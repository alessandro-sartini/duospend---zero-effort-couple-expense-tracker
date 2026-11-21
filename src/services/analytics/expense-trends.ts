import type { Expense } from '../../types';
import {
  buildRecentMonths,
  formatFullMonthIt,
  formatMonthYearIt,
  formatShortMonthIt,
  matchesSplitAndPayer,
  parseIsoDateParts,
  resolveFilterYearMonth,
  toYearMonth,
  WEEKDAYS_FULL_IT,
  WEEKDAYS_SHORT_IT,
} from './shared';
import type {
  AnalyticsTimeframe,
  BurnRateDayPoint,
  ExpenseFilterCriteria,
  IsoDateParts,
  MonthlyBurnRateSummary,
  MonthlyTrendPoint,
  PayerFilter,
  SourceStat,
  SplitFilter,
  WeekdayStat,
} from './shared';

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
  const { year: targetYear, month: targetMonth } = resolveFilterYearMonth(filters, now);

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
  } else if (filters.timeframe === 'year' || targetMonth === null) {
    months = Array.from({ length: 12 }, (_, idx) => toYearMonth(targetYear, idx + 1));
  } else {
    const anchorDate = new Date(targetYear, targetMonth - 1, 1);
    months = buildRecentMonths(anchorDate, 6);
  }

  const scopeSet = new Set<string>();
  if (filters.timeframe === 'year' || targetMonth === null) {
    for (const ym of months) {
      if (ym.startsWith(`${targetYear}-`)) {
        scopeSet.add(ym);
      }
    }
  } else if (filters.timeframe === 'month') {
    scopeSet.add(toYearMonth(targetYear, targetMonth));
  } else if (filters.timeframe === 'quarter') {
    const anchorDate = new Date(targetYear, targetMonth - 1, 1);
    for (const ym of buildRecentMonths(anchorDate, 3)) {
      scopeSet.add(ym);
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
