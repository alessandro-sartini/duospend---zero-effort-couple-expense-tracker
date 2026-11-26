import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initAuth, logout } from '../services/auth';
import {
  computeSettlementBalance,
  loadExpenses,
  loadGmailRecurringRules,
  loadGoals,
  loadIgnoredGmailMessageIds,
  loadProfile,
  loadRecurringExpenses,
  loadSettlements,
  loadTrips,
  saveExpenses,
  saveGmailRecurringRules,
  saveGoals,
  saveGoalsLocalOnly,
  saveIgnoredGmailMessageIds,
  saveProfile,
  saveRecurringExpenses,
  saveSettlements,
  saveTrips,
  syncWithServerDatabase,
  UNAUTHORIZED_EVENT,
} from '../services/storage';
import {
  applyMatchedCyclesToRecurring,
  computeTripSummary,
  extractGmailIdsFromExpense,
  findZeroQuarantineMatches,
  mergeReconciledExpenses,
  reconcileIncomingExpenses,
} from '../services/reconciliation';
import type {
  CoupleProfile,
  Expense,
  GmailRecurringRule,
  RecurringExpenseItem,
  SavingGoal,
  Settlement,
  TripProject,
} from '../types';

const PENDING_SHARE_STORAGE_KEY = 'duospend_pending_share_v1';
const PENDING_ACTION_STORAGE_KEY = 'duospend_pending_action_v1';
const ALLOWED_SHORTCUT_ACTIONS = new Set(['add-expense', 'paste-notification', 'scan-receipt']);

const sanitizeSharedQueryParam = (value: string | null, maxLength = 4000): string => {
  if (!value) return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
};

export function useDuoSpendData() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [goals, setGoals] = useState<SavingGoal[]>([]);
  const [trips, setTrips] = useState<TripProject[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpenseItem[]>([]);
  const [profile, setProfile] = useState<CoupleProfile>(() => loadProfile());
  const [ignoredGmailMessageIds, setIgnoredGmailMessageIds] = useState<string[]>([]);
  const [gmailRecurringRules, setGmailRecurringRules] = useState<GmailRecurringRule[]>([]);
  const [reconciliationNotice, setReconciliationNotice] = useState<string | null>(null);

  const activeTripRef = useRef<TripProject | null>(null);
  const recurringExpensesRef = useRef<RecurringExpenseItem[]>([]);
  activeTripRef.current = trips.find((t) => t.isActive) ?? null;
  recurringExpensesRef.current = recurringExpenses;

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isSyncingData, setIsSyncingData] = useState(false);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [authMethod, setAuthMethod] = useState<'google' | 'development' | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [sharedNotificationTextState, setSharedNotificationTextState] = useState<string>('');
  const [pendingShortcutActionState, setPendingShortcutActionState] = useState<string | null>(null);

  const setSharedNotificationText = useCallback((value: string) => {
    const clean = sanitizeSharedQueryParam(value, 4000);
    setSharedNotificationTextState(clean);
    try {
      if (clean) {
        sessionStorage.setItem(PENDING_SHARE_STORAGE_KEY, clean);
      } else {
        sessionStorage.removeItem(PENDING_SHARE_STORAGE_KEY);
      }
    } catch {
      // sessionStorage potrebbe essere disabilitato in contesti privati
    }
  }, []);

  const setPendingShortcutAction = useCallback((action: string | null) => {
    const clean = action && ALLOWED_SHORTCUT_ACTIONS.has(action) ? action : null;
    setPendingShortcutActionState(clean);
    try {
      if (clean) {
        sessionStorage.setItem(PENDING_ACTION_STORAGE_KEY, clean);
      } else {
        sessionStorage.removeItem(PENDING_ACTION_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleRefreshData = useCallback(async () => {
    setIsSyncingData(true);
    try {
      const synced = await syncWithServerDatabase();
      if (!synced) return;
      setExpenses(synced.expenses);
      setSettlements(synced.settlements);
      setGoals(synced.goals);
      setTrips(synced.trips);
      setRecurringExpenses(synced.recurringExpenses);
      setProfile(synced.profile);
    } finally {
      setIsSyncingData(false);
    }
  }, []);

  const handleUnlock = useCallback(
    async (method: 'google' | 'development', email: string): Promise<boolean> => {
      setIsSyncingData(true);
      try {
        const synced = await syncWithServerDatabase();
        if (!synced) return false;

        setIsVaultUnlocked(true);
        setAuthMethod(method);
        setUserEmail(email);
        setIsSignedIn(true);
        setExpenses(synced.expenses);
        setSettlements(synced.settlements);
        setGoals(synced.goals);
        setTrips(synced.trips);
        setRecurringExpenses(synced.recurringExpenses);
        setProfile(synced.profile);
        return true;
      } finally {
        setIsSyncingData(false);
      }
    },
    []
  );

  const handleLockVault = useCallback(async () => {
    setIsVaultUnlocked(false);
    setIsSignedIn(false);
    setUserEmail(undefined);
    setAuthMethod(null);
    try {
      await logout();
    } catch (e) {
      console.warn(e);
    }
  }, []);

  const handleAuthChanged = useCallback((signedIn: boolean, email?: string) => {
    setIsSignedIn(signedIn);
    setUserEmail(email);
    if (!signedIn) {
      setIsVaultUnlocked(false);
      setAuthMethod(null);
    }
  }, []);

  const handleUpdateProfile = useCallback((updated: Partial<CoupleProfile>) => {
    setProfile((current) => {
      const newProfile = { ...current, ...updated };
      saveProfile(newProfile);
      return newProfile;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    setExpenses(loadExpenses());
    setSettlements(loadSettlements());
    setGoals(loadGoals());
    setTrips(loadTrips());
    setRecurringExpenses(loadRecurringExpenses());
    setIgnoredGmailMessageIds(loadIgnoredGmailMessageIds());
    setGmailRecurringRules(loadGmailRecurringRules());

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const rawTitle = sanitizeSharedQueryParam(urlParams.get('title'), 200);
      const rawText = sanitizeSharedQueryParam(
        urlParams.get('text') || urlParams.get('notification') || urlParams.get('shared_text'),
        3800
      );
      const rawUrl = sanitizeSharedQueryParam(urlParams.get('url'), 300);
      const usefulTitle =
        rawTitle &&
        rawTitle.toLowerCase() !== 'duospend' &&
        !rawText.toLowerCase().includes(rawTitle.toLowerCase())
          ? rawTitle
          : '';
      const combinedShareText = rawText
        ? [usefulTitle, rawText].filter(Boolean).join(': ').slice(0, 4000)
        : [usefulTitle, rawUrl].filter(Boolean).join(' ').slice(0, 4000);

      if (combinedShareText) {
        setSharedNotificationText(combinedShareText);
      } else {
        const storedShare = sessionStorage.getItem(PENDING_SHARE_STORAGE_KEY);
        if (storedShare) {
          setSharedNotificationText(storedShare);
        }
      }

      const rawAction = sanitizeSharedQueryParam(urlParams.get('action'), 64);
      if (rawAction && ALLOWED_SHORTCUT_ACTIONS.has(rawAction)) {
        setPendingShortcutAction(rawAction);
      } else {
        const storedAction = sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY);
        if (storedAction && ALLOWED_SHORTCUT_ACTIONS.has(storedAction)) {
          setPendingShortcutAction(storedAction);
        }
      }

      if (
        urlParams.has('text') ||
        urlParams.has('notification') ||
        urlParams.has('shared_text') ||
        urlParams.has('title') ||
        urlParams.has('url') ||
        urlParams.has('action') ||
        urlParams.has('source')
      ) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {
      console.warn('URL param parse error', e);
    }

    const initialProfileEmail = loadProfile().userEmail || 'sviluppo-locale';
    const unsubscribe = initAuth(
      (user) => {
        void (async () => {
          await handleUnlock(
            user.email ? 'google' : 'development',
            user.email || initialProfileEmail
          );
          if (!cancelled) setIsCheckingAuth(false);
        })();
      },
      () => {
        setIsSignedIn(false);
        setUserEmail(undefined);
        setAuthMethod(null);
        setIsVaultUnlocked(false);
        if (!cancelled) setIsCheckingAuth(false);
      }
    );

    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [handleUnlock, setPendingShortcutAction, setSharedNotificationText]);

  useEffect(() => {
    if (!isVaultUnlocked) return;

    const handleFocus = () => {
      void handleRefreshData();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [isVaultUnlocked, handleRefreshData]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setIsVaultUnlocked(false);
      setIsSignedIn(false);
      setUserEmail(undefined);
      setAuthMethod(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  const lastUserActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!isVaultUnlocked || authMethod !== 'google') return;

    let cancelled = false;
    let checkTimer: number | null = null;
    lastUserActivityRef.current = Date.now();

    const markUserActivity = () => {
      const now = Date.now();
      if (now - lastUserActivityRef.current >= 1000) {
        lastUserActivityRef.current = now;
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
      'scroll',
    ];
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, markUserActivity, { passive: true });
    }

    const lockUiSession = () => {
      setIsVaultUnlocked(false);
      setIsSignedIn(false);
      setUserEmail(undefined);
      setAuthMethod(null);
    };

    const clearTimer = () => {
      if (checkTimer !== null) {
        window.clearTimeout(checkTimer);
        checkTimer = null;
      }
    };

    const scheduleFromServerSession = async (allowKeepAlive: boolean) => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/auth/session');
        if (!res.ok) return;
        const session = (await res.json()) as {
          authenticated?: boolean;
          idleExpiresAt?: number;
          absoluteExpiresAt?: number;
        };
        if (cancelled) return;

        if (!session.authenticated) {
          lockUiSession();
          return;
        }

        const now = Date.now();
        const idleExpiresAt =
          typeof session.idleExpiresAt === 'number'
            ? session.idleExpiresAt
            : now + 30 * 60 * 1000;
        const absoluteExpiresAt =
          typeof session.absoluteExpiresAt === 'number'
            ? session.absoluteExpiresAt
            : now + 4 * 60 * 60 * 1000;

        // Se l'utente è stato attivo di recente e resta margine sul limite assoluto,
        // rinnova la finestra di inattività prima della scadenza.
        const recentlyActive = now - lastUserActivityRef.current < 10 * 60 * 1000;
        if (
          allowKeepAlive &&
          recentlyActive &&
          idleExpiresAt - now <= 45_000 &&
          absoluteExpiresAt - now > 15_000
        ) {
          await handleRefreshData();
          if (!cancelled) {
            await scheduleFromServerSession(false);
          }
          return;
        }

        const nextExpiry = Math.min(idleExpiresAt, absoluteExpiresAt);
        const keepAliveAt = idleExpiresAt - 30_000;
        const delayMs =
          keepAliveAt > now + 5_000 && recentlyActive
            ? keepAliveAt - now
            : Math.max(1_000, nextExpiry - now + 1_000);

        clearTimer();
        checkTimer = window.setTimeout(() => {
          void scheduleFromServerSession(true);
        }, delayMs);
      } catch {
        // Retry leggero se offline momentaneo; UNAUTHORIZED_EVENT gestirà eventuali 401 reali
      }
    };

    void scheduleFromServerSession(false);

    return () => {
      cancelled = true;
      clearTimer();
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, markUserActivity);
      }
    };
  }, [isVaultUnlocked, authMethod, handleRefreshData]);

  const trackingStartDate = profile.trackingStartDate;

  const activeExpenses = useMemo(() => {
    if (!trackingStartDate) return expenses;
    return expenses.filter((expense) => expense.date >= trackingStartDate);
  }, [expenses, trackingStartDate]);

  const activeSettlements = useMemo(() => {
    if (!trackingStartDate) return settlements;
    return settlements.filter((settlement) => settlement.date >= trackingStartDate);
  }, [settlements, trackingStartDate]);

  const excludedBeforeStartCount = expenses.length - activeExpenses.length;

  const balanceSummary = useMemo(
    () => computeSettlementBalance(activeExpenses, activeSettlements),
    [activeExpenses, activeSettlements]
  );
  const zeroAmountExpenses = useMemo(
    () =>
      activeExpenses.filter(
        (expense) => expense.amount <= 0 || expense.reconciliationStatus === 'zero_quarantine'
      ),
    [activeExpenses]
  );

  const activeTrip = useMemo(() => trips.find((t) => t.isActive) ?? null, [trips]);

  const activeTripSummary = useMemo(
    () => (activeTrip ? computeTripSummary(activeTrip, activeExpenses) : null),
    [activeTrip, activeExpenses]
  );

  const recurringMonthlyTotal = useMemo(
    () =>
      recurringExpenses.reduce((sum, rule) => {
        if (!rule.active || rule.expectedAmount <= 0) return sum;
        if (rule.frequency === 'yearly') return sum + rule.expectedAmount / 12;
        if (rule.frequency === 'bimonthly') return sum + rule.expectedAmount / 2;
        return sum + rule.expectedAmount;
      }, 0),
    [recurringExpenses]
  );

  const zeroQuarantineMatches = useMemo(
    () => findZeroQuarantineMatches(activeExpenses, recurringExpenses),
    [activeExpenses, recurringExpenses]
  );

  const knownGmailSourceReferences = useMemo(
    () => Array.from(new Set(expenses.flatMap(extractGmailIdsFromExpense))),
    [expenses]
  );

  const applyMatchedRecurringCycles = useCallback(
    (matchedCycles: Array<{ ruleId: string; cycle: string }>) => {
      if (matchedCycles.length === 0) return;
      setRecurringExpenses((current) => {
        const updated = applyMatchedCyclesToRecurring(current, matchedCycles);
        saveRecurringExpenses(updated);
        return updated;
      });
    },
    []
  );

  const handleSaveExpense = useCallback(
    (newExpData: Omit<Expense, 'id'>, editingId?: string) => {
      if (editingId) {
        setExpenses((current) => {
          const updated = current.map((e) =>
            e.id === editingId
              ? {
                  ...newExpData,
                  id: editingId,
                  reconciliationStatus:
                    newExpData.amount > 0 ? ('confirmed' as const) : ('zero_quarantine' as const),
                }
              : e
          );
          saveExpenses(updated);
          return updated;
        });
        return;
      }

      let matchedCycles: Array<{ ruleId: string; cycle: string }> = [];
      let didMerge = false;
      setExpenses((current) => {
        const result = reconcileIncomingExpenses(current, [newExpData], {
          activeTrip: activeTripRef.current,
          recurringExpenses: recurringExpensesRef.current,
          idPrefix: 'exp',
        });
        matchedCycles = result.matchedRecurringCycles;
        didMerge = result.mergedCount > 0;
        saveExpenses(result.expenses);
        return result.expenses;
      });
      if (matchedCycles.length > 0) {
        applyMatchedRecurringCycles(matchedCycles);
      }
      if (didMerge) {
        setReconciliationNotice(
          `Riconciliata "${newExpData.title}" con un movimento esistente (nessun doppione creato).`
        );
      }
    },
    [applyMatchedRecurringCycles]
  );

  const handleDeleteExpense = useCallback((id: string) => {
    setExpenses((current) => {
      const updated = current.filter((e) => e.id !== id);
      saveExpenses(updated);
      return updated;
    });
  }, []);

  const handleRestoreExpense = useCallback((expense: Expense) => {
    setExpenses((current) => {
      if (current.some((e) => e.id === expense.id)) return current;
      const updated = [expense, ...current].sort((a, b) => b.date.localeCompare(a.date));
      saveExpenses(updated);
      return updated;
    });
  }, []);

  const handleImportGmailExpenses = useCallback(
    (newItems: Omit<Expense, 'id'>[]) => {
      let matchedCycles: Array<{ ruleId: string; cycle: string }> = [];
      let mergedCount = 0;
      let addedCount = 0;
      let quarantinedZeroCount = 0;

      setExpenses((current) => {
        const result = reconcileIncomingExpenses(current, newItems, {
          activeTrip: activeTripRef.current,
          recurringExpenses: recurringExpensesRef.current,
        });
        matchedCycles = result.matchedRecurringCycles;
        mergedCount = result.mergedCount;
        addedCount = result.addedCount;
        quarantinedZeroCount = result.quarantinedZeroCount;
        if (result.expenses !== current) {
          saveExpenses(result.expenses);
        }
        return result.expenses;
      });

      if (matchedCycles.length > 0) {
        applyMatchedRecurringCycles(matchedCycles);
      }

      if (mergedCount > 0 || quarantinedZeroCount > 0) {
        const parts: string[] = [];
        if (addedCount > 0) parts.push(`${addedCount} aggiunte`);
        if (mergedCount > 0) parts.push(`${mergedCount} riconciliate senza doppioni`);
        if (quarantinedZeroCount > 0) {
          parts.push(`${quarantinedZeroCount} in quarantena 0 €`);
        }
        setReconciliationNotice(`Import completato: ${parts.join(' · ')}.`);
      }
    },
    [applyMatchedRecurringCycles]
  );

  const handleMergeZeroExpense = useCallback(
    (zeroExpenseId: string, candidateExpenseId: string) => {
      setExpenses((current) => {
        const zeroExp = current.find((e) => e.id === zeroExpenseId);
        const candidateExp = current.find((e) => e.id === candidateExpenseId);
        if (!zeroExp || !candidateExp) return current;

        const merged = mergeReconciledExpenses(candidateExp, zeroExp);
        const updated = current
          .filter((e) => e.id !== zeroExpenseId)
          .map((e) => (e.id === candidateExpenseId ? merged : e));
        saveExpenses(updated);
        setReconciliationNotice(
          `Ricevuta a 0 € "${zeroExp.title}" unita a "${merged.title}" (${merged.currency} ${merged.amount.toFixed(2)}).`
        );
        return updated;
      });
    },
    []
  );

  const handleMergeDuplicateExpense = useCallback(
    (duplicateExpenseId: string, candidateExpenseId: string) => {
      setExpenses((current) => {
        const dupExp = current.find((e) => e.id === duplicateExpenseId);
        const candidateExp = current.find((e) => e.id === candidateExpenseId);
        if (!dupExp || !candidateExp || dupExp.id === candidateExp.id) return current;

        const merged = mergeReconciledExpenses(candidateExp, dupExp);
        const updated = current
          .filter((e) => e.id !== duplicateExpenseId)
          .map((e) => (e.id === candidateExpenseId ? merged : e));
        saveExpenses(updated);
        setReconciliationNotice(
          `Movimenti uniti in "${merged.title}" (${merged.currency} ${merged.amount.toFixed(2)}).`
        );
        return updated;
      });
    },
    []
  );

  const handleDismissDuplicateExpense = useCallback((expenseId: string) => {
    setExpenses((current) => {
      const updated = current.map((e) => {
        if (e.id !== expenseId) return e;
        const { duplicateCandidateId: _removed, ...rest } = e;
        return {
          ...rest,
          reconciliationStatus: (e.amount > 0 ? 'confirmed' : 'zero_quarantine') as Expense['reconciliationStatus'],
        };
      });
      saveExpenses(updated);
      return updated;
    });
  }, []);

  const handleSaveTrip = useCallback((trip: TripProject) => {
    setTrips((current) => {
      const normalized = trip.isActive
        ? current.map((existing) =>
            existing.id === trip.id ? trip : { ...existing, isActive: false }
          )
        : current.map((existing) => (existing.id === trip.id ? trip : existing));
      const exists = normalized.some((existing) => existing.id === trip.id);
      const updated = exists ? normalized : [trip, ...normalized];
      saveTrips(updated);
      return updated;
    });
  }, []);

  const handleToggleTripActive = useCallback((tripId: string) => {
    setTrips((current) => {
      const target = current.find((t) => t.id === tripId);
      if (!target) return current;
      const nextActive = !target.isActive;
      const updated = current.map((t) =>
        t.id === tripId
          ? { ...t, isActive: nextActive }
          : nextActive
            ? { ...t, isActive: false }
            : t
      );
      saveTrips(updated);
      return updated;
    });
  }, []);

  const handleDeleteTrip = useCallback((tripId: string) => {
    setTrips((current) => {
      const updated = current.filter((t) => t.id !== tripId);
      saveTrips(updated);
      return updated;
    });
  }, []);

  const handleSaveRecurringExpense = useCallback((item: RecurringExpenseItem) => {
    setRecurringExpenses((current) => {
      const exists = current.some((existing) => existing.id === item.id);
      const updated = exists
        ? current.map((existing) => (existing.id === item.id ? item : existing))
        : [item, ...current];
      saveRecurringExpenses(updated);
      return updated;
    });
  }, []);

  const handleDeleteRecurringExpense = useCallback((ruleId: string) => {
    setRecurringExpenses((current) => {
      const updated = current.filter((r) => r.id !== ruleId);
      saveRecurringExpenses(updated);
      return updated;
    });
  }, []);

  const handleTriggerRecurringExpense = useCallback(
    (rule: RecurringExpenseItem) => {
      if (rule.expectedAmount <= 0) return;
      const today = new Date().toISOString().slice(0, 10);
      handleSaveExpense({
        title: rule.title,
        amount: rule.expectedAmount,
        currency: rule.currency,
        date: today,
        category: rule.category,
        payer: rule.payer,
        splitType: rule.splitType,
        customSplitRatio: rule.customSplitRatio,
        source: 'recurring',
        recurringRuleId: rule.id,
        notes: 'Rata registrata dal modulo Spese Ricorrenti',
      });
    },
    [handleSaveExpense]
  );

  const handleIgnoreGmailMessage = useCallback((messageId: string) => {
    setIgnoredGmailMessageIds((current) => {
      const updated = [...new Set([...current, messageId])];
      saveIgnoredGmailMessageIds(updated);
      return updated;
    });
  }, []);

  const handleUnignoreGmailMessage = useCallback((messageId: string) => {
    setIgnoredGmailMessageIds((current) => {
      if (!current.includes(messageId)) return current;
      const updated = current.filter((id) => id !== messageId);
      saveIgnoredGmailMessageIds(updated);
      return updated;
    });
  }, []);

  const handleSaveGmailRecurringRule = useCallback((rule: GmailRecurringRule) => {
    setGmailRecurringRules((current) => {
      const updated = [
        ...current.filter(
          (existing) =>
            existing.sender.toLowerCase() !== rule.sender.toLowerCase() ||
            existing.subject.trim().toLowerCase() !== rule.subject.trim().toLowerCase()
        ),
        rule,
      ];
      saveGmailRecurringRules(updated);
      return updated;
    });
  }, []);

  const handleConfirmSettlement = useCallback((settlementData: Omit<Settlement, 'id'>) => {
    const created: Settlement = {
      ...settlementData,
      id: `stl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    setSettlements((current) => {
      const updated = [created, ...current];
      saveSettlements(updated);
      return updated;
    });
  }, []);

  const handleDeleteSettlement = useCallback((id: string) => {
    setSettlements((current) => {
      const updated = current.filter((s) => s.id !== id);
      saveSettlements(updated);
      return updated;
    });
  }, []);

  const handleRestoreSettlement = useCallback((settlement: Settlement) => {
    setSettlements((current) => {
      if (current.some((s) => s.id === settlement.id)) return current;
      const updated = [settlement, ...current].sort((a, b) => b.date.localeCompare(a.date));
      saveSettlements(updated);
      return updated;
    });
  }, []);

  const handleUpdateGoalImage = useCallback(
    (goalId: string, imageUrl: string, resolution: string) => {
      setGoals((current) => {
        const updated = current.map((g) =>
          g.id === goalId ? { ...g, imageUrl, imageResolution: resolution } : g
        );
        saveGoals(updated);
        return updated;
      });
    },
    []
  );

  const handleAddGoal = useCallback((goal: SavingGoal) => {
    setGoals((current) => {
      const updated = [...current, goal];
      saveGoals(updated);
      return updated;
    });
  }, []);

  const handleUpdateGoal = useCallback((updatedGoal: SavingGoal) => {
    setGoals((current) => {
      const updated = current.map((g) => (g.id === updatedGoal.id ? updatedGoal : g));
      saveGoals(updated);
      return updated;
    });
  }, []);

  const handleDeleteGoal = useCallback((id: string) => {
    setGoals((current) => {
      const updated = current.filter((g) => g.id !== id);
      saveGoals(updated);
      return updated;
    });
  }, []);

  const handleSyncGoalFromServer = useCallback((updatedGoal: SavingGoal) => {
    setGoals((current) => {
      const exists = current.some((g) => g.id === updatedGoal.id);
      const updated = exists
        ? current.map((g) => (g.id === updatedGoal.id ? updatedGoal : g))
        : [...current, updatedGoal];
      saveGoalsLocalOnly(updated);
      return updated;
    });
  }, []);

  const handleSyncGoalsFromServer = useCallback((updatedGoals: SavingGoal[]) => {
    if (updatedGoals.length === 0) return;
    setGoals((current) => {
      const byId = new Map(updatedGoals.map((g) => [g.id, g]));
      const updated = current.map((g) => byId.get(g.id) ?? g);
      saveGoalsLocalOnly(updated);
      return updated;
    });
  }, []);

  return {
    expenses: activeExpenses,
    allExpenses: expenses,
    allExpensesCount: expenses.length,
    excludedBeforeStartCount,
    settlements: activeSettlements,
    goals,
    trips,
    activeTrip,
    activeTripSummary,
    recurringExpenses,
    recurringMonthlyTotal,
    zeroQuarantineMatches,
    knownGmailSourceReferences,
    reconciliationNotice,
    clearReconciliationNotice: () => setReconciliationNotice(null),
    profile,
    ignoredGmailMessageIds,
    gmailRecurringRules,
    isCheckingAuth,
    isSyncingData,
    isVaultUnlocked,
    authMethod,
    isSignedIn,
    userEmail,
    sharedNotificationText: sharedNotificationTextState,
    setSharedNotificationText,
    pendingShortcutAction: pendingShortcutActionState,
    setPendingShortcutAction,
    balanceSummary,
    zeroAmountExpenses,
    handleUnlock,
    handleLockVault,
    handleAuthChanged,
    handleUpdateProfile,
    handleRefreshData,
    handleSaveExpense,
    handleDeleteExpense,
    handleRestoreExpense,
    handleImportGmailExpenses,
    handleMergeZeroExpense,
    handleMergeDuplicateExpense,
    handleDismissDuplicateExpense,
    handleSaveTrip,
    handleToggleTripActive,
    handleDeleteTrip,
    handleSaveRecurringExpense,
    handleDeleteRecurringExpense,
    handleTriggerRecurringExpense,
    handleIgnoreGmailMessage,
    handleUnignoreGmailMessage,
    handleSaveGmailRecurringRule,
    handleConfirmSettlement,
    handleDeleteSettlement,
    handleRestoreSettlement,
    handleUpdateGoalImage,
    handleAddGoal,
    handleUpdateGoal,
    handleDeleteGoal,
    handleSyncGoalFromServer,
    handleSyncGoalsFromServer,
  };
}
