import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { LEGACY_JSON_DB_FILE, SQLITE_DB_FILE } from './config';
import type { CoupleProfile, Expense, SavingGoal, Settlement } from '../src/types';
import {
  buildAllowedCategorySet,
  sanitizeCustomCategories,
  sanitizeExpenseRecord,
  sanitizeGoalRecord,
  sanitizePlainText,
  sanitizeProfileRecord,
  sanitizeSettlementRecord,
  stripDangerousKeys,
} from './utils/security';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_GMAIL_CACHE_MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_GMAIL_SCAN_CACHE_ENTRIES = 2000;
const MAX_GMAIL_CACHE_BLOB_CHARS = 32_000;

export interface ServerDatabase {
  expenses: Expense[];
  settlements: Settlement[];
  goals: SavingGoal[];
  profile: CoupleProfile;
  lastUpdated: string;
  gmailScanCache?: GmailScanCacheEntry[];
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

  return {
    expenses,
    settlements,
    goals,
    profile,
    lastUpdated,
    ...(gmailScanCache ? { gmailScanCache } : {}),
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
      position INTEGER NOT NULL DEFAULT 0
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
  `);

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
      items_json, tax, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      hidden_categories_json, tracking_start_date, last_updated
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  const seedFullDatabase = (seed: ServerDatabase) => {
    runInTransaction(db, () => {
      replaceExpenses(seed.expenses);
      replaceSettlements(seed.settlements);
      replaceGoals(seed.goals);
      saveProfile(seed.profile, seed.lastUpdated);
      replaceGmailScanCache(seed.gmailScanCache ?? []);
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
      if (patch.gmailScanCache !== undefined) {
        replaceGmailScanCache(patch.gmailScanCache);
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
        targetPosition
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

  return {
    readDatabase,
    writeDatabase,
    insertExpenseRecord,
    readAiModelRegistry,
    upsertAiModelRegistry,
    resetDatabase,
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
