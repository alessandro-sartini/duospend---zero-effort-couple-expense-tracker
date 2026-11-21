import { describe, expect, it } from 'vitest';
import {
  computeChallengeCalculation,
  estimateChallengeSetup,
  getMonthBounds,
  getTodayIsoInTimeZone,
} from '../server/services/savings-challenge-engine';
import type {
  CoupleProfile,
  Expense,
  SavingGoal,
  SavingsChallengeContribution,
} from '../src/types';

const baseGoals: SavingGoal[] = [
  {
    id: 'goal-honeymoon',
    title: 'Viaggio di Nozze',
    targetAmount: 4000,
    currentAmount: 1000,
  },
];

const baseProfile: CoupleProfile = {
  userName: 'Partner 1',
  partnerName: 'Partner 2',
  monthlyBudget: 2800,
  currency: 'EUR',
  customCategories: ['Animali Domestici'],
  hiddenCategories: ['Shopping'],
};

const makeChallenge = (overrides: Record<string, unknown> = {}) => ({
  id: 'chg-1',
  title: 'Sfida Ristoranti Novembre',
  goalId: 'goal-honeymoon',
  goalTitleSnapshot: 'Viaggio di Nozze',
  categories: ['Ristoranti e Bar'],
  monthlyLimit: 300,
  currency: 'EUR',
  startMonth: '2026-11',
  durationMonths: 1,
  status: 'active' as const,
  splitScope: 'all' as const,
  timezone: 'Europe/Rome',
  ...overrides,
});

describe('Motore di calcolo server-side Sfide di Risparmio', () => {
  it('esegue il calcolo base (300 - 250 = 50 EUR virtuali) e completa a fine mese', () => {
    const expenses: Expense[] = [
      {
        id: 'e1',
        title: 'Trattoria',
        amount: 120,
        currency: 'EUR',
        date: '2026-11-05',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'manual',
      },
      {
        id: 'e2',
        title: 'Pizzeria',
        amount: 130,
        currency: 'EUR',
        date: '2026-11-20',
        category: 'Ristoranti e Bar',
        payer: 'partner',
        splitType: '50_50',
        source: 'manual',
      },
    ];

    // Durante il mese (2026-11-21)
    const midMonth = computeChallengeCalculation({
      challenge: makeChallenge(),
      expenses,
      goals: baseGoals,
      profile: baseProfile,
      now: new Date('2026-11-21T12:00:00Z'),
    });
    expect(midMonth.metrics.validSpend).toBe(250);
    expect(midMonth.metrics.remainingBudget).toBe(50);
    expect(midMonth.metrics.virtualSavingsPotential).toBe(50);
    expect(midMonth.metrics.virtualSavingsAvailable).toBe(50);
    expect(midMonth.metrics.consumedPercent).toBe(83.3);
    expect(midMonth.metrics.daysElapsed).toBe(21);
    expect(midMonth.metrics.daysRemaining).toBe(9);
    expect(midMonth.metrics.isPeriodConcluded).toBe(false);
    expect(midMonth.metrics.healthState).toBe('warning');

    // Fine mese esatta (2026-11-30) -> 0 giorni rimasti
    const endDay = computeChallengeCalculation({
      challenge: makeChallenge(),
      expenses,
      goals: baseGoals,
      profile: baseProfile,
      now: new Date('2026-11-30T12:00:00Z'),
    });
    expect(endDay.metrics.daysElapsed).toBe(30);
    expect(endDay.metrics.daysRemaining).toBe(0);
    expect(endDay.metrics.isPeriodConcluded).toBe(false);

    // Giorno successivo (2026-12-01) -> periodo concluso e sfida completata
    const afterEnd = computeChallengeCalculation({
      challenge: makeChallenge(),
      expenses,
      goals: baseGoals,
      profile: baseProfile,
      now: new Date('2026-12-01T10:00:00Z'),
    });
    expect(afterEnd.metrics.isPeriodConcluded).toBe(true);
    expect(afterEnd.metrics.healthState).toBe('completed');
    expect(afterEnd.metrics.statusMessage).toContain('50.00');
  });

  it('gestisce limite a zero, limite negativo difensivo e limite estremo senza errori di precisione', () => {
    const exp: Expense = {
      id: 'e-lim',
      title: 'Cena',
      amount: 45,
      currency: 'EUR',
      date: '2026-11-10',
      category: 'Ristoranti e Bar',
      payer: 'user',
      splitType: '50_50',
      source: 'manual',
    };

    const zeroLimit = computeChallengeCalculation({
      challenge: makeChallenge({ monthlyLimit: 0 }),
      expenses: [exp],
      goals: baseGoals,
      now: new Date('2026-11-15T12:00:00Z'),
    });
    expect(zeroLimit.metrics.totalLimit).toBe(0);
    expect(zeroLimit.metrics.virtualSavingsPotential).toBe(0);
    expect(zeroLimit.metrics.exceededAmount).toBe(45);
    expect(zeroLimit.metrics.healthState).toBe('exceeded');

    const negativeLimit = computeChallengeCalculation({
      challenge: makeChallenge({ monthlyLimit: -250 }),
      expenses: [],
      goals: baseGoals,
      now: new Date('2026-11-15T12:00:00Z'),
    });
    expect(negativeLimit.metrics.totalLimit).toBe(0);
    expect(negativeLimit.metrics.virtualSavingsPotential).toBe(0);
    expect(negativeLimit.metrics.healthState).toBe('neutral');

    const extremeLimit = computeChallengeCalculation({
      challenge: makeChallenge({ monthlyLimit: 999999.99, durationMonths: 12 }),
      expenses: [exp],
      goals: baseGoals,
      now: new Date('2026-11-15T12:00:00Z'),
    });
    expect(extremeLimit.metrics.totalLimit).toBe(11999999.88);
    expect(extremeLimit.metrics.virtualSavingsPotential).toBe(999954.99);
  });

  it('gestisce mese vuoto, mese parziale, mese bisestile (2028-02) e cambio DST senza slittamenti', () => {
    // Mese vuoto
    const emptyMonth = computeChallengeCalculation({
      challenge: makeChallenge({ startMonth: '2026-11' }),
      expenses: [],
      goals: baseGoals,
      now: new Date('2026-11-05T12:00:00Z'),
    });
    expect(emptyMonth.metrics.validSpend).toBe(0);
    expect(emptyMonth.metrics.virtualSavingsPotential).toBe(300);
    expect(emptyMonth.metrics.healthState).toBe('neutral');

    // Anno bisestile febbraio 2028 (29 giorni) vs 2026 (28 giorni)
    expect(getMonthBounds('2028-02').endDate).toBe('2028-02-29');
    expect(getMonthBounds('2028-02').daysInMonth).toBe(29);
    expect(getMonthBounds('2026-02').endDate).toBe('2026-02-28');

    const leapCalc = computeChallengeCalculation({
      challenge: makeChallenge({ startMonth: '2028-02' }),
      expenses: [
        {
          id: 'e-leap',
          title: 'Cena 29 Feb',
          amount: 60,
          currency: 'EUR',
          date: '2028-02-29',
          category: 'Ristoranti e Bar',
          payer: 'user',
          splitType: '50_50',
          source: 'manual',
        },
      ],
      goals: baseGoals,
      now: new Date('2028-02-29T12:00:00Z'),
    });
    expect(leapCalc.metrics.daysTotal).toBe(29);
    expect(leapCalc.metrics.daysElapsed).toBe(29);
    expect(leapCalc.metrics.daysRemaining).toBe(0);
    expect(leapCalc.metrics.validSpend).toBe(60);

    // Cambio DST primaverile (29 marzo 2026 -> 31 gg) e autunnale (25 ottobre 2026 -> 31 gg)
    const dstSpring = computeChallengeCalculation({
      challenge: makeChallenge({ startMonth: '2026-03', timezone: 'Europe/Rome' }),
      expenses: [],
      goals: baseGoals,
      now: new Date('2026-03-31T10:00:00Z'),
    });
    expect(dstSpring.metrics.daysTotal).toBe(31);
    expect(dstSpring.metrics.daysElapsed).toBe(31);
    expect(dstSpring.metrics.daysRemaining).toBe(0);

    const dstAutumn = computeChallengeCalculation({
      challenge: makeChallenge({ startMonth: '2026-10', timezone: 'Europe/Rome' }),
      expenses: [],
      goals: baseGoals,
      now: new Date('2026-10-26T10:00:00Z'),
    });
    expect(dstAutumn.metrics.daysTotal).toBe(31);
    expect(dstAutumn.metrics.daysElapsed).toBe(26);
    expect(dstAutumn.metrics.daysRemaining).toBe(5);
  });

  it('rispetta la timezone a cavallo di mezzanotte ed esclude spese future nella timezone della sfida', () => {
    // 2026-11-30T23:30:00Z -> è già 2026-12-01 a Tokyo, ma ancora 2026-11-30 alle Hawaii
    const boundaryInstant = new Date('2026-11-30T23:30:00Z');
    expect(getTodayIsoInTimeZone(boundaryInstant, 'Asia/Tokyo')).toBe('2026-12-01');
    expect(getTodayIsoInTimeZone(boundaryInstant, 'Pacific/Honolulu')).toBe('2026-11-30');

    const expenses: Expense[] = [
      {
        id: 'e-today',
        title: 'Pranzo 15',
        amount: 40,
        currency: 'EUR',
        date: '2026-11-15',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'manual',
      },
      {
        id: 'e-future',
        title: 'Prenotazione 25',
        amount: 90,
        currency: 'EUR',
        date: '2026-11-25',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'manual',
      },
    ];

    const calc = computeChallengeCalculation({
      challenge: makeChallenge({ timezone: 'Europe/Rome' }),
      expenses,
      goals: baseGoals,
      now: new Date('2026-11-15T12:00:00Z'),
    });
    expect(calc.metrics.validSpend).toBe(40);
    expect(calc.metrics.excludedBreakdown.futureExpenseCount).toBe(1);
    expect(calc.metrics.excludedBreakdown.futureScheduledTotal).toBe(90);
  });

  it('arrotonda decimali in centesimi esatti ed esclude valute diverse, 0 EUR, negative e dati parziali', () => {
    const expenses: Expense[] = [
      {
        id: 'e-dec-1',
        title: 'Caffè e brioche',
        amount: 0.1,
        currency: 'EUR',
        date: '2026-11-02',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'manual',
      },
      {
        id: 'e-dec-2',
        title: 'Gelato',
        amount: 0.2,
        currency: 'EUR',
        date: '2026-11-03',
        category: 'Ristoranti e Bar',
        payer: 'partner',
        splitType: '100_partner',
        source: 'manual',
      },
      {
        id: 'e-dec-3',
        title: 'Bistro',
        amount: 19.994,
        currency: 'EUR',
        date: '2026-11-04',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'manual',
      },
      // Duplicato stesso ID -> deduplicato
      {
        id: 'e-dec-3',
        title: 'Bistro',
        amount: 19.994,
        currency: 'EUR',
        date: '2026-11-04',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'manual',
      },
      // Valuta estera (USD) -> esclusa senza conversione implicita
      {
        id: 'e-usd',
        title: 'Dinner NY',
        amount: 85,
        currency: 'USD',
        date: '2026-11-05',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'manual',
      },
      // Quarantena 0 EUR -> esclusa
      {
        id: 'e-zero',
        title: 'Ricevuta da verificare',
        amount: 0,
        currency: 'EUR',
        date: '2026-11-06',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'gmail',
        reconciliationStatus: 'zero_quarantine',
      },
      // Importo negativo / rimborso -> escluso
      {
        id: 'e-neg',
        title: 'Rimborso catering',
        amount: -20,
        currency: 'EUR',
        date: '2026-11-07',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'manual',
      },
      // Data malformata (dati parziali) -> ignorata senza crash
      {
        id: 'e-bad-date',
        title: 'Dato corrotto',
        amount: 50,
        currency: 'EUR',
        date: '2026-02-30',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'manual',
      },
    ];

    const calc = computeChallengeCalculation({
      challenge: makeChallenge(),
      expenses,
      goals: baseGoals,
      now: new Date('2026-11-15T12:00:00Z'),
    });

    // 0.10 + 0.20 + 19.99 = 20.29 (zero floating drift!)
    expect(calc.metrics.validSpend).toBe(20.29);
    expect(calc.metrics.virtualSavingsPotential).toBe(279.71);
    expect(calc.metrics.sharedSpend).toBe(20.09);
    expect(calc.metrics.personalSpend).toBe(0.2);
    expect(calc.metrics.matchedExpenseCount).toBe(3);
    expect(calc.metrics.excludedBreakdown.foreignCurrencyCount).toBe(1);
    expect(calc.metrics.excludedBreakdown.foreignCurrencies).toEqual([
      { currency: 'USD', count: 1, total: 85 },
    ]);
    expect(calc.metrics.excludedBreakdown.zeroOrQuarantineCount).toBe(1);
    expect(calc.metrics.excludedBreakdown.negativeOrInvalidCount).toBe(1);
    expect(calc.metrics.excludedBreakdown.settlementsAlwaysExcluded).toBe(true);

    // Con splitScope = 'shared_only' esclude anche la spesa personale 100_partner (0.20)
    const sharedOnly = computeChallengeCalculation({
      challenge: makeChallenge({ splitScope: 'shared_only' }),
      expenses,
      goals: baseGoals,
      now: new Date('2026-11-15T12:00:00Z'),
    });
    expect(sharedOnly.metrics.validSpend).toBe(20.09);
    expect(sharedOnly.metrics.excludedBreakdown.personalExcludedCount).toBe(1);
  });

  it('gestisce spesa superiore al limite senza linguaggio colpevolizzante', () => {
    const calc = computeChallengeCalculation({
      challenge: makeChallenge({ monthlyLimit: 200 }),
      expenses: [
        {
          id: 'e-over',
          title: 'Cena Anniversario',
          amount: 265,
          currency: 'EUR',
          date: '2026-11-10',
          category: 'Ristoranti e Bar',
          payer: 'user',
          splitType: '50_50',
          source: 'manual',
        },
      ],
      goals: baseGoals,
      now: new Date('2026-11-15T12:00:00Z'),
    });

    expect(calc.metrics.validSpend).toBe(265);
    expect(calc.metrics.remainingBudget).toBe(0);
    expect(calc.metrics.exceededAmount).toBe(65);
    expect(calc.metrics.virtualSavingsPotential).toBe(0);
    expect(calc.metrics.healthState).toBe('exceeded');
    expect(calc.metrics.statusMessage).toContain('Il limite è stato superato');
    expect(calc.metrics.statusMessage.toLowerCase()).toContain('nessuna penalità');
  });

  it('rileva categorie personalizzate, categorie eliminate, obiettivo mancante e doppia sfida con categorie sovrapposte', () => {
    const contrib: SavingsChallengeContribution = {
      id: 'c1',
      challengeId: 'chg-1',
      goalId: 'goal-honeymoon',
      goalTitleSnapshot: 'Viaggio di Nozze',
      amount: 40,
      currency: 'EUR',
      status: 'applied',
      createdBy: 'Partner 1',
      createdAt: '2026-11-10T10:00:00Z',
    };

    const calc = computeChallengeCalculation({
      challenge: makeChallenge({
        categories: ['Animali Domestici', 'Categoria Vecchia Rimossa', 'Ristoranti e Bar'],
      }),
      expenses: [
        {
          id: 'e-custom-cat',
          title: 'Veterinario',
          amount: 70,
          currency: 'EUR',
          date: '2026-11-08',
          category: 'Animali Domestici',
          payer: 'user',
          splitType: '50_50',
          source: 'manual',
        },
      ],
      goals: baseGoals,
      otherChallenges: [
        {
          id: 'chg-2',
          status: 'active',
          startDate: '2026-11-01',
          endDate: '2026-12-31',
          categories: ['Ristoranti e Bar'],
        },
      ],
      contributions: [contrib],
      profile: baseProfile,
      now: new Date('2026-11-15T12:00:00Z'),
    });

    expect(calc.metrics.validSpend).toBe(70);
    expect(calc.metrics.virtualSavingsPotential).toBe(230);
    expect(calc.metrics.virtualSavingsApplied).toBe(40);
    expect(calc.metrics.virtualSavingsAvailable).toBe(190);
    expect(calc.metrics.overlappingChallengeIds).toEqual(['chg-2']);
    expect(calc.metrics.overlappingCategories).toEqual(['Ristoranti e Bar']);
    expect(calc.metrics.orphanedCategories).toEqual(['Categoria Vecchia Rimossa']);

    // Obiettivo scollegato -> stato needs_recalculation
    const orphanedGoal = computeChallengeCalculation({
      challenge: makeChallenge(),
      expenses: [],
      goals: [],
      now: new Date('2026-11-15T12:00:00Z'),
    });
    expect(orphanedGoal.metrics.goalLinked).toBe(false);
    expect(orphanedGoal.metrics.healthState).toBe('needs_recalculation');
  });

  it('esegue doppio calcolo in modo deterministico e idempotente e calcola correttamente la stima pre-creazione', () => {
    const expenses: Expense[] = [
      {
        id: 'e-prev-1',
        title: 'Cena Ottobre',
        amount: 220,
        currency: 'EUR',
        date: '2026-10-12',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'manual',
      },
      {
        id: 'e-prev-2',
        title: 'Cena Settembre',
        amount: 180,
        currency: 'EUR',
        date: '2026-09-18',
        category: 'Ristoranti e Bar',
        payer: 'partner',
        splitType: '50_50',
        source: 'manual',
      },
      {
        id: 'e-curr-1',
        title: 'Bistro Novembre',
        amount: 95,
        currency: 'EUR',
        date: '2026-11-06',
        category: 'Ristoranti e Bar',
        payer: 'user',
        splitType: '50_50',
        source: 'manual',
      },
    ];

    const first = computeChallengeCalculation({
      challenge: makeChallenge(),
      expenses,
      goals: baseGoals,
      now: new Date('2026-11-15T12:00:00Z'),
    });
    const second = computeChallengeCalculation({
      challenge: makeChallenge(),
      expenses,
      goals: baseGoals,
      now: new Date('2026-11-15T12:00:00Z'),
    });
    expect(first).toEqual(second);

    const estimate = estimateChallengeSetup({
      categories: ['Ristoranti e Bar', 'Animali Domestici'],
      startMonth: '2026-11',
      durationMonths: 1,
      goalId: 'goal-honeymoon',
      expenses,
      goals: baseGoals,
      profile: baseProfile,
      now: new Date('2026-11-15T12:00:00Z'),
    });
    expect(estimate.previousPeriodMonthsSampled).toBe(2);
    expect(estimate.previousPeriodAverageSpend).toBe(200);
    expect(estimate.currentPeriodSpend).toBe(95);
    expect(estimate.suggestedMonthlyLimit).toBe(180);
    expect(estimate.customCategoriesSelected).toEqual(['Animali Domestici']);
    expect(estimate.goalPreview?.title).toBe('Viaggio di Nozze');
    expect(estimate.virtualSavingsNotice.toLowerCase()).toContain('virtuale');
  });
});
