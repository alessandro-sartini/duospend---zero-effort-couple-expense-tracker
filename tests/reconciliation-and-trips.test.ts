import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase, type SqliteDatabaseHandle } from '../server/database';
import {
  sanitizeRecurringExpenseRecord,
  sanitizeTripRecord,
} from '../server/utils/sanitizers';
import {
  applyMatchedCyclesToRecurring,
  computeExpenseMatchScore,
  computeTripSummary,
  extractGmailIdsFromExpense,
  findZeroQuarantineMatches,
  normalizeMerchantKey,
  reconcileIncomingExpenses,
} from '../src/services/reconciliation';
import { buildNotificationSourceReference } from '../server/services/notification.service';
import type { Expense, RecurringExpenseItem, TripProject } from '../src/types';

describe('Motore di riconciliazione multi-canale, quarantena 0 €, Vacanze e Ricorrenti', () => {
  const handles: SqliteDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it('normalizza gli esercenti bancari ed email rimuovendo prefissi POS/SDD/codici ordine', () => {
    expect(normalizeMerchantKey('PAGAMENTO POS AMZN Mktp IT*8821')).toBe('amazon');
    expect(normalizeMerchantKey('Amazon.it Ordine #402-123991')).toBe('amazon');
    expect(normalizeMerchantKey('ADDEBITO SDD ENEL ENERGIA SPA')).toBe('enel');
    expect(normalizeMerchantKey('GOOGLE *NETFLIX.COM')).toBe('netflix');
  });

  it('riconcilia notifica bancaria immediata e sync Gmail eseguita 10 giorni dopo senza creare doppioni', () => {
    const bankNotif: Expense = {
      id: 'exp-notif-1',
      title: 'PAGAMENTO POS AMZN Mktp IT*91K2',
      amount: 34.99,
      currency: 'EUR',
      date: '2026-11-02',
      category: 'Shopping',
      payer: 'user',
      splitType: '50_50',
      source: 'notification',
      notes: 'Notifica push Revolut',
    };

    const delayedGmailReceipt: Omit<Expense, 'id'> = {
      title: 'Amazon.it Ordine Cavo USB-C e Lampada',
      amount: 34.99,
      currency: 'EUR',
      date: '2026-11-12', // 10 giorni dopo rispetto alla notifica
      category: 'Shopping',
      payer: 'user',
      splitType: '50_50',
      source: 'gmail',
      sourceReference: 'gmail-msg-amzn-10d',
      items: [{ name: 'Cavo USB-C', price: 14.99 }, { name: 'Lampada', price: 20 }],
    };

    const match = computeExpenseMatchScore(delayedGmailReceipt, bankNotif);
    expect(match.kind).toBe('delayed_channel_match');
    expect(match.score).toBeGreaterThanOrEqual(80);

    const res = reconcileIncomingExpenses([bankNotif], [delayedGmailReceipt]);
    expect(res.addedCount).toBe(0);
    expect(res.mergedCount).toBe(1);
    expect(res.expenses).toHaveLength(1);
    expect(res.expenses[0]?.linkedSources).toEqual(['notification', 'gmail']);
    expect(res.expenses[0]?.items).toHaveLength(2);
    expect(extractGmailIdsFromExpense(res.expenses[0]!)).toContain('gmail-msg-amzn-10d');
  });

  it('gestisce quarantena 0 € da Gmail e aggancia l’importo reale da notifica bancaria (in qualsiasi ordine)', () => {
    // Ordine 1: arriva prima ricevuta Gmail a 0 € -> quarantena
    const gmailZeroFirst = reconcileIncomingExpenses([], [
      {
        title: 'Fattura Enel Energia Novembre',
        amount: 0,
        currency: 'EUR',
        date: '2026-11-01',
        category: 'Bollette e Utenze',
        payer: 'user',
        splitType: '50_50',
        source: 'gmail',
        sourceReference: 'gmail-msg-enel-0',
      },
    ]);
    expect(gmailZeroFirst.quarantinedZeroCount).toBe(1);
    expect(gmailZeroFirst.expenses[0]?.reconciliationStatus).toBe('zero_quarantine');

    // Arriva poi addebito bancario reale 8 giorni dopo -> completa l'importo ed esce dalla quarantena
    const bankArrivesLater = reconcileIncomingExpenses(gmailZeroFirst.expenses, [
      {
        title: 'ADDEBITO SDD ENEL ENERGIA SPA',
        amount: 112.4,
        currency: 'EUR',
        date: '2026-11-09',
        category: 'Bollette e Utenze',
        payer: 'user',
        splitType: '50_50',
        source: 'notification',
      },
    ]);
    expect(bankArrivesLater.addedCount).toBe(0);
    expect(bankArrivesLater.mergedCount).toBe(1);
    expect(bankArrivesLater.expenses).toHaveLength(1);
    expect(bankArrivesLater.expenses[0]?.amount).toBe(112.4);
    expect(bankArrivesLater.expenses[0]?.date).toBe('2026-11-09');
    expect(bankArrivesLater.expenses[0]?.reconciliationStatus).toBe('confirmed');
    expect(extractGmailIdsFromExpense(bankArrivesLater.expenses[0]!)).toContain('gmail-msg-enel-0');

    // Ordine 2: notifica bancaria già registrata prima, poi sync Gmail a 0 € 10 giorni dopo -> mantiene importo banca
    const gmailZeroLater = reconcileIncomingExpenses(
      [
        {
          id: 'exp-notif-enel',
          title: 'ADDEBITO SDD ENEL ENERGIA SPA',
          amount: 112.4,
          currency: 'EUR',
          date: '2026-11-09',
          category: 'Bollette e Utenze',
          payer: 'user',
          splitType: '50_50',
          source: 'notification',
        },
      ],
      [
        {
          title: 'Fattura Enel Energia Novembre',
          amount: 0,
          currency: 'EUR',
          date: '2026-11-01',
          category: 'Bollette e Utenze',
          payer: 'user',
          splitType: '50_50',
          source: 'gmail',
          sourceReference: 'gmail-msg-enel-late',
        },
      ]
    );
    expect(gmailZeroLater.mergedCount).toBe(1);
    expect(gmailZeroLater.expenses[0]?.amount).toBe(112.4);
    expect(gmailZeroLater.expenses[0]?.reconciliationStatus).toBe('confirmed');
    expect(extractGmailIdsFromExpense(gmailZeroLater.expenses[0]!)).toContain('gmail-msg-enel-late');
  });

  it('non unisce spese con importi positivi diversi o distanti oltre 14 giorni', () => {
    const existing: Expense[] = [
      {
        id: 'exp-nf-oct',
        title: 'Netflix Abbonamento',
        amount: 17.99,
        currency: 'EUR',
        date: '2026-10-05',
        category: 'Svago e Intrattenimento',
        payer: 'user',
        splitType: '50_50',
        source: 'notification',
      },
    ];

    // Rinnovo del mese successivo (31 giorni dopo): non deve essere fuso!
    const nextMonth = reconcileIncomingExpenses(existing, [
      {
        title: 'Netflix Ricevuta Mensile',
        amount: 17.99,
        currency: 'EUR',
        date: '2026-11-05',
        category: 'Svago e Intrattenimento',
        payer: 'user',
        splitType: '50_50',
        source: 'gmail',
        sourceReference: 'msg-nf-nov',
      },
    ]);
    expect(nextMonth.addedCount).toBe(1);
    expect(nextMonth.mergedCount).toBe(0);
    expect(nextMonth.expenses).toHaveLength(2);

    // Importo diverso allo stesso supermercato lo stesso giorno: non deve essere fuso!
    const diffAmount = reconcileIncomingExpenses(
      [
        {
          id: 'exp-ess-1',
          title: 'Esselunga',
          amount: 12.5,
          currency: 'EUR',
          date: '2026-11-10',
          category: 'Spesa',
          payer: 'user',
          splitType: '50_50',
          source: 'notification',
        },
      ],
      [
        {
          title: 'Esselunga Spesa',
          amount: 48.9,
          currency: 'EUR',
          date: '2026-11-10',
          category: 'Spesa',
          payer: 'user',
          splitType: '50_50',
          source: 'gmail',
          sourceReference: 'msg-ess-2',
        },
      ]
    );
    expect(diffAmount.addedCount).toBe(1);
    expect(diffAmount.mergedCount).toBe(0);
  });

  it('rileva match candidati per spese già in quarantena 0 € con findZeroQuarantineMatches', () => {
    const matches = findZeroQuarantineMatches([
      {
        id: 'exp-zero-1',
        title: 'Deliveroo Ordine Cena',
        amount: 0,
        currency: 'EUR',
        date: '2026-11-12',
        category: 'Ristoranti e Bar',
        payer: 'partner',
        splitType: '50_50',
        source: 'gmail',
        reconciliationStatus: 'zero_quarantine',
      },
      {
        id: 'exp-bank-1',
        title: 'PAYPAL *DELIVEROO IT',
        amount: 29.5,
        currency: 'EUR',
        date: '2026-11-13',
        category: 'Ristoranti e Bar',
        payer: 'partner',
        splitType: '50_50',
        source: 'notification',
      },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.zeroExpense.id).toBe('exp-zero-1');
    expect(matches[0]?.candidateExpense.id).toBe('exp-bank-1');
  });

  it('auto-assegna la Modalità Vacanza alle spese nelle date del viaggio e calcola il mini-saldo isolato', () => {
    const activeTrip: TripProject = {
      id: 'trip-bcn',
      name: 'Weekend a Barcellona',
      startDate: '2026-11-14',
      endDate: '2026-11-17',
      budget: 600,
      defaultCategory: 'Viaggi',
      isActive: true,
    };

    const res = reconcileIncomingExpenses(
      [],
      [
        {
          title: 'Hotel Barcellona',
          amount: 240,
          currency: 'EUR',
          date: '2026-11-15',
          category: 'Viaggi',
          payer: 'user',
          splitType: '50_50',
          source: 'notification',
        },
        {
          title: 'Tapas El Nacional',
          amount: 80,
          currency: 'EUR',
          date: '2026-11-16',
          category: 'Ristoranti e Bar',
          payer: 'partner',
          splitType: '50_50',
          source: 'manual',
        },
        {
          title: 'Spesa Esselunga post-rientro',
          amount: 55,
          currency: 'EUR',
          date: '2026-11-20',
          category: 'Spesa',
          payer: 'user',
          splitType: '50_50',
          source: 'manual',
        },
      ],
      { activeTrip }
    );

    expect(res.expenses[0]?.tripId).toBeUndefined(); // Esselunga il 20/11
    expect(res.expenses[1]?.tripId).toBe('trip-bcn');
    expect(res.expenses[2]?.tripId).toBe('trip-bcn');

    const summary = computeTripSummary(activeTrip, res.expenses);
    expect(summary.totalSpend).toBe(320);
    expect(summary.expenseCount).toBe(2);
    expect(summary.netBalance).toBe(80); // user 240 - 160 quota = +80 credito viaggio
    expect(summary.budgetRemaining).toBe(280);
  });

  it('riconcilia abbonamenti ricorrenti con notifica e successiva fattura Gmail aggiornando il ciclo senza duplicare', () => {
    const recurringRules: RecurringExpenseItem[] = [
      {
        id: 'rec-netflix',
        title: 'Netflix Casa',
        merchantAliases: ['netflix.com'],
        expectedAmount: 17.99,
        amountTolerancePercent: 5,
        currency: 'EUR',
        category: 'Svago e Intrattenimento',
        payer: 'user',
        splitType: '50_50',
        frequency: 'monthly',
        dayOfMonth: 15,
        autoMatchNotifications: true,
        active: true,
      },
    ];

    const step1 = reconcileIncomingExpenses(
      [],
      [
        {
          title: 'GOOGLE *NETFLIX.COM',
          amount: 17.99,
          currency: 'EUR',
          date: '2026-11-15',
          category: 'Svago e Intrattenimento',
          payer: 'user',
          splitType: '50_50',
          source: 'notification',
        },
      ],
      { recurringExpenses: recurringRules }
    );
    expect(step1.expenses[0]?.recurringRuleId).toBe('rec-netflix');
    expect(step1.matchedRecurringCycles).toEqual([
      { ruleId: 'rec-netflix', cycle: '2026-11', expenseId: step1.expenses[0]!.id },
    ]);

    const updatedRules = applyMatchedCyclesToRecurring(recurringRules, step1.matchedRecurringCycles);
    expect(updatedRules[0]?.lastMatchedCycle).toBe('2026-11');

    // 10 giorni dopo arriva anche la mail di ricevuta Netflix in Gmail
    const step2 = reconcileIncomingExpenses(
      step1.expenses,
      [
        {
          title: 'Ricevuta abbonamento Netflix',
          amount: 17.99,
          currency: 'EUR',
          date: '2026-11-25',
          category: 'Svago e Intrattenimento',
          payer: 'user',
          splitType: '50_50',
          source: 'gmail',
          sourceReference: 'gmail-nf-11',
        },
      ],
      { recurringExpenses: updatedRules }
    );
    expect(step2.addedCount).toBe(0);
    expect(step2.mergedCount).toBe(1);
    expect(step2.expenses).toHaveLength(1);
    expect(step2.expenses[0]?.linkedSources).toEqual(['notification', 'gmail']);
  });

  it('persiste e sanitizza viaggi, spese ricorrenti e metadati di riconciliazione in SQLite', () => {
    const db = createSqliteDatabase({ dbFile: ':memory:' });
    handles.push(db);

    const trip = sanitizeTripRecord({
      id: 'trip-1',
      name: 'Napoli <script>alert(1)</script>',
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      budget: 500,
      defaultCategory: 'Viaggi',
      isActive: true,
    });
    const rule = sanitizeRecurringExpenseRecord({
      id: 'rec-1',
      title: 'Fibra Casa',
      merchantAliases: ['fastweb', 'fastweb spa'],
      expectedAmount: 29.95,
      currency: 'EUR',
      category: 'Bollette e Utenze',
      payer: 'partner',
      splitType: '50_50',
      frequency: 'monthly',
      dayOfMonth: 5,
      autoMatchNotifications: true,
      active: true,
      lastMatchedCycle: '2026-11',
    });

    expect(trip?.name).toBe('Napoli');
    expect(rule).not.toBeNull();

    const current = db.readDatabase();
    db.writeDatabase({
      trips: trip ? [trip] : [],
      recurringExpenses: rule ? [rule] : [],
      expenses: [
        {
          ...current.expenses[0]!,
          tripId: trip?.id,
          recurringRuleId: rule?.id,
          reconciliationStatus: 'confirmed',
          linkedSources: ['camera', 'notification'],
          linkedReferences: ['gmail:abc123'],
        },
      ],
    });

    const reloaded = db.readDatabase();
    expect(reloaded.trips).toHaveLength(1);
    expect(reloaded.trips?.[0]?.name).toBe('Napoli');
    expect(reloaded.recurringExpenses).toHaveLength(1);
    expect(reloaded.recurringExpenses?.[0]?.merchantAliases).toEqual(['fastweb', 'fastweb spa']);
    expect(reloaded.expenses[0]?.tripId).toBe('trip-1');
    expect(reloaded.expenses[0]?.recurringRuleId).toBe('rec-1');
    expect(reloaded.expenses[0]?.linkedSources).toEqual(['camera', 'notification']);
    expect(reloaded.expenses[0]?.linkedReferences).toEqual(['gmail:abc123']);
  });

  it('deduplica due notifiche identiche sullo stesso canale notification tramite sourceReference (exact_duplicate) senza bloccare due spese distinte nello stesso giorno', () => {
    const fixedTime = 1_763_740_000_000;
    const notifText1 = 'Satispay: Hai pagato €1,50 a Bar Centrale.';
    const sourceRef1 = buildNotificationSourceReference({
      payer: 'user',
      appName: 'Satispay',
      notificationText: notifText1,
      nowMs: fixedTime,
    });

    const firstIngestion = reconcileIncomingExpenses(
      [],
      [
        {
          title: 'Bar Centrale',
          amount: 1.5,
          currency: 'EUR',
          date: '2026-11-21',
          category: 'Ristoranti e Bar',
          payer: 'user',
          splitType: '50_50',
          source: 'notification',
          sourceReference: sourceRef1,
          notes: 'Caffè mattina',
        },
      ]
    );
    expect(firstIngestion.addedCount).toBe(1);
    expect(firstIngestion.expenses).toHaveLength(1);

    // Retry di MacroDroid dopo pochi secondi (stesso bucket 5 min / stesso sourceReference)
    const duplicateCandidate: Omit<Expense, 'id'> = {
      title: 'Bar Centrale',
      amount: 1.5,
      currency: 'EUR',
      date: '2026-11-21',
      category: 'Ristoranti e Bar',
      payer: 'user',
      splitType: '50_50',
      source: 'notification',
      sourceReference: buildNotificationSourceReference({
        payer: 'user',
        appName: 'Satispay',
        notificationText: notifText1,
        nowMs: fixedTime + 15_000,
      }),
      notes: 'Caffè mattina',
    };

    const dupMatch = computeExpenseMatchScore(duplicateCandidate, firstIngestion.expenses[0]!);
    expect(dupMatch.kind).toBe('exact_duplicate');
    expect(dupMatch.score).toBe(100);

    const afterDuplicateRetry = reconcileIncomingExpenses(firstIngestion.expenses, [
      duplicateCandidate,
    ]);
    expect(afterDuplicateRetry.addedCount).toBe(0);
    expect(afterDuplicateRetry.mergedCount).toBe(1);
    expect(afterDuplicateRetry.expenses).toHaveLength(1);

    // Seconda spesa legittima allo stesso bar nel pomeriggio (notifica distinta / finestra temporale diversa)
    const notifText2 = 'Satispay: Hai pagato €1,50 a Bar Centrale alle 15:30.';
    const distinctAfternoonExpense: Omit<Expense, 'id'> = {
      title: 'Bar Centrale',
      amount: 1.5,
      currency: 'EUR',
      date: '2026-11-21',
      category: 'Ristoranti e Bar',
      payer: 'user',
      splitType: '50_50',
      source: 'notification',
      sourceReference: buildNotificationSourceReference({
        payer: 'user',
        appName: 'Satispay',
        notificationText: notifText2,
        nowMs: fixedTime + 4 * 60 * 60 * 1000,
      }),
      notes: 'Caffè pomeriggio',
    };

    const afternoonMatch = computeExpenseMatchScore(
      distinctAfternoonExpense,
      afterDuplicateRetry.expenses[0]!
    );
    expect(afternoonMatch.kind).toBe('possible_duplicate');
    expect(afternoonMatch.score).toBeLessThan(80);

    const afterAfternoonCoffee = reconcileIncomingExpenses(afterDuplicateRetry.expenses, [
      distinctAfternoonExpense,
    ]);
    expect(afterAfternoonCoffee.addedCount).toBe(1);
    expect(afterAfternoonCoffee.mergedCount).toBe(0);
    expect(afterAfternoonCoffee.expenses).toHaveLength(2);
  });
});
