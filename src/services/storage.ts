import type {
  Expense,
  Settlement,
  CoupleProfile,
  SavingGoal,
  GmailRecurringRule,
  ExpenseCategory,
  TripProject,
  RecurringExpenseItem,
} from '../types';
import {
  defaultProfile,
  initialExpenses,
  initialGoals,
  initialSettlements,
} from './seed-data';
import { deriveNameFromEmail, sanitizeAndMigrateProfile } from './profile-sanitizer';
import { computeSettlementBalance } from './settlement-math';

export {
  defaultProfile,
  initialExpenses,
  initialGoals,
  initialSettlements,
  deriveNameFromEmail,
  sanitizeAndMigrateProfile,
  computeSettlementBalance,
};

const STORAGE_KEYS = {
  EXPENSES: 'duospend_expenses_v1',
  SETTLEMENTS: 'duospend_settlements_v1',
  PROFILE: 'duospend_profile_v1',
  GOALS: 'duospend_goals_v1',
  TRIPS: 'duospend_trips_v1',
  RECURRING_EXPENSES: 'duospend_recurring_expenses_v1',
  GMAIL_IGNORED_MESSAGES: 'duospend_gmail_ignored_messages_v1',
  GMAIL_RECURRING_RULES: 'duospend_gmail_recurring_rules_v1',
  DIRTY_SYNC: 'duospend_dirty_sync_v1',
  OCR_DRAFT: 'duospend_ocr_draft_v1',
  GMAIL_DRAFT: 'duospend_gmail_draft_v1',
};

export interface PersistedOcrDraft<TDraft = unknown> {
  imagePreview: string | null;
  imageMimeType: string;
  extractedData: TDraft | null;
  wasAnalyzing?: boolean;
  payer?: 'user' | 'partner';
  splitType?: '50_50' | '100_user' | '100_partner' | 'custom';
}

export interface PersistedGmailDraft<TReceipt = unknown, TCandidate = unknown, TStats = unknown> {
  detectedReceipts: TReceipt[];
  reviewCandidates: TCandidate[];
  selectedIds: Record<string, boolean>;
  nextPageToken: string | null;
  analysisModel: string | null;
  scanStats: TStats | null;
  scanStatus: 'complete' | 'stopped' | 'error' | null;
  wasSyncing?: boolean;
  lookbackDays?: number;
  searchMode?: 'tracking_start' | 'month_start' | 'prev_month_start' | 'year_start' | 'custom_date' | 'days';
  customStartDate?: string;
}

// Local Storage Loaders & Savers with Central Server Database Sync
export const loadExpenses = (): Expense[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EXPENSES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(initialExpenses));
      return initialExpenses;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return initialExpenses;
    return parsed.map((expense: Expense) =>
      expense && expense.id === 'exp-7' && expense.title === 'Decathlon Abbigliamento Running (Utente 1)'
        ? { ...expense, title: 'Decathlon Abbigliamento Running (Personale)' }
        : expense
    );
  } catch {
    return initialExpenses;
  }
};

const safeSetLocalStorageItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Unable to persist localStorage key "${key}":`, error);
    return false;
  }
};

const stripInlineReceiptsForLocalCache = (expenses: Expense[]): Expense[] =>
  expenses.map((expense) => {
    if (typeof expense.receiptUrl === 'string' && expense.receiptUrl.startsWith('data:image/')) {
      const { receiptUrl: _stripped, ...rest } = expense;
      return rest;
    }
    return expense;
  });

const saveExpensesToLocalStorage = (expenses: Expense[]) => {
  if (safeSetLocalStorageItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses))) {
    return;
  }
  const compactExpenses = stripInlineReceiptsForLocalCache(expenses);
  safeSetLocalStorageItem(STORAGE_KEYS.EXPENSES, JSON.stringify(compactExpenses));
};

export const saveExpenses = (expenses: Expense[]) => {
  saveExpensesToLocalStorage(expenses);
  void syncPatchToServer({ expenses });
};

export const loadOcrDraft = <TDraft = unknown>(): PersistedOcrDraft<TDraft> | null => {
  try {
    const raw =
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEYS.OCR_DRAFT) : null) ??
      localStorage.getItem(STORAGE_KEYS.OCR_DRAFT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedOcrDraft<TDraft>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const saveOcrDraft = <TDraft = unknown>(draft: PersistedOcrDraft<TDraft> | null): void => {
  try {
    if (!draft || (!draft.extractedData && !draft.wasAnalyzing)) {
      localStorage.removeItem(STORAGE_KEYS.OCR_DRAFT);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(STORAGE_KEYS.OCR_DRAFT);
      }
      return;
    }
    const serialized = JSON.stringify(draft);
    let savedToSession = false;
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(STORAGE_KEYS.OCR_DRAFT, serialized);
        savedToSession = true;
      } catch {
        // Fallback to localStorage below
      }
    }
    if (!safeSetLocalStorageItem(STORAGE_KEYS.OCR_DRAFT, serialized) && !savedToSession) {
      safeSetLocalStorageItem(
        STORAGE_KEYS.OCR_DRAFT,
        JSON.stringify({ ...draft, imagePreview: null }),
      );
    }
  } catch {
    // Ignore storage cleanup errors
  }
};

export const loadGmailDraft = <
  TReceipt = unknown,
  TCandidate = unknown,
  TStats = unknown,
>(): PersistedGmailDraft<TReceipt, TCandidate, TStats> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GMAIL_DRAFT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedGmailDraft<TReceipt, TCandidate, TStats>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (!Array.isArray(parsed.detectedReceipts) &&
        !Array.isArray(parsed.reviewCandidates) &&
        !parsed.wasSyncing)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const saveGmailDraft = <TReceipt = unknown, TCandidate = unknown, TStats = unknown>(
  draft: PersistedGmailDraft<TReceipt, TCandidate, TStats> | null,
): void => {
  try {
    if (
      !draft ||
      (!draft.wasSyncing &&
        draft.detectedReceipts.length === 0 &&
        draft.reviewCandidates.length === 0)
    ) {
      localStorage.removeItem(STORAGE_KEYS.GMAIL_DRAFT);
      return;
    }
    safeSetLocalStorageItem(STORAGE_KEYS.GMAIL_DRAFT, JSON.stringify(draft));
  } catch {
    // Ignore storage cleanup errors
  }
};

export const loadIgnoredGmailMessageIds = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GMAIL_IGNORED_MESSAGES);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch (error) {
    console.error('Failed to load ignored Gmail message IDs:', error);
    return [];
  }
};

export const saveIgnoredGmailMessageIds = (ids: string[]) => {
  safeSetLocalStorageItem(STORAGE_KEYS.GMAIL_IGNORED_MESSAGES, JSON.stringify([...new Set(ids)]));
};

export const loadGmailRecurringRules = (): GmailRecurringRule[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GMAIL_RECURRING_RULES);
    const rules: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(rules)) return [];
    return rules.filter((value): value is GmailRecurringRule => {
      if (typeof value !== 'object' || value === null) return false;
      const rule = value as Record<string, unknown>;
      return typeof rule.sender === 'string' &&
        typeof rule.subject === 'string' &&
        typeof rule.merchant === 'string' &&
        typeof rule.amount === 'number' &&
        Number.isFinite(rule.amount) &&
        rule.amount > 0 &&
        typeof rule.currency === 'string' &&
        typeof rule.category === 'string' &&
        rule.category.trim().length > 0 &&
        rule.category.trim().length <= 100;
    });
  } catch (error) {
    console.error('Failed to load Gmail recurring rules:', error);
    return [];
  }
};

export const saveGmailRecurringRules = (rules: GmailRecurringRule[]) => {
  safeSetLocalStorageItem(STORAGE_KEYS.GMAIL_RECURRING_RULES, JSON.stringify(rules));
};

export const UNAUTHORIZED_EVENT = 'duospend:unauthorized';

function notifyUnauthorizedIfNeeded(status: number): void {
  if ((status === 401 || status === 403) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
}

let syncQueuePromise: Promise<void> = Promise.resolve();
let pendingSyncCount = 0;
let batchHadFailure = false;

const syncPatchToServer = (patch: Record<string, unknown>): Promise<void> => {
  safeSetLocalStorageItem(STORAGE_KEYS.DIRTY_SYNC, '1');
  if (pendingSyncCount === 0) {
    batchHadFailure = false;
  }
  pendingSyncCount += 1;

  const run = async () => {
    try {
      const response = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (response.ok) {
        if (pendingSyncCount <= 1 && !batchHadFailure) {
          localStorage.removeItem(STORAGE_KEYS.DIRTY_SYNC);
        }
      } else {
        batchHadFailure = true;
        notifyUnauthorizedIfNeeded(response.status);
        console.warn('Background sync failed:', response.status);
      }
    } catch (err) {
      batchHadFailure = true;
      if (err instanceof Error && err.message !== 'Accedi con Google per continuare.') {
        console.warn('Background sync error:', err);
      }
    } finally {
      pendingSyncCount = Math.max(0, pendingSyncCount - 1);
    }
  };

  const next = syncQueuePromise.then(run, run);
  syncQueuePromise = next.catch(() => {});
  return next;
};

export const loadSettlements = (): Settlement[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTLEMENTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(initialSettlements));
      return initialSettlements;
    }
    return JSON.parse(raw);
  } catch {
    return initialSettlements;
  }
};

export const saveSettlements = (settlements: Settlement[]) => {
  safeSetLocalStorageItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(settlements));
  void syncPatchToServer({ settlements });
};

export const loadProfile = (): CoupleProfile => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(defaultProfile));
      return defaultProfile;
    }
    const storedProfile = JSON.parse(raw) as Partial<CoupleProfile> & Record<string, unknown>;
    const sanitized = sanitizeAndMigrateProfile(storedProfile);
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(sanitized));
    return sanitized;
  } catch {
    return defaultProfile;
  }
};

export const saveProfile = (profile: CoupleProfile) => {
  const safeProfile = sanitizeAndMigrateProfile(profile as Partial<CoupleProfile> & Record<string, unknown>);
  safeSetLocalStorageItem(STORAGE_KEYS.PROFILE, JSON.stringify(safeProfile));
  void syncPatchToServer({
    profile: {
      ...safeProfile,
      // Stringa vuota esplicita quando disattivata così il server rimuove il Punto Zero precedente
      trackingStartDate: safeProfile.trackingStartDate ?? '',
    },
  });
};

export const loadGoals = (): SavingGoal[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GOALS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(initialGoals));
      return initialGoals;
    }
    return JSON.parse(raw);
  } catch {
    return initialGoals;
  }
};

export const saveGoals = (goals: SavingGoal[]) => {
  safeSetLocalStorageItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));
  void syncPatchToServer({ goals });
};

export const loadTrips = (): TripProject[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRIPS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveTrips = (trips: TripProject[]) => {
  safeSetLocalStorageItem(STORAGE_KEYS.TRIPS, JSON.stringify(trips));
  void syncPatchToServer({ trips });
};

export const loadRecurringExpenses = (): RecurringExpenseItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECURRING_EXPENSES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveRecurringExpenses = (recurringExpenses: RecurringExpenseItem[]) => {
  safeSetLocalStorageItem(STORAGE_KEYS.RECURRING_EXPENSES, JSON.stringify(recurringExpenses));
  void syncPatchToServer({ recurringExpenses });
};

/**
 * Synchronizes client data with the central server database.
 * Merges records to prevent data loss across devices.
 */
export const syncWithServerDatabase = async (): Promise<{
  expenses: Expense[];
  settlements: Settlement[];
  goals: SavingGoal[];
  profile: CoupleProfile;
  trips: TripProject[];
  recurringExpenses: RecurringExpenseItem[];
} | null> => {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) {
      notifyUnauthorizedIfNeeded(res.status);
      const error = await res.json().catch(() => ({}));
      console.warn('Server rejected database sync:', res.status, error.error || 'Errore senza dettagli.');
      return null;
    }
    const json = await res.json();
    if (!json.success) return null;

    const serverExps: Expense[] = Array.isArray(json.expenses) ? json.expenses : [];
    const serverStls: Settlement[] = Array.isArray(json.settlements) ? json.settlements : [];
    const serverGoals: SavingGoal[] = Array.isArray(json.goals) ? json.goals : [];
    const serverTrips: TripProject[] = Array.isArray(json.trips) ? json.trips : [];
    const serverRecurring: RecurringExpenseItem[] = Array.isArray(json.recurringExpenses)
      ? json.recurringExpenses
      : [];
    const serverProfile = sanitizeAndMigrateProfile(
      (json.profile || {}) as Partial<CoupleProfile> & Record<string, unknown>
    );

    const hasPendingOfflineChanges = localStorage.getItem(STORAGE_KEYS.DIRTY_SYNC) === '1';

    if (!hasPendingOfflineChanges) {
      saveExpensesToLocalStorage(serverExps);
      safeSetLocalStorageItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(serverStls));
      safeSetLocalStorageItem(STORAGE_KEYS.GOALS, JSON.stringify(serverGoals));
      safeSetLocalStorageItem(STORAGE_KEYS.TRIPS, JSON.stringify(serverTrips));
      safeSetLocalStorageItem(STORAGE_KEYS.RECURRING_EXPENSES, JSON.stringify(serverRecurring));
      safeSetLocalStorageItem(STORAGE_KEYS.PROFILE, JSON.stringify(serverProfile));

      return {
        expenses: serverExps,
        settlements: serverStls,
        goals: serverGoals,
        profile: serverProfile,
        trips: serverTrips,
        recurringExpenses: serverRecurring,
      };
    }

    // Merge server expenses with local pending offline changes (local edits take precedence)
    const localExps = loadExpenses();
    const expMap = new Map<string, Expense>();
    serverExps.forEach((e) => expMap.set(e.id, e));
    localExps.forEach((e) => {
      const serverMatch = expMap.get(e.id);
      expMap.set(e.id, {
        ...e,
        ...(e.receiptUrl ? {} : serverMatch?.receiptUrl ? { receiptUrl: serverMatch.receiptUrl } : {}),
      });
    });
    const mergedExpenses = Array.from(expMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Merge settlements (local edits take precedence)
    const localStls = loadSettlements();
    const stlMap = new Map<string, Settlement>();
    serverStls.forEach((s) => stlMap.set(s.id, s));
    localStls.forEach((s) => stlMap.set(s.id, s));
    const mergedSettlements = Array.from(stlMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Merge goals (local edits take precedence)
    const localGoals = loadGoals();
    const goalMap = new Map<string, SavingGoal>();
    serverGoals.forEach((g) => goalMap.set(g.id, g));
    localGoals.forEach((g) => goalMap.set(g.id, g));
    const mergedGoals = Array.from(goalMap.values());

    // Merge trips (local edits take precedence)
    const localTrips = loadTrips();
    const tripMap = new Map<string, TripProject>();
    serverTrips.forEach((t) => tripMap.set(t.id, t));
    localTrips.forEach((t) => tripMap.set(t.id, t));
    const mergedTrips = Array.from(tripMap.values());

    // Merge recurring expenses (local edits take precedence)
    const localRecurring = loadRecurringExpenses();
    const recMap = new Map<string, RecurringExpenseItem>();
    serverRecurring.forEach((r) => recMap.set(r.id, r));
    localRecurring.forEach((r) => recMap.set(r.id, r));
    const mergedRecurring = Array.from(recMap.values());

    // Profile (local edits take precedence while preserving server-verified couple emails)
    const localProfile = loadProfile();
    const mergedProfile = sanitizeAndMigrateProfile({
      ...defaultProfile,
      ...serverProfile,
      ...localProfile,
      userEmail: serverProfile.userEmail || localProfile.userEmail,
      partnerEmail: serverProfile.partnerEmail || localProfile.partnerEmail,
    });

    // Save merged state locally
    saveExpensesToLocalStorage(mergedExpenses);
    safeSetLocalStorageItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(mergedSettlements));
    safeSetLocalStorageItem(STORAGE_KEYS.GOALS, JSON.stringify(mergedGoals));
    safeSetLocalStorageItem(STORAGE_KEYS.TRIPS, JSON.stringify(mergedTrips));
    safeSetLocalStorageItem(STORAGE_KEYS.RECURRING_EXPENSES, JSON.stringify(mergedRecurring));
    safeSetLocalStorageItem(STORAGE_KEYS.PROFILE, JSON.stringify(mergedProfile));

    // Send back unified data to server through the serialized queue
    void syncPatchToServer({
      expenses: mergedExpenses,
      settlements: mergedSettlements,
      goals: mergedGoals,
      trips: mergedTrips,
      recurringExpenses: mergedRecurring,
      profile: {
        ...mergedProfile,
        trackingStartDate: mergedProfile.trackingStartDate ?? '',
      },
    });

    return {
      expenses: mergedExpenses,
      settlements: mergedSettlements,
      goals: mergedGoals,
      profile: mergedProfile,
      trips: mergedTrips,
      recurringExpenses: mergedRecurring,
    };
  } catch (err) {
    console.warn('Sync with server database failed (using local cache):', err);
    return null;
  }
};
