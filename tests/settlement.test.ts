import { describe, expect, it } from 'vitest';
import { computeSettlementBalance } from '../src/services/storage';
import type { Expense, Settlement } from '../src/types';

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: overrides.id ?? 'exp-test',
    title: overrides.title ?? 'Spesa Test',
    amount: overrides.amount ?? 0,
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
    id: overrides.id ?? 'stl-test',
    date: overrides.date ?? '2026-11-12',
    amount: overrides.amount ?? 0,
    currency: overrides.currency ?? 'EUR',
    from: overrides.from ?? 'partner',
    to: overrides.to ?? 'user',
    note: overrides.note ?? 'Pareggio Test',
    ...overrides,
  };
}

describe('computeSettlementBalance (calcolo dei pareggi)', () => {
  it('restituisce tutto a zero senza spese e senza pareggi', () => {
    const summary = computeSettlementBalance([], []);
    expect(summary).toEqual({
      netBalance: 0,
      userTotalPaid: 0,
      partnerTotalPaid: 0,
      totalSharedSpend: 0,
      userSharedShare: 0,
      partnerSharedShare: 0,
    });
  });

  it('calcola correttamente spese 50_50 pagate da entrambi i partner', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'e1', amount: 100, payer: 'user', splitType: '50_50' }),
      makeExpense({ id: 'e2', amount: 40, payer: 'partner', splitType: '50_50' }),
    ];

    const summary = computeSettlementBalance(expenses, []);
    // user paid 100 (+50 credit), partner paid 40 (-20 user debt) => +30 owed to user
    expect(summary.netBalance).toBe(30);
    expect(summary.userTotalPaid).toBe(100);
    expect(summary.partnerTotalPaid).toBe(40);
    expect(summary.totalSharedSpend).toBe(140);
    expect(summary.userSharedShare).toBe(70);
    expect(summary.partnerSharedShare).toBe(70);
  });

  it('gestisce spese 100_user e 100_partner anticipate dall’altro partner', () => {
    const expenses: Expense[] = [
      // Il partner paga una spesa personale dell'utente => utente deve 45
      makeExpense({ id: 'e1', amount: 45, payer: 'partner', splitType: '100_user' }),
      // L'utente paga una spesa personale del partner => partner deve 70
      makeExpense({ id: 'e2', amount: 70, payer: 'user', splitType: '100_partner' }),
      // Spesa personale pagata per sé stesso => nessun impatto sul pareggio
      makeExpense({ id: 'e3', amount: 120, payer: 'user', splitType: '100_user' }),
    ];

    const summary = computeSettlementBalance(expenses, []);
    expect(summary.netBalance).toBe(25); // 70 - 45
    expect(summary.userTotalPaid).toBe(190);
    expect(summary.partnerTotalPaid).toBe(45);
    expect(summary.totalSharedSpend).toBe(0);
  });

  it('supporta split custom con customSplitRatio personalizzato', () => {
    const expenses: Expense[] = [
      // Totale 200 pagato da user con quota utente 70% => partner deve il 30% (60)
      makeExpense({
        id: 'e1',
        amount: 200,
        payer: 'user',
        splitType: 'custom',
        customSplitRatio: 0.7,
      }),
      // Totale 100 pagato da partner con quota utente 25% => utente deve il 25% (25)
      makeExpense({
        id: 'e2',
        amount: 100,
        payer: 'partner',
        splitType: 'custom',
        customSplitRatio: 0.25,
      }),
    ];

    const summary = computeSettlementBalance(expenses, []);
    expect(summary.netBalance).toBe(35); // 60 - 25
    expect(summary.totalSharedSpend).toBe(300);
  });

  it('compensa i pareggi registrati in entrambe le direzioni e arrotonda ai centesimi', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'e1', amount: 100.33, payer: 'user', splitType: '50_50' }),
    ];
    const settlements: Settlement[] = [
      makeSettlement({ id: 's1', amount: 30, from: 'partner', to: 'user' }),
      makeSettlement({ id: 's2', amount: 5, from: 'user', to: 'partner' }),
    ];

    const summary = computeSettlementBalance(expenses, settlements);
    // 100.33 / 2 = 50.165; 50.165 - 30 + 5 = 25.165 -> rounded 25.17
    expect(summary.netBalance).toBe(25.17);
  });
});
