import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { LEGACY_JSON_DB_FILE, SQLITE_DB_FILE } from './config';
import type {
  CoupleProfile,
  Expense,
  RecurringExpenseItem,
  SavingGoal,
  SavingsChallengePeriodStatus,
  SavingsChallengeSplitScope,
  SavingsChallengeStatus,
  Settlement,
  TripProject,
} from '../src/types';
import {
  buildAllowedCategorySet,
  isValidSafeEntityId,
  sanitizeChallengeLimit,
  sanitizeCustomCategories,
  sanitizeDurationMonths,
  sanitizeExpenseRecord,
  sanitizeGoalRecord,
  sanitizeIanaTimeZone,
  sanitizeIsoDate,
  sanitizePlainText,
  sanitizeProfileRecord,
  sanitizeRecurringExpenseRecord,
  sanitizeSettlementRecord,
  sanitizeTripRecord,
  sanitizeYearMonth,
  stripDangerousKeys,
} from './utils/security';
import { sanitizeGmailScanState } from '../src/services/gmail-scan-history';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_GMAIL_CACHE_MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_GMAIL_SCAN_CACHE_ENTRIES = 2000;
const MAX_GMAIL_CACHE_BLOB_CHARS = 32_000;

export interface SavingsChallengeRowBackup {
  id: string;
  title: string;
  goalId: string;
  goalTitleSnapshot: string;
  monthlyLimit: number;
  currency: string;
  startMonth: string;
  durationMonths: number;
  startDate: string;
  endDate: string;
  status: SavingsChallengeStatus;
  splitScope: SavingsChallengeSplitScope;
  initialSpend: number;
  currentValidSpend: number;
  virtualSavingsAccumulated: number;
  virtualSavingsApplied: number;
  lastReconciledAt?: string;
  lastCalculationError?: string;
  timezone: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface SavingsChallengeCategoryRowBackup {
  challengeId: string;
  categoryName: string;
  position: number;
}

export interface SavingsChallengePeriodRowBackup {
  id: string;
  challengeId: string;
  periodYm: string;
  startDate: string;
  endDate: string;
  monthlyLimit: number;
  validSpend: number;
  virtualSavingsPotential: number;
  virtualSavingsApplied: number;
  matchedExpenseCount: number;
  excludedExpenseCount: number;
  calculationMetaJson?: string;
  status: SavingsChallengePeriodStatus;
  reconciledAt?: string;
  calculationError?: string;
}

export interface SavingsChallengeContributionRowBackup {
  id: string;
  challengeId: string;
  periodYm?: string;
  goalId: string;
  goalTitleSnapshot: string;
  amount: number;
  currency: string;
  status: 'applied' | 'reverted';
  note?: string;
  idempotencyKey?: string;
  createdBy: string;
  createdAt: string;
  revertedAt?: string;
  revertedBy?: string;
  revertReason?: string;
}

export interface SavingsChallengeHistoryRowBackup {
  id: string;
  challengeId: string;
  action: string;
  actor: string;
  summary: string;
  beforeJson?: string;
  afterJson?: string;
  createdAt: string;
}

export interface SavingsChallengesBackupSnapshot {
  challenges: SavingsChallengeRowBackup[];
  categories: SavingsChallengeCategoryRowBackup[];
  periods: SavingsChallengePeriodRowBackup[];
  contributions: SavingsChallengeContributionRowBackup[];
  history: SavingsChallengeHistoryRowBackup[];
}

export interface ServerDatabase {
  expenses: Expense[];
  settlements: Settlement[];
  goals: SavingGoal[];
  profile: CoupleProfile;
  lastUpdated: string;
  gmailScanCache?: GmailScanCacheEntry[];
  trips?: TripProject[];
  recurringExpenses?: RecurringExpenseItem[];
  savingsChallengesBackup?: SavingsChallengesBackupSnapshot;
}

export interface GmailScanCacheEntry {
  accountEmail: string;
  messageId: string;
  scannedAt: string;
  receipt?: Record<string, unknown>;
  reviewCandidate?: Record<string, unknown>;
  suppressedLowConfidence?: boolean;
}

export interface AiModelRegistryEntry {
  modelId: string;
  kind: 'text' | 'image';
  status: 'active' | 'deprecated';
  replacementModel?: string;
  expiresAt: number;
  updatedAt: string;
}

export interface SqliteDatabaseOptions {
  dbFile?: string;
  legacyJsonFile?: string;
}

export interface SqliteDatabaseHandle {
  readDatabase: () => ServerDatabase;
  writeDatabase: (patch: Partial<ServerDatabase>) => ServerDatabase;
  insertExpenseRecord: (expense: Expense) => Expense;
  readAiModelRegistry: () => AiModelRegistryEntry[];
  upsertAiModelRegistry: (entries: AiModelRegistryEntry[]) => void;
  resetDatabase: () => ServerDatabase;
  withTransaction: <T>(action: (db: DatabaseSync) => T) => T;
  getRawDatabase: () => DatabaseSync;
  exportSavingsChallengesBackup: () => SavingsChallengesBackupSnapshot;
  restoreSavingsChallengesBackup: (snapshot: SavingsChallengesBackupSnapshot) => void;
  clearSavingsChallenges: () => void;
  close: () => void;
}

export const getInitialDatabase = (): ServerDatabase => ({
  expenses: [
    {
      id: 'exp-1',
      title: 'Supermercato Esselunga Spesa Settimanale',
      amount: 142.60,
      currency: 'EUR',
      date: '2026-11-08',
      category: 'Spesa',
      payer: 'user',
      splitType: '50_50',
      source: 'camera',
      notes: 'Frutta fresca, verdura biologica, pasta, olio extravergine e scorte casa',
      items: [
        { name: 'Verdura e Frutta Fresca', price: 34.20 },
        { name: 'Pasta e Sughi Artigianali', price: 18.50 },
        { name: 'Latticini e Uova', price: 22.40 },
        { name: 'Petto di pollo e Salmone', price: 41.50 },
        { name: 'Detersivi e prodotti per la casa', price: 26.00 },
      ],
      tax: 14.20,
    },
    {
      id: 'exp-2',
      title: 'Trattoria Osteria del Borgo Cena',
      amount: 88.00,
      currency: 'EUR',
      date: '2026-11-06',
      category: 'Ristoranti e Bar',
      payer: 'partner',
      splitType: '50_50',
      source: 'manual',
      notes: 'Cena romantica del venerdì con vino e dolci',
    },
    {
      id: 'exp-3',
      title: 'Bolletta Luce Enel Energia',
      amount: 94.50,
      currency: 'EUR',
      date: '2026-11-04',
      category: 'Bollette e Utenze',
      payer: 'user',
      splitType: '50_50',
      source: 'gmail',
      notes: 'Fattura bimestrale energia elettrica',
    },
    {
      id: 'exp-4',
      title: 'Amazon Prime Accessori e Dispensa',
      amount: 52.90,
      currency: 'EUR',
      date: '2026-11-03',
      category: 'Shopping',
      payer: 'partner',
      splitType: '50_50',
      source: 'gmail',
      notes: 'Barattoli in vetro per dispensa e organizer bagno',
    },
    {
      id: 'exp-5',
      title: 'Abbonamento Trenord e Metro Mensile',
      amount: 70.00,
      currency: 'EUR',
      date: '2026-11-01',
      category: 'Trasporti',
      payer: 'user',
      splitType: '50_50',
      source: 'manual',
      notes: 'Ricarica abbonamenti pendolari per entrambi',
    },
    {
      id: 'exp-6',
      title: 'Acconto Arredo Soggiorno',
      amount: 450.00,
      currency: 'EUR',
      date: '2026-10-28',
      category: 'Casa e Affitto',
      payer: 'user',
      splitType: '50_50',
      source: 'manual',
      notes: 'Primo acconto tavolo e sedie soggiorno',
    },
    {
      id: 'exp-7',
      title: 'Decathlon Abbigliamento Running (Personale)',
      amount: 45.00,
      currency: 'EUR',
      date: '2026-10-25',
      category: 'Salute e Benessere',
      payer: 'user',
      splitType: '100_user',
      source: 'manual',
      notes: 'Pantaloncini tecnici ed elastici da allenamento',
    },
    {
      id: 'exp-8',
      title: 'Coop Pane e Spesa Weekend',
      amount: 68.30,
      currency: 'EUR',
      date: '2026-10-22',
      category: 'Spesa',
      payer: 'partner',
      splitType: '50_50',
      source: 'camera',
      notes: 'Pane fresco, frutta e caffè in grani',
    },
  ],
  settlements: [
    {
      id: 'stl-1',
      date: '2026-10-31',
      amount: 110.00,
      currency: 'EUR',
      from: 'partner',
      to: 'user',
      note: 'Pareggio saldo fine mese di ottobre via Revolut',
    },
  ],
  goals: [
    {
      id: 'goal-1',
      title: 'Viaggio in Costiera Amalfitana',
      targetAmount: 4000,
      currentAmount: 2650,
      targetDate: '2027-06-15',
      imageUrl: '/src/assets/images/amalfi_honeymoon_goal_1794425601686.jpg',
      imageResolution: '1K',
    },
    {
      id: 'goal-2',
      title: 'Fondo Vacanza Estiva',
      targetAmount: 3000,
      currentAmount: 1800,
      targetDate: '2027-02-01',
    },
    {
      id: 'goal-3',
      title: 'Fondo Arredo Nuova Casa',
      targetAmount: 5000,
      currentAmount: 3200,
      targetDate: '2026-12-31',
    },
  ],
  profile: {
    userName: 'Partner 1',
    partnerName: 'Partner 2',
    monthlyBudget: 2800,
    currency: 'EUR',
    weddingBudgetGoal: 15000,
    userEmail: (process.env.DUOSPEND_OWNER_EMAIL || '').toLowerCase().trim(),
    partnerEmail: '',
  },
  lastUpdated: new Date().toISOString(),
});

function sanitizeGmailCacheJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const cleaned = stripDangerousKeys(value as Record<string, unknown>);
  try {
    const serialized = JSON.stringify(cleaned);
    if (serialized.length > MAX_GMAIL_CACHE_BLOB_CHARS) {
      return undefined;
    }
    return cleaned;
  } catch {
    return undefined;
  }
}

function sanitizeGmailScanCacheEntry(raw: unknown): GmailScanCacheEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const accountEmail = sanitizePlainText(entry.accountEmail, 254).toLowerCase();
  if (!accountEmail || !accountEmail.includes('@') || /\s/.test(accountEmail)) {
    return null;
  }
  const messageId = typeof entry.messageId === 'string' ? entry.messageId.trim() : '';
  if (!SAFE_GMAIL_CACHE_MESSAGE_ID_PATTERN.test(messageId)) {
    return null;
  }
  const rawScannedAt = typeof entry.scannedAt === 'string' ? entry.scannedAt.trim() : '';
  const parsedScannedAt = rawScannedAt ? Date.parse(rawScannedAt) : NaN;
  const scannedAt =
    Number.isFinite(parsedScannedAt) && parsedScannedAt > 0
      ? new Date(parsedScannedAt).toISOString()
      : new Date().toISOString();

  const receipt = sanitizeGmailCacheJsonObject(entry.receipt);
  const reviewCandidate = sanitizeGmailCacheJsonObject(entry.reviewCandidate);

  return {
    accountEmail,
    messageId,
    scannedAt,
    ...(receipt ? { receipt } : {}),
    ...(reviewCandidate ? { reviewCandidate } : {}),
    ...(entry.suppressedLowConfidence === true ? { suppressedLowConfidence: true } : {}),
  };
}

function sanitizeLegacyDatabasePayload(raw: unknown): ServerDatabase {
  const fallback = getInitialDatabase();
  const safeRaw = stripDangerousKeys(raw);
  if (!safeRaw || typeof safeRaw !== 'object' || Array.isArray(safeRaw)) {
    return fallback;
  }

  const candidate = safeRaw as Record<string, unknown>;
  const rawProfileSource =
    candidate.profile && typeof candidate.profile === 'object' && !Array.isArray(candidate.profile)
      ? { ...(candidate.profile as Record<string, unknown>) }
      : {};
  delete rawProfileSource.securityPin;
  delete rawProfileSource.webhookSecret;

  const candidateUserEmail =
    typeof rawProfileSource.userEmail === 'string'
      ? sanitizePlainText(rawProfileSource.userEmail, 254).toLowerCase()
      : '';
  const candidatePartnerEmail =
    typeof rawProfileSource.partnerEmail === 'string'
      ? sanitizePlainText(rawProfileSource.partnerEmail, 254).toLowerCase()
      : '';
  const legacyUserEmail = EMAIL_PATTERN.test(candidateUserEmail)
    ? candidateUserEmail
    : fallback.profile.userEmail || '';
  const legacyPartnerEmail = EMAIL_PATTERN.test(candidatePartnerEmail)
    ? candidatePartnerEmail
    : fallback.profile.partnerEmail || '';

  const goals = Array.isArray(candidate.goals)
    ? candidate.goals
        .slice(0, 1_000)
        .map(sanitizeGoalRecord)
        .filter((goal): goal is SavingGoal => goal !== null)
    : fallback.goals;

  const customCatsFromLegacy = sanitizeCustomCategories(
    rawProfileSource.customCategories,
    fallback.profile.customCategories
  );
  const legacyAllowedCategories = buildAllowedCategorySet(
    { customCategories: customCatsFromLegacy },
    goals
  );

  const profile = sanitizeProfileRecord(
    rawProfileSource,
    { ...fallback.profile, userEmail: legacyUserEmail },
    legacyPartnerEmail,
    legacyAllowedCategories
  );

  const expenses = Array.isArray(candidate.expenses)
    ? candidate.expenses
        .slice(0, 10_000)
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
          const record = item as Record<string, unknown>;
          return record.id === 'exp-7' &&
            record.title === 'Decathlon Abbigliamento Running (Utente 1)'
            ? { ...record, title: 'Decathlon Abbigliamento Running (Personale)' }
            : record;
        })
        .map((item) => sanitizeExpenseRecord(item, legacyAllowedCategories))
        .filter((expense): expense is Expense => expense !== null)
    : fallback.expenses;

  const settlements = Array.isArray(candidate.settlements)
    ? candidate.settlements
        .slice(0, 10_000)
        .map(sanitizeSettlementRecord)
        .filter((settlement): settlement is Settlement => settlement !== null)
    : fallback.settlements;

  const parsedLastUpdated =
    typeof candidate.lastUpdated === 'string' ? Date.parse(candidate.lastUpdated) : NaN;
  const lastUpdated =
    Number.isFinite(parsedLastUpdated) && parsedLastUpdated > 0
      ? new Date(parsedLastUpdated).toISOString()
      : new Date().toISOString();

  const gmailScanCache = Array.isArray(candidate.gmailScanCache)
    ? candidate.gmailScanCache
        .slice(0, MAX_GMAIL_SCAN_CACHE_ENTRIES)
        .map(sanitizeGmailScanCacheEntry)
        .filter((entry): entry is GmailScanCacheEntry => entry !== null)
    : undefined;

  const trips = Array.isArray(candidate.trips)
    ? candidate.trips
        .slice(0, 500)
        .map((item) => sanitizeTripRecord(item, legacyAllowedCategories))
        .filter((trip): trip is TripProject => trip !== null)
    : undefined;

  const recurringExpenses = Array.isArray(candidate.recurringExpenses)
    ? candidate.recurringExpenses
        .slice(0, 500)
        .map((item) => sanitizeRecurringExpenseRecord(item, legacyAllowedCategories))
        .filter((item): item is RecurringExpenseItem => item !== null)
    : undefined;

  return {
    expenses,
    settlements,
    goals,
    profile,
    lastUpdated,
    ...(gmailScanCache ? { gmailScanCache } : {}),
    ...(trips && trips.length > 0 ? { trips } : {}),
    ...(recurringExpenses && recurringExpenses.length > 0 ? { recurringExpenses } : {}),
  };
}

function parseJsonSafe<T>(value: unknown): T | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function runInTransaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failure when transaction is already aborted
    }
    throw error;
  }
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA wal_autocheckpoint = 1000;
    PRAGMA journal_size_limit = 67108864;

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      payer TEXT NOT NULL,
      split_type TEXT NOT NULL,
      custom_split_ratio REAL,
      source TEXT NOT NULL,
      source_reference TEXT,
      notes TEXT,
      receipt_url TEXT,
      items_json TEXT,
      tax REAL,
      position INTEGER NOT NULL DEFAULT 0,
      trip_id TEXT,
      recurring_rule_id TEXT,
      reconciliation_status TEXT,
      duplicate_candidate_id TEXT,
      linked_sources_json TEXT,
      linked_references_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date DESC);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (category);

    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      from_payer TEXT NOT NULL,
      to_payer TEXT NOT NULL,
      note TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_settlements_date ON settlements (date DESC);

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL,
      target_date TEXT,
      image_url TEXT,
      image_resolution TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      budget REAL,
      default_category TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      ai_summary TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      merchant_aliases_json TEXT,
      expected_amount REAL NOT NULL,
      amount_tolerance_percent REAL,
      currency TEXT NOT NULL,
      category TEXT NOT NULL,
      payer TEXT NOT NULL,
      split_type TEXT NOT NULL,
      custom_split_ratio REAL,
      frequency TEXT NOT NULL,
      day_of_month INTEGER NOT NULL DEFAULT 1,
      auto_match_notifications INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      last_matched_cycle TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      user_name TEXT NOT NULL,
      partner_name TEXT NOT NULL,
      monthly_budget REAL NOT NULL,
      currency TEXT NOT NULL,
      wedding_budget_goal REAL,
      user_email TEXT NOT NULL DEFAULT '',
      partner_email TEXT NOT NULL DEFAULT '',
      category_budgets_json TEXT,
      custom_categories_json TEXT,
      hidden_categories_json TEXT,
      tracking_start_date TEXT,
      gmail_scan_state_json TEXT,
      last_updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gmail_scan_cache (
      account_email TEXT NOT NULL,
      message_id TEXT NOT NULL,
      scanned_at TEXT NOT NULL,
      receipt_json TEXT,
      review_candidate_json TEXT,
      suppressed_low_confidence INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (account_email, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_gmail_scan_cache_scanned_at ON gmail_scan_cache (scanned_at);

    CREATE TABLE IF NOT EXISTS ai_model_registry (
      model_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      replacement_model TEXT,
      expires_at INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_model_registry_expires_at ON ai_model_registry (expires_at);

    CREATE TABLE IF NOT EXISTS savings_challenges (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      goal_title_snapshot TEXT NOT NULL,
      monthly_limit REAL NOT NULL,
      currency TEXT NOT NULL,
      start_month TEXT NOT NULL,
      duration_months INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL,
      split_scope TEXT NOT NULL DEFAULT 'all',
      initial_spend REAL NOT NULL DEFAULT 0,
      current_valid_spend REAL NOT NULL DEFAULT 0,
      virtual_savings_accumulated REAL NOT NULL DEFAULT 0,
      virtual_savings_applied REAL NOT NULL DEFAULT 0,
      last_reconciled_at TEXT,
      last_calculation_error TEXT,
      timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_savings_challenges_goal_id ON savings_challenges (goal_id);
    CREATE INDEX IF NOT EXISTS idx_savings_challenges_status ON savings_challenges (status);
    CREATE INDEX IF NOT EXISTS idx_savings_challenges_dates ON savings_challenges (start_date, end_date);

    CREATE TABLE IF NOT EXISTS savings_challenge_categories (
      challenge_id TEXT NOT NULL,
      category_name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (challenge_id, category_name),
      FOREIGN KEY (challenge_id) REFERENCES savings_challenges(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_savings_challenge_categories_name ON savings_challenge_categories (category_name);

    CREATE TABLE IF NOT EXISTS savings_challenge_periods (
      id TEXT PRIMARY KEY,
      challenge_id TEXT NOT NULL,
      period_ym TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      monthly_limit REAL NOT NULL,
      valid_spend REAL NOT NULL DEFAULT 0,
      virtual_savings_potential REAL NOT NULL DEFAULT 0,
      virtual_savings_applied REAL NOT NULL DEFAULT 0,
      matched_expense_count INTEGER NOT NULL DEFAULT 0,
      excluded_expense_count INTEGER NOT NULL DEFAULT 0,
      calculation_meta_json TEXT,
      status TEXT NOT NULL,
      reconciled_at TEXT,
      calculation_error TEXT,
      UNIQUE (challenge_id, period_ym),
      FOREIGN KEY (challenge_id) REFERENCES savings_challenges(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_savings_challenge_periods_challenge ON savings_challenge_periods (challenge_id, period_ym);

    CREATE TABLE IF NOT EXISTS savings_challenge_contributions (
      id TEXT PRIMARY KEY,
      challenge_id TEXT NOT NULL,
      period_ym TEXT,
      goal_id TEXT NOT NULL,
      goal_title_snapshot TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      idempotency_key TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reverted_at TEXT,
      reverted_by TEXT,
      revert_reason TEXT,
      FOREIGN KEY (challenge_id) REFERENCES savings_challenges(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_savings_challenge_contributions_challenge ON savings_challenge_contributions (challenge_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_savings_challenge_contributions_goal ON savings_challenge_contributions (goal_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_savings_challenge_contributions_idem ON savings_challenge_contributions (idempotency_key) WHERE idempotency_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS savings_challenge_history (
      id TEXT PRIMARY KEY,
      challenge_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      summary TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (challenge_id) REFERENCES savings_challenges(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_savings_challenge_history_challenge_time ON savings_challenge_history (challenge_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS savings_challenge_idempotency (
      idempotency_key TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      challenge_id TEXT,
      response_status INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_savings_challenge_idempotency_expires ON savings_challenge_idempotency (expires_at);
  `);

  const expenseCols = db.prepare('PRAGMA table_info(expenses)').all() as Array<{ name?: string }>;
  const expenseColNames = new Set(expenseCols.map((col) => col.name));
  if (!expenseColNames.has('trip_id')) {
    db.exec('ALTER TABLE expenses ADD COLUMN trip_id TEXT');
  }
  if (!expenseColNames.has('recurring_rule_id')) {
    db.exec('ALTER TABLE expenses ADD COLUMN recurring_rule_id TEXT');
  }
  if (!expenseColNames.has('reconciliation_status')) {
    db.exec('ALTER TABLE expenses ADD COLUMN reconciliation_status TEXT');
  }
  if (!expenseColNames.has('duplicate_candidate_id')) {
    db.exec('ALTER TABLE expenses ADD COLUMN duplicate_candidate_id TEXT');
  }
  if (!expenseColNames.has('linked_sources_json')) {
    db.exec('ALTER TABLE expenses ADD COLUMN linked_sources_json TEXT');
  }
  if (!expenseColNames.has('linked_references_json')) {
    db.exec('ALTER TABLE expenses ADD COLUMN linked_references_json TEXT');
  }

  const profileCols = db.prepare('PRAGMA table_info(profile)').all() as Array<{ name?: string }>;
  const profileColNames = new Set(profileCols.map((col) => col.name));
  if (!profileColNames.has('custom_categories_json')) {
    db.exec('ALTER TABLE profile ADD COLUMN custom_categories_json TEXT');
  }
  if (!profileColNames.has('hidden_categories_json')) {
    db.exec('ALTER TABLE profile ADD COLUMN hidden_categories_json TEXT');
  }
  if (!profileColNames.has('tracking_start_date')) {
    db.exec('ALTER TABLE profile ADD COLUMN tracking_start_date TEXT');
  }
  if (!profileColNames.has('gmail_scan_state_json')) {
    db.exec('ALTER TABLE profile ADD COLUMN gmail_scan_state_json TEXT');
  }
}

export function createSqliteDatabase(options: SqliteDatabaseOptions = {}): SqliteDatabaseHandle {
  const dbFile = options.dbFile ?? SQLITE_DB_FILE;
  const legacyJsonFile =
    options.legacyJsonFile !== undefined
      ? options.legacyJsonFile
      : dbFile === SQLITE_DB_FILE
        ? LEGACY_JSON_DB_FILE
        : undefined;

  if (dbFile !== ':memory:') {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  }

  const db = new DatabaseSync(dbFile);
  initializeSchema(db);

  const insertExpenseStmt = db.prepare(`
    INSERT INTO expenses (
      id, title, amount, currency, date, category, payer, split_type,
      custom_split_ratio, source, source_reference, notes, receipt_url,
      items_json, tax, position, trip_id, recurring_rule_id,
      reconciliation_status, duplicate_candidate_id, linked_sources_json, linked_references_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      amount = excluded.amount,
      currency = excluded.currency,
      date = excluded.date,
      category = excluded.category,
      payer = excluded.payer,
      split_type = excluded.split_type,
      custom_split_ratio = excluded.custom_split_ratio,
      source = excluded.source,
      source_reference = excluded.source_reference,
      notes = excluded.notes,
      receipt_url = excluded.receipt_url,
      items_json = excluded.items_json,
      tax = excluded.tax,
      position = excluded.position,
      trip_id = excluded.trip_id,
      recurring_rule_id = excluded.recurring_rule_id,
      reconciliation_status = excluded.reconciliation_status,
      duplicate_candidate_id = excluded.duplicate_candidate_id,
      linked_sources_json = excluded.linked_sources_json,
      linked_references_json = excluded.linked_references_json
  `);

  const insertTripStmt = db.prepare(`
    INSERT INTO trips (
      id, name, start_date, end_date, budget, default_category, is_active, ai_summary, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      budget = excluded.budget,
      default_category = excluded.default_category,
      is_active = excluded.is_active,
      ai_summary = excluded.ai_summary,
      position = excluded.position
  `);

  const insertRecurringStmt = db.prepare(`
    INSERT INTO recurring_expenses (
      id, title, merchant_aliases_json, expected_amount, amount_tolerance_percent,
      currency, category, payer, split_type, custom_split_ratio,
      frequency, day_of_month, auto_match_notifications, active, last_matched_cycle, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      merchant_aliases_json = excluded.merchant_aliases_json,
      expected_amount = excluded.expected_amount,
      amount_tolerance_percent = excluded.amount_tolerance_percent,
      currency = excluded.currency,
      category = excluded.category,
      payer = excluded.payer,
      split_type = excluded.split_type,
      custom_split_ratio = excluded.custom_split_ratio,
      frequency = excluded.frequency,
      day_of_month = excluded.day_of_month,
      auto_match_notifications = excluded.auto_match_notifications,
      active = excluded.active,
      last_matched_cycle = excluded.last_matched_cycle,
      position = excluded.position
  `);

  const insertSettlementStmt = db.prepare(`
    INSERT INTO settlements (id, date, amount, currency, from_payer, to_payer, note, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date,
      amount = excluded.amount,
      currency = excluded.currency,
      from_payer = excluded.from_payer,
      to_payer = excluded.to_payer,
      note = excluded.note,
      position = excluded.position
  `);

  const insertGoalStmt = db.prepare(`
    INSERT INTO goals (
      id, title, target_amount, current_amount, target_date, image_url, image_resolution, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      target_amount = excluded.target_amount,
      current_amount = excluded.current_amount,
      target_date = excluded.target_date,
      image_url = excluded.image_url,
      image_resolution = excluded.image_resolution,
      position = excluded.position
  `);

  const upsertProfileStmt = db.prepare(`
    INSERT INTO profile (
      id, user_name, partner_name, monthly_budget, currency, wedding_budget_goal,
      user_email, partner_email, category_budgets_json, custom_categories_json,
      hidden_categories_json, tracking_start_date, gmail_scan_state_json, last_updated
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      user_name = excluded.user_name,
      partner_name = excluded.partner_name,
      monthly_budget = excluded.monthly_budget,
      currency = excluded.currency,
      wedding_budget_goal = excluded.wedding_budget_goal,
      user_email = excluded.user_email,
      partner_email = excluded.partner_email,
      category_budgets_json = excluded.category_budgets_json,
      custom_categories_json = excluded.custom_categories_json,
      hidden_categories_json = excluded.hidden_categories_json,
      tracking_start_date = excluded.tracking_start_date,
      gmail_scan_state_json = excluded.gmail_scan_state_json,
      last_updated = excluded.last_updated
  `);

  const insertCacheStmt = db.prepare(`
    INSERT INTO gmail_scan_cache (
      account_email, message_id, scanned_at, receipt_json, review_candidate_json, suppressed_low_confidence
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_email, message_id) DO UPDATE SET
      scanned_at = excluded.scanned_at,
      receipt_json = excluded.receipt_json,
      review_candidate_json = excluded.review_candidate_json,
      suppressed_low_confidence = excluded.suppressed_low_confidence
  `);

  const replaceExpenses = (expenses: Expense[]) => {
    db.exec('DELETE FROM expenses');
    expenses.forEach((expense, index) => {
      insertExpenseStmt.run(
        expense.id,
        expense.title,
        expense.amount,
        expense.currency,
        expense.date,
        expense.category,
        expense.payer,
        expense.splitType,
        expense.customSplitRatio ?? null,
        expense.source,
        expense.sourceReference ?? null,
        expense.notes ?? null,
        expense.receiptUrl ?? null,
        expense.items && expense.items.length > 0 ? JSON.stringify(expense.items) : null,
        expense.tax ?? null,
        index,
        expense.tripId ?? null,
        expense.recurringRuleId ?? null,
        expense.reconciliationStatus ?? null,
        expense.duplicateCandidateId ?? null,
        expense.linkedSources && expense.linkedSources.length > 0
          ? JSON.stringify(expense.linkedSources)
          : null,
        expense.linkedReferences && expense.linkedReferences.length > 0
          ? JSON.stringify(expense.linkedReferences)
          : null
      );
    });
  };

  const replaceTrips = (trips: TripProject[]) => {
    db.exec('DELETE FROM trips');
    trips.forEach((trip, index) => {
      insertTripStmt.run(
        trip.id,
        trip.name,
        trip.startDate,
        trip.endDate ?? null,
        trip.budget ?? null,
        trip.defaultCategory ?? null,
        trip.isActive ? 1 : 0,
        trip.aiSummary ?? null,
        index
      );
    });
  };

  const replaceRecurringExpenses = (recurringList: RecurringExpenseItem[]) => {
    db.exec('DELETE FROM recurring_expenses');
    recurringList.forEach((item, index) => {
      insertRecurringStmt.run(
        item.id,
        item.title,
        item.merchantAliases && item.merchantAliases.length > 0
          ? JSON.stringify(item.merchantAliases)
          : null,
        item.expectedAmount,
        item.amountTolerancePercent ?? null,
        item.currency,
        item.category,
        item.payer,
        item.splitType,
        item.customSplitRatio ?? null,
        item.frequency,
        item.dayOfMonth,
        item.autoMatchNotifications ? 1 : 0,
        item.active ? 1 : 0,
        item.lastMatchedCycle ?? null,
        index
      );
    });
  };

  const replaceSettlements = (settlements: Settlement[]) => {
    db.exec('DELETE FROM settlements');
    settlements.forEach((stl, index) => {
      insertSettlementStmt.run(
        stl.id,
        stl.date,
        stl.amount,
        stl.currency,
        stl.from,
        stl.to,
        stl.note,
        index
      );
    });
  };

  const replaceGoals = (goals: SavingGoal[]) => {
    db.exec('DELETE FROM goals');
    goals.forEach((goal, index) => {
      insertGoalStmt.run(
        goal.id,
        goal.title,
        goal.targetAmount,
        goal.currentAmount,
        goal.targetDate ?? null,
        goal.imageUrl ?? null,
        goal.imageResolution ?? null,
        index
      );
    });
  };

  const saveProfile = (profile: CoupleProfile, lastUpdated: string) => {
    const categoryBudgetsJson =
      profile.categoryBudgets && Object.keys(profile.categoryBudgets).length > 0
        ? JSON.stringify(profile.categoryBudgets)
        : null;
    const customCategoriesJson =
      profile.customCategories && profile.customCategories.length > 0
        ? JSON.stringify(profile.customCategories)
        : null;
    const hiddenCategoriesJson =
      profile.hiddenCategories && profile.hiddenCategories.length > 0
        ? JSON.stringify(profile.hiddenCategories)
        : null;
    const sanitizedGmailScanState = sanitizeGmailScanState(profile.gmailScanState);
    const gmailScanStateJson = sanitizedGmailScanState
      ? JSON.stringify(sanitizedGmailScanState)
      : null;
    upsertProfileStmt.run(
      profile.userName,
      profile.partnerName,
      profile.monthlyBudget,
      profile.currency,
      profile.weddingBudgetGoal ?? null,
      profile.userEmail ?? '',
      profile.partnerEmail ?? '',
      categoryBudgetsJson,
      customCategoriesJson,
      hiddenCategoriesJson,
      profile.trackingStartDate ?? null,
      gmailScanStateJson,
      lastUpdated
    );
  };

  const replaceGmailScanCache = (entries: GmailScanCacheEntry[]) => {
    db.exec('DELETE FROM gmail_scan_cache');
    entries
      .slice(0, MAX_GMAIL_SCAN_CACHE_ENTRIES)
      .map(sanitizeGmailScanCacheEntry)
      .filter((entry): entry is GmailScanCacheEntry => entry !== null)
      .forEach((entry) => {
        insertCacheStmt.run(
          entry.accountEmail,
          entry.messageId,
          entry.scannedAt,
          entry.receipt ? JSON.stringify(entry.receipt) : null,
          entry.reviewCandidate ? JSON.stringify(entry.reviewCandidate) : null,
          entry.suppressedLowConfidence ? 1 : 0
        );
      });
  };

  const ALLOWED_CHALLENGE_STATUSES = new Set<SavingsChallengeStatus>([
    'active',
    'paused',
    'completed',
    'cancelled',
  ]);
  const ALLOWED_PERIOD_STATUSES = new Set<SavingsChallengePeriodStatus>([
    'upcoming',
    'active',
    'completed',
    'paused',
    'cancelled',
    'needs_recalculation',
  ]);

  const clearChallengesTablesInTx = () => {
    db.exec('DELETE FROM savings_challenges');
    db.exec('DELETE FROM savings_challenge_idempotency');
  };

  const insertChallengeBackupStmt = db.prepare(`
    INSERT INTO savings_challenges (
      id, title, goal_id, goal_title_snapshot, monthly_limit, currency,
      start_month, duration_months, start_date, end_date, status, split_scope,
      initial_spend, current_valid_spend, virtual_savings_accumulated, virtual_savings_applied,
      last_reconciled_at, last_calculation_error, timezone, created_by, created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertChallengeCatBackupStmt = db.prepare(`
    INSERT INTO savings_challenge_categories (challenge_id, category_name, position)
    VALUES (?, ?, ?)
    ON CONFLICT(challenge_id, category_name) DO UPDATE SET position = excluded.position
  `);

  const insertChallengePeriodBackupStmt = db.prepare(`
    INSERT INTO savings_challenge_periods (
      id, challenge_id, period_ym, start_date, end_date, monthly_limit, valid_spend,
      virtual_savings_potential, virtual_savings_applied, matched_expense_count,
      excluded_expense_count, calculation_meta_json, status, reconciled_at, calculation_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertChallengeContribBackupStmt = db.prepare(`
    INSERT INTO savings_challenge_contributions (
      id, challenge_id, period_ym, goal_id, goal_title_snapshot, amount, currency,
      status, note, idempotency_key, created_by, created_at, reverted_at, reverted_by, revert_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertChallengeHistoryBackupStmt = db.prepare(`
    INSERT INTO savings_challenge_history (
      id, challenge_id, action, actor, summary, before_json, after_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const replaceSavingsChallengesBackupInTx = (rawSnapshot: SavingsChallengesBackupSnapshot) => {
    const safeSnapshot = stripDangerousKeys(rawSnapshot);
    clearChallengesTablesInTx();
    if (!safeSnapshot || typeof safeSnapshot !== 'object') return;

    const validChallengeIds = new Set<string>();
    const challenges = Array.isArray(safeSnapshot.challenges) ? safeSnapshot.challenges.slice(0, 200) : [];
    for (const ch of challenges) {
      if (!ch || !isValidSafeEntityId(ch.id) || !isValidSafeEntityId(ch.goalId)) continue;
      const limit = sanitizeChallengeLimit(ch.monthlyLimit);
      const startMonth = sanitizeYearMonth(ch.startMonth);
      const durationMonths = sanitizeDurationMonths(ch.durationMonths);
      if (limit === null || !startMonth || durationMonths === null) continue;
      const status = ALLOWED_CHALLENGE_STATUSES.has(ch.status) ? ch.status : 'active';
      const splitScope: SavingsChallengeSplitScope =
        ch.splitScope === 'shared_only' ? 'shared_only' : 'all';
      const currency =
        typeof ch.currency === 'string' && /^[A-Z]{3}$/.test(ch.currency.trim().toUpperCase())
          ? ch.currency.trim().toUpperCase()
          : 'EUR';
      const timezone = sanitizeIanaTimeZone(ch.timezone, 'Europe/Rome');
      const nowIso = new Date().toISOString();

      insertChallengeBackupStmt.run(
        ch.id,
        sanitizePlainText(ch.title, 100, 'Sfida di Risparmio'),
        ch.goalId,
        sanitizePlainText(ch.goalTitleSnapshot, 160, 'Obiettivo di Coppia'),
        limit,
        currency,
        startMonth,
        durationMonths,
        sanitizeIsoDate(ch.startDate),
        sanitizeIsoDate(ch.endDate),
        status,
        splitScope,
        Math.max(0, Math.round((Number(ch.initialSpend) || 0) * 100) / 100),
        Math.max(0, Math.round((Number(ch.currentValidSpend) || 0) * 100) / 100),
        Math.max(0, Math.round((Number(ch.virtualSavingsAccumulated) || 0) * 100) / 100),
        Math.max(0, Math.round((Number(ch.virtualSavingsApplied) || 0) * 100) / 100),
        ch.lastReconciledAt ? sanitizePlainText(ch.lastReconciledAt, 40) : null,
        ch.lastCalculationError ? sanitizePlainText(ch.lastCalculationError, 240) : null,
        timezone,
        sanitizePlainText(ch.createdBy, 100, 'Coppia'),
        sanitizePlainText(ch.createdAt, 40, nowIso),
        sanitizePlainText(ch.updatedAt, 40, nowIso),
        Math.max(1, Math.floor(Number(ch.version) || 1))
      );
      validChallengeIds.add(ch.id);
    }

    const categories = Array.isArray(safeSnapshot.categories) ? safeSnapshot.categories.slice(0, 4000) : [];
    for (const cat of categories) {
      if (!cat || !validChallengeIds.has(cat.challengeId)) continue;
      const cleanName = sanitizePlainText(cat.categoryName, 60);
      if (!cleanName) continue;
      insertChallengeCatBackupStmt.run(
        cat.challengeId,
        cleanName,
        Math.max(0, Math.floor(Number(cat.position) || 0))
      );
    }

    const periods = Array.isArray(safeSnapshot.periods) ? safeSnapshot.periods.slice(0, 2400) : [];
    for (const period of periods) {
      if (!period || !validChallengeIds.has(period.challengeId)) continue;
      const periodYm = sanitizeYearMonth(period.periodYm);
      if (!periodYm) continue;
      const periodId = sanitizePlainText(period.id, 120, `${period.challengeId}:${periodYm}`);
      insertChallengePeriodBackupStmt.run(
        periodId,
        period.challengeId,
        periodYm,
        sanitizeIsoDate(period.startDate),
        sanitizeIsoDate(period.endDate),
        Math.max(0, Math.round((Number(period.monthlyLimit) || 0) * 100) / 100),
        Math.max(0, Math.round((Number(period.validSpend) || 0) * 100) / 100),
        Math.max(0, Math.round((Number(period.virtualSavingsPotential) || 0) * 100) / 100),
        Math.max(0, Math.round((Number(period.virtualSavingsApplied) || 0) * 100) / 100),
        Math.max(0, Math.floor(Number(period.matchedExpenseCount) || 0)),
        Math.max(0, Math.floor(Number(period.excludedExpenseCount) || 0)),
        typeof period.calculationMetaJson === 'string'
          ? period.calculationMetaJson.slice(0, 16_000)
          : null,
        ALLOWED_PERIOD_STATUSES.has(period.status) ? period.status : 'active',
        period.reconciledAt ? sanitizePlainText(period.reconciledAt, 40) : null,
        period.calculationError ? sanitizePlainText(period.calculationError, 240) : null
      );
    }

    const contributions = Array.isArray(safeSnapshot.contributions)
      ? safeSnapshot.contributions.slice(0, 5000)
      : [];
    for (const contrib of contributions) {
      if (!contrib || !validChallengeIds.has(contrib.challengeId) || !isValidSafeEntityId(contrib.id)) {
        continue;
      }
      const amount = Math.round((Number(contrib.amount) || 0) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const currency =
        typeof contrib.currency === 'string' && /^[A-Z]{3}$/.test(contrib.currency.trim().toUpperCase())
          ? contrib.currency.trim().toUpperCase()
          : 'EUR';
      insertChallengeContribBackupStmt.run(
        contrib.id,
        contrib.challengeId,
        contrib.periodYm ? sanitizeYearMonth(contrib.periodYm) : null,
        sanitizePlainText(contrib.goalId, 80, 'goal'),
        sanitizePlainText(contrib.goalTitleSnapshot, 160, 'Obiettivo di Coppia'),
        amount,
        currency,
        contrib.status === 'reverted' ? 'reverted' : 'applied',
        contrib.note ? sanitizePlainText(contrib.note, 300) : null,
        contrib.idempotencyKey ? sanitizePlainText(contrib.idempotencyKey, 128) : null,
        sanitizePlainText(contrib.createdBy, 100, 'Coppia'),
        sanitizePlainText(contrib.createdAt, 40, new Date().toISOString()),
        contrib.revertedAt ? sanitizePlainText(contrib.revertedAt, 40) : null,
        contrib.revertedBy ? sanitizePlainText(contrib.revertedBy, 100) : null,
        contrib.revertReason ? sanitizePlainText(contrib.revertReason, 300) : null
      );
    }

    const history = Array.isArray(safeSnapshot.history) ? safeSnapshot.history.slice(0, 10_000) : [];
    for (const entry of history) {
      if (!entry || !validChallengeIds.has(entry.challengeId) || !isValidSafeEntityId(entry.id)) {
        continue;
      }
      insertChallengeHistoryBackupStmt.run(
        entry.id,
        entry.challengeId,
        sanitizePlainText(entry.action, 60, 'updated'),
        sanitizePlainText(entry.actor, 100, 'Coppia'),
        sanitizePlainText(entry.summary, 400, 'Aggiornamento'),
        typeof entry.beforeJson === 'string' ? entry.beforeJson.slice(0, 16_000) : null,
        typeof entry.afterJson === 'string' ? entry.afterJson.slice(0, 16_000) : null,
        sanitizePlainText(entry.createdAt, 40, new Date().toISOString())
      );
    }
  };

  const seedFullDatabase = (seed: ServerDatabase) => {
    runInTransaction(db, () => {
      replaceExpenses(seed.expenses);
      replaceSettlements(seed.settlements);
      replaceGoals(seed.goals);
      replaceTrips(seed.trips ?? []);
      replaceRecurringExpenses(seed.recurringExpenses ?? []);
      saveProfile(seed.profile, seed.lastUpdated);
      replaceGmailScanCache(seed.gmailScanCache ?? []);
      if (seed.savingsChallengesBackup) {
        replaceSavingsChallengesBackupInTx(seed.savingsChallengesBackup);
      } else {
        clearChallengesTablesInTx();
      }
    });
  };

  const existingProfile = db.prepare('SELECT id FROM profile WHERE id = 1').get();
  if (!existingProfile) {
    let initialSeed = getInitialDatabase();
    if (legacyJsonFile && fs.existsSync(legacyJsonFile)) {
      try {
        const legacyContent = fs.readFileSync(legacyJsonFile, 'utf-8');
        initialSeed = sanitizeLegacyDatabasePayload(JSON.parse(legacyContent));
      } catch (err) {
        console.warn('Legacy JSON migration failed, initializing fresh SQLite database:', err);
      }
    }
    seedFullDatabase(initialSeed);
  }

  const readDatabase = (): ServerDatabase => {
    try {
      const expenseRows = db
        .prepare('SELECT * FROM expenses ORDER BY position ASC')
        .all() as Array<Record<string, unknown>>;
      const settlementRows = db
        .prepare('SELECT * FROM settlements ORDER BY position ASC')
        .all() as Array<Record<string, unknown>>;
      const goalRows = db
        .prepare('SELECT * FROM goals ORDER BY position ASC')
        .all() as Array<Record<string, unknown>>;
      const tripRows = db
        .prepare('SELECT * FROM trips ORDER BY position ASC')
        .all() as Array<Record<string, unknown>>;
      const recurringRows = db
        .prepare('SELECT * FROM recurring_expenses ORDER BY position ASC')
        .all() as Array<Record<string, unknown>>;
      const profileRow = db
        .prepare('SELECT * FROM profile WHERE id = 1')
        .get() as Record<string, unknown> | undefined;
      const cacheRows = db
        .prepare('SELECT * FROM gmail_scan_cache')
        .all() as Array<Record<string, unknown>>;

      const fallbackProfile = getInitialDatabase().profile;
      const categoryBudgets = parseJsonSafe<CoupleProfile['categoryBudgets']>(
        profileRow?.category_budgets_json
      );
      const customCategories = parseJsonSafe<string[]>(
        profileRow?.custom_categories_json
      );
      const hiddenCategories = parseJsonSafe<string[]>(
        profileRow?.hidden_categories_json
      );
      const gmailScanState = sanitizeGmailScanState(
        parseJsonSafe<unknown>(profileRow?.gmail_scan_state_json)
      );

      const trackingStartDateRaw =
        typeof profileRow?.tracking_start_date === 'string'
          ? profileRow.tracking_start_date.trim()
          : '';
      const trackingStartDate = /^\d{4}-\d{2}-\d{2}$/.test(trackingStartDateRaw)
        ? trackingStartDateRaw
        : undefined;

      const profile: CoupleProfile = profileRow
        ? {
            userName: String(profileRow.user_name ?? fallbackProfile.userName),
            partnerName: String(profileRow.partner_name ?? fallbackProfile.partnerName),
            monthlyBudget: Number(profileRow.monthly_budget ?? fallbackProfile.monthlyBudget),
            currency: String(profileRow.currency ?? fallbackProfile.currency),
            ...(profileRow.wedding_budget_goal != null
              ? { weddingBudgetGoal: Number(profileRow.wedding_budget_goal) }
              : {}),
            userEmail: String(profileRow.user_email ?? ''),
            partnerEmail: String(profileRow.partner_email ?? ''),
            ...(trackingStartDate ? { trackingStartDate } : {}),
            ...(gmailScanState ? { gmailScanState } : {}),
            ...(categoryBudgets && Object.keys(categoryBudgets).length > 0
              ? { categoryBudgets }
              : {}),
            ...(Array.isArray(customCategories) && customCategories.length > 0
              ? { customCategories }
              : {}),
            ...(Array.isArray(hiddenCategories) && hiddenCategories.length > 0
              ? { hiddenCategories }
              : {}),
          }
        : fallbackProfile;

      const expenses: Expense[] = expenseRows.map((row) => {
        const items = parseJsonSafe<Expense['items']>(row.items_json);
        const linkedSources = parseJsonSafe<Expense['linkedSources']>(row.linked_sources_json);
        const linkedReferences = parseJsonSafe<string[]>(row.linked_references_json);
        return {
          id: String(row.id),
          title: String(row.title),
          amount: Number(row.amount),
          currency: String(row.currency),
          date: String(row.date),
          category: row.category as Expense['category'],
          payer: row.payer as Expense['payer'],
          splitType: row.split_type as Expense['splitType'],
          ...(row.custom_split_ratio != null
            ? { customSplitRatio: Number(row.custom_split_ratio) }
            : {}),
          source: row.source as Expense['source'],
          ...(row.source_reference ? { sourceReference: String(row.source_reference) } : {}),
          ...(row.notes ? { notes: String(row.notes) } : {}),
          ...(row.receipt_url ? { receiptUrl: String(row.receipt_url) } : {}),
          ...(items && items.length > 0 ? { items } : {}),
          ...(row.tax != null ? { tax: Number(row.tax) } : {}),
          ...(row.trip_id ? { tripId: String(row.trip_id) } : {}),
          ...(row.recurring_rule_id ? { recurringRuleId: String(row.recurring_rule_id) } : {}),
          ...(row.reconciliation_status
            ? { reconciliationStatus: row.reconciliation_status as Expense['reconciliationStatus'] }
            : {}),
          ...(row.duplicate_candidate_id
            ? { duplicateCandidateId: String(row.duplicate_candidate_id) }
            : {}),
          ...(Array.isArray(linkedSources) && linkedSources.length > 0
            ? { linkedSources }
            : {}),
          ...(Array.isArray(linkedReferences) && linkedReferences.length > 0
            ? { linkedReferences }
            : {}),
        };
      });

      const settlements: Settlement[] = settlementRows.map((row) => ({
        id: String(row.id),
        date: String(row.date),
        amount: Number(row.amount),
        currency: String(row.currency),
        from: row.from_payer as Settlement['from'],
        to: row.to_payer as Settlement['to'],
        note: String(row.note),
      }));

      const goals: SavingGoal[] = goalRows.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        targetAmount: Number(row.target_amount),
        currentAmount: Number(row.current_amount),
        ...(row.target_date ? { targetDate: String(row.target_date) } : {}),
        ...(row.image_url ? { imageUrl: String(row.image_url) } : {}),
        ...(row.image_resolution ? { imageResolution: String(row.image_resolution) } : {}),
      }));

      const trips: TripProject[] = tripRows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        startDate: String(row.start_date),
        ...(row.end_date ? { endDate: String(row.end_date) } : {}),
        ...(row.budget != null ? { budget: Number(row.budget) } : {}),
        ...(row.default_category ? { defaultCategory: String(row.default_category) } : {}),
        isActive: Number(row.is_active) === 1,
        ...(row.ai_summary ? { aiSummary: String(row.ai_summary) } : {}),
      }));

      const recurringExpenses: RecurringExpenseItem[] = recurringRows.map((row) => {
        const aliases = parseJsonSafe<string[]>(row.merchant_aliases_json);
        return {
          id: String(row.id),
          title: String(row.title),
          ...(Array.isArray(aliases) && aliases.length > 0 ? { merchantAliases: aliases } : {}),
          expectedAmount: Number(row.expected_amount),
          ...(row.amount_tolerance_percent != null
            ? { amountTolerancePercent: Number(row.amount_tolerance_percent) }
            : {}),
          currency: String(row.currency),
          category: String(row.category),
          payer: row.payer as RecurringExpenseItem['payer'],
          splitType: row.split_type as RecurringExpenseItem['splitType'],
          ...(row.custom_split_ratio != null
            ? { customSplitRatio: Number(row.custom_split_ratio) }
            : {}),
          frequency: row.frequency as RecurringExpenseItem['frequency'],
          dayOfMonth: Number(row.day_of_month ?? 1),
          autoMatchNotifications: Number(row.auto_match_notifications) === 1,
          active: Number(row.active) === 1,
          ...(row.last_matched_cycle
            ? { lastMatchedCycle: String(row.last_matched_cycle) }
            : {}),
        };
      });

      const gmailScanCache: GmailScanCacheEntry[] = cacheRows.map((row) => {
        const receipt = parseJsonSafe<Record<string, unknown>>(row.receipt_json);
        const reviewCandidate = parseJsonSafe<Record<string, unknown>>(
          row.review_candidate_json
        );
        return {
          accountEmail: String(row.account_email),
          messageId: String(row.message_id),
          scannedAt: String(row.scanned_at),
          ...(receipt ? { receipt } : {}),
          ...(reviewCandidate ? { reviewCandidate } : {}),
          ...(Number(row.suppressed_low_confidence) === 1
            ? { suppressedLowConfidence: true }
            : {}),
        };
      });

      return {
        expenses,
        settlements,
        goals,
        profile,
        lastUpdated: String(profileRow?.last_updated ?? new Date().toISOString()),
        ...(gmailScanCache.length > 0 ? { gmailScanCache } : {}),
        ...(trips.length > 0 ? { trips } : {}),
        ...(recurringExpenses.length > 0 ? { recurringExpenses } : {}),
      };
    } catch (err) {
      console.error('Error reading SQLite database:', err);
      throw new Error('Database non disponibile; operazione annullata per proteggere i dati.', {
        cause: err,
      });
    }
  };

  const writeDatabase = (patch: Partial<ServerDatabase>): ServerDatabase => {
    const timestamp = new Date().toISOString();
    runInTransaction(db, () => {
      if (patch.expenses !== undefined) {
        replaceExpenses(patch.expenses);
      }
      if (patch.settlements !== undefined) {
        replaceSettlements(patch.settlements);
      }
      if (patch.goals !== undefined) {
        replaceGoals(patch.goals);
      }
      if (patch.trips !== undefined) {
        replaceTrips(patch.trips);
      }
      if (patch.recurringExpenses !== undefined) {
        replaceRecurringExpenses(patch.recurringExpenses);
      }
      if (patch.gmailScanCache !== undefined) {
        replaceGmailScanCache(patch.gmailScanCache);
      }
      if (patch.savingsChallengesBackup !== undefined) {
        replaceSavingsChallengesBackupInTx(patch.savingsChallengesBackup);
      }
      if (patch.profile !== undefined) {
        saveProfile(patch.profile, timestamp);
      } else {
        db.prepare('UPDATE profile SET last_updated = ? WHERE id = 1').run(timestamp);
      }
    });
    return readDatabase();
  };

  const insertExpenseRecord = (expense: Expense): Expense => {
    const timestamp = new Date().toISOString();
    runInTransaction(db, () => {
      const existingRow = db
        .prepare('SELECT position FROM expenses WHERE id = ?')
        .get(expense.id) as { position?: number } | undefined;

      const minPosRow = db
        .prepare('SELECT COALESCE(MIN(position), 0) AS minPos FROM expenses')
        .get() as { minPos: number };

      const targetPosition =
        existingRow && typeof existingRow.position === 'number'
          ? existingRow.position
          : Number(minPosRow?.minPos ?? 0) - 1;

      insertExpenseStmt.run(
        expense.id,
        expense.title,
        expense.amount,
        expense.currency,
        expense.date,
        expense.category,
        expense.payer,
        expense.splitType,
        expense.customSplitRatio ?? null,
        expense.source,
        expense.sourceReference ?? null,
        expense.notes ?? null,
        expense.receiptUrl ?? null,
        expense.items && expense.items.length > 0 ? JSON.stringify(expense.items) : null,
        expense.tax ?? null,
        targetPosition,
        expense.tripId ?? null,
        expense.recurringRuleId ?? null,
        expense.reconciliationStatus ?? null,
        expense.duplicateCandidateId ?? null,
        expense.linkedSources && expense.linkedSources.length > 0
          ? JSON.stringify(expense.linkedSources)
          : null,
        expense.linkedReferences && expense.linkedReferences.length > 0
          ? JSON.stringify(expense.linkedReferences)
          : null
      );
      db.prepare('UPDATE profile SET last_updated = ? WHERE id = 1').run(timestamp);
    });
    return expense;
  };

  const readAiModelRegistry = (): AiModelRegistryEntry[] => {
    const now = Date.now();
    const rows = db
      .prepare(
        `SELECT model_id, kind, status, replacement_model, expires_at, updated_at
         FROM ai_model_registry
         WHERE expires_at > ?
         ORDER BY updated_at DESC`
      )
      .all(now) as Array<{
      model_id: string;
      kind: string;
      status: string;
      replacement_model: string | null;
      expires_at: number;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      modelId: row.model_id,
      kind: row.kind === 'image' ? 'image' : 'text',
      status: row.status === 'deprecated' ? 'deprecated' : 'active',
      ...(row.replacement_model ? { replacementModel: row.replacement_model } : {}),
      expiresAt: row.expires_at,
      updatedAt: row.updated_at,
    }));
  };

  const upsertAiModelRegistry = (entries: AiModelRegistryEntry[]): void => {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const now = Date.now();
    const upsertStmt = db.prepare(`
      INSERT INTO ai_model_registry (
        model_id, kind, status, replacement_model, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(model_id) DO UPDATE SET
        kind = excluded.kind,
        status = excluded.status,
        replacement_model = excluded.replacement_model,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `);
    runInTransaction(db, () => {
      db.prepare('DELETE FROM ai_model_registry WHERE expires_at <= ?').run(now);
      for (const entry of entries.slice(0, 100)) {
        const cleanId = sanitizePlainText(entry.modelId, 120);
        if (!cleanId) continue;
        const cleanReplacement = entry.replacementModel
          ? sanitizePlainText(entry.replacementModel, 120)
          : null;
        upsertStmt.run(
          cleanId,
          entry.kind === 'image' ? 'image' : 'text',
          entry.status === 'deprecated' ? 'deprecated' : 'active',
          cleanReplacement || null,
          Number.isFinite(entry.expiresAt) ? entry.expiresAt : now + 24 * 60 * 60 * 1000,
          entry.updatedAt || new Date(now).toISOString()
        );
      }
    });
  };

  const resetDatabase = (): ServerDatabase => {
    const freshSeed = getInitialDatabase();
    seedFullDatabase(freshSeed);
    return readDatabase();
  };

  const exportSavingsChallengesBackup = (): SavingsChallengesBackupSnapshot => {
    const challengeRows = db
      .prepare('SELECT * FROM savings_challenges ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;
    const categoryRows = db
      .prepare('SELECT * FROM savings_challenge_categories ORDER BY challenge_id ASC, position ASC')
      .all() as Array<Record<string, unknown>>;
    const periodRows = db
      .prepare('SELECT * FROM savings_challenge_periods ORDER BY challenge_id ASC, period_ym ASC')
      .all() as Array<Record<string, unknown>>;
    const contribRows = db
      .prepare('SELECT * FROM savings_challenge_contributions ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;
    const historyRows = db
      .prepare('SELECT * FROM savings_challenge_history ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;

    return {
      challenges: challengeRows.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        goalId: String(row.goal_id),
        goalTitleSnapshot: String(row.goal_title_snapshot),
        monthlyLimit: Number(row.monthly_limit),
        currency: String(row.currency),
        startMonth: String(row.start_month),
        durationMonths: Number(row.duration_months),
        startDate: String(row.start_date),
        endDate: String(row.end_date),
        status: row.status as SavingsChallengeStatus,
        splitScope: (row.split_scope === 'shared_only' ? 'shared_only' : 'all') as SavingsChallengeSplitScope,
        initialSpend: Number(row.initial_spend ?? 0),
        currentValidSpend: Number(row.current_valid_spend ?? 0),
        virtualSavingsAccumulated: Number(row.virtual_savings_accumulated ?? 0),
        virtualSavingsApplied: Number(row.virtual_savings_applied ?? 0),
        ...(row.last_reconciled_at ? { lastReconciledAt: String(row.last_reconciled_at) } : {}),
        ...(row.last_calculation_error ? { lastCalculationError: String(row.last_calculation_error) } : {}),
        timezone: String(row.timezone ?? 'Europe/Rome'),
        createdBy: String(row.created_by),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        version: Number(row.version ?? 1),
      })),
      categories: categoryRows.map((row) => ({
        challengeId: String(row.challenge_id),
        categoryName: String(row.category_name),
        position: Number(row.position ?? 0),
      })),
      periods: periodRows.map((row) => ({
        id: String(row.id),
        challengeId: String(row.challenge_id),
        periodYm: String(row.period_ym),
        startDate: String(row.start_date),
        endDate: String(row.end_date),
        monthlyLimit: Number(row.monthly_limit),
        validSpend: Number(row.valid_spend ?? 0),
        virtualSavingsPotential: Number(row.virtual_savings_potential ?? 0),
        virtualSavingsApplied: Number(row.virtual_savings_applied ?? 0),
        matchedExpenseCount: Number(row.matched_expense_count ?? 0),
        excludedExpenseCount: Number(row.excluded_expense_count ?? 0),
        ...(row.calculation_meta_json ? { calculationMetaJson: String(row.calculation_meta_json) } : {}),
        status: row.status as SavingsChallengePeriodStatus,
        ...(row.reconciled_at ? { reconciledAt: String(row.reconciled_at) } : {}),
        ...(row.calculation_error ? { calculationError: String(row.calculation_error) } : {}),
      })),
      contributions: contribRows.map((row) => ({
        id: String(row.id),
        challengeId: String(row.challenge_id),
        ...(row.period_ym ? { periodYm: String(row.period_ym) } : {}),
        goalId: String(row.goal_id),
        goalTitleSnapshot: String(row.goal_title_snapshot),
        amount: Number(row.amount),
        currency: String(row.currency),
        status: (row.status === 'reverted' ? 'reverted' : 'applied') as 'applied' | 'reverted',
        ...(row.note ? { note: String(row.note) } : {}),
        ...(row.idempotency_key ? { idempotencyKey: String(row.idempotency_key) } : {}),
        createdBy: String(row.created_by),
        createdAt: String(row.created_at),
        ...(row.reverted_at ? { revertedAt: String(row.reverted_at) } : {}),
        ...(row.reverted_by ? { revertedBy: String(row.reverted_by) } : {}),
        ...(row.revert_reason ? { revertReason: String(row.revert_reason) } : {}),
      })),
      history: historyRows.map((row) => ({
        id: String(row.id),
        challengeId: String(row.challenge_id),
        action: String(row.action),
        actor: String(row.actor),
        summary: String(row.summary),
        ...(row.before_json ? { beforeJson: String(row.before_json) } : {}),
        ...(row.after_json ? { afterJson: String(row.after_json) } : {}),
        createdAt: String(row.created_at),
      })),
    };
  };

  const restoreSavingsChallengesBackup = (snapshot: SavingsChallengesBackupSnapshot): void => {
    runInTransaction(db, () => {
      replaceSavingsChallengesBackupInTx(snapshot);
    });
  };

  const clearSavingsChallenges = (): void => {
    runInTransaction(db, () => {
      clearChallengesTablesInTx();
    });
  };

  return {
    readDatabase,
    writeDatabase,
    insertExpenseRecord,
    readAiModelRegistry,
    upsertAiModelRegistry,
    resetDatabase,
    withTransaction: <T>(action: (rawDb: DatabaseSync) => T): T =>
      runInTransaction(db, () => action(db)),
    getRawDatabase: () => db,
    exportSavingsChallengesBackup,
    restoreSavingsChallengesBackup,
    clearSavingsChallenges,
    close: () => db.close(),
  };
}

let defaultInstance: SqliteDatabaseHandle | null = null;

function getDefaultDatabase(): SqliteDatabaseHandle {
  if (!defaultInstance) {
    defaultInstance = createSqliteDatabase();
  }
  return defaultInstance;
}

export function getDefaultDatabaseHandle(): SqliteDatabaseHandle {
  return getDefaultDatabase();
}

export function readDatabase(): ServerDatabase {
  return getDefaultDatabase().readDatabase();
}

export function writeDatabase(patch: Partial<ServerDatabase>): ServerDatabase {
  return getDefaultDatabase().writeDatabase(patch);
}

export function insertExpenseRecord(expense: Expense): Expense {
  return getDefaultDatabase().insertExpenseRecord(expense);
}

export function readAiModelRegistry(): AiModelRegistryEntry[] {
  return getDefaultDatabase().readAiModelRegistry();
}

export function upsertAiModelRegistry(entries: AiModelRegistryEntry[]): void {
  getDefaultDatabase().upsertAiModelRegistry(entries);
}

export function resetDatabase(): ServerDatabase {
  return getDefaultDatabase().resetDatabase();
}
