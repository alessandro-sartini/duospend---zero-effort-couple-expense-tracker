import { getActiveCategories, getCategoryBudget } from '../../src/constants/categories';
import type {
  CoupleProfile,
  Expense,
  SavingGoal,
  SavingsChallenge,
  SavingsChallengeContribution,
  SavingsChallengeEstimate,
  SavingsChallengeExcludedBreakdown,
  SavingsChallengeHealthState,
  SavingsChallengeMatchedExpensePreview,
  SavingsChallengeMetrics,
  SavingsChallengePeriodRecord,
  SavingsChallengePeriodStatus,
  SavingsChallengeSplitScope,
  SavingsChallengeStatus,
  SavingsChallengesCalculationPolicy,
} from '../../src/types';
import { sanitizeIanaTimeZone, sanitizeYearMonth } from '../utils/sanitizers';

const MS_PER_DAY = 86_400_000;
const MAX_PREVIEW_EXPENSES = 50;

export const CHALLENGE_CALCULATION_POLICY: SavingsChallengesCalculationPolicy = {
  formula: 'max(0, limite mensile - spese considerate valide)',
  currencyPolicy:
    'Nessuna conversione valutaria implicita: vengono conteggiate solo le spese nella valuta della sfida; eventuali spese in altra valuta sono escluse e segnalate.',
  splitPolicy:
    'Configurabile per sfida: tutte le spese della coppia nella categoria (default) oppure solo spese condivise (50/50 o % personalizzata).',
  excludedItemsPolicy:
    'Escluse spese cancellate, in quarantena 0 €, importi negativi o rimborsi, spese future rispetto alla timezone della sfida e pareggi (settlement).',
  virtualTransferPolicy:
    'Il risparmio è esclusivamente virtuale: nessun conto bancario viene modificato e il contributo aggiorna la Vision Board solo dopo conferma esplicita (reversibile).',
};

export interface ChallengeCalculationConfig {
  id: string;
  title: string;
  goalId: string;
  goalTitleSnapshot: string;
  categories: string[];
  monthlyLimit: number;
  currency: string;
  startMonth: string;
  durationMonths: number;
  status: SavingsChallengeStatus;
  splitScope: SavingsChallengeSplitScope;
  timezone: string;
  lastCalculationError?: string;
}

export interface OtherActiveChallengeRef {
  id: string;
  status: SavingsChallengeStatus;
  startDate: string;
  endDate: string;
  categories: string[];
}

export interface ChallengeCalculationResult {
  startDate: string;
  endDate: string;
  periods: SavingsChallengePeriodRecord[];
  metrics: SavingsChallengeMetrics;
  currentValidSpend: number;
  virtualSavingsAccumulated: number;
  virtualSavingsApplied: number;
  lastReconciledAt: string;
}

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

export function addMonthsToYearMonth(ym: string, offsetMonths: number): string {
  const clean = sanitizeYearMonth(ym) ?? '2026-01';
  const [yearStr, monthStr] = clean.split('-');
  const totalMonths = Number(yearStr) * 12 + (Number(monthStr) - 1) + offsetMonths;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = ((totalMonths % 12) + 12) % 12 + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

export function getMonthBounds(ym: string): {
  periodYm: string;
  startDate: string;
  endDate: string;
  daysInMonth: number;
} {
  const clean = sanitizeYearMonth(ym) ?? '2026-01';
  const [yearStr, monthStr] = clean.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    periodYm: clean,
    startDate: `${clean}-01`,
    endDate: `${clean}-${String(daysInMonth).padStart(2, '0')}`,
    daysInMonth,
  };
}

export function buildChallengePeriodMonths(startMonth: string, durationMonths: number): string[] {
  const safeDuration = Math.max(1, Math.min(12, Math.floor(durationMonths)));
  const months: string[] = [];
  for (let i = 0; i < safeDuration; i += 1) {
    months.push(addMonthsToYearMonth(startMonth, i));
  }
  return months;
}

export function getTodayIsoInTimeZone(now: Date = new Date(), rawTimeZone = 'Europe/Rome'): string {
  const timeZone = sanitizeIanaTimeZone(rawTimeZone, 'Europe/Rome');
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback below
  }
  return now.toISOString().slice(0, 10);
}

export function getYearMonthInTimeZone(now: Date = new Date(), rawTimeZone = 'Europe/Rome'): string {
  return getTodayIsoInTimeZone(now, rawTimeZone).slice(0, 7);
}

function parseIsoCalendarUtcMs(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.getTime();
}

export function diffCalendarDaysUtc(startIso: string, endIso: string): number {
  const startMs = parseIsoCalendarUtcMs(startIso);
  const endMs = parseIsoCalendarUtcMs(endIso);
  if (startMs === null || endMs === null) return 0;
  return Math.round((endMs - startMs) / MS_PER_DAY);
}

function isSharedSplit(splitType: Expense['splitType']): boolean {
  return splitType === '50_50' || splitType === 'custom';
}

function formatMoneyLabel(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const symbol = currency === 'EUR' ? '€' : `${currency} `;
  return `${symbol}${safe.toFixed(2)}`;
}

export function computeChallengeCalculation(input: {
  challenge: ChallengeCalculationConfig;
  expenses: Expense[];
  goals: SavingGoal[];
  otherChallenges?: OtherActiveChallengeRef[];
  contributions?: SavingsChallengeContribution[];
  profile?: Pick<CoupleProfile, 'customCategories' | 'hiddenCategories'>;
  now?: Date;
}): ChallengeCalculationResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const { challenge } = input;
  const timeZone = sanitizeIanaTimeZone(challenge.timezone, 'Europe/Rome');
  const todayIso = getTodayIsoInTimeZone(now, timeZone);
  const targetCurrency = (challenge.currency || 'EUR').trim().toUpperCase();

  const periodMonths = buildChallengePeriodMonths(challenge.startMonth, challenge.durationMonths);
  const periodBounds = periodMonths.map(getMonthBounds);
  const startDate = periodBounds[0].startDate;
  const endDate = periodBounds[periodBounds.length - 1].endDate;

  const limitCents = Math.max(0, toCents(Number.isFinite(challenge.monthlyLimit) ? challenge.monthlyLimit : 0));
  const safeMonthlyLimit = fromCents(limitCents);

  const categorySetLower = new Set(
    challenge.categories.map((cat) => cat.trim().toLowerCase()).filter(Boolean)
  );

  // Deduplicate expenses by ID while collecting valid and excluded metrics
  const seenExpenseIds = new Set<string>();
  const periodBuckets = new Map<
    string,
    {
      validCents: number;
      matchedCount: number;
      excludedCount: number;
    }
  >();
  for (const b of periodBounds) {
    periodBuckets.set(b.periodYm, { validCents: 0, matchedCount: 0, excludedCount: 0 });
  }

  const foreignCurrencyMap = new Map<string, { count: number; totalCents: number }>();
  let zeroOrQuarantineCount = 0;
  let negativeOrInvalidCount = 0;
  let futureExpenseCount = 0;
  let futureScheduledCents = 0;
  let personalExcludedCount = 0;
  let sharedSpendCents = 0;
  let personalSpendCents = 0;

  const matchedExpenses: SavingsChallengeMatchedExpensePreview[] = [];

  for (const exp of input.expenses) {
    if (!exp || typeof exp.id !== 'string' || !exp.id) continue;
    if (seenExpenseIds.has(exp.id)) continue;
    seenExpenseIds.add(exp.id);

    const expCategoryLower = (exp.category || '').trim().toLowerCase();
    if (!categorySetLower.has(expCategoryLower)) continue;

    const cleanDate = typeof exp.date === 'string' ? exp.date.trim().slice(0, 10) : '';
    if (parseIsoCalendarUtcMs(cleanDate) === null) continue;
    if (cleanDate < startDate || cleanDate > endDate) continue;

    const periodYm = cleanDate.slice(0, 7);
    const bucket = periodBuckets.get(periodYm);
    if (!bucket) continue;

    if (!Number.isFinite(exp.amount) || exp.amount < 0) {
      negativeOrInvalidCount += 1;
      bucket.excludedCount += 1;
      continue;
    }

    if (exp.amount === 0 || exp.reconciliationStatus === 'zero_quarantine') {
      zeroOrQuarantineCount += 1;
      bucket.excludedCount += 1;
      continue;
    }

    const expCurrency = (exp.currency || 'EUR').trim().toUpperCase();
    if (expCurrency !== targetCurrency) {
      const prev = foreignCurrencyMap.get(expCurrency) ?? { count: 0, totalCents: 0 };
      foreignCurrencyMap.set(expCurrency, {
        count: prev.count + 1,
        totalCents: prev.totalCents + toCents(exp.amount),
      });
      bucket.excludedCount += 1;
      continue;
    }

    if (challenge.splitScope === 'shared_only' && !isSharedSplit(exp.splitType)) {
      personalExcludedCount += 1;
      bucket.excludedCount += 1;
      continue;
    }

    if (cleanDate > todayIso) {
      futureExpenseCount += 1;
      futureScheduledCents += toCents(exp.amount);
      bucket.excludedCount += 1;
      continue;
    }

    const cents = toCents(exp.amount);
    bucket.validCents += cents;
    bucket.matchedCount += 1;
    if (isSharedSplit(exp.splitType)) {
      sharedSpendCents += cents;
    } else {
      personalSpendCents += cents;
    }

    matchedExpenses.push({
      id: exp.id,
      title: exp.title,
      date: cleanDate,
      amount: fromCents(cents),
      currency: expCurrency,
      category: exp.category,
      splitType: exp.splitType,
    });
  }

  matchedExpenses.sort((a, b) => b.date.localeCompare(a.date));

  const appliedByPeriodCents = new Map<string, number>();
  let totalAppliedCents = 0;
  for (const contrib of input.contributions ?? []) {
    if (contrib.challengeId !== challenge.id || contrib.status !== 'applied') continue;
    const cents = Math.max(0, toCents(contrib.amount));
    totalAppliedCents += cents;
    if (contrib.periodYm) {
      appliedByPeriodCents.set(
        contrib.periodYm,
        (appliedByPeriodCents.get(contrib.periodYm) ?? 0) + cents
      );
    }
  }

  let totalValidCents = 0;
  let totalPotentialCents = 0;

  const periods: SavingsChallengePeriodRecord[] = periodBounds.map((bounds) => {
    const bucket = periodBuckets.get(bounds.periodYm) ?? {
      validCents: 0,
      matchedCount: 0,
      excludedCount: 0,
    };
    const isUpcoming = bounds.startDate > todayIso;
    const isConcluded = todayIso > bounds.endDate;

    totalValidCents += bucket.validCents;
    const potentialCents = isUpcoming ? 0 : Math.max(0, limitCents - bucket.validCents);
    totalPotentialCents += potentialCents;

    let periodStatus: SavingsChallengePeriodStatus;
    if (challenge.lastCalculationError) {
      periodStatus = 'needs_recalculation';
    } else if (challenge.status === 'cancelled') {
      periodStatus = 'cancelled';
    } else if (challenge.status === 'paused') {
      periodStatus = 'paused';
    } else if (isUpcoming) {
      periodStatus = 'upcoming';
    } else if (challenge.status === 'completed' || isConcluded) {
      periodStatus = 'completed';
    } else {
      periodStatus = 'active';
    }

    return {
      id: `${challenge.id}:${bounds.periodYm}`,
      challengeId: challenge.id,
      periodYm: bounds.periodYm,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      monthlyLimit: safeMonthlyLimit,
      validSpend: fromCents(bucket.validCents),
      virtualSavingsPotential: fromCents(potentialCents),
      virtualSavingsApplied: fromCents(appliedByPeriodCents.get(bounds.periodYm) ?? 0),
      matchedExpenseCount: bucket.matchedCount,
      excludedExpenseCount: bucket.excludedCount,
      status: periodStatus,
      reconciledAt: nowIso,
      ...(challenge.lastCalculationError ? { calculationError: challenge.lastCalculationError } : {}),
    };
  });

  const totalLimitCents = limitCents * periodBounds.length;
  const remainingCents = Math.max(0, totalLimitCents - totalValidCents);
  const exceededCents = Math.max(0, totalValidCents - totalLimitCents);
  const availableCents = Math.max(0, totalPotentialCents - totalAppliedCents);

  const consumedPercent =
    totalLimitCents > 0
      ? Math.round((totalValidCents / totalLimitCents) * 1000) / 10
      : totalValidCents > 0
        ? 100
        : 0;
  const barPercent = Math.min(100, Math.max(0, Math.round(consumedPercent)));

  const daysTotal = Math.max(1, diffCalendarDaysUtc(startDate, endDate) + 1);
  let daysElapsed = 0;
  if (todayIso >= startDate) {
    daysElapsed =
      todayIso > endDate
        ? daysTotal
        : Math.min(daysTotal, Math.max(0, diffCalendarDaysUtc(startDate, todayIso) + 1));
  }
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);
  const isPeriodConcluded = todayIso > endDate;

  // Detect overlapping active challenges sharing categories and overlapping dates
  const overlappingChallengeIds: string[] = [];
  const overlappingCategorySet = new Set<string>();
  for (const other of input.otherChallenges ?? []) {
    if (other.id === challenge.id) continue;
    if (challenge.status !== 'active' || other.status !== 'active') continue;
    const datesOverlap = other.startDate <= endDate && other.endDate >= startDate;
    if (!datesOverlap) continue;
    const sharedCats = other.categories.filter((cat) =>
      categorySetLower.has(cat.trim().toLowerCase())
    );
    if (sharedCats.length > 0) {
      overlappingChallengeIds.push(other.id);
      for (const cat of sharedCats) {
        overlappingCategorySet.add(cat);
      }
    }
  }

  // Detect orphaned categories (removed custom category or hidden built-in category)
  const activeCategoriesLower = new Set(
    getActiveCategories(input.profile, input.goals).map((c) => c.trim().toLowerCase())
  );
  const orphanedCategories = challenge.categories.filter(
    (cat) => !activeCategoriesLower.has(cat.trim().toLowerCase())
  );

  const linkedGoal = input.goals.find((g) => g.id === challenge.goalId);
  const goalLinked = Boolean(linkedGoal);
  const goalLabel = linkedGoal?.title || challenge.goalTitleSnapshot || 'Obiettivo Vision Board';

  const matchedExpenseCount = matchedExpenses.length;

  let healthState: SavingsChallengeHealthState;
  if (challenge.status === 'cancelled') {
    healthState = 'cancelled';
  } else if (challenge.status === 'paused') {
    healthState = 'paused';
  } else if (challenge.lastCalculationError || !goalLinked) {
    healthState = 'needs_recalculation';
  } else if (
    challenge.status === 'completed' ||
    (isPeriodConcluded && totalValidCents <= totalLimitCents)
  ) {
    healthState = 'completed';
  } else if (totalValidCents > totalLimitCents) {
    healthState = 'exceeded';
  } else if (matchedExpenseCount === 0 && !isPeriodConcluded) {
    healthState = 'neutral';
  } else if (consumedPercent >= 80) {
    healthState = 'warning';
  } else {
    healthState = 'positive';
  }

  const availableLabel = formatMoneyLabel(fromCents(availableCents), targetCurrency);
  const potentialLabel = formatMoneyLabel(fromCents(totalPotentialCents), targetCurrency);
  const remainingLabel = formatMoneyLabel(fromCents(remainingCents), targetCurrency);
  const exceededLabel = formatMoneyLabel(fromCents(exceededCents), targetCurrency);

  let statusMessage: string;
  switch (healthState) {
    case 'cancelled':
      statusMessage = 'Sfida annullata. Nessun conto reale è stato modificato.';
      break;
    case 'paused':
      statusMessage = 'Sfida in pausa: potete riattivarla in qualsiasi momento.';
      break;
    case 'needs_recalculation':
      statusMessage = !goalLinked
        ? 'L’obiettivo Vision Board collegato non è più presente: scegliete un nuovo obiettivo o ricalcolate.'
        : 'Alcuni dati richiedono un ricalcolo manuale per aggiornare la sfida.';
      break;
    case 'completed':
      statusMessage =
        availableCents > 0
          ? `Questa sfida è stata completata: avete creato ${availableLabel} virtuali per ${goalLabel}.`
          : totalAppliedCents > 0
            ? `Questa sfida è stata completata e avete già applicato ${formatMoneyLabel(fromCents(totalAppliedCents), targetCurrency)} virtuali a ${goalLabel}.`
            : 'Questa sfida è stata completata.';
      break;
    case 'exceeded':
      statusMessage = `Il limite è stato superato di ${exceededLabel}. Nessuna penalità: potete ripartire il prossimo mese o rivedere la soglia.`;
      break;
    case 'neutral':
      statusMessage = `Nessuna spesa registrata nel periodo finora: risparmio virtuale potenziale ${potentialLabel}.`;
      break;
    case 'warning':
      statusMessage = `Obiettivo quasi raggiunto: restano ${remainingLabel} di margine su ${formatMoneyLabel(fromCents(totalLimitCents), targetCurrency)}.`;
      break;
    case 'positive':
    default:
      statusMessage = `Avete creato ${availableLabel} virtuali potenziali per ${goalLabel}.`;
      break;
  }

  const foreignCurrencies = Array.from(foreignCurrencyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, stats]) => ({
      currency,
      count: stats.count,
      total: fromCents(stats.totalCents),
    }));
  const foreignCurrencyCount = foreignCurrencies.reduce((acc, item) => acc + item.count, 0);

  const excludedBreakdown: SavingsChallengeExcludedBreakdown = {
    foreignCurrencyCount,
    foreignCurrencies,
    zeroOrQuarantineCount,
    negativeOrInvalidCount,
    futureExpenseCount,
    futureScheduledTotal: fromCents(futureScheduledCents),
    personalExcludedCount,
    settlementsAlwaysExcluded: true,
  };

  return {
    startDate,
    endDate,
    periods,
    metrics: {
      totalLimit: fromCents(totalLimitCents),
      validSpend: fromCents(totalValidCents),
      remainingBudget: fromCents(remainingCents),
      exceededAmount: fromCents(exceededCents),
      consumedPercent,
      barPercent,
      virtualSavingsPotential: fromCents(totalPotentialCents),
      virtualSavingsApplied: fromCents(totalAppliedCents),
      virtualSavingsAvailable: fromCents(availableCents),
      daysTotal,
      daysElapsed,
      daysRemaining,
      isPeriodConcluded,
      matchedExpenseCount,
      matchedExpensesPreview: matchedExpenses.slice(0, MAX_PREVIEW_EXPENSES),
      sharedSpend: fromCents(sharedSpendCents),
      personalSpend: fromCents(personalSpendCents),
      excludedBreakdown,
      overlappingChallengeIds,
      overlappingCategories: Array.from(overlappingCategorySet),
      orphanedCategories,
      goalLinked,
      healthState,
      statusMessage,
    },
    currentValidSpend: fromCents(totalValidCents),
    virtualSavingsAccumulated: fromCents(totalPotentialCents),
    virtualSavingsApplied: fromCents(totalAppliedCents),
    lastReconciledAt: nowIso,
  };
}

export function estimateChallengeSetup(input: {
  categories: string[];
  startMonth: string;
  durationMonths: number;
  monthlyLimit?: number;
  goalId?: string;
  splitScope?: SavingsChallengeSplitScope;
  timezone?: string;
  currency?: string;
  expenses: Expense[];
  goals: SavingGoal[];
  profile?: CoupleProfile;
  now?: Date;
}): SavingsChallengeEstimate {
  const now = input.now ?? new Date();
  const timeZone = sanitizeIanaTimeZone(input.timezone, 'Europe/Rome');
  const todayIso = getTodayIsoInTimeZone(now, timeZone);
  const startMonth = sanitizeYearMonth(input.startMonth) ?? todayIso.slice(0, 7);
  const durationMonths = Math.max(1, Math.min(12, Math.floor(input.durationMonths || 1)));
  const splitScope: SavingsChallengeSplitScope =
    input.splitScope === 'shared_only' ? 'shared_only' : 'all';
  const currency = (input.currency || input.profile?.currency || 'EUR').trim().toUpperCase();
  const categories = Array.from(new Set(input.categories.map((c) => c.trim()).filter(Boolean)));
  const categorySetLower = new Set(categories.map((c) => c.toLowerCase()));

  const periodMonths = buildChallengePeriodMonths(startMonth, durationMonths);
  const startDate = getMonthBounds(periodMonths[0]).startDate;
  const endDate = getMonthBounds(periodMonths[periodMonths.length - 1]).endDate;

  const previousMonths = [
    addMonthsToYearMonth(startMonth, -3),
    addMonthsToYearMonth(startMonth, -2),
    addMonthsToYearMonth(startMonth, -1),
  ];
  const prevTotals = new Map<string, number>(previousMonths.map((ym) => [ym, 0]));
  const prevStart = getMonthBounds(previousMonths[0]).startDate;
  const prevEnd = getMonthBounds(previousMonths[previousMonths.length - 1]).endDate;

  let currentPeriodCents = 0;
  let excludedForeignCurrencyCount = 0;
  const seenIds = new Set<string>();

  for (const exp of input.expenses) {
    if (!exp || !exp.id || seenIds.has(exp.id)) continue;
    seenIds.add(exp.id);
    if (!categorySetLower.has((exp.category || '').trim().toLowerCase())) continue;
    if (!Number.isFinite(exp.amount) || exp.amount <= 0) continue;
    if (exp.reconciliationStatus === 'zero_quarantine') continue;
    if (splitScope === 'shared_only' && !isSharedSplit(exp.splitType)) continue;

    const cleanDate = typeof exp.date === 'string' ? exp.date.trim().slice(0, 10) : '';
    if (parseIsoCalendarUtcMs(cleanDate) === null) continue;

    const expCurrency = (exp.currency || 'EUR').trim().toUpperCase();
    if (expCurrency !== currency) {
      if (cleanDate >= startDate && cleanDate <= endDate) {
        excludedForeignCurrencyCount += 1;
      }
      continue;
    }

    if (cleanDate >= prevStart && cleanDate <= prevEnd) {
      const ym = cleanDate.slice(0, 7);
      prevTotals.set(ym, (prevTotals.get(ym) ?? 0) + toCents(exp.amount));
    }

    if (cleanDate >= startDate && cleanDate <= endDate && cleanDate <= todayIso) {
      currentPeriodCents += toCents(exp.amount);
    }
  }

  const nonZeroMonths = Array.from(prevTotals.values()).filter((cents) => cents > 0);
  const previousPeriodMonthsSampled = nonZeroMonths.length;
  const previousPeriodAverageSpend =
    nonZeroMonths.length > 0
      ? fromCents(Math.round(nonZeroMonths.reduce((a, b) => a + b, 0) / nonZeroMonths.length))
      : 0;

  const fallbackCategoryBudget = categories.reduce(
    (sum, cat) => sum + getCategoryBudget(cat, input.profile, input.goals),
    0
  );

  const suggestedMonthlyLimit =
    previousPeriodAverageSpend > 0
      ? Math.max(10, Math.round((previousPeriodAverageSpend * 0.9) / 5) * 5)
      : Math.max(50, Math.round(fallbackCategoryBudget * 100) / 100);

  const effectiveLimit =
    typeof input.monthlyLimit === 'number' && Number.isFinite(input.monthlyLimit) && input.monthlyLimit > 0
      ? Math.round(input.monthlyLimit * 100) / 100
      : suggestedMonthlyLimit;

  const currentPeriodSpend = fromCents(currentPeriodCents);
  const estimatedTotalLimit = Math.round(effectiveLimit * durationMonths * 100) / 100;
  const estimatedVirtualSavings = fromCents(
    Math.max(0, toCents(estimatedTotalLimit) - currentPeriodCents)
  );

  const customCatSetLower = new Set(
    (input.profile?.customCategories ?? []).map((c) => c.trim().toLowerCase())
  );
  const customCategoriesSelected = categories.filter((c) =>
    customCatSetLower.has(c.trim().toLowerCase())
  );

  const matchedGoal = input.goalId
    ? input.goals.find((g) => g.id === input.goalId)
    : undefined;

  return {
    startMonth,
    durationMonths,
    startDate,
    endDate,
    currency,
    timezone: timeZone,
    splitScope,
    categories,
    previousPeriodAverageSpend,
    previousPeriodMonthsSampled,
    currentPeriodSpend,
    suggestedMonthlyLimit,
    estimatedVirtualSavings,
    customCategoriesSelected,
    excludedForeignCurrencyCount,
    ...(matchedGoal
      ? {
          goalPreview: {
            id: matchedGoal.id,
            title: matchedGoal.title,
            currentAmount: matchedGoal.currentAmount,
            targetAmount: matchedGoal.targetAmount,
            ...(matchedGoal.imageUrl ? { imageUrl: matchedGoal.imageUrl } : {}),
          },
        }
      : {}),
    calculationSummary: `Risparmio virtuale = max(0, limite mensile ${formatMoneyLabel(effectiveLimit, currency)} - spese valide nelle ${categories.length} categorie selezionate nel periodo ${startDate} → ${endDate}).`,
    virtualSavingsNotice:
      'Il risparmio generato è virtuale: nessun conto bancario reale viene modificato e i fondi sull’obiettivo cambiano solo dopo conferma esplicita.',
  };
}

export function buildGoalVirtualSavingsMap(
  challenges: SavingsChallenge[],
  contributions: SavingsChallengeContribution[]
): Map<string, number> {
  const byGoalCents = new Map<string, number>();
  for (const contrib of contributions) {
    if (contrib.status !== 'applied') continue;
    byGoalCents.set(
      contrib.goalId,
      (byGoalCents.get(contrib.goalId) ?? 0) + toCents(contrib.amount)
    );
  }
  const result = new Map<string, number>();
  for (const challenge of challenges) {
    if (!result.has(challenge.goalId)) {
      result.set(challenge.goalId, fromCents(byGoalCents.get(challenge.goalId) ?? 0));
    }
  }
  for (const [goalId, cents] of byGoalCents.entries()) {
    result.set(goalId, fromCents(cents));
  }
  return result;
}
