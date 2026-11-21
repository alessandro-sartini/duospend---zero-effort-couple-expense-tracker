import type {
  CoupleProfile,
  Expense,
  SavingGoal,
  Settlement,
} from '../../types';

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
  selectedYear?: number | null;
  selectedMonth?: number | null; // 1..12; null/undefined con selectedYear => intero anno
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

export const WEEKDAYS_SHORT_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const WEEKDAYS_FULL_IT = [
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
  'Domenica',
];

export const MS_PER_DAY = 1000 * 60 * 60 * 24;

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

export function toYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function buildRecentMonths(now: Date, count: number): string[] {
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

export function matchesSplitAndPayer(
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

export function resolveFilterYearMonth(
  filters: Pick<ExpenseFilterCriteria, 'timeframe' | 'selectedYear' | 'selectedMonth'>,
  now: Date = new Date()
): { year: number; month: number | null } {
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const year =
    typeof filters.selectedYear === 'number' && Number.isFinite(filters.selectedYear)
      ? filters.selectedYear
      : nowYear;

  if (filters.timeframe === 'year') {
    return { year, month: null };
  }

  const month =
    typeof filters.selectedMonth === 'number' &&
    filters.selectedMonth >= 1 &&
    filters.selectedMonth <= 12
      ? filters.selectedMonth
      : nowMonth;

  return { year, month };
}

export function filterExpenses(
  expenses: Expense[],
  filters: ExpenseFilterCriteria,
  now: Date = new Date()
): Expense[] {
  const payerFilter = filters.payerFilter ?? 'all';
  const { year: targetYear, month: targetMonth } = resolveFilterYearMonth(filters, now);

  return expenses.filter((expense) => {
    if (!matchesSplitAndPayer(expense, filters.splitFilter, payerFilter)) {
      return false;
    }
    if (filters.timeframe === 'all') return true;

    const parts = parseIsoDateParts(expense.date);
    if (!parts) return false;

    if (filters.timeframe === 'year' || targetMonth === null) {
      return parts.year === targetYear;
    }

    if (filters.timeframe === 'month') {
      return parts.year === targetYear && parts.month === targetMonth;
    }

    const diffMonths = (targetYear - parts.year) * 12 + (targetMonth - parts.month);
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
  const { year: targetYear, month: targetMonth } = resolveFilterYearMonth(filters, now);

  const currentExpenses = filterExpenses(expenses, filters, now);
  const currentTotal = currentExpenses.reduce((sum, item) => sum + item.amount, 0);

  let previousTotal = 0;
  let comparisonLabel = '';

  if (filters.timeframe === 'year' || targetMonth === null) {
    comparisonLabel = 'vs anno prec.';
  } else if (filters.timeframe === 'month') {
    comparisonLabel =
      targetYear === nowYear && targetMonth === nowMonth
        ? 'vs mese scorso'
        : 'vs mese prec.';
  } else {
    comparisonLabel = 'vs 3 mesi prec.';
  }

  for (const expense of expenses) {
    if (!matchesSplitAndPayer(expense, filters.splitFilter, payerFilter)) continue;
    const parts = parseIsoDateParts(expense.date);
    if (!parts) continue;

    if (filters.timeframe === 'year' || targetMonth === null) {
      if (parts.year === targetYear - 1) previousTotal += expense.amount;
    } else if (filters.timeframe === 'month') {
      const diffMonths = (targetYear - parts.year) * 12 + (targetMonth - parts.month);
      if (diffMonths === 1) previousTotal += expense.amount;
    } else if (filters.timeframe === 'quarter') {
      const diffMonths = (targetYear - parts.year) * 12 + (targetMonth - parts.month);
      if (diffMonths >= 3 && diffMonths <= 5) previousTotal += expense.amount;
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
  now: Date = new Date(),
  period?: { selectedYear?: number | null; selectedMonth?: number | null }
): number {
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const todayLocal = new Date(nowYear, now.getMonth(), now.getDate());
  const { year: targetYear, month: targetMonth } = resolveFilterYearMonth(
    {
      timeframe,
      selectedYear: period?.selectedYear,
      selectedMonth: period?.selectedMonth,
    },
    now
  );

  if (timeframe === 'year') {
    const start = new Date(targetYear, 0, 1);
    const end = targetYear === nowYear ? todayLocal : new Date(targetYear, 11, 31);
    if (end.getTime() < start.getTime()) return 1;
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
  }

  if (timeframe === 'month' && targetMonth !== null) {
    if (targetYear === nowYear && targetMonth === nowMonth) {
      return Math.max(1, now.getDate());
    }
    return new Date(targetYear, targetMonth, 0).getDate();
  }

  if (timeframe === 'quarter' && targetMonth !== null) {
    const start = new Date(targetYear, targetMonth - 3, 1);
    const end =
      targetYear === nowYear && targetMonth === nowMonth
        ? todayLocal
        : new Date(targetYear, targetMonth, 0);
    if (end.getTime() < start.getTime()) return 1;
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
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

