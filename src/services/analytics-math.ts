import type {
  CoupleProfile,
  Expense,
  SavingGoal,
  Settlement,
} from '../types';

export type AnalyticsTimeframe = 'month' | 'quarter' | 'year' | 'all';
export type SplitFilter = 'all' | 'shared' | 'personal';
export type PayerFilter = 'all' | 'user' | 'partner';
export type SettlementChartRange = '3m' | '6m' | 'all';

export interface IsoDateParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

export interface ExpenseFilterCriteria {
  timeframe: AnalyticsTimeframe;
  splitFilter: SplitFilter;
  payerFilter?: PayerFilter;
}

export interface PeriodComparisonResult {
  previousTotal: number | null;
  deltaPercent: number | null;
  comparisonLabel: string | null;
}

export interface BurnRateDayPoint {
  day: number;
  dailyAdded: number;
  cumulative: number | null;
  projected: number | null;
  ideal: number;
}

export interface MonthlyBurnRateSummary {
  monthLabel: string;
  daysInMonth: number;
  currentDay: number;
  currentTotal: number;
  scheduledLaterTotal: number;
  budgetGoal: number;
  idealAtCurrentDay: number;
  dailyRate: number;
  projectedEndOfMonth: number;
  projectedDelta: number;
  budgetPercentage: number;
  points: BurnRateDayPoint[];
}

export interface MonthlyTrendPoint {
  ym: string;
  shortLabel: string;
  fullLabel: string;
  total: number;
  userPaid: number;
  partnerPaid: number;
  byCategory: Record<string, number>;
  otherTotal: number;
  count: number;
  inScope: boolean;
}

export interface WeekdayStat {
  index: number; // 0 = Lun .. 6 = Dom
  shortLabel: string;
  fullLabel: string;
  total: number;
  count: number;
  isPeak: boolean;
}

export interface SourceStat {
  source: Expense['source'];
  count: number;
  total: number;
  sharePercent: number;
}

export interface NetBalanceTimelinePoint {
  id: string;
  date: string;
  title: string;
  note: string;
  amount: number;
  balance: number;
  isSettlement: boolean;
}

export interface MonthlyPartnerPoint {
  ym: string;
  shortLabel: string;
  fullLabel: string;
  userPaid: number;
  partnerPaid: number;
  difference: number;
}

export interface GoalRunwayItem {
  goal: SavingGoal;
  remaining: number;
  percent: number;
  monthsLeft: number | null;
  monthlyPace: number | null;
  isCompleted: boolean;
  isOverdue: boolean;
  isUrgent: boolean;
}

export interface GoalsSavingsOverviewData {
  totalCurrent: number;
  totalTarget: number;
  totalRemaining: number;
  overallPercent: number;
  totalMonthlyPace: number;
  items: GoalRunwayItem[];
}

const MONTH_NAMES_IT = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

const SHORT_MONTHS_IT = [
  'Gen',
  'Feb',
  'Mar',
  'Apr',
  'Mag',
  'Giu',
  'Lug',
  'Ago',
  'Set',
  'Ott',
  'Nov',
  'Dic',
];

const WEEKDAYS_SHORT_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const WEEKDAYS_FULL_IT = [
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
  'Domenica',
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function parseIsoDateParts(dateStr: string): IsoDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const check = new Date(year, month - 1, day);
  if (
    check.getFullYear() !== year ||
    check.getMonth() !== month - 1 ||
    check.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function toYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function buildRecentMonths(now: Date, count: number): string[] {
  const result: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    result.push(toYearMonth(d.getFullYear(), d.getMonth() + 1));
  }
  return result;
}

export function formatMonthYearIt(date: Date = new Date()): string {
  return `${MONTH_NAMES_IT[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatShortMonthIt(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!match) return ym;
  const monthIdx = Number(match[2]) - 1;
  return SHORT_MONTHS_IT[monthIdx] ?? ym;
}

export function formatFullMonthIt(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!match) return ym;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const name = MONTH_NAMES_IT[monthIdx];
  return name ? `${name} ${year}` : ym;
}

export function formatCompactCurrency(amount: number, currency = 'EUR'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const roundedAbs = Math.round(Math.abs(safe));
  const sign = safe < 0 && roundedAbs > 0 ? '-' : '';
  const symbol = currency === 'EUR' ? '€' : `${currency} `;
  const grouped = roundedAbs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${symbol}${grouped}`;
}

export function formatAxisCurrency(amount: number, currency = 'EUR'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(safe);
  const symbol = currency === 'EUR' ? '€' : `${currency} `;
  if (abs >= 1000) {
    const k = Math.round((abs / 1000) * 10) / 10;
    const kLabel = Number.isInteger(k) ? String(k) : k.toFixed(1).replace('.', ',');
    const sign = safe < 0 ? '-' : '';
    return `${sign}${symbol}${kLabel}k`;
  }
  return formatCompactCurrency(safe, currency);
}

export function isSharedExpense(expense: Pick<Expense, 'splitType'>): boolean {
  return expense.splitType === '50_50' || expense.splitType === 'custom';
}

function matchesSplitAndPayer(
  expense: Expense,
  splitFilter: SplitFilter,
  payerFilter: PayerFilter
): boolean {
  if (splitFilter === 'shared' && !isSharedExpense(expense)) return false;
  if (splitFilter === 'personal' && isSharedExpense(expense)) return false;
  if (payerFilter === 'user' && expense.payer !== 'user') return false;
  if (payerFilter === 'partner' && expense.payer !== 'partner') return false;
  return true;
}

export function filterExpenses(
  expenses: Expense[],
  filters: ExpenseFilterCriteria,
  now: Date = new Date()
): Expense[] {
  const payerFilter = filters.payerFilter ?? 'all';
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;

  return expenses.filter((expense) => {
    if (!matchesSplitAndPayer(expense, filters.splitFilter, payerFilter)) {
      return false;
    }
    if (filters.timeframe === 'all') return true;

    const parts = parseIsoDateParts(expense.date);
    if (!parts) return false;

    if (filters.timeframe === 'month') {
      return parts.year === nowYear && parts.month === nowMonth;
    }
    if (filters.timeframe === 'year') {
      return parts.year === nowYear;
    }

    const diffMonths = (nowYear - parts.year) * 12 + (nowMonth - parts.month);
    return diffMonths >= 0 && diffMonths <= 2;
  });
}

export function filterExpensesByMonth(
  expenses: Expense[],
  ym: string,
  splitFilter: SplitFilter = 'all',
  payerFilter: PayerFilter = 'all'
): Expense[] {
  const match = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!match) return [];
  const targetYear = Number(match[1]);
  const targetMonth = Number(match[2]);

  return expenses.filter((expense) => {
    if (!matchesSplitAndPayer(expense, splitFilter, payerFilter)) {
      return false;
    }
    const parts = parseIsoDateParts(expense.date);
    return Boolean(
      parts && parts.year === targetYear && parts.month === targetMonth
    );
  });
}

export function filterExpensesByDay(
  expenses: Expense[],
  year: number,
  month: number,
  day: number,
  splitFilter: SplitFilter = 'all'
): Expense[] {
  return expenses.filter((expense) => {
    if (!matchesSplitAndPayer(expense, splitFilter, 'all')) {
      return false;
    }
    const parts = parseIsoDateParts(expense.date);
    return Boolean(
      parts && parts.year === year && parts.month === month && parts.day === day
    );
  });
}

export function getPreviousPeriodComparison(
  expenses: Expense[],
  filters: ExpenseFilterCriteria,
  now: Date = new Date()
): PeriodComparisonResult {
  if (filters.timeframe === 'all') {
    return { previousTotal: null, deltaPercent: null, comparisonLabel: null };
  }

  const payerFilter = filters.payerFilter ?? 'all';
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;

  const currentExpenses = filterExpenses(expenses, filters, now);
  const currentTotal = currentExpenses.reduce((sum, item) => sum + item.amount, 0);

  let previousTotal = 0;
  let comparisonLabel = '';

  if (filters.timeframe === 'month') {
    comparisonLabel = 'vs mese scorso';
  } else if (filters.timeframe === 'quarter') {
    comparisonLabel = 'vs 3 mesi prec.';
  } else {
    comparisonLabel = 'vs anno prec.';
  }

  for (const expense of expenses) {
    if (!matchesSplitAndPayer(expense, filters.splitFilter, payerFilter)) continue;
    const parts = parseIsoDateParts(expense.date);
    if (!parts) continue;

    if (filters.timeframe === 'month') {
      const diffMonths = (nowYear - parts.year) * 12 + (nowMonth - parts.month);
      if (diffMonths === 1) previousTotal += expense.amount;
    } else if (filters.timeframe === 'quarter') {
      const diffMonths = (nowYear - parts.year) * 12 + (nowMonth - parts.month);
      if (diffMonths >= 3 && diffMonths <= 5) previousTotal += expense.amount;
    } else if (filters.timeframe === 'year') {
      if (parts.year === nowYear - 1) previousTotal += expense.amount;
    }
  }

  const roundedPrevious = Math.round(previousTotal * 100) / 100;
  if (roundedPrevious <= 0) {
    return {
      previousTotal: roundedPrevious,
      deltaPercent: null,
      comparisonLabel,
    };
  }

  const deltaPercent = Math.round(((currentTotal - roundedPrevious) / roundedPrevious) * 100);
  return {
    previousTotal: roundedPrevious,
    deltaPercent,
    comparisonLabel,
  };
}

export function getActiveDaysInPeriod(
  expenses: Expense[],
  timeframe: AnalyticsTimeframe,
  now: Date = new Date()
): number {
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (timeframe === 'month') {
    return Math.max(1, now.getDate());
  }

  if (timeframe === 'quarter') {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return Math.max(1, Math.round((todayLocal.getTime() - start.getTime()) / MS_PER_DAY) + 1);
  }

  if (timeframe === 'year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.max(1, Math.round((todayLocal.getTime() - start.getTime()) / MS_PER_DAY) + 1);
  }

  let earliestTime: number | null = null;
  for (const expense of expenses) {
    const parts = parseIsoDateParts(expense.date);
    if (!parts) continue;
    const t = new Date(parts.year, parts.month - 1, parts.day).getTime();
    if (earliestTime === null || t < earliestTime) {
      earliestTime = t;
    }
  }

  if (earliestTime === null || earliestTime > todayLocal.getTime()) {
    return Math.max(1, now.getDate());
  }

  return Math.max(1, Math.round((todayLocal.getTime() - earliestTime) / MS_PER_DAY) + 1);
}

export function computeMonthlyBurnRate(
  expenses: Expense[],
  monthlyBudget: number,
  splitFilter: SplitFilter = 'all',
  now: Date = new Date()
): MonthlyBurnRateSummary {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const currentDay = Math.min(Math.max(1, now.getDate()), daysInMonth);
  const safeBudget = Number.isFinite(monthlyBudget) && monthlyBudget > 0 ? monthlyBudget : 2800;

  const dailyTotals = new Array<number>(daysInMonth + 1).fill(0);
  let scheduledLaterTotal = 0;

  for (const expense of expenses) {
    if (!matchesSplitAndPayer(expense, splitFilter, 'all')) continue;
    const parts = parseIsoDateParts(expense.date);
    if (!parts || parts.year !== year || parts.month !== month) continue;

    if (parts.day <= currentDay) {
      dailyTotals[parts.day] += expense.amount;
    } else {
      scheduledLaterTotal += expense.amount;
    }
  }

  let runningSum = 0;
  for (let day = 1; day <= currentDay; day += 1) {
    runningSum += dailyTotals[day];
  }

  const currentTotal = Math.round(runningSum * 100) / 100;
  const dailyRate = currentTotal / currentDay;
  const projectedEndOfMonth = Math.round(dailyRate * daysInMonth * 100) / 100;
  const projectedDelta = Math.round((projectedEndOfMonth - safeBudget) * 100) / 100;
  const idealAtCurrentDay = Math.round(((safeBudget / daysInMonth) * currentDay) * 100) / 100;
  const budgetPercentage = Math.min(Math.round((currentTotal / safeBudget) * 100), 999);

  const points: BurnRateDayPoint[] = [];
  let cum = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dailyAdded = Math.round(dailyTotals[day] * 100) / 100;
    if (day <= currentDay) {
      cum += dailyTotals[day];
    }
    const ideal = Math.round(((safeBudget / daysInMonth) * day) * 100) / 100;
    const projected = day >= currentDay ? Math.round(dailyRate * day * 100) / 100 : null;
    points.push({
      day,
      dailyAdded,
      cumulative: day <= currentDay ? Math.round(cum * 100) / 100 : null,
      projected,
      ideal,
    });
  }

  return {
    monthLabel: formatMonthYearIt(now),
    daysInMonth,
    currentDay,
    currentTotal,
    scheduledLaterTotal: Math.round(scheduledLaterTotal * 100) / 100,
    budgetGoal: safeBudget,
    idealAtCurrentDay,
    dailyRate: Math.round(dailyRate * 100) / 100,
    projectedEndOfMonth,
    projectedDelta,
    budgetPercentage,
    points,
  };
}

export function computeMonthlyTrendSeries(
  expenses: Expense[],
  filters: ExpenseFilterCriteria,
  topCategories: string[],
  now: Date = new Date()
): MonthlyTrendPoint[] {
  const payerFilter = filters.payerFilter ?? 'all';
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const currentYm = toYearMonth(nowYear, nowMonth);

  let months: string[];
  if (filters.timeframe === 'all') {
    const validYms = expenses
      .map((e) => parseIsoDateParts(e.date))
      .filter((p): p is IsoDateParts => p !== null)
      .map((p) => toYearMonth(p.year, p.month))
      .filter((ym) => ym <= currentYm)
      .sort();

    if (validYms.length === 0) {
      months = buildRecentMonths(now, 6);
    } else {
      const firstParts = parseIsoDateParts(`${validYms[0]}-01`)!;
      const totalSpan =
        (nowYear - firstParts.year) * 12 + (nowMonth - firstParts.month) + 1;
      const clampedCount = Math.min(12, Math.max(6, totalSpan));
      months = buildRecentMonths(now, clampedCount);
    }
  } else if (filters.timeframe === 'year') {
    const count = Math.max(6, nowMonth);
    months = buildRecentMonths(now, count);
  } else {
    months = buildRecentMonths(now, 6);
  }

  const scopeSet = new Set<string>();
  if (filters.timeframe === 'month') {
    scopeSet.add(currentYm);
  } else if (filters.timeframe === 'quarter') {
    for (const ym of buildRecentMonths(now, 3)) {
      scopeSet.add(ym);
    }
  } else if (filters.timeframe === 'year') {
    for (const ym of months) {
      if (ym.startsWith(`${nowYear}-`)) {
        scopeSet.add(ym);
      }
    }
  } else {
    for (const ym of months) {
      scopeSet.add(ym);
    }
  }

  const topSet = new Set(topCategories);
  const buckets = new Map<string, MonthlyTrendPoint>();
  for (const ym of months) {
    const byCategory: Record<string, number> = {};
    for (const cat of topCategories) {
      byCategory[cat] = 0;
    }
    buckets.set(ym, {
      ym,
      shortLabel: formatShortMonthIt(ym),
      fullLabel: formatFullMonthIt(ym),
      total: 0,
      userPaid: 0,
      partnerPaid: 0,
      byCategory,
      otherTotal: 0,
      count: 0,
      inScope: scopeSet.has(ym),
    });
  }

  for (const expense of expenses) {
    if (!matchesSplitAndPayer(expense, filters.splitFilter, payerFilter)) continue;
    const parts = parseIsoDateParts(expense.date);
    if (!parts) continue;
    const ym = toYearMonth(parts.year, parts.month);
    const point = buckets.get(ym);
    if (!point) continue;

    point.total += expense.amount;
    point.count += 1;
    if (expense.payer === 'user') {
      point.userPaid += expense.amount;
    } else {
      point.partnerPaid += expense.amount;
    }
    if (topSet.has(expense.category)) {
      point.byCategory[expense.category] =
        (point.byCategory[expense.category] || 0) + expense.amount;
    } else {
      point.otherTotal += expense.amount;
    }
  }

  return Array.from(buckets.values()).map((point) => {
    const roundedCats: Record<string, number> = {};
    for (const [cat, val] of Object.entries(point.byCategory)) {
      roundedCats[cat] = Math.round(val * 100) / 100;
    }
    return {
      ...point,
      total: Math.round(point.total * 100) / 100,
      userPaid: Math.round(point.userPaid * 100) / 100,
      partnerPaid: Math.round(point.partnerPaid * 100) / 100,
      otherTotal: Math.round(point.otherTotal * 100) / 100,
      byCategory: roundedCats,
    };
  });
}

export function computeWeekdayDistribution(expenses: Expense[]): WeekdayStat[] {
  const totals = new Array<number>(7).fill(0);
  const counts = new Array<number>(7).fill(0);

  for (const expense of expenses) {
    const parts = parseIsoDateParts(expense.date);
    if (!parts) continue;
    const jsDay = new Date(parts.year, parts.month - 1, parts.day).getDay();
    const index = (jsDay + 6) % 7; // 0 = Lun .. 6 = Dom
    totals[index] += expense.amount;
    counts[index] += 1;
  }

  const maxTotal = Math.max(...totals);
  return WEEKDAYS_SHORT_IT.map((shortLabel, index) => {
    const total = Math.round(totals[index] * 100) / 100;
    return {
      index,
      shortLabel,
      fullLabel: WEEKDAYS_FULL_IT[index],
      total,
      count: counts[index],
      isPeak: maxTotal > 0 && totals[index] === maxTotal,
    };
  });
}

export function computeSourceDistribution(expenses: Expense[]): SourceStat[] {
  const sources: Expense['source'][] = ['gmail', 'camera', 'notification', 'manual'];
  const counts: Record<Expense['source'], number> = {
    gmail: 0,
    camera: 0,
    notification: 0,
    manual: 0,
  };
  const totals: Record<Expense['source'], number> = {
    gmail: 0,
    camera: 0,
    notification: 0,
    manual: 0,
  };

  for (const expense of expenses) {
    counts[expense.source] = (counts[expense.source] || 0) + 1;
    totals[expense.source] = (totals[expense.source] || 0) + expense.amount;
  }

  const totalCount = expenses.length;
  return sources.map((source) => ({
    source,
    count: counts[source],
    total: Math.round(totals[source] * 100) / 100,
    sharePercent: totalCount > 0 ? Math.round((counts[source] / totalCount) * 100) : 0,
  }));
}

function getExpenseBalanceDelta(expense: Expense): number {
  if (expense.splitType === '50_50') {
    const half = expense.amount / 2;
    return expense.payer === 'user' ? half : -half;
  }
  if (expense.splitType === '100_user') {
    return expense.payer === 'partner' ? -expense.amount : 0;
  }
  if (expense.splitType === '100_partner') {
    return expense.payer === 'user' ? expense.amount : 0;
  }
  const userRatio = expense.customSplitRatio ?? 0.5;
  const partnerRatio = 1 - userRatio;
  return expense.payer === 'user'
    ? expense.amount * partnerRatio
    : -expense.amount * userRatio;
}

export function computeNetBalanceTimeline(
  expenses: Expense[],
  settlements: Settlement[],
  profile: Pick<CoupleProfile, 'userName' | 'partnerName'>,
  range: SettlementChartRange = 'all',
  now: Date = new Date()
): NetBalanceTimelinePoint[] {
  if (expenses.length === 0 && settlements.length === 0) {
    return [];
  }

  interface RawEvent {
    id: string;
    date: string;
    title: string;
    note: string;
    amount: number;
    delta: number;
    isSettlement: boolean;
  }

  const events: RawEvent[] = [];

  for (const expense of expenses) {
    const payerLabel = expense.payer === 'user' ? profile.userName : profile.partnerName;
    events.push({
      id: `exp-${expense.id}`,
      date: expense.date,
      title: expense.title,
      note: `${payerLabel} · ${expense.category}`,
      amount: expense.amount,
      delta: getExpenseBalanceDelta(expense),
      isSettlement: false,
    });
  }

  for (const stl of settlements) {
    let delta = 0;
    if (stl.from === 'partner' && stl.to === 'user') {
      delta = -stl.amount;
    } else if (stl.from === 'user' && stl.to === 'partner') {
      delta = stl.amount;
    }
    const fromLabel = stl.from === 'user' ? profile.userName : profile.partnerName;
    const toLabel = stl.to === 'user' ? profile.userName : profile.partnerName;
    events.push({
      id: `stl-${stl.id}`,
      date: stl.date,
      title: `Pareggio ${fromLabel} → ${toLabel}`,
      note: stl.note || 'Rimborso registrato',
      amount: stl.amount,
      delta,
      isSettlement: true,
    });
  }

  events.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.isSettlement === b.isSettlement ? 0 : a.isSettlement ? 1 : -1)
  );

  let running = 0;
  const fullPoints: NetBalanceTimelinePoint[] = [
    {
      id: 'start',
      date: events[0].date,
      title: 'Inizio storico',
      note: 'Saldo iniziale pari',
      amount: 0,
      balance: 0,
      isSettlement: false,
    },
  ];

  for (const event of events) {
    running += event.delta;
    fullPoints.push({
      id: event.id,
      date: event.date,
      title: event.title,
      note: event.note,
      amount: Math.round(event.amount * 100) / 100,
      balance: Math.round(running * 100) / 100,
      isSettlement: event.isSettlement,
    });
  }

  if (range === 'all') {
    return fullPoints;
  }

  const maxMonthDiff = range === '3m' ? 2 : 5;
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const windowStartDate = new Date(nowYear, nowMonth - 1 - maxMonthDiff, 1);
  const windowStartIso = toYearMonth(windowStartDate.getFullYear(), windowStartDate.getMonth() + 1) + '-01';

  const beforeWindow = fullPoints.filter((p) => p.id !== 'start' && p.date < windowStartIso);
  const inWindow = fullPoints.filter((p) => p.id !== 'start' && p.date >= windowStartIso);

  if (beforeWindow.length === 0) {
    return fullPoints;
  }

  const openingPoint = beforeWindow[beforeWindow.length - 1];
  const carryAnchor: NetBalanceTimelinePoint = {
    id: 'window-carry',
    date: windowStartIso,
    title: 'Saldo precedente',
    note: 'Riporto prima del periodo selezionato',
    amount: 0,
    balance: openingPoint.balance,
    isSettlement: false,
  };

  if (inWindow.length === 0) {
    return [
      carryAnchor,
      {
        ...carryAnchor,
        id: 'window-end',
        date: toYearMonth(nowYear, nowMonth) + `-${String(now.getDate()).padStart(2, '0')}`,
        note: 'Nessun movimento nel periodo selezionato',
      },
    ];
  }

  return [carryAnchor, ...inWindow];
}

export function computeMonthlyPartnerComparison(
  expenses: Expense[],
  range: SettlementChartRange = '6m',
  now: Date = new Date()
): MonthlyPartnerPoint[] {
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const currentYm = toYearMonth(nowYear, nowMonth);

  let months: string[];
  if (range === '3m') {
    months = buildRecentMonths(now, 3);
  } else if (range === '6m') {
    months = buildRecentMonths(now, 6);
  } else {
    const validYms = expenses
      .map((e) => parseIsoDateParts(e.date))
      .filter((p): p is IsoDateParts => p !== null)
      .map((p) => toYearMonth(p.year, p.month))
      .filter((ym) => ym <= currentYm)
      .sort();

    if (validYms.length === 0) {
      months = buildRecentMonths(now, 6);
    } else {
      const firstParts = parseIsoDateParts(`${validYms[0]}-01`)!;
      const totalSpan =
        (nowYear - firstParts.year) * 12 + (nowMonth - firstParts.month) + 1;
      months = buildRecentMonths(now, Math.min(12, Math.max(6, totalSpan)));
    }
  }

  const map = new Map<string, MonthlyPartnerPoint>();
  for (const ym of months) {
    map.set(ym, {
      ym,
      shortLabel: formatShortMonthIt(ym),
      fullLabel: formatFullMonthIt(ym),
      userPaid: 0,
      partnerPaid: 0,
      difference: 0,
    });
  }

  for (const expense of expenses) {
    const parts = parseIsoDateParts(expense.date);
    if (!parts) continue;
    const ym = toYearMonth(parts.year, parts.month);
    const point = map.get(ym);
    if (!point) continue;

    if (expense.payer === 'user') {
      point.userPaid += expense.amount;
    } else {
      point.partnerPaid += expense.amount;
    }
  }

  return Array.from(map.values()).map((point) => {
    const userPaid = Math.round(point.userPaid * 100) / 100;
    const partnerPaid = Math.round(point.partnerPaid * 100) / 100;
    return {
      ...point,
      userPaid,
      partnerPaid,
      difference: Math.round((userPaid - partnerPaid) * 100) / 100,
    };
  });
}

export function computeGoalsSavingsOverview(
  goals: SavingGoal[],
  now: Date = new Date()
): GoalsSavingsOverviewData {
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const totalCurrent = Math.round(
    goals.reduce((sum, g) => sum + Math.max(0, g.currentAmount), 0) * 100
  ) / 100;
  const totalTarget = Math.round(
    goals.reduce((sum, g) => sum + Math.max(0, g.targetAmount), 0) * 100
  ) / 100;
  const totalRemaining = Math.round(
    goals.reduce((sum, g) => sum + Math.max(0, g.targetAmount - g.currentAmount), 0) * 100
  ) / 100;

  const overallPercent =
    totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0;

  let totalMonthlyPace = 0;

  const items: GoalRunwayItem[] = goals.map((goal) => {
    const remaining = Math.round(Math.max(0, goal.targetAmount - goal.currentAmount) * 100) / 100;
    const percent =
      goal.targetAmount > 0
        ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
        : 0;
    const isCompleted = remaining <= 0;

    if (isCompleted) {
      return {
        goal,
        remaining: 0,
        percent: 100,
        monthsLeft: 0,
        monthlyPace: 0,
        isCompleted: true,
        isOverdue: false,
        isUrgent: false,
      };
    }

    const targetParts = goal.targetDate ? parseIsoDateParts(goal.targetDate) : null;
    if (!targetParts) {
      return {
        goal,
        remaining,
        percent,
        monthsLeft: null,
        monthlyPace: null,
        isCompleted: false,
        isOverdue: false,
        isUrgent: false,
      };
    }

    const targetTime = new Date(
      targetParts.year,
      targetParts.month - 1,
      targetParts.day
    ).getTime();
    const diffDays = (targetTime - todayLocal.getTime()) / MS_PER_DAY;

    if (diffDays <= 0) {
      totalMonthlyPace += remaining;
      return {
        goal,
        remaining,
        percent,
        monthsLeft: 1,
        monthlyPace: remaining,
        isCompleted: false,
        isOverdue: true,
        isUrgent: true,
      };
    }

    const monthsLeft = Math.max(1, Math.round((diffDays / 30.4375) * 10) / 10);
    const monthlyPace = Math.round((remaining / monthsLeft) * 100) / 100;
    totalMonthlyPace += monthlyPace;

    return {
      goal,
      remaining,
      percent,
      monthsLeft,
      monthlyPace,
      isCompleted: false,
      isOverdue: false,
      isUrgent: monthsLeft <= 2,
    };
  });

  return {
    totalCurrent,
    totalTarget,
    totalRemaining,
    overallPercent,
    totalMonthlyPace: Math.round(totalMonthlyPace * 100) / 100,
    items,
  };
}
