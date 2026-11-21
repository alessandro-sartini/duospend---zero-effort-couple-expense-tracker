import { randomUUID } from 'crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDefaultDatabaseHandle, type SqliteDatabaseHandle } from '../database';
import type {
  ContributionPreview,
  CoupleProfile,
  GoalVirtualSavingsSummary,
  SavingGoal,
  SavingsChallenge,
  SavingsChallengeContribution,
  SavingsChallengeEstimate,
  SavingsChallengeHistoryEntry,
  SavingsChallengeSplitScope,
  SavingsChallengeStatus,
} from '../../src/types';
import { HttpError } from '../utils/http-error';
import {
  buildAllowedCategorySet,
  isValidIanaTimeZone,
  isValidSafeEntityId,
  sanitizeChallengeCategories,
  sanitizeChallengeLimit,
  sanitizeDurationMonths,
  sanitizeIanaTimeZone,
  sanitizeIdempotencyKey,
  sanitizePlainText,
  sanitizeYearMonth,
} from '../utils/sanitizers';
import {
  CHALLENGE_CALCULATION_POLICY,
  computeChallengeCalculation,
  estimateChallengeSetup,
  fromCents,
  getTodayIsoInTimeZone,
  getYearMonthInTimeZone,
  toCents,
  type OtherActiveChallengeRef,
} from './savings-challenge-engine';

const MAX_ACTIVE_CHALLENGES = 50;
const MAX_TOTAL_CHALLENGES = 200;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IDEMPOTENCY_ENTRIES = 500;

interface StoredChallengeRow {
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
  categories: string[];
}

export interface ChallengeActorContext {
  requesterEmail?: string;
  actorLabel?: string;
  idempotencyKey?: string | null;
  now?: Date;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function resolveCoupleActor(
  requesterEmail: string | undefined,
  profile: CoupleProfile,
  fallbackLabel?: string
): string {
  const cleanEmail = (requesterEmail || '').toLowerCase().trim();
  const ownerEmail = (profile.userEmail || '').toLowerCase().trim();
  const partnerEmail = (profile.partnerEmail || '').toLowerCase().trim();

  if (cleanEmail && ownerEmail && cleanEmail === ownerEmail) {
    return sanitizePlainText(profile.userName, 80, 'Partner 1');
  }
  if (cleanEmail && partnerEmail && cleanEmail === partnerEmail) {
    return sanitizePlainText(profile.partnerName, 80, 'Partner 2');
  }
  if (fallbackLabel) {
    return sanitizePlainText(fallbackLabel, 80, 'Coppia');
  }
  return 'Coppia';
}

function sanitizeCurrencyCode(raw: unknown, fallback: string): string | null {
  if (raw === undefined || raw === null || raw === '') {
    return fallback.trim().toUpperCase() || 'EUR';
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : null;
}

function parseSplitScope(raw: unknown, fallback: SavingsChallengeSplitScope = 'all'): SavingsChallengeSplitScope | null {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (raw === 'all' || raw === 'shared_only') return raw;
  return null;
}

function parseJsonObjectSafe(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function mapContributionRow(row: Record<string, unknown>): SavingsChallengeContribution {
  return {
    id: String(row.id),
    challengeId: String(row.challenge_id),
    ...(row.period_ym ? { periodYm: String(row.period_ym) } : {}),
    goalId: String(row.goal_id),
    goalTitleSnapshot: String(row.goal_title_snapshot),
    amount: Math.round(Number(row.amount) * 100) / 100,
    currency: String(row.currency),
    status: row.status === 'reverted' ? 'reverted' : 'applied',
    ...(row.note ? { note: String(row.note) } : {}),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    ...(row.reverted_at ? { revertedAt: String(row.reverted_at) } : {}),
    ...(row.reverted_by ? { revertedBy: String(row.reverted_by) } : {}),
    ...(row.revert_reason ? { revertReason: String(row.revert_reason) } : {}),
  };
}

function mapHistoryRow(row: Record<string, unknown>): SavingsChallengeHistoryEntry {
  const before = parseJsonObjectSafe(row.before_json);
  const after = parseJsonObjectSafe(row.after_json);
  return {
    id: String(row.id),
    challengeId: String(row.challenge_id),
    action: String(row.action),
    actor: String(row.actor),
    summary: String(row.summary),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    createdAt: String(row.created_at),
  };
}

function loadChallengeRows(db: DatabaseSync): StoredChallengeRow[] {
  const challengeRows = db
    .prepare('SELECT * FROM savings_challenges ORDER BY created_at DESC')
    .all() as Array<Record<string, unknown>>;
  const categoryRows = db
    .prepare('SELECT challenge_id, category_name FROM savings_challenge_categories ORDER BY position ASC')
    .all() as Array<Record<string, unknown>>;

  const catsByChallenge = new Map<string, string[]>();
  for (const row of categoryRows) {
    const chId = String(row.challenge_id);
    const list = catsByChallenge.get(chId) ?? [];
    list.push(String(row.category_name));
    catsByChallenge.set(chId, list);
  }

  return challengeRows.map((row) => {
    const id = String(row.id);
    return {
      id,
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
      splitScope: row.split_scope === 'shared_only' ? 'shared_only' : 'all',
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
      categories: catsByChallenge.get(id) ?? [],
    };
  });
}

function loadAllContributions(db: DatabaseSync): SavingsChallengeContribution[] {
  const rows = db
    .prepare('SELECT * FROM savings_challenge_contributions ORDER BY created_at DESC')
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapContributionRow);
}

function pruneIdempotency(db: DatabaseSync, nowMs: number): void {
  db.prepare('DELETE FROM savings_challenge_idempotency WHERE expires_at <= ?').run(nowMs);
  const countRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM savings_challenge_idempotency')
    .get() as { cnt?: number } | undefined;
  const total = Number(countRow?.cnt ?? 0);
  if (total > MAX_IDEMPOTENCY_ENTRIES) {
    db.prepare(
      `DELETE FROM savings_challenge_idempotency
       WHERE idempotency_key IN (
         SELECT idempotency_key FROM savings_challenge_idempotency
         ORDER BY created_at ASC
         LIMIT ?
       )`
    ).run(total - MAX_IDEMPOTENCY_ENTRIES);
  }
}

function lookupIdempotency(
  db: DatabaseSync,
  key: string | null | undefined,
  expectedAction: string,
  expectedChallengeId: string | null,
  nowMs: number
): { status: number; body: Record<string, unknown> } | null {
  if (!key) return null;
  const row = db
    .prepare('SELECT * FROM savings_challenge_idempotency WHERE idempotency_key = ?')
    .get(key) as
    | {
        idempotency_key: string;
        action: string;
        challenge_id: string | null;
        response_status: number;
        response_json: string;
        expires_at: number;
      }
    | undefined;
  if (!row || row.expires_at <= nowMs) return null;
  if (row.action !== expectedAction || (expectedChallengeId && row.challenge_id !== expectedChallengeId)) {
    throw new HttpError(409, 'Chiave idempotente già utilizzata per un’altra operazione.');
  }
  const parsed = parseJsonObjectSafe(row.response_json);
  if (!parsed) return null;
  return {
    status: row.response_status,
    body: { ...parsed, idempotentReplay: true },
  };
}

function saveIdempotency(
  db: DatabaseSync,
  key: string | null | undefined,
  action: string,
  challengeId: string | null,
  status: number,
  body: Record<string, unknown>,
  nowMs: number
): void {
  if (!key) return;
  db.prepare(
    `INSERT INTO savings_challenge_idempotency (
       idempotency_key, action, challenge_id, response_status, response_json, created_at, expires_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(idempotency_key) DO NOTHING`
  ).run(
    key,
    action,
    challengeId,
    status,
    JSON.stringify(body),
    new Date(nowMs).toISOString(),
    nowMs + IDEMPOTENCY_TTL_MS
  );
}

function insertHistoryEntry(
  db: DatabaseSync,
  entry: {
    challengeId: string;
    action: string;
    actor: string;
    summary: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    createdAt: string;
  }
): void {
  db.prepare(
    `INSERT INTO savings_challenge_history (
       id, challenge_id, action, actor, summary, before_json, after_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId('hist'),
    entry.challengeId,
    entry.action,
    entry.actor,
    sanitizePlainText(entry.summary, 400, 'Aggiornamento sfida'),
    entry.before ? JSON.stringify(entry.before) : null,
    entry.after ? JSON.stringify(entry.after) : null,
    entry.createdAt
  );
}

function replacePeriodsForChallenge(
  db: DatabaseSync,
  challengeId: string,
  periods: SavingsChallenge['periods']
): void {
  db.prepare('DELETE FROM savings_challenge_periods WHERE challenge_id = ?').run(challengeId);
  const stmt = db.prepare(
    `INSERT INTO savings_challenge_periods (
       id, challenge_id, period_ym, start_date, end_date, monthly_limit,
       valid_spend, virtual_savings_potential, virtual_savings_applied,
       matched_expense_count, excluded_expense_count, calculation_meta_json,
       status, reconciled_at, calculation_error
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const period of periods) {
    stmt.run(
      period.id,
      challengeId,
      period.periodYm,
      period.startDate,
      period.endDate,
      period.monthlyLimit,
      period.validSpend,
      period.virtualSavingsPotential,
      period.virtualSavingsApplied,
      period.matchedExpenseCount,
      period.excludedExpenseCount,
      null,
      period.status,
      period.reconciledAt ?? null,
      period.calculationError ?? null
    );
  }
}

function replaceCategoriesForChallenge(
  db: DatabaseSync,
  challengeId: string,
  categories: string[]
): void {
  db.prepare('DELETE FROM savings_challenge_categories WHERE challenge_id = ?').run(challengeId);
  const stmt = db.prepare(
    'INSERT INTO savings_challenge_categories (challenge_id, category_name, position) VALUES (?, ?, ?)'
  );
  categories.forEach((cat, idx) => {
    stmt.run(challengeId, cat, idx);
  });
}

function buildGoalSummaries(
  goals: SavingGoal[],
  challenges: SavingsChallenge[],
  contributions: SavingsChallengeContribution[]
): GoalVirtualSavingsSummary[] {
  const goalIds = new Set<string>(goals.map((g) => g.id));
  for (const ch of challenges) goalIds.add(ch.goalId);
  for (const c of contributions) goalIds.add(c.goalId);

  const summaries: GoalVirtualSavingsSummary[] = [];
  for (const goalId of goalIds) {
    const goalContribs = contributions.filter((c) => c.goalId === goalId && c.status === 'applied');
    const totalAppliedCents = goalContribs.reduce((sum, c) => sum + toCents(c.amount), 0);
    const goalChallenges = challenges.filter((c) => c.goalId === goalId);
    const activeChallengesCount = goalChallenges.filter((c) => c.status === 'active').length;
    const completedChallenges = goalChallenges
      .filter((c) => c.status === 'completed' || c.metrics.healthState === 'completed')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    summaries.push({
      goalId,
      totalVirtualApplied: fromCents(totalAppliedCents),
      activeChallengesCount,
      completedChallengesCount: completedChallenges.length,
      ...(completedChallenges[0]
        ? {
            lastCompletedChallengeTitle: completedChallenges[0].title,
            lastCompletedAt: completedChallenges[0].updatedAt,
          }
        : {}),
      contributionsCount: goalContribs.length,
    });
  }
  return summaries;
}

function hydrateChallenge(
  row: StoredChallengeRow,
  allOtherRefs: OtherActiveChallengeRef[],
  contributions: SavingsChallengeContribution[],
  snapshotData: {
    expenses: ReturnType<SqliteDatabaseHandle['readDatabase']>['expenses'];
    goals: SavingGoal[];
    profile: CoupleProfile;
  },
  now: Date
): SavingsChallenge {
  const calc = computeChallengeCalculation({
    challenge: {
      id: row.id,
      title: row.title,
      goalId: row.goalId,
      goalTitleSnapshot: row.goalTitleSnapshot,
      categories: row.categories,
      monthlyLimit: row.monthlyLimit,
      currency: row.currency,
      startMonth: row.startMonth,
      durationMonths: row.durationMonths,
      status: row.status,
      splitScope: row.splitScope,
      timezone: row.timezone,
      lastCalculationError: row.lastCalculationError,
    },
    expenses: snapshotData.expenses,
    goals: snapshotData.goals,
    otherChallenges: allOtherRefs,
    contributions,
    profile: snapshotData.profile,
    now,
  });

  const challengeContribs = contributions.filter((c) => c.challengeId === row.id);
  const latestContribution = challengeContribs[0];

  return {
    id: row.id,
    title: row.title,
    goalId: row.goalId,
    goalTitleSnapshot: row.goalTitleSnapshot,
    categories: row.categories,
    monthlyLimit: row.monthlyLimit,
    currency: row.currency,
    startMonth: row.startMonth,
    durationMonths: row.durationMonths,
    startDate: calc.startDate,
    endDate: calc.endDate,
    status: row.status,
    splitScope: row.splitScope,
    initialSpend: row.initialSpend,
    currentValidSpend: calc.currentValidSpend,
    virtualSavingsAccumulated: calc.virtualSavingsAccumulated,
    virtualSavingsApplied: calc.virtualSavingsApplied,
    lastReconciledAt: calc.lastReconciledAt,
    ...(row.lastCalculationError ? { lastCalculationError: row.lastCalculationError } : {}),
    timezone: row.timezone,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    periods: calc.periods,
    metrics: calc.metrics,
    ...(latestContribution ? { latestContribution } : {}),
  };
}

export function createSavingsChallengesService(injectedDbHandle?: SqliteDatabaseHandle) {
  const getHandle = (): SqliteDatabaseHandle => injectedDbHandle ?? getDefaultDatabaseHandle();

  const buildHydratedSnapshot = (
    db: DatabaseSync,
    handle: SqliteDatabaseHandle,
    now: Date,
    persistSnapshots: boolean
  ) => {
    const dbData = handle.readDatabase();
    const rows = loadChallengeRows(db);
    const contributions = loadAllContributions(db);
    const otherRefs: OtherActiveChallengeRef[] = rows.map((r) => ({
      id: r.id,
      status: r.status,
      startDate: r.startDate,
      endDate: r.endDate,
      categories: r.categories,
    }));

    const challenges = rows.map((row) =>
      hydrateChallenge(row, otherRefs, contributions, dbData, now)
    );

    if (persistSnapshots) {
      const updateSnapshotStmt = db.prepare(
        `UPDATE savings_challenges
         SET current_valid_spend = ?,
             virtual_savings_accumulated = ?,
             virtual_savings_applied = ?,
             last_reconciled_at = ?
         WHERE id = ?`
      );
      for (const ch of challenges) {
        updateSnapshotStmt.run(
          ch.currentValidSpend,
          ch.virtualSavingsAccumulated,
          ch.virtualSavingsApplied,
          ch.lastReconciledAt ?? now.toISOString(),
          ch.id
        );
        replacePeriodsForChallenge(db, ch.id, ch.periods);
      }
    }

    const goalSummaries = buildGoalSummaries(dbData.goals, challenges, contributions);
    return { dbData, challenges, contributions, goalSummaries };
  };

  const listChallenges = (options?: {
    status?: string;
    goalId?: string;
    recalculate?: boolean;
    now?: Date;
  }) => {
    const handle = getHandle();
    const now = options?.now ?? new Date();
    const persistSnapshots = options?.recalculate !== false;

    const { dbData, challenges, goalSummaries } = handle.withTransaction((db) =>
      buildHydratedSnapshot(db, handle, now, persistSnapshots)
    );

    let filtered = challenges;
    if (options?.status && ['active', 'paused', 'completed', 'cancelled'].includes(options.status)) {
      filtered = filtered.filter((c) => c.status === options.status);
    }
    if (options?.goalId) {
      if (!isValidSafeEntityId(options.goalId)) {
        throw new HttpError(400, 'ID obiettivo non valido.');
      }
      filtered = filtered.filter((c) => c.goalId === options.goalId);
    }

    return {
      success: true,
      challenges: filtered,
      goalSummaries,
      policy: CHALLENGE_CALCULATION_POLICY,
      lastUpdated: dbData.lastUpdated,
    };
  };

  const estimateChallenge = (payload: Record<string, unknown>, options?: { now?: Date }): {
    success: true;
    estimate: SavingsChallengeEstimate;
  } => {
    const handle = getHandle();
    const now = options?.now ?? new Date();
    const dbData = handle.readDatabase();

    const timezone =
      payload.timezone !== undefined && payload.timezone !== ''
        ? isValidIanaTimeZone(payload.timezone)
          ? payload.timezone.trim()
          : (() => {
              throw new HttpError(400, 'Timezone non valida.');
            })()
        : 'Europe/Rome';

    const startMonth =
      payload.startMonth !== undefined && payload.startMonth !== ''
        ? sanitizeYearMonth(payload.startMonth)
        : getYearMonthInTimeZone(now, timezone);
    if (!startMonth) {
      throw new HttpError(400, 'Mese iniziale non valido (usa formato YYYY-MM).');
    }

    const durationMonths =
      payload.durationMonths !== undefined ? sanitizeDurationMonths(payload.durationMonths) : 1;
    if (!durationMonths) {
      throw new HttpError(400, 'Durata sfida non valida (1–12 mesi).');
    }

    const splitScope = parseSplitScope(payload.splitScope, 'all');
    if (!splitScope) {
      throw new HttpError(400, 'Ambito spese sfida non valido.');
    }

    const currency = sanitizeCurrencyCode(payload.currency, dbData.profile.currency || 'EUR');
    if (!currency) {
      throw new HttpError(400, 'Codice valuta non valido.');
    }

    const allowedCategories = buildAllowedCategorySet(dbData.profile, dbData.goals);
    const categories = sanitizeChallengeCategories(payload.categories, allowedCategories);
    if (categories.length === 0) {
      throw new HttpError(400, 'Seleziona almeno una categoria valida per stimare la sfida.');
    }

    let goalId: string | undefined;
    if (payload.goalId !== undefined && payload.goalId !== '') {
      if (!isValidSafeEntityId(payload.goalId)) {
        throw new HttpError(400, 'ID obiettivo non valido.');
      }
      goalId = payload.goalId;
    }

    const rawLimit = payload.monthlyLimit;
    const parsedLimit =
      rawLimit !== undefined && rawLimit !== '' && rawLimit !== null
        ? sanitizeChallengeLimit(rawLimit) ?? undefined
        : undefined;

    const estimate = estimateChallengeSetup({
      categories,
      startMonth,
      durationMonths,
      monthlyLimit: parsedLimit,
      goalId,
      splitScope,
      timezone,
      currency,
      expenses: dbData.expenses,
      goals: dbData.goals,
      profile: dbData.profile,
      now,
    });

    return { success: true, estimate };
  };

  const createChallenge = (
    payload: Record<string, unknown>,
    ctx: ChallengeActorContext = {}
  ): { status: number; body: Record<string, unknown> } => {
    const handle = getHandle();
    const now = ctx.now ?? new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const idemKey = sanitizeIdempotencyKey(ctx.idempotencyKey ?? payload.idempotencyKey);

    return handle.withTransaction((db) => {
      pruneIdempotency(db, nowMs);
      const replay = lookupIdempotency(db, idemKey, 'create_challenge', null, nowMs);
      if (replay) return replay;

      const existingRows = loadChallengeRows(db);
      if (existingRows.length >= MAX_TOTAL_CHALLENGES) {
        throw new HttpError(409, 'Limite massimo di sfide archiviate raggiunto (200).');
      }
      if (existingRows.filter((r) => r.status === 'active').length >= MAX_ACTIVE_CHALLENGES) {
        throw new HttpError(409, 'Hai raggiunto il limite massimo di 50 sfide attive simultanee.');
      }

      const dbData = handle.readDatabase();
      const title = sanitizePlainText(payload.title, 100);
      if (title.length < 2) {
        throw new HttpError(400, 'Inserisci un titolo valido per la sfida (almeno 2 caratteri).');
      }

      if (!isValidSafeEntityId(payload.goalId)) {
        throw new HttpError(400, 'Seleziona un obiettivo Vision Board valido.');
      }
      const targetGoal = dbData.goals.find((g) => g.id === payload.goalId);
      if (!targetGoal) {
        throw new HttpError(404, 'Obiettivo Vision Board collegato non trovato.');
      }

      const allowedCategories = buildAllowedCategorySet(dbData.profile, dbData.goals);
      const categories = sanitizeChallengeCategories(payload.categories, allowedCategories);
      if (categories.length === 0) {
        throw new HttpError(400, 'Seleziona almeno una categoria valida esistente.');
      }

      const monthlyLimit = sanitizeChallengeLimit(payload.monthlyLimit);
      if (monthlyLimit === null) {
        throw new HttpError(
          400,
          'Il limite mensile della sfida deve essere maggiore di 0 e non superiore a 1.000.000.'
        );
      }

      let timezone = 'Europe/Rome';
      if (payload.timezone !== undefined && payload.timezone !== '') {
        if (!isValidIanaTimeZone(payload.timezone)) {
          throw new HttpError(400, 'Timezone IANA non valida.');
        }
        timezone = sanitizeIanaTimeZone(payload.timezone);
      }

      const startMonth =
        payload.startMonth !== undefined && payload.startMonth !== ''
          ? sanitizeYearMonth(payload.startMonth)
          : getYearMonthInTimeZone(now, timezone);
      if (!startMonth) {
        throw new HttpError(400, 'Mese iniziale non valido (usa formato YYYY-MM).');
      }

      const durationMonths =
        payload.durationMonths !== undefined ? sanitizeDurationMonths(payload.durationMonths) : 1;
      if (durationMonths === null) {
        throw new HttpError(400, 'Durata sfida non valida (da 1 a 12 mesi).');
      }

      const splitScope = parseSplitScope(payload.splitScope, 'all');
      if (!splitScope) {
        throw new HttpError(400, 'Ambito spese sfida non valido.');
      }

      const currency = sanitizeCurrencyCode(payload.currency, dbData.profile.currency || 'EUR');
      if (!currency) {
        throw new HttpError(400, 'Codice valuta non valido.');
      }

      const actor = resolveCoupleActor(ctx.requesterEmail, dbData.profile, ctx.actorLabel);
      const id = generateId('chg');

      const otherRefs: OtherActiveChallengeRef[] = existingRows.map((r) => ({
        id: r.id,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        categories: r.categories,
      }));

      const calc = computeChallengeCalculation({
        challenge: {
          id,
          title,
          goalId: targetGoal.id,
          goalTitleSnapshot: targetGoal.title,
          categories,
          monthlyLimit,
          currency,
          startMonth,
          durationMonths,
          status: 'active',
          splitScope,
          timezone,
        },
        expenses: dbData.expenses,
        goals: dbData.goals,
        otherChallenges: otherRefs,
        contributions: [],
        profile: dbData.profile,
        now,
      });

      db.prepare(
        `INSERT INTO savings_challenges (
           id, title, goal_id, goal_title_snapshot, monthly_limit, currency,
           start_month, duration_months, start_date, end_date, status, split_scope,
           initial_spend, current_valid_spend, virtual_savings_accumulated, virtual_savings_applied,
           last_reconciled_at, last_calculation_error, timezone, created_by, created_at, updated_at, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        title,
        targetGoal.id,
        targetGoal.title,
        monthlyLimit,
        currency,
        startMonth,
        durationMonths,
        calc.startDate,
        calc.endDate,
        'active',
        splitScope,
        calc.currentValidSpend,
        calc.currentValidSpend,
        calc.virtualSavingsAccumulated,
        0,
        calc.lastReconciledAt,
        null,
        timezone,
        actor,
        nowIso,
        nowIso,
        1
      );

      replaceCategoriesForChallenge(db, id, categories);
      replacePeriodsForChallenge(db, id, calc.periods);
      insertHistoryEntry(db, {
        challengeId: id,
        action: 'created',
        actor,
        summary: `Sfida "${title}" creata per "${targetGoal.title}" con limite ${monthlyLimit.toFixed(2)} ${currency}/mese.`,
        after: {
          title,
          goalId: targetGoal.id,
          categories,
          monthlyLimit,
          startMonth,
          durationMonths,
          splitScope,
          timezone,
        },
        createdAt: nowIso,
      });

      const { challenges, goalSummaries } = buildHydratedSnapshot(db, handle, now, false);
      const created = challenges.find((c) => c.id === id)!;
      const body = {
        success: true,
        challenge: created,
        goalSummaries,
      };
      saveIdempotency(db, idemKey, 'create_challenge', id, 201, body, nowMs);
      return { status: 201, body };
    });
  };

  const updateChallenge = (
    id: string,
    payload: Record<string, unknown>,
    ctx: ChallengeActorContext = {}
  ): Record<string, unknown> => {
    if (!isValidSafeEntityId(id)) {
      throw new HttpError(400, 'ID sfida non valido.');
    }
    const handle = getHandle();
    const now = ctx.now ?? new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const idemKey = sanitizeIdempotencyKey(ctx.idempotencyKey ?? payload.idempotencyKey);

    return handle.withTransaction((db) => {
      pruneIdempotency(db, nowMs);
      const replay = lookupIdempotency(db, idemKey, 'update_challenge', id, nowMs);
      if (replay) return replay.body;

      const allRows = loadChallengeRows(db);
      const existing = allRows.find((r) => r.id === id);
      if (!existing) {
        throw new HttpError(404, 'Sfida di risparmio non trovata.');
      }
      if (existing.status === 'cancelled') {
        throw new HttpError(409, 'Le sfide annullate non possono essere modificate.');
      }

      if (payload.expectedVersion !== undefined) {
        const expectedVersion = Number(payload.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion !== existing.version) {
          throw new HttpError(
            409,
            'La sfida è stata aggiornata da un altro dispositivo. Ricarica i dati prima di salvare.',
            { code: 'VERSION_CONFLICT', currentVersion: existing.version }
          );
        }
      }

      const dbData = handle.readDatabase();
      const actor = resolveCoupleActor(ctx.requesterEmail, dbData.profile, ctx.actorLabel);
      const contributions = loadAllContributions(db);
      const existingContribs = contributions.filter((c) => c.challengeId === id && c.status === 'applied');
      const existingAppliedCents = existingContribs.reduce((sum, c) => sum + toCents(c.amount), 0);

      let nextTitle = existing.title;
      if (payload.title !== undefined) {
        const cleanTitle = sanitizePlainText(payload.title, 100);
        if (cleanTitle.length < 2) {
          throw new HttpError(400, 'Il titolo della sfida deve contenere almeno 2 caratteri.');
        }
        nextTitle = cleanTitle;
      }

      let nextGoalId = existing.goalId;
      let nextGoalTitle = existing.goalTitleSnapshot;
      let goalChanged = false;
      if (payload.goalId !== undefined && payload.goalId !== existing.goalId) {
        if (!isValidSafeEntityId(payload.goalId)) {
          throw new HttpError(400, 'ID obiettivo Vision Board non valido.');
        }
        const targetGoal = dbData.goals.find((g) => g.id === payload.goalId);
        if (!targetGoal) {
          throw new HttpError(404, 'Obiettivo Vision Board collegato non trovato.');
        }
        if (existingAppliedCents > 0) {
          throw new HttpError(
            409,
            'Prima di collegare un nuovo obiettivo, annulla i contributi virtuali già applicati a quello attuale.',
            { code: 'APPLIED_CONTRIBUTIONS_EXIST', appliedTotal: fromCents(existingAppliedCents) }
          );
        }
        nextGoalId = targetGoal.id;
        nextGoalTitle = targetGoal.title;
        goalChanged = true;
      }

      let nextCategories = existing.categories;
      let categoriesChanged = false;
      if (payload.categories !== undefined) {
        const allowedCategories = buildAllowedCategorySet(dbData.profile, dbData.goals);
        // Preserve any already-attached orphaned category if explicitly kept in payload
        for (const existingCat of existing.categories) {
          allowedCategories.add(existingCat);
        }
        const cleaned = sanitizeChallengeCategories(payload.categories, allowedCategories);
        if (cleaned.length === 0) {
          throw new HttpError(400, 'Seleziona almeno una categoria valida.');
        }
        categoriesChanged =
          cleaned.length !== existing.categories.length ||
          cleaned.some((c, i) => c !== existing.categories[i]);
        nextCategories = cleaned;
      }

      let nextLimit = existing.monthlyLimit;
      let limitChanged = false;
      if (payload.monthlyLimit !== undefined) {
        const sanitizedLimit = sanitizeChallengeLimit(payload.monthlyLimit);
        if (sanitizedLimit === null) {
          throw new HttpError(400, 'Il limite mensile deve essere maggiore di 0.');
        }
        limitChanged = toCents(sanitizedLimit) !== toCents(existing.monthlyLimit);
        nextLimit = sanitizedLimit;
      }

      let nextStartMonth = existing.startMonth;
      let periodChanged = false;
      if (payload.startMonth !== undefined) {
        const cleanMonth = sanitizeYearMonth(payload.startMonth);
        if (!cleanMonth) {
          throw new HttpError(400, 'Mese iniziale non valido (usa formato YYYY-MM).');
        }
        periodChanged = cleanMonth !== existing.startMonth;
        nextStartMonth = cleanMonth;
      }

      let nextDuration = existing.durationMonths;
      let durationChanged = false;
      if (payload.durationMonths !== undefined) {
        const cleanDur = sanitizeDurationMonths(payload.durationMonths);
        if (cleanDur === null) {
          throw new HttpError(400, 'Durata non valida (1–12 mesi).');
        }
        durationChanged = cleanDur !== existing.durationMonths;
        nextDuration = cleanDur;
      }

      let nextSplitScope = existing.splitScope;
      let splitChanged = false;
      if (payload.splitScope !== undefined) {
        const cleanScope = parseSplitScope(payload.splitScope, existing.splitScope);
        if (!cleanScope) {
          throw new HttpError(400, 'Ambito spese non valido.');
        }
        splitChanged = cleanScope !== existing.splitScope;
        nextSplitScope = cleanScope;
      }

      let nextTimezone = existing.timezone;
      let tzChanged = false;
      if (payload.timezone !== undefined) {
        if (!isValidIanaTimeZone(payload.timezone)) {
          throw new HttpError(400, 'Timezone IANA non valida.');
        }
        const cleanTz = sanitizeIanaTimeZone(payload.timezone);
        tzChanged = cleanTz !== existing.timezone;
        nextTimezone = cleanTz;
      }

      const otherRefs: OtherActiveChallengeRef[] = allRows.map((r) => ({
        id: r.id,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        categories: r.categories,
      }));

      const prevCalc = computeChallengeCalculation({
        challenge: {
          id: existing.id,
          title: existing.title,
          goalId: existing.goalId,
          goalTitleSnapshot: existing.goalTitleSnapshot,
          categories: existing.categories,
          monthlyLimit: existing.monthlyLimit,
          currency: existing.currency,
          startMonth: existing.startMonth,
          durationMonths: existing.durationMonths,
          status: existing.status,
          splitScope: existing.splitScope,
          timezone: existing.timezone,
        },
        expenses: dbData.expenses,
        goals: dbData.goals,
        otherChallenges: otherRefs,
        contributions,
        profile: dbData.profile,
        now,
      });

      const nextCalc = computeChallengeCalculation({
        challenge: {
          id: existing.id,
          title: nextTitle,
          goalId: nextGoalId,
          goalTitleSnapshot: nextGoalTitle,
          categories: nextCategories,
          monthlyLimit: nextLimit,
          currency: existing.currency,
          startMonth: nextStartMonth,
          durationMonths: nextDuration,
          status: existing.status,
          splitScope: nextSplitScope,
          timezone: nextTimezone,
        },
        expenses: dbData.expenses,
        goals: dbData.goals,
        otherChallenges: otherRefs,
        contributions,
        profile: dbData.profile,
        now,
      });

      if (toCents(nextCalc.virtualSavingsAccumulated) < existingAppliedCents) {
        throw new HttpError(
          409,
          'Le modifiche riducono il risparmio virtuale potenziale al di sotto dei contributi già applicati. Annulla prima l’ultimo contributo.',
          {
            code: 'APPLIED_EXCEEDS_NEW_POTENTIAL',
            appliedAmount: fromCents(existingAppliedCents),
            newPotential: nextCalc.virtualSavingsAccumulated,
          }
        );
      }

      const todayIso = getTodayIsoInTimeZone(now, existing.timezone);
      const calculationFieldsChanged =
        goalChanged ||
        categoriesChanged ||
        limitChanged ||
        periodChanged ||
        durationChanged ||
        splitChanged ||
        tzChanged;
      const challengeAlreadyActiveInTime = todayIso >= existing.startDate;
      const isRetroactive =
        calculationFieldsChanged && (challengeAlreadyActiveInTime || existingAppliedCents > 0);

      if (isRetroactive && payload.confirmRetroactive !== true) {
        throw new HttpError(
          409,
          'Questa modifica è retroattiva su un periodo già avviato o con dati attivi e ricalcolerà i risultati. Conferma esplicitamente per procedere.',
          {
            code: 'RETROACTIVE_CONFIRMATION_REQUIRED',
            impact: {
              previousValidSpend: prevCalc.currentValidSpend,
              nextValidSpend: nextCalc.currentValidSpend,
              previousVirtualSavingsPotential: prevCalc.virtualSavingsAccumulated,
              nextVirtualSavingsPotential: nextCalc.virtualSavingsAccumulated,
              goalChanged,
              appliedContributionsCount: existingContribs.length,
            },
          }
        );
      }

      const nextVersion = existing.version + 1;
      db.prepare(
        `UPDATE savings_challenges
         SET title = ?,
             goal_id = ?,
             goal_title_snapshot = ?,
             monthly_limit = ?,
             start_month = ?,
             duration_months = ?,
             start_date = ?,
             end_date = ?,
             split_scope = ?,
             current_valid_spend = ?,
             virtual_savings_accumulated = ?,
             virtual_savings_applied = ?,
             last_reconciled_at = ?,
             last_calculation_error = NULL,
             timezone = ?,
             updated_at = ?,
             version = ?
         WHERE id = ?`
      ).run(
        nextTitle,
        nextGoalId,
        nextGoalTitle,
        nextLimit,
        nextStartMonth,
        nextDuration,
        nextCalc.startDate,
        nextCalc.endDate,
        nextSplitScope,
        nextCalc.currentValidSpend,
        nextCalc.virtualSavingsAccumulated,
        nextCalc.virtualSavingsApplied,
        nextCalc.lastReconciledAt,
        nextTimezone,
        nowIso,
        nextVersion,
        id
      );

      if (categoriesChanged) {
        replaceCategoriesForChallenge(db, id, nextCategories);
      }
      replacePeriodsForChallenge(db, id, nextCalc.periods);

      const action = isRetroactive ? 'retroactive_update' : goalChanged ? 'goal_changed' : 'updated';
      insertHistoryEntry(db, {
        challengeId: id,
        action,
        actor,
        summary: isRetroactive
          ? `Modifica retroattiva confermata su "${nextTitle}" (nuovo risparmio virtuale potenziale: ${nextCalc.virtualSavingsAccumulated.toFixed(2)} ${existing.currency}).`
          : goalChanged
            ? `Obiettivo collegato aggiornato a "${nextGoalTitle}".`
            : `Dettagli sfida "${nextTitle}" aggiornati.`,
        before: {
          title: existing.title,
          goalId: existing.goalId,
          categories: existing.categories,
          monthlyLimit: existing.monthlyLimit,
          startMonth: existing.startMonth,
          durationMonths: existing.durationMonths,
          splitScope: existing.splitScope,
          timezone: existing.timezone,
          validSpend: prevCalc.currentValidSpend,
          virtualSavingsPotential: prevCalc.virtualSavingsAccumulated,
        },
        after: {
          title: nextTitle,
          goalId: nextGoalId,
          categories: nextCategories,
          monthlyLimit: nextLimit,
          startMonth: nextStartMonth,
          durationMonths: nextDuration,
          splitScope: nextSplitScope,
          timezone: nextTimezone,
          validSpend: nextCalc.currentValidSpend,
          virtualSavingsPotential: nextCalc.virtualSavingsAccumulated,
        },
        createdAt: nowIso,
      });

      const { challenges, goalSummaries } = buildHydratedSnapshot(db, handle, now, false);
      const updated = challenges.find((c) => c.id === id)!;
      const body = { success: true, challenge: updated, goalSummaries };
      saveIdempotency(db, idemKey, 'update_challenge', id, 200, body, nowMs);
      return body;
    });
  };

  const transitionChallengeStatus = (
    id: string,
    targetStatus: SavingsChallengeStatus,
    payload: Record<string, unknown>,
    ctx: ChallengeActorContext
  ): Record<string, unknown> => {
    if (!isValidSafeEntityId(id)) {
      throw new HttpError(400, 'ID sfida non valido.');
    }
    const handle = getHandle();
    const now = ctx.now ?? new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const actionKey = `status_${targetStatus}`;
    const idemKey = sanitizeIdempotencyKey(ctx.idempotencyKey ?? payload.idempotencyKey);

    return handle.withTransaction((db) => {
      pruneIdempotency(db, nowMs);
      const replay = lookupIdempotency(db, idemKey, actionKey, id, nowMs);
      if (replay) return replay.body;

      const rows = loadChallengeRows(db);
      const existing = rows.find((r) => r.id === id);
      if (!existing) {
        throw new HttpError(404, 'Sfida di risparmio non trovata.');
      }

      if (payload.expectedVersion !== undefined) {
        const expectedVersion = Number(payload.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion !== existing.version) {
          throw new HttpError(409, 'Versione sfida non aggiornata.', {
            code: 'VERSION_CONFLICT',
            currentVersion: existing.version,
          });
        }
      }

      const validTransition =
        (targetStatus === 'paused' && existing.status === 'active') ||
        (targetStatus === 'active' && (existing.status === 'paused' || existing.status === 'completed')) ||
        (targetStatus === 'completed' && (existing.status === 'active' || existing.status === 'paused')) ||
        (targetStatus === 'cancelled' && existing.status !== 'cancelled');

      if (!validTransition) {
        throw new HttpError(
          409,
          `Transizione di stato non consentita da "${existing.status}" a "${targetStatus}".`,
          { code: 'INVALID_STATUS_TRANSITION', currentStatus: existing.status }
        );
      }

      const dbData = handle.readDatabase();
      const actor = resolveCoupleActor(ctx.requesterEmail, dbData.profile, ctx.actorLabel);
      const contributions = loadAllContributions(db);
      const otherRefs: OtherActiveChallengeRef[] = rows.map((r) => ({
        id: r.id,
        status: r.id === id ? targetStatus : r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        categories: r.categories,
      }));

      const calc = computeChallengeCalculation({
        challenge: {
          id: existing.id,
          title: existing.title,
          goalId: existing.goalId,
          goalTitleSnapshot: existing.goalTitleSnapshot,
          categories: existing.categories,
          monthlyLimit: existing.monthlyLimit,
          currency: existing.currency,
          startMonth: existing.startMonth,
          durationMonths: existing.durationMonths,
          status: targetStatus,
          splitScope: existing.splitScope,
          timezone: existing.timezone,
        },
        expenses: dbData.expenses,
        goals: dbData.goals,
        otherChallenges: otherRefs,
        contributions,
        profile: dbData.profile,
        now,
      });

      db.prepare(
        `UPDATE savings_challenges
         SET status = ?,
             current_valid_spend = ?,
             virtual_savings_accumulated = ?,
             virtual_savings_applied = ?,
             last_reconciled_at = ?,
             updated_at = ?,
             version = ?
         WHERE id = ?`
      ).run(
        targetStatus,
        calc.currentValidSpend,
        calc.virtualSavingsAccumulated,
        calc.virtualSavingsApplied,
        calc.lastReconciledAt,
        nowIso,
        existing.version + 1,
        id
      );

      replacePeriodsForChallenge(db, id, calc.periods);

      const summaryMap: Record<SavingsChallengeStatus, string> = {
        paused: `Sfida "${existing.title}" messa in pausa.`,
        active: `Sfida "${existing.title}" riattivata e ricalcolata.`,
        completed: `Sfida "${existing.title}" conclusa manualmente (nessun movimento bancario automatico).`,
        cancelled: `Sfida "${existing.title}" annullata.`,
      };

      insertHistoryEntry(db, {
        challengeId: id,
        action:
          targetStatus === 'paused'
            ? 'paused'
            : targetStatus === 'active'
              ? 'resumed'
              : targetStatus,
        actor,
        summary: summaryMap[targetStatus],
        before: { status: existing.status },
        after: { status: targetStatus },
        createdAt: nowIso,
      });

      const { challenges, goalSummaries } = buildHydratedSnapshot(db, handle, now, false);
      const updated = challenges.find((c) => c.id === id)!;
      const body = { success: true, challenge: updated, goalSummaries };
      saveIdempotency(db, idemKey, actionKey, id, 200, body, nowMs);
      return body;
    });
  };

  const pauseChallenge = (id: string, payload: Record<string, unknown> = {}, ctx: ChallengeActorContext = {}) =>
    transitionChallengeStatus(id, 'paused', payload, ctx);

  const resumeChallenge = (id: string, payload: Record<string, unknown> = {}, ctx: ChallengeActorContext = {}) =>
    transitionChallengeStatus(id, 'active', payload, ctx);

  const completeChallenge = (id: string, payload: Record<string, unknown> = {}, ctx: ChallengeActorContext = {}) =>
    transitionChallengeStatus(id, 'completed', payload, ctx);

  const recalculateChallenge = (
    id: string,
    ctx: ChallengeActorContext = {}
  ): Record<string, unknown> => {
    if (!isValidSafeEntityId(id)) {
      throw new HttpError(400, 'ID sfida non valido.');
    }
    const handle = getHandle();
    const now = ctx.now ?? new Date();
    const nowIso = now.toISOString();

    return handle.withTransaction((db) => {
      const rows = loadChallengeRows(db);
      const existing = rows.find((r) => r.id === id);
      if (!existing) {
        throw new HttpError(404, 'Sfida di risparmio non trovata.');
      }
      const dbData = handle.readDatabase();
      const actor = resolveCoupleActor(ctx.requesterEmail, dbData.profile, ctx.actorLabel);
      const contributions = loadAllContributions(db);
      const otherRefs: OtherActiveChallengeRef[] = rows.map((r) => ({
        id: r.id,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        categories: r.categories,
      }));

      const calc = computeChallengeCalculation({
        challenge: {
          id: existing.id,
          title: existing.title,
          goalId: existing.goalId,
          goalTitleSnapshot: existing.goalTitleSnapshot,
          categories: existing.categories,
          monthlyLimit: existing.monthlyLimit,
          currency: existing.currency,
          startMonth: existing.startMonth,
          durationMonths: existing.durationMonths,
          status: existing.status,
          splitScope: existing.splitScope,
          timezone: existing.timezone,
        },
        expenses: dbData.expenses,
        goals: dbData.goals,
        otherChallenges: otherRefs,
        contributions,
        profile: dbData.profile,
        now,
      });

      const calcError = calc.metrics.goalLinked
        ? null
        : 'Obiettivo Vision Board collegato non trovato.';

      db.prepare(
        `UPDATE savings_challenges
         SET current_valid_spend = ?,
             virtual_savings_accumulated = ?,
             virtual_savings_applied = ?,
             last_reconciled_at = ?,
             last_calculation_error = ?
         WHERE id = ?`
      ).run(
        calc.currentValidSpend,
        calc.virtualSavingsAccumulated,
        calc.virtualSavingsApplied,
        calc.lastReconciledAt,
        calcError,
        id
      );
      replacePeriodsForChallenge(db, id, calc.periods);
      insertHistoryEntry(db, {
        challengeId: id,
        action: 'recalculated',
        actor,
        summary: `Ricalcolo server eseguito: spese valide ${calc.currentValidSpend.toFixed(2)} ${existing.currency}, risparmio virtuale disponibile ${calc.metrics.virtualSavingsAvailable.toFixed(2)} ${existing.currency}.`,
        before: {
          validSpend: existing.currentValidSpend,
          virtualSavingsPotential: existing.virtualSavingsAccumulated,
        },
        after: {
          validSpend: calc.currentValidSpend,
          virtualSavingsPotential: calc.virtualSavingsAccumulated,
          virtualSavingsAvailable: calc.metrics.virtualSavingsAvailable,
        },
        createdAt: nowIso,
      });

      const { challenges, goalSummaries } = buildHydratedSnapshot(db, handle, now, false);
      const updated = challenges.find((c) => c.id === id)!;
      return { success: true, challenge: updated, goalSummaries };
    });
  };

  const confirmContribution = (
    id: string,
    payload: Record<string, unknown>,
    ctx: ChallengeActorContext = {}
  ): Record<string, unknown> => {
    if (!isValidSafeEntityId(id)) {
      throw new HttpError(400, 'ID sfida non valido.');
    }
    const handle = getHandle();
    const now = ctx.now ?? new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const dryRun = payload.dryRun === true;
    const idemKey = sanitizeIdempotencyKey(ctx.idempotencyKey ?? payload.idempotencyKey);

    if (dryRun) {
      return handle.withTransaction((db) => {
        const rows = loadChallengeRows(db);
        const existing = rows.find((r) => r.id === id);
        if (!existing) {
          throw new HttpError(404, 'Sfida di risparmio non trovata.');
        }
        const dbData = handle.readDatabase();
        const goal = dbData.goals.find((g) => g.id === existing.goalId);
        if (!goal) {
          throw new HttpError(
            404,
            'Obiettivo Vision Board collegato non trovato. Collega un obiettivo esistente prima di procedere.'
          );
        }

        const contributions = loadAllContributions(db);
        const otherRefs: OtherActiveChallengeRef[] = rows.map((r) => ({
          id: r.id,
          status: r.status,
          startDate: r.startDate,
          endDate: r.endDate,
          categories: r.categories,
        }));
        const calc = computeChallengeCalculation({
          challenge: {
            id: existing.id,
            title: existing.title,
            goalId: existing.goalId,
            goalTitleSnapshot: existing.goalTitleSnapshot,
            categories: existing.categories,
            monthlyLimit: existing.monthlyLimit,
            currency: existing.currency,
            startMonth: existing.startMonth,
            durationMonths: existing.durationMonths,
            status: existing.status,
            splitScope: existing.splitScope,
            timezone: existing.timezone,
          },
          expenses: dbData.expenses,
          goals: dbData.goals,
          otherChallenges: otherRefs,
          contributions,
          profile: dbData.profile,
          now,
        });

        const available = calc.metrics.virtualSavingsAvailable;
        let proposedAmount = available;
        if (payload.amount !== undefined && payload.amount !== null && payload.amount !== '') {
          const requested = sanitizeChallengeLimit(payload.amount);
          if (requested === null) {
            throw new HttpError(400, 'Importo contributo virtuale non valido.');
          }
          proposedAmount = Math.min(requested, available);
        }

        const projectedGoalAmount = fromCents(toCents(goal.currentAmount) + toCents(proposedAmount));
        const projectedGoalPercent =
          goal.targetAmount > 0
            ? Math.min(100, Math.round((projectedGoalAmount / goal.targetAmount) * 100))
            : 0;

        const preview: ContributionPreview = {
          challengeId: existing.id,
          goalId: goal.id,
          goalTitle: goal.title,
          ...(goal.imageUrl ? { goalImageUrl: goal.imageUrl } : {}),
          currentGoalAmount: goal.currentAmount,
          targetGoalAmount: goal.targetAmount,
          availableVirtualSavings: available,
          proposedAmount,
          projectedGoalAmount,
          projectedGoalPercent,
          currency: existing.currency,
          matchedExpenseCount: calc.metrics.matchedExpenseCount,
          validSpend: calc.metrics.validSpend,
          totalLimit: calc.metrics.totalLimit,
          previousContributions: contributions.filter((c) => c.challengeId === existing.id),
          explanation: `Calcolato su ${calc.metrics.matchedExpenseCount} spese valide (${calc.metrics.validSpend.toFixed(2)} ${existing.currency}) rispetto al limite di ${calc.metrics.totalLimit.toFixed(2)} ${existing.currency}.`,
          virtualDisclaimer:
            'Trasferimento esclusivamente virtuale verso la Vision Board: nessun conto bancario reale viene modificato e l’operazione è reversibile in qualsiasi momento.',
          challengeVersion: existing.version,
        };

        return { success: true, preview };
      });
    }

    if (payload.confirmed !== true) {
      throw new HttpError(400, 'Conferma esplicita richiesta per registrare il contributo virtuale.');
    }
    if (!idemKey) {
      throw new HttpError(400, 'Chiave idempotente (Idempotency-Key) obbligatoria per confermare il contributo.');
    }

    return handle.withTransaction((db) => {
      pruneIdempotency(db, nowMs);
      const replay = lookupIdempotency(db, idemKey, 'confirm_contribution', id, nowMs);
      if (replay) return replay.body;

      const rows = loadChallengeRows(db);
      const existing = rows.find((r) => r.id === id);
      if (!existing) {
        throw new HttpError(404, 'Sfida di risparmio non trovata.');
      }
      if (existing.status === 'cancelled') {
        throw new HttpError(409, 'Impossibile confermare contributi su una sfida annullata.');
      }

      if (payload.expectedVersion !== undefined) {
        const expectedVersion = Number(payload.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion !== existing.version) {
          throw new HttpError(
            409,
            'La sfida è stata modificata da un altro dispositivo. Aggiorna l’anteprima prima di confermare.',
            { code: 'VERSION_CONFLICT', currentVersion: existing.version }
          );
        }
      }

      const dbData = handle.readDatabase();
      const targetGoal = dbData.goals.find((g) => g.id === existing.goalId);
      if (!targetGoal) {
        throw new HttpError(
          404,
          'Obiettivo Vision Board collegato non trovato. Collega un obiettivo valido prima di confermare.'
        );
      }

      const existingContribs = loadAllContributions(db);
      const otherRefs: OtherActiveChallengeRef[] = rows.map((r) => ({
        id: r.id,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        categories: r.categories,
      }));
      const liveCalc = computeChallengeCalculation({
        challenge: {
          id: existing.id,
          title: existing.title,
          goalId: existing.goalId,
          goalTitleSnapshot: existing.goalTitleSnapshot,
          categories: existing.categories,
          monthlyLimit: existing.monthlyLimit,
          currency: existing.currency,
          startMonth: existing.startMonth,
          durationMonths: existing.durationMonths,
          status: existing.status,
          splitScope: existing.splitScope,
          timezone: existing.timezone,
        },
        expenses: dbData.expenses,
        goals: dbData.goals,
        otherChallenges: otherRefs,
        contributions: existingContribs,
        profile: dbData.profile,
        now,
      });

      const availableCents = toCents(liveCalc.metrics.virtualSavingsAvailable);
      if (availableCents <= 0) {
        throw new HttpError(
          409,
          'Nessun risparmio virtuale disponibile da applicare per questa sfida.',
          { code: 'NO_VIRTUAL_SAVINGS_AVAILABLE' }
        );
      }

      let amountCents = availableCents;
      if (payload.amount !== undefined && payload.amount !== null && payload.amount !== '') {
        const parsedAmount = sanitizeChallengeLimit(payload.amount);
        if (parsedAmount === null) {
          throw new HttpError(400, 'Importo del contributo virtuale non valido.');
        }
        amountCents = toCents(parsedAmount);
      }
      if (amountCents > availableCents) {
        throw new HttpError(
          409,
          `L’importo richiesto supera il risparmio virtuale disponibile (${fromCents(availableCents).toFixed(2)} ${existing.currency}).`,
          {
            code: 'INSUFFICIENT_VIRTUAL_SAVINGS',
            availableVirtualSavings: fromCents(availableCents),
          }
        );
      }

      let periodYm: string | undefined;
      if (payload.periodYm !== undefined && payload.periodYm !== null && payload.periodYm !== '') {
        const cleanPeriod = sanitizeYearMonth(payload.periodYm);
        if (!cleanPeriod || !liveCalc.periods.some((p) => p.periodYm === cleanPeriod)) {
          throw new HttpError(400, 'Periodo mensile specificato non valido per questa sfida.');
        }
        periodYm = cleanPeriod;
      }

      const amount = fromCents(amountCents);
      const actor = resolveCoupleActor(ctx.requesterEmail, dbData.profile, ctx.actorLabel);
      const note = payload.note
        ? sanitizePlainText(payload.note, 300)
        : `Contributo virtuale da sfida "${existing.title}"`;
      const contribId = generateId('contrib');

      db.prepare(
        `INSERT INTO savings_challenge_contributions (
           id, challenge_id, period_ym, goal_id, goal_title_snapshot, amount, currency,
           status, note, idempotency_key, created_by, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?, ?, ?)`
      ).run(
        contribId,
        existing.id,
        periodYm ?? null,
        targetGoal.id,
        targetGoal.title,
        amount,
        existing.currency,
        note || null,
        idemKey,
        actor,
        nowIso
      );

      const updateGoalInfo = db
        .prepare('UPDATE goals SET current_amount = ROUND(current_amount + ?, 2) WHERE id = ?')
        .run(amount, targetGoal.id);
      if (Number(updateGoalInfo.changes) !== 1) {
        throw new HttpError(404, 'Impossibile aggiornare l’obiettivo Vision Board.');
      }

      const updatedGoalRow = db
        .prepare('SELECT * FROM goals WHERE id = ?')
        .get(targetGoal.id) as Record<string, unknown> | undefined;
      if (!updatedGoalRow) {
        throw new HttpError(500, 'Errore interno durante l’aggiornamento dell’obiettivo.');
      }
      const updatedGoal: SavingGoal = {
        id: String(updatedGoalRow.id),
        title: String(updatedGoalRow.title),
        targetAmount: Number(updatedGoalRow.target_amount),
        currentAmount: Number(updatedGoalRow.current_amount),
        ...(updatedGoalRow.target_date ? { targetDate: String(updatedGoalRow.target_date) } : {}),
        ...(updatedGoalRow.image_url ? { imageUrl: String(updatedGoalRow.image_url) } : {}),
        ...(updatedGoalRow.image_resolution
          ? { imageResolution: String(updatedGoalRow.image_resolution) }
          : {}),
      };

      const nextVersion = existing.version + 1;
      const nextApplied = fromCents(
        toCents(liveCalc.virtualSavingsApplied) + amountCents
      );

      db.prepare(
        `UPDATE savings_challenges
         SET current_valid_spend = ?,
             virtual_savings_accumulated = ?,
             virtual_savings_applied = ?,
             last_reconciled_at = ?,
             updated_at = ?,
             version = ?
         WHERE id = ?`
      ).run(
        liveCalc.currentValidSpend,
        liveCalc.virtualSavingsAccumulated,
        nextApplied,
        nowIso,
        nowIso,
        nextVersion,
        existing.id
      );

      insertHistoryEntry(db, {
        challengeId: existing.id,
        action: 'contribution_confirmed',
        actor,
        summary: `Contributo virtuale di ${amount.toFixed(2)} ${existing.currency} applicato a "${targetGoal.title}".`,
        before: { goalAmount: targetGoal.currentAmount, virtualSavingsApplied: liveCalc.virtualSavingsApplied },
        after: { goalAmount: updatedGoal.currentAmount, virtualSavingsApplied: nextApplied, contributionId: contribId },
        createdAt: nowIso,
      });

      const { challenges, contributions, goalSummaries } = buildHydratedSnapshot(db, handle, now, true);
      const updatedChallenge = challenges.find((c) => c.id === existing.id)!;
      const createdContrib = contributions.find((c) => c.id === contribId)!;

      const body = {
        success: true,
        challenge: updatedChallenge,
        contribution: createdContrib,
        updatedGoal,
        goalSummaries,
      };
      saveIdempotency(db, idemKey, 'confirm_contribution', existing.id, 200, body, nowMs);
      return body;
    });
  };

  const revertContribution = (
    id: string,
    payload: Record<string, unknown> = {},
    ctx: ChallengeActorContext = {}
  ): Record<string, unknown> => {
    if (!isValidSafeEntityId(id)) {
      throw new HttpError(400, 'ID sfida non valido.');
    }
    const handle = getHandle();
    const now = ctx.now ?? new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const idemKey = sanitizeIdempotencyKey(ctx.idempotencyKey ?? payload.idempotencyKey);

    return handle.withTransaction((db) => {
      pruneIdempotency(db, nowMs);
      const replay = lookupIdempotency(db, idemKey, 'revert_contribution', id, nowMs);
      if (replay) return replay.body;

      const rows = loadChallengeRows(db);
      const existing = rows.find((r) => r.id === id);
      if (!existing) {
        throw new HttpError(404, 'Sfida di risparmio non trovata.');
      }

      if (payload.expectedVersion !== undefined) {
        const expectedVersion = Number(payload.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion !== existing.version) {
          throw new HttpError(409, 'La sfida è stata aggiornata da un altro dispositivo.', {
            code: 'VERSION_CONFLICT',
            currentVersion: existing.version,
          });
        }
      }

      let targetContribRow: Record<string, unknown> | undefined;
      if (payload.contributionId !== undefined && payload.contributionId !== '') {
        if (!isValidSafeEntityId(payload.contributionId)) {
          throw new HttpError(400, 'ID contributo non valido.');
        }
        targetContribRow = db
          .prepare('SELECT * FROM savings_challenge_contributions WHERE id = ? AND challenge_id = ?')
          .get(payload.contributionId, id) as Record<string, unknown> | undefined;
        if (!targetContribRow) {
          throw new HttpError(404, 'Contributo virtuale non trovato per questa sfida.');
        }
        if (targetContribRow.status === 'reverted') {
          throw new HttpError(409, 'Questo contributo virtuale è già stato annullato.', {
            code: 'CONTRIBUTION_ALREADY_REVERTED',
          });
        }
      } else {
        targetContribRow = db
          .prepare(
            `SELECT * FROM savings_challenge_contributions
             WHERE challenge_id = ? AND status = 'applied'
             ORDER BY created_at DESC, rowid DESC
             LIMIT 1`
          )
          .get(id) as Record<string, unknown> | undefined;
        if (!targetContribRow) {
          throw new HttpError(404, 'Nessun contributo virtuale attivo da annullare su questa sfida.');
        }
      }

      const targetContrib = mapContributionRow(targetContribRow);
      const dbData = handle.readDatabase();
      const actor = resolveCoupleActor(ctx.requesterEmail, dbData.profile, ctx.actorLabel);
      const reason = payload.reason
        ? sanitizePlainText(payload.reason, 300)
        : 'Annullamento esplicito contributo virtuale';

      db.prepare(
        `UPDATE savings_challenge_contributions
         SET status = 'reverted',
             reverted_at = ?,
             reverted_by = ?,
             revert_reason = ?
         WHERE id = ? AND status = 'applied'`
      ).run(nowIso, actor, reason, targetContrib.id);

      let updatedGoal: SavingGoal | undefined;
      const existingGoal = dbData.goals.find((g) => g.id === targetContrib.goalId);
      if (existingGoal) {
        db.prepare(
          'UPDATE goals SET current_amount = MAX(0, ROUND(current_amount - ?, 2)) WHERE id = ?'
        ).run(targetContrib.amount, existingGoal.id);
        const goalRow = db
          .prepare('SELECT * FROM goals WHERE id = ?')
          .get(existingGoal.id) as Record<string, unknown> | undefined;
        if (goalRow) {
          updatedGoal = {
            id: String(goalRow.id),
            title: String(goalRow.title),
            targetAmount: Number(goalRow.target_amount),
            currentAmount: Number(goalRow.current_amount),
            ...(goalRow.target_date ? { targetDate: String(goalRow.target_date) } : {}),
            ...(goalRow.image_url ? { imageUrl: String(goalRow.image_url) } : {}),
            ...(goalRow.image_resolution ? { imageResolution: String(goalRow.image_resolution) } : {}),
          };
        }
      }

      db.prepare('UPDATE savings_challenges SET updated_at = ?, version = ? WHERE id = ?').run(
        nowIso,
        existing.version + 1,
        id
      );

      insertHistoryEntry(db, {
        challengeId: id,
        action: 'contribution_reverted',
        actor,
        summary: `Contributo virtuale di ${targetContrib.amount.toFixed(2)} ${targetContrib.currency} annullato da "${targetContrib.goalTitleSnapshot}".`,
        before: { contributionId: targetContrib.id, status: 'applied' },
        after: { contributionId: targetContrib.id, status: 'reverted', reason },
        createdAt: nowIso,
      });

      const { challenges, contributions, goalSummaries } = buildHydratedSnapshot(db, handle, now, true);
      const updatedChallenge = challenges.find((c) => c.id === id)!;
      const revertedContribution = contributions.find((c) => c.id === targetContrib.id)!;

      const body = {
        success: true,
        challenge: updatedChallenge,
        revertedContribution,
        ...(updatedGoal ? { updatedGoal } : {}),
        goalSummaries,
      };
      saveIdempotency(db, idemKey, 'revert_contribution', id, 200, body, nowMs);
      return body;
    });
  };

  const deleteChallenge = (
    id: string,
    payload: Record<string, unknown> = {},
    ctx: ChallengeActorContext = {}
  ): Record<string, unknown> => {
    if (!isValidSafeEntityId(id)) {
      throw new HttpError(400, 'ID sfida non valido.');
    }
    const handle = getHandle();
    const now = ctx.now ?? new Date();

    return handle.withTransaction((db) => {
      const rows = loadChallengeRows(db);
      const existing = rows.find((r) => r.id === id);
      if (!existing) {
        throw new HttpError(404, 'Sfida di risparmio non trovata.');
      }

      if (payload.expectedVersion !== undefined) {
        const expectedVersion = Number(payload.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion !== existing.version) {
          throw new HttpError(409, 'La sfida è stata modificata da un altro dispositivo.', {
            code: 'VERSION_CONFLICT',
            currentVersion: existing.version,
          });
        }
      }

      const appliedRows = (
        db
          .prepare(
            `SELECT * FROM savings_challenge_contributions
             WHERE challenge_id = ? AND status = 'applied'`
          )
          .all(id) as Array<Record<string, unknown>>
      ).map(mapContributionRow);

      const appliedTotal = fromCents(appliedRows.reduce((sum, c) => sum + toCents(c.amount), 0));
      if (appliedTotal > 0 && payload.revertAppliedContributions !== true) {
        throw new HttpError(
          409,
          'Questa sfida ha contributi virtuali applicati all’obiettivo. Conferma lo storno prima di eliminarla.',
          { code: 'APPLIED_CONTRIBUTIONS_EXIST', appliedTotal }
        );
      }

      const updatedGoals: SavingGoal[] = [];
      if (appliedRows.length > 0) {
        const revertByGoalCents = new Map<string, number>();
        for (const contrib of appliedRows) {
          revertByGoalCents.set(
            contrib.goalId,
            (revertByGoalCents.get(contrib.goalId) ?? 0) + toCents(contrib.amount)
          );
        }
        for (const [goalId, cents] of revertByGoalCents.entries()) {
          db.prepare(
            'UPDATE goals SET current_amount = MAX(0, ROUND(current_amount - ?, 2)) WHERE id = ?'
          ).run(fromCents(cents), goalId);
          const goalRow = db
            .prepare('SELECT * FROM goals WHERE id = ?')
            .get(goalId) as Record<string, unknown> | undefined;
          if (goalRow) {
            updatedGoals.push({
              id: String(goalRow.id),
              title: String(goalRow.title),
              targetAmount: Number(goalRow.target_amount),
              currentAmount: Number(goalRow.current_amount),
              ...(goalRow.target_date ? { targetDate: String(goalRow.target_date) } : {}),
              ...(goalRow.image_url ? { imageUrl: String(goalRow.image_url) } : {}),
              ...(goalRow.image_resolution
                ? { imageResolution: String(goalRow.image_resolution) }
                : {}),
            });
          }
        }
      }

      db.prepare('DELETE FROM savings_challenges WHERE id = ?').run(id);
      db.prepare('DELETE FROM savings_challenge_idempotency WHERE challenge_id = ?').run(id);

      const { goalSummaries } = buildHydratedSnapshot(db, handle, now, false);
      return {
        success: true,
        deletedId: id,
        revertedAmount: appliedTotal,
        updatedGoals,
        goalSummaries,
      };
    });
  };

  const getChallengeHistory = (id: string) => {
    if (!isValidSafeEntityId(id)) {
      throw new HttpError(400, 'ID sfida non valido.');
    }
    const handle = getHandle();
    return handle.withTransaction((db) => {
      const exists = db
        .prepare('SELECT id FROM savings_challenges WHERE id = ?')
        .get(id) as { id?: string } | undefined;
      if (!exists) {
        throw new HttpError(404, 'Sfida di risparmio non trovata.');
      }

      const historyRows = db
        .prepare(
          'SELECT * FROM savings_challenge_history WHERE challenge_id = ? ORDER BY created_at DESC, rowid DESC'
        )
        .all(id) as Array<Record<string, unknown>>;
      const contribRows = db
        .prepare(
          'SELECT * FROM savings_challenge_contributions WHERE challenge_id = ? ORDER BY created_at DESC, rowid DESC'
        )
        .all(id) as Array<Record<string, unknown>>;

      return {
        success: true,
        challengeId: id,
        history: historyRows.map(mapHistoryRow),
        contributions: contribRows.map(mapContributionRow),
      };
    });
  };

  return {
    listChallenges,
    estimateChallenge,
    createChallenge,
    updateChallenge,
    pauseChallenge,
    resumeChallenge,
    completeChallenge,
    recalculateChallenge,
    confirmContribution,
    revertContribution,
    deleteChallenge,
    getChallengeHistory,
  };
}

export const defaultSavingsChallengesService = createSavingsChallengesService();
