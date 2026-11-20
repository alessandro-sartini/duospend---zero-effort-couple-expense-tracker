import { describe, expect, it } from 'vitest';
import {
  computeGoalsSavingsOverview,
  computeMonthlyBurnRate,
  computeMonthlyPartnerComparison,
  computeMonthlyTrendSeries,
  computeNetBalanceTimeline,
  computeSourceDistribution,
  computeWeekdayDistribution,
  filterExpenses,
  filterExpensesByDay,
  filterExpensesByMonth,
  formatAxisCurrency,
  formatMonthYearIt,
  getPreviousPeriodComparison,
} from '../src/services/analytics-math';
import { computeSettlementBalance } from '../src/services/settlement-math';
import type { Expense, SavingGoal, Settlement } from '../src/types';

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: overrides.id ?? 'exp-1',
    title: overrides.title ?? 'Spesa Test',
    amount: overrides.amount ?? 50,
    currency: overrides.currency ?? 'EUR',
    date: overrides.date ?? '2026-11-10',
    category: overrides.category ?? 'Spesa',
    payer: overrides.payer ?? 'user',
    splitType: overrides.splitType ?? '50_50',
    source: overrides.source ?? 'manual',
    ...overrides,
  };
}

function makeSettlement(overrides: Partial<Settlement>): Settlement {
  return {
    id: overrides.id ?? 'stl-1',
    date: overrides.date ?? '2026-11-12',
    amount: overrides.amount ?? 100,
    currency: overrides.currency ?? 'EUR',
    from: overrides.from ?? 'partner',
    to: overrides.to ?? 'user',
    note: overrides.note ?? 'Pareggio Test',
    ...overrides,
  };
}

const NOV_20 = new Date(2026, 10, 20, 12, 0, 0);

describe('analytics-math (motore calcoli dashboard DuoSpend)', () => {
  it('filtra correttamente mese, trimestre stretto (3 mesi solari), anno, split e pagante', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'aug', date: '2026-08-31', amount: 100, splitType: '50_50', payer: 'user' }),
      makeExpense({ id: 'sep', date: '2026-09-01', amount: 120, splitType: '50_50', payer: 'partner' }),
      makeExpense({ id: 'oct', date: '2026-10-15', amount: 80, splitType: '100_user', payer: 'user' }),
      makeExpense({ id: 'nov', date: '2026-11-18', amount: 60, splitType: 'custom', customSplitRatio: 0.7, payer: 'partner' }),
      makeExpense({ id: 'prev-yr', date: '2025-12-20', amount: 200, splitType: '50_50', payer: 'user' }),
    ];

    // Regressione bug trimestre: Agosto NON deve rientrare quando siamo a Novembre
    const quarterAll = filterExpenses(
      expenses,
      { timeframe: 'quarter', splitFilter: 'all', payerFilter: 'all' },
      NOV_20
    );
    expect(quarterAll.map((e) => e.id)).toEqual(['sep', 'oct', 'nov']);

    const monthOnly = filterExpenses(
      expenses,
      { timeframe: 'month', splitFilter: 'all' },
      NOV_20
    );
    expect(monthOnly.map((e) => e.id)).toEqual(['nov']);

    const yearSharedPartner = filterExpenses(
      expenses,
      { timeframe: 'year', splitFilter: 'shared', payerFilter: 'partner' },
      NOV_20
    );
    expect(yearSharedPartner.map((e) => e.id)).toEqual(['sep', 'nov']);

    const personalAll = filterExpenses(
      expenses,
      { timeframe: 'all', splitFilter: 'personal' },
      NOV_20
    );
    expect(personalAll.map((e) => e.id)).toEqual(['oct']);
  });

  it('calcola il confronto percentuale rispetto al periodo precedente e gestisce casi vuoti o all', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'oct-1', date: '2026-10-10', amount: 200 }),
      makeExpense({ id: 'nov-1', date: '2026-11-10', amount: 250 }),
    ];

    const mom = getPreviousPeriodComparison(
      expenses,
      { timeframe: 'month', splitFilter: 'all' },
      NOV_20
    );
    expect(mom.previousTotal).toBe(200);
    expect(mom.deltaPercent).toBe(25);
    expect(mom.comparisonLabel).toBe('vs mese scorso');

    const allCmp = getPreviousPeriodComparison(
      expenses,
      { timeframe: 'all', splitFilter: 'all' },
      NOV_20
    );
    expect(allCmp.deltaPercent).toBeNull();
  });

  it('calcola burn-rate mensile, proiezione lineare e gestisce anni bisestili', () => {
    const empty = computeMonthlyBurnRate([], 2800, 'all', NOV_20);
    expect(empty.currentTotal).toBe(0);
    expect(empty.projectedEndOfMonth).toBe(0);
    expect(empty.daysInMonth).toBe(30);
    expect(empty.monthLabel).toBe('Novembre 2026');

    const midMonth = computeMonthlyBurnRate(
      [
        makeExpense({ id: 'n1', date: '2026-11-05', amount: 400, splitType: '50_50' }),
        makeExpense({ id: 'n2', date: '2026-11-10', amount: 600, splitType: '50_50' }),
        makeExpense({ id: 'n3', date: '2026-11-12', amount: 150, splitType: '100_user' }),
      ],
      2800,
      'shared',
      NOV_20
    );

    // 1000 spesi fino al giorno 20 su 30 giorni -> 50/giorno -> proiezione 1500
    expect(midMonth.currentTotal).toBe(1000);
    expect(midMonth.dailyRate).toBe(50);
    expect(midMonth.projectedEndOfMonth).toBe(1500);
    expect(midMonth.projectedDelta).toBe(-1300);
    expect(midMonth.points[19].cumulative).toBe(1000);
    expect(midMonth.points[29].projected).toBe(1500);

    const febLeap = computeMonthlyBurnRate([], 2000, 'all', new Date(2024, 1, 15));
    const febRegular = computeMonthlyBurnRate([], 2000, 'all', new Date(2026, 1, 15));
    expect(febLeap.daysInMonth).toBe(29);
    expect(febRegular.daysInMonth).toBe(28);
  });

  it('genera serie mensile ordinata con scope corretto e ripartizione categorie', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'e1', date: '2026-09-05', amount: 300, category: 'Spesa', payer: 'user' }),
      makeExpense({ id: 'e2', date: '2026-11-05', amount: 200, category: 'Casa e Affitto', payer: 'partner' }),
      makeExpense({ id: 'e3', date: '2026-11-08', amount: 50, category: 'Altro', payer: 'user' }),
    ];

    const series = computeMonthlyTrendSeries(
      expenses,
      { timeframe: 'quarter', splitFilter: 'all', payerFilter: 'all' },
      ['Spesa', 'Casa e Affitto'],
      NOV_20
    );

    expect(series.map((s) => s.ym)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(series.filter((s) => s.inScope).map((s) => s.ym)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    const nov = series[5];
    expect(nov.total).toBe(250);
    expect(nov.userPaid).toBe(50);
    expect(nov.partnerPaid).toBe(200);
    expect(nov.byCategory['Casa e Affitto']).toBe(200);
    expect(nov.otherTotal).toBe(50);
  });

  it('mappa correttamente i giorni della settimana (Lun-Dom senza shift UTC) e le fonti', () => {
    const expenses: Expense[] = [
      // 2026-11-16 è Lunedì
      makeExpense({ id: 'mon', date: '2026-11-16', amount: 40, source: 'gmail' }),
      // 2026-11-22 è Domenica
      makeExpense({ id: 'sun', date: '2026-11-22', amount: 180, source: 'camera' }),
      makeExpense({ id: 'sun2', date: '2026-11-22', amount: 20, source: 'camera' }),
    ];

    const weekdays = computeWeekdayDistribution(expenses);
    expect(weekdays[0].shortLabel).toBe('Lun');
    expect(weekdays[0].total).toBe(40);
    expect(weekdays[0].isPeak).toBe(false);
    expect(weekdays[6].shortLabel).toBe('Dom');
    expect(weekdays[6].total).toBe(200);
    expect(weekdays[6].count).toBe(2);
    expect(weekdays[6].isPeak).toBe(true);

    const sources = computeSourceDistribution(expenses);
    const camera = sources.find((s) => s.source === 'camera');
    const gmail = sources.find((s) => s.source === 'gmail');
    expect(camera).toEqual({ source: 'camera', count: 2, total: 200, sharePercent: 67 });
    expect(gmail).toEqual({ source: 'gmail', count: 1, total: 40, sharePercent: 33 });
  });

  it('mantiene parità esatta tra punto finale della timeline e computeSettlementBalance', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'e1', date: '2026-06-10', amount: 100.33, payer: 'user', splitType: '50_50' }),
      makeExpense({ id: 'e2', date: '2026-09-12', amount: 200, payer: 'user', splitType: 'custom', customSplitRatio: 0.7 }),
      makeExpense({ id: 'e3', date: '2026-10-05', amount: 45, payer: 'partner', splitType: '100_user' }),
      makeExpense({ id: 'e4', date: '2026-11-02', amount: 70, payer: 'user', splitType: '100_partner' }),
    ];
    const settlements: Settlement[] = [
      makeSettlement({ id: 's1', date: '2026-09-30', amount: 30, from: 'partner', to: 'user' }),
      makeSettlement({ id: 's2', date: '2026-10-20', amount: 5, from: 'user', to: 'partner' }),
    ];

    const expected = computeSettlementBalance(expenses, settlements).netBalance;
    const timelineAll = computeNetBalanceTimeline(
      expenses,
      settlements,
      { userName: 'Ale', partnerName: 'Bea' },
      'all',
      NOV_20
    );
    const timeline3m = computeNetBalanceTimeline(
      expenses,
      settlements,
      { userName: 'Ale', partnerName: 'Bea' },
      '3m',
      NOV_20
    );

    expect(timelineAll[timelineAll.length - 1].balance).toBe(expected);
    // Anche filtrando agli ultimi 3 mesi il saldo di chiusura mantiene il riporto esatto
    expect(timeline3m[0].id).toBe('window-carry');
    expect(timeline3m[timeline3m.length - 1].balance).toBe(expected);
    expect(
      computeNetBalanceTimeline([], [], { userName: 'Ale', partnerName: 'Bea' })
    ).toEqual([]);

    const partnerMonthly = computeMonthlyPartnerComparison(expenses, '3m', NOV_20);
    expect(partnerMonthly.map((m) => m.ym)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('calcola riepilogo obiettivi, completati, scaduti e senza scadenza', () => {
    const goals: SavingGoal[] = [
      { id: 'g1', title: 'Fatto', currentAmount: 1000, targetAmount: 1000, targetDate: '2026-12-31' },
      { id: 'g2', title: 'Scaduto', currentAmount: 200, targetAmount: 500, targetDate: '2026-10-01' },
      { id: 'g3', title: 'Futuro', currentAmount: 1000, targetAmount: 2200, targetDate: '2027-05-22' },
      { id: 'g4', title: 'Libero', currentAmount: 300, targetAmount: 800 },
    ];

    const overview = computeGoalsSavingsOverview(goals, NOV_20);
    expect(overview.totalCurrent).toBe(2500);
    expect(overview.totalTarget).toBe(4500);
    expect(overview.totalRemaining).toBe(2000);
    expect(overview.overallPercent).toBe(56);

    const g1 = overview.items.find((i) => i.goal.id === 'g1')!;
    const g2 = overview.items.find((i) => i.goal.id === 'g2')!;
    const g3 = overview.items.find((i) => i.goal.id === 'g3')!;
    const g4 = overview.items.find((i) => i.goal.id === 'g4')!;

    expect(g1.isCompleted).toBe(true);
    expect(g1.monthlyPace).toBe(0);
    expect(g2.isOverdue).toBe(true);
    expect(g2.monthlyPace).toBe(300);
    expect(g3.monthsLeft).toBe(6);
    expect(g3.monthlyPace).toBe(200);
    expect(g4.monthsLeft).toBeNull();
    expect(g4.monthlyPace).toBeNull();
  });

  it('formatta correttamente assi compatti e mesi italiani', () => {
    expect(formatAxisCurrency(2800)).toBe('€2,8k');
    expect(formatAxisCurrency(2000)).toBe('€2k');
    expect(formatAxisCurrency(-150)).toBe('-€150');
    expect(formatMonthYearIt(NOV_20)).toBe('Novembre 2026');
  });

  it('estrae correttamente le spese per singolo mese o singolo giorno (drill-down)', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'd1', date: '2026-11-10', splitType: '50_50', payer: 'user' }),
      makeExpense({ id: 'd2', date: '2026-11-10', splitType: '100_user', payer: 'user' }),
      makeExpense({ id: 'd3', date: '2026-11-15', splitType: '50_50', payer: 'partner' }),
      makeExpense({ id: 'd4', date: '2026-10-10', splitType: '50_50', payer: 'partner' }),
    ];

    expect(
      filterExpensesByMonth(expenses, '2026-11', 'shared', 'partner').map((e) => e.id)
    ).toEqual(['d3']);
    expect(filterExpensesByMonth(expenses, 'invalido').length).toBe(0);
    expect(filterExpensesByDay(expenses, 2026, 11, 10, 'all').map((e) => e.id)).toEqual([
      'd1',
      'd2',
    ]);
    expect(filterExpensesByDay(expenses, 2026, 11, 10, 'shared').map((e) => e.id)).toEqual([
      'd1',
    ]);
  });
});
