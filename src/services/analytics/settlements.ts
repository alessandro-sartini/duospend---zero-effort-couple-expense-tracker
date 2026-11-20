import type { CoupleProfile, Expense, Settlement } from '../../types';
import {
  buildRecentMonths,
  formatFullMonthIt,
  formatShortMonthIt,
  parseIsoDateParts,
  toYearMonth,
} from './shared';
import type {
  IsoDateParts,
  MonthlyPartnerPoint,
  NetBalanceTimelinePoint,
  SettlementChartRange,
} from './shared';

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
