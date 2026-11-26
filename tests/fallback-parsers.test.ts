import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerDatabase } from '../server/database';

const initialNotificationMockDb: ServerDatabase = {
  expenses: [],
  settlements: [],
  goals: [],
  trips: [],
  recurringExpenses: [],
  profile: {
    userName: 'Partner 1',
    partnerName: 'Partner 2',
    monthlyBudget: 2500,
    currency: 'EUR',
    weddingBudgetGoal: 10000,
    userEmail: 'owner@example.com',
    partnerEmail: 'partner@example.com',
  },
  lastUpdated: '2026-11-21T00:00:00.000Z',
};

let notificationInMemoryDb: ServerDatabase = structuredClone(initialNotificationMockDb);
const generateContentWithFallbackMock = vi.fn();
const hasGeminiApiKeyMock = vi.fn(() => false);

vi.mock('../server/database', () => ({
  readDatabase: () => structuredClone(notificationInMemoryDb),
  writeDatabase: (patch: Partial<ServerDatabase>) => {
    notificationInMemoryDb = {
      ...notificationInMemoryDb,
      ...patch,
      lastUpdated: new Date().toISOString(),
    };
    return structuredClone(notificationInMemoryDb);
  },
  insertExpenseRecord: (expense: ServerDatabase['expenses'][number]) => {
    notificationInMemoryDb = {
      ...notificationInMemoryDb,
      expenses: [expense, ...notificationInMemoryDb.expenses.filter((e) => e.id !== expense.id)],
      lastUpdated: new Date().toISOString(),
    };
  },
}));

vi.mock('../server/services/gemini', () => ({
  generateContentWithFallback: (...args: unknown[]) => generateContentWithFallbackMock(...args),
  hasGeminiApiKey: () => hasGeminiApiKeyMock(),
}));

import {
  classifyNonExpenseNotification,
  extractReceiptsHeuristically,
  isLikelyPromotionalOrNonExpenseEmail,
  parseNotificationHeuristically,
  parseNotificationHistoryHeuristically,
} from '../server/utils/security';
import { buildReceiptFallback, normalizeReceiptResponse } from '../server/services/ai.service';
import {
  ingestNotification,
  normalizeNotificationExpense,
  resetNotificationIdempotencyCacheForTests,
} from '../server/services/notification.service';

describe('Parser locali di fallback (Notifiche, Gmail, OCR)', () => {
  describe('Notifiche singole (parseNotificationHeuristically)', () => {
    it('estrae correttamente importo, esercente e categoria da notifica Google Pay', () => {
      const parsed = parseNotificationHeuristically(
        'Google Pay: €9,20 addebitati per ATM Milano Metro.',
        'Google Pay',
        'user'
      );

      expect(parsed.amount).toBe(9.2);
      expect(parsed.currency).toBe('EUR');
      expect(parsed.title).toBe('ATM Milano Metro');
      expect(parsed.category).toBe('Trasporti');
      expect(parsed.source).toBe('notification');
      expect(parsed.payer).toBe('user');
    });

    it('estrae correttamente esercente e data italiana da SMS bancari e Revolut', () => {
      const parsed = parseNotificationHeuristically(
        'PostePay: Pagamento di 18,50 EUR presso FARMACIA CENTRALE autorizzato del 11/11/2026.',
        'PostePay',
        'partner'
      );

      expect(parsed.amount).toBe(18.5);
      expect(parsed.currency).toBe('EUR');
      expect(parsed.title).toBe('FARMACIA CENTRALE');
      expect(parsed.date).toBe('2026-11-11');
      expect(parsed.category).toBe('Salute e Benessere');
      expect(parsed.payer).toBe('partner');
    });

    it('gestisce valute estere ($/USD) e separatori decimali italiani', () => {
      const parsed = parseNotificationHeuristically(
        'Revolut: Hai speso $42.90 presso Amazon Marketplace.',
        'Revolut',
        'user'
      );

      expect(parsed.amount).toBe(42.9);
      expect(parsed.currency).toBe('USD');
      expect(parsed.title).toBe('Amazon Marketplace');
      expect(parsed.category).toBe('Shopping');
    });

    it('usa sempre la data di sistema new Date() ignorando qualsiasi data dall AI', () => {
      const todayIso = new Date().toISOString().slice(0, 10);
      const rawAiResult = {
        merchant: 'Satispay',
        amount: 10,
        currency: 'EUR',
        category: 'Altro',
        date: '2023-10-25',
        notes: 'Pagamento Satispay',
      };

      const normalized = normalizeNotificationExpense(
        rawAiResult,
        'Hai inviato 10,00 € con Satispay',
        'Satispay',
        'user',
        'Default notes'
      );

      expect(normalized.date).toBe(todayIso);
      expect(normalized.amount).toBe(10);
      expect(normalized.title).toBe('Satispay');
    });

    it('estrae correttamente importo con parola "euro" ed esercente successivo (es. " pagamento 12 euro bar roma ")', () => {
      const parsed = parseNotificationHeuristically(
        ' pagamento 12 euro bar roma ',
        'App Bancaria / SMS',
        'user'
      );

      expect(parsed.amount).toBe(12);
      expect(parsed.currency).toBe('EUR');
      expect(parsed.title.toLowerCase()).toBe('bar roma');
      expect(parsed.category).toBe('Ristoranti e Bar');
      expect(parsed.isExpense).not.toBe(false);
    });
  });

  describe('Cronologia notifiche Android (parseNotificationHistoryHeuristically)', () => {
    it('estrae spese valide multi-riga e scarta OTP e messaggi promozionali', () => {
      const history = `
        11:42 - Revolut: Hai speso €28,50 da Pizzeria Da Michele.
        11:40 - Banca Intesa: Il tuo codice OTP di verifica è 482910.
        10:15 - Offerta speciale promo sconto 20% solo oggi €10,00
        Ieri - Google Pay: €9,20 addebitati per ATM Milano Metro.
      `;

      const items = parseNotificationHistoryHeuristically(history, 'user');
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        title: 'Pizzeria Da Michele',
        amount: 28.5,
        category: 'Ristoranti e Bar',
      });
      expect(items[1]).toMatchObject({
        title: 'ATM Milano Metro',
        amount: 9.2,
        category: 'Trasporti',
      });
    });
  });

  describe('Scanner Gmail euristico (extractReceiptsHeuristically)', () => {
    it('classifica ricevute con importo reale pagato e sopprime email senza importo, spam o OTP', () => {
      const result = extractReceiptsHeuristically([
        {
          id: 'msg-1',
          subject: 'La tua ricevuta Airbnb per Lumignano',
          sender: '"Airbnb" <automated@airbnb.com>',
          dateHeader: '2026-10-20T12:00:00Z',
          snippet: 'Pagamento confermato',
          body: 'Totale addebitato: €253,00 EUR per soggiorno 2 notti.',
        },
        {
          id: 'msg-2',
          subject: 'Conferma ordine Amazon.it #1234',
          sender: 'ordini@amazon.it',
          dateHeader: '2026-11-03T09:15:00Z',
          snippet: 'Grazie per il tuo ordine',
          body: 'Il tuo pacco è in preparazione senza riepilogo importo nel testo.',
        },
        {
          id: 'msg-3',
          subject: 'Newsletter offerte della settimana - unsubscribe',
          sender: 'promo@negozio.example',
          dateHeader: '2026-11-05T08:00:00Z',
          snippet: 'Sconto del 30%',
          body: 'Clicca per disiscriviti dalla newsletter.',
        },
      ]);

      expect(result.receipts).toHaveLength(1);
      expect(result.receipts[0]).toMatchObject({
        id: 'msg-1',
        merchant: 'Airbnb',
        total: 253,
        currency: 'EUR',
        date: '2026-10-20',
        category: 'Viaggi',
      });

      expect(result.reviewCandidates).toHaveLength(0);
      expect(result.suppressedLowConfidenceCount).toBe(2);
    });

    it('scarta newsletter crypto (Conio), promo Black Friday, sconti, concorsi e importi surreali nel corpo', () => {
      const result = extractReceiptsHeuristically([
        {
          id: 'msg-conio',
          subject: '#210 Midterm USA: cosa cambia per le crypto?',
          sender: 'Conio News <support@conio.com>',
          dateHeader: '2026-11-14T10:00:00Z',
          snippet: 'Bitcoin supera €63.110 questa settimana',
          body: 'Aggiornamento mercato crypto: quotazione €63.110,00. Acquista o vendi dal wallet.',
        },
        {
          id: 'msg-samsung',
          subject: 'Offerte Black Friday da scoprire!',
          sender: 'Samsung <no-reply@m1.email.samsung.com>',
          dateHeader: '2026-11-15T07:30:07Z',
          snippet: 'Fino a €400 di sconto sul tuo ordine',
          body: 'Totale risparmio fino a €400,00 sul prossimo acquisto.',
        },
        {
          id: 'msg-bk',
          subject: 'CANTA. GUSTA. VIVI',
          sender: 'Burger King <bk@email.burgerking.it>',
          dateHeader: '2026-10-20T10:00:00Z',
          snippet: 'Partecipa subito',
          body: 'Concorso con montepremi €90.000,00 fino al 30 novembre.',
          listUnsubscribe: '<mailto:unsub@email.burgerking.it>',
        },
        {
          id: 'msg-boolean',
          subject: 'Sconto del 20% sui biglietti per laravelday, reactjsday e angularday.',
          sender: 'Boolean <ciao@boolean.careers>',
          dateHeader: '2026-11-14T10:19:50Z',
          snippet: 'Usa il codice promozionale sul tuo acquisto',
          body: 'Totale scontato a €120,00 se prenoti oggi.',
        },
        {
          id: 'msg-over-cap',
          subject: 'Fattura ordine preventivo aziendale #99',
          sender: 'fatture@fornitore.example',
          dateHeader: '2026-11-12T10:00:00Z',
          snippet: 'Fattura €4.200,00',
          body: 'Totale pagato: €4.200,00',
        },
        {
          id: 'msg-real',
          subject: 'Conferma ordine spesa Esselunga',
          sender: 'Esselunga Online <ordini@esselunga.it>',
          dateHeader: '2026-11-13T18:10:00Z',
          snippet: 'Ricevuta del tuo ordine consegnato',
          body: 'Grazie per il tuo acquisto. Totale pagato: €84,20 con carta.',
        },
      ]);

      expect(result.receipts).toHaveLength(1);
      expect(result.receipts[0]).toMatchObject({
        id: 'msg-real',
        total: 84.2,
        currency: 'EUR',
      });
      expect(result.reviewCandidates).toHaveLength(0);
      expect(result.suppressedLowConfidenceCount).toBe(5);

      expect(
        isLikelyPromotionalOrNonExpenseEmail({
          subject: 'RE: Prenotazione per La Perla a Lumignano',
          sender: 'Airbnb <express@airbnb.com>',
        })
      ).toBe(true);
      expect(
        isLikelyPromotionalOrNonExpenseEmail({
          subject: 'Delivered: illy Caffè in Capsule',
          sender: '"Amazon.it" <order-update@amazon.it>',
        })
      ).toBe(true);
      expect(
        isLikelyPromotionalOrNonExpenseEmail({
          subject: 'Un regalo per oggi: 40% di sconto',
          sender: 'Deliveroo <hello@announcement.deliveroo.it>',
        })
      ).toBe(true);
    });
  });

  describe('OCR scontrini locale (buildReceiptFallback & normalizeReceiptResponse)', () => {
    it('estrae una bozza utile dal testo OCR e crea un fallback vuoto sicuro per sola foto', () => {
      const fromText = buildReceiptFallback(
        'Esselunga: Pagamento €64,40 presso Esselunga Milano il 2026-11-09'
      );
      expect(fromText.merchant).toBe('Esselunga Milano');
      expect(fromText.total).toBe(64.4);
      expect(fromText.date).toBe('2026-11-09');
      expect(fromText.category).toBe('Spesa');

      const withoutText = buildReceiptFallback();
      expect(withoutText.total).toBe(0);
      expect(withoutText.merchant).toBe('Scontrino da completare');
    });

    it('normalizza categorie inglesi e rimuove tag HTML dai campi AI OCR', () => {
      const normalized = normalizeReceiptResponse({
        merchant: '<b>Bar Centrale</b>',
        date: '2026-11-11',
        total: 12.345,
        tax: 1.23,
        currency: 'eur',
        category: 'Dining Out',
        items: [{ name: '<script>x</script>Espresso', price: 1.5 }],
        notes: 'Colazione <i>veloce</i>',
      });

      expect(normalized.merchant).toBe('Bar Centrale');
      expect(normalized.total).toBe(12.35);
      expect(normalized.currency).toBe('EUR');
      expect(normalized.category).toBe('Ristoranti e Bar');
      expect(normalized.items).toEqual([{ name: 'Espresso', price: 1.5 }]);
      expect(normalized.notes).toBe('Colazione veloce');
    });
  });

  describe('Webhook ingestNotification: filtro isExpense (SMS promo/OTP) e idempotenza concorrente/sequenziale', () => {
    beforeEach(() => {
      notificationInMemoryDb = structuredClone(initialNotificationMockDb);
      resetNotificationIdempotencyCacheForTests();
      generateContentWithFallbackMock.mockReset();
      hasGeminiApiKeyMock.mockReset();
      hasGeminiApiKeyMock.mockReturnValue(true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('scarta SMS promozionali ("Hai 10€ di sconto...") e codici OTP senza inserire alcuna riga in SQLite', async () => {
      expect(
        classifyNonExpenseNotification('Hai 10€ di sconto sul tuo prossimo acquisto in negozio!')
          .isNonExpense
      ).toBe(true);
      expect(
        classifyNonExpenseNotification('Banca Intesa: il tuo codice OTP di verifica è 548291.')
          .isNonExpense
      ).toBe(true);

      const promoResult = await ingestNotification({
        notificationText: 'Hai 10€ di sconto sul tuo prossimo acquisto da Carrefour!',
        appName: 'SMS Promo',
        payer: 'user',
        shouldPersist: true,
      });

      expect(promoResult.success).toBe(true);
      expect(promoResult.isExpense).toBe(false);
      expect(promoResult.persisted).toBe(false);
      expect(promoResult.ignored).toBe(true);
      expect(promoResult.reason).toBeTruthy();
      expect(notificationInMemoryDb.expenses).toHaveLength(0);
      expect(generateContentWithFallbackMock).not.toHaveBeenCalled();

      const otpResult = await ingestNotification({
        notificationText: 'Nexi: Codice OTP 839201 per confermare accesso.',
        appName: 'Nexi',
        payer: 'user',
        shouldPersist: true,
      });

      expect(otpResult.success).toBe(true);
      expect(otpResult.isExpense).toBe(false);
      expect(otpResult.persisted).toBe(false);
      expect(otpResult.ignored).toBe(true);
      expect(notificationInMemoryDb.expenses).toHaveLength(0);

      // Anche se un messaggio ambiguo supera il pre-filtro e Gemini risponde isExpense: false, non salva nulla in SQLite
      generateContentWithFallbackMock.mockResolvedValueOnce({
        modelUsed: 'gemini-3.5-flash-lite',
        response: {
          text: JSON.stringify({
            isExpense: false,
            ignoreReason: 'Offerta commerciale di partner selezionati',
            merchant: 'Offerta',
            amount: 0,
            currency: 'EUR',
            category: 'Altro',
          }),
        },
      });

      const aiFilteredResult = await ingestNotification({
        notificationText: 'Con Te: 10€ per te sulla prossima spesa in cassa fino a domenica.',
        appName: 'Messaggi',
        payer: 'user',
        shouldPersist: true,
      });

      expect(aiFilteredResult.success).toBe(true);
      expect(aiFilteredResult.isExpense).toBe(false);
      expect(aiFilteredResult.persisted).toBe(false);
      expect(aiFilteredResult.ignored).toBe(true);
      expect(aiFilteredResult.reason).toContain('Offerta commerciale');
      expect(notificationInMemoryDb.expenses).toHaveLength(0);

      // Se invece il testo è un pagamento sintetico come " pagamento 12 euro bar roma " e Gemini dovesse rispondere isExpense: false, la salvaguardia lo salva comunque in SQLite
      generateContentWithFallbackMock.mockResolvedValueOnce({
        modelUsed: 'gemini-3.5-flash-lite',
        response: {
          text: JSON.stringify({
            isExpense: false,
            ignoreReason: 'Messaggio troppo breve',
            merchant: '',
            amount: 0,
            currency: 'EUR',
            category: 'Altro',
          }),
        },
      });

      const barRomaResult = await ingestNotification({
        notificationText: ' pagamento 12 euro bar roma ',
        appName: 'MacroDroid',
        payer: 'user',
        shouldPersist: true,
      });

      expect(barRomaResult.success).toBe(true);
      expect(barRomaResult.isExpense).toBe(true);
      expect(barRomaResult.persisted).toBe(true);
      expect(barRomaResult.ignored).toBe(false);
      expect(barRomaResult.expense?.amount).toBe(12);
      expect(barRomaResult.expense?.title.toLowerCase()).toBe('bar roma');
      expect(notificationInMemoryDb.expenses).toHaveLength(1);
    });

    it('estrae correttamente "Amazon Prime" dal testo NexiPay nel fallback locale e gestisce data a 2 cifre', () => {
      const parsedNexi = parseNotificationHeuristically(
        "Movimenti - è stata richiesta un'autorizzazione di pagamento di 4,99 € sulla carta 4480 c/o presso Amazon Prime il 24/11/2026 alle 18:14.",
        'NexiPay',
        'partner'
      );
      expect(parsedNexi.amount).toBe(4.99);
      expect(parsedNexi.title).toBe('Amazon Prime');
      expect(parsedNexi.date).toBe('2026-11-24');

      const parsedBancaImola = parseNotificationHeuristically(
        'Movimento conto - Sul conto **7557 il giorno 24/11/26 è stata registrata una operazione di Pagamento',
        'Banca Imola',
        'partner'
      );
      expect(parsedBancaImola.date).toBe('2026-11-24');

      const parsedYouAppTime = parseNotificationHeuristically(
        "Notifica movimento carta - E' stato richiesta una spesa di EUR 1,50 alle ore 12:48 del giorno 24/11/2026",
        'YouApp',
        'user'
      );
      expect(parsedYouAppTime.amount).toBe(1.5);
      expect(parsedYouAppTime.title).toBe('YouApp');
    });

    it('unisce automaticamente 3 notifiche ripetute Banca Imola da €287 oltre i 5 minuti e migliora titolo "P"', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(Date.parse('2026-11-24T10:00:00Z'));

      generateContentWithFallbackMock.mockResolvedValue({
        modelUsed: 'gemini-3.5-flash-lite',
        response: {
          text: JSON.stringify({
            isExpense: true,
            ignoreReason: '',
            merchant: 'P',
            amount: 287,
            currency: 'EUR',
            category: 'Altro',
            notes: 'Movimento conto tramite Banca Imola',
          }),
        },
      });

      const first = await ingestNotification({
        notificationText: 'Movimento conto - Sul conto **7557 il giorno 24/11/26 è stata registrata una operazione di Pagamento 287,00 EUR',
        appName: 'Banca Imola',
        payer: 'partner',
        shouldPersist: true,
      });

      expect(first.persisted).toBe(true);
      expect(first.expense?.title).toBe('Movimento Banca Imola');
      expect(notificationInMemoryDb.expenses).toHaveLength(1);

      // Seconda notifica 2 ore dopo (fuori dal vecchio TTL di 5 min) e cache azzerata
      resetNotificationIdempotencyCacheForTests();
      nowSpy.mockReturnValue(Date.parse('2026-11-24T12:30:00Z'));

      const second = await ingestNotification({
        notificationText: 'Pagamento con carta 287,00 EUR tramite Banca Imola',
        appName: 'Banca Imola',
        payer: 'partner',
        shouldPersist: true,
      });

      expect(second.persisted).toBe(true);
      expect(second.deduplicated).toBe(true);
      expect(second.reconciled).toBe(true);
      expect(second.expense?.title).toBe('Movimento Banca Imola');
      expect(notificationInMemoryDb.expenses).toHaveLength(1);

      // Terza notifica il giorno dopo
      resetNotificationIdempotencyCacheForTests();
      nowSpy.mockReturnValue(Date.parse('2026-11-25T09:15:00Z'));

      const third = await ingestNotification({
        notificationText: 'Movimento conto - Sul conto **7557 il giorno 24/11/26 è stata registrata una operazione di Pagamento 287,00 EUR',
        appName: 'Banca Imola',
        payer: 'partner',
        shouldPersist: true,
      });

      expect(third.deduplicated).toBe(true);
      expect(third.expense?.title).toBe('Movimento Banca Imola');
      expect(notificationInMemoryDb.expenses).toHaveLength(1);
    });

    it('marca come possible_duplicate per scelta utente piccoli importi ripetuti senza esercente certo o esercenti diversi stesso importo', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(Date.parse('2026-11-26T09:00:00Z'));

      // 1) Primo caffè da 1.50€ senza esercente certo
      generateContentWithFallbackMock.mockResolvedValueOnce({
        modelUsed: 'gemini-3.5-flash-lite',
        response: {
          text: JSON.stringify({
            isExpense: true,
            ignoreReason: '',
            merchant: 'YouApp',
            amount: 1.5,
            currency: 'EUR',
            category: 'Ristoranti e Bar',
            notes: 'Pagamento con carta tramite YouApp',
          }),
        },
      });
      const coffee1 = await ingestNotification({
        notificationText: 'Notifica movimento carta - Spesa di 1,50 EUR',
        appName: 'YouApp',
        payer: 'user',
        shouldPersist: true,
      });
      expect(coffee1.persisted).toBe(true);
      expect(coffee1.possibleDuplicate).toBe(false);

      // 2) Secondo caffè da 1.50€ due ore dopo -> deve chiedere conferma all'utente (non auto-unire!)
      resetNotificationIdempotencyCacheForTests();
      nowSpy.mockReturnValue(Date.parse('2026-11-26T11:30:00Z'));
      generateContentWithFallbackMock.mockResolvedValueOnce({
        modelUsed: 'gemini-3.5-flash-lite',
        response: {
          text: JSON.stringify({
            isExpense: true,
            ignoreReason: '',
            merchant: 'YouApp',
            amount: 1.5,
            currency: 'EUR',
            category: 'Ristoranti e Bar',
            notes: 'Pagamento con carta tramite YouApp',
          }),
        },
      });
      const coffee2 = await ingestNotification({
        notificationText: 'Notifica movimento carta - Altro addebito di 1,50 EUR',
        appName: 'YouApp',
        payer: 'user',
        shouldPersist: true,
      });
      expect(coffee2.persisted).toBe(true);
      expect(coffee2.deduplicated).toBe(false);
      expect(coffee2.possibleDuplicate).toBe(true);
      expect(coffee2.expense?.reconciliationStatus).toBe('possible_duplicate');
      expect(coffee2.expense?.duplicateCandidateId).toBe(coffee1.expense?.id);
      expect(notificationInMemoryDb.expenses).toHaveLength(2);

      // 2b) Terzo caffè da 1.50€ punta sempre alla spesa radice confermata (coffee1) e non a catena su coffee2
      resetNotificationIdempotencyCacheForTests();
      nowSpy.mockReturnValue(Date.parse('2026-11-26T15:00:00Z'));
      generateContentWithFallbackMock.mockResolvedValueOnce({
        modelUsed: 'gemini-3.5-flash-lite',
        response: {
          text: JSON.stringify({
            isExpense: true,
            ignoreReason: '',
            merchant: 'YouApp',
            amount: 1.5,
            currency: 'EUR',
            category: 'Ristoranti e Bar',
          }),
        },
      });
      const coffee3 = await ingestNotification({
        notificationText: 'Notifica movimento carta - Terzo addebito di 1,50 EUR',
        appName: 'YouApp',
        payer: 'user',
        shouldPersist: true,
      });
      expect(coffee3.possibleDuplicate).toBe(true);
      expect(coffee3.expense?.duplicateCandidateId).toBe(coffee1.expense?.id);

      // 3) Due spese da 4.50€ con esercenti reali diversi nello stesso giorno -> scelta utente
      generateContentWithFallbackMock.mockResolvedValueOnce({
        modelUsed: 'gemini-3.5-flash-lite',
        response: {
          text: JSON.stringify({
            isExpense: true,
            ignoreReason: '',
            merchant: 'Bar Centrale',
            amount: 4.5,
            currency: 'EUR',
            category: 'Ristoranti e Bar',
          }),
        },
      });
      const bar = await ingestNotification({
        notificationText: 'Pagamento di 4,50 EUR presso Bar Centrale',
        appName: 'Google Wallet',
        payer: 'partner',
        shouldPersist: true,
      });

      generateContentWithFallbackMock.mockResolvedValueOnce({
        modelUsed: 'gemini-3.5-flash-lite',
        response: {
          text: JSON.stringify({
            isExpense: true,
            ignoreReason: '',
            merchant: 'Edicola Stazione',
            amount: 4.5,
            currency: 'EUR',
            category: 'Shopping',
          }),
        },
      });
      const edicola = await ingestNotification({
        notificationText: 'Pagamento di 4,50 EUR presso Edicola Stazione',
        appName: 'Google Wallet',
        payer: 'partner',
        shouldPersist: true,
      });

      expect(edicola.persisted).toBe(true);
      expect(edicola.possibleDuplicate).toBe(true);
      expect(edicola.expense?.reconciliationStatus).toBe('possible_duplicate');
      expect(edicola.expense?.duplicateCandidateId).toBe(bar.expense?.id);
    });

    it('deduplica una doppia chiamata concorrente e sequenziale a ingestNotification con lo stesso testo producendo una sola riga in SQLite', async () => {
      generateContentWithFallbackMock.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return {
          modelUsed: 'gemini-3.5-flash-lite',
          response: {
            text: JSON.stringify({
              isExpense: true,
              ignoreReason: '',
              merchant: 'Esselunga',
              amount: 42.8,
              currency: 'EUR',
              category: 'Spesa',
              notes: 'Pagamento carta',
            }),
          },
        };
      });

      const payload = {
        notificationText: 'Nexi: Pagamento di 42,80 EUR presso ESSELUNGA autorizzato.',
        appName: 'Nexi',
        payer: 'user',
        shouldPersist: true,
      };

      // 1) Due richieste identiche inviate in parallelo (in-flight deduplication)
      const [first, secondConcurrent] = await Promise.all([
        ingestNotification(payload),
        ingestNotification(payload),
      ]);

      expect(first.success).toBe(true);
      expect(first.persisted).toBe(true);
      expect(first.deduplicated).toBe(false);
      expect(first.expense?.sourceReference).toMatch(/^notif:[a-f0-9]{16}:\d+$/);

      expect(secondConcurrent.success).toBe(true);
      expect(secondConcurrent.deduplicated).toBe(true);
      expect(secondConcurrent.expense?.id).toBe(first.expense?.id);

      expect(generateContentWithFallbackMock).toHaveBeenCalledTimes(1);
      expect(notificationInMemoryDb.expenses).toHaveLength(1);

      // 2) Terza richiesta identica sequenziale entro il TTL di 5 minuti
      const thirdSequential = await ingestNotification({
        ...payload,
        notificationText: '  Nexi:   Pagamento di 42,80 EUR presso ESSELUNGA autorizzato. ',
      });

      expect(thirdSequential.success).toBe(true);
      expect(thirdSequential.deduplicated).toBe(true);
      expect(thirdSequential.expense?.id).toBe(first.expense?.id);
      expect(generateContentWithFallbackMock).toHaveBeenCalledTimes(1);
      expect(notificationInMemoryDb.expenses).toHaveLength(1);

      // 3) Anche dopo un reset della cache in memoria (es. riavvio container), sourceReference in SQLite impedisce duplicati
      resetNotificationIdempotencyCacheForTests();
      const afterRestart = await ingestNotification(payload);
      expect(afterRestart.success).toBe(true);
      expect(afterRestart.persisted).toBe(true);
      expect(afterRestart.reconciled).toBe(true);
      expect(afterRestart.deduplicated).toBe(true);
      expect(notificationInMemoryDb.expenses).toHaveLength(1);

      // 4) Doppia notifica da due app diverse per lo stesso pagamento POS a pochi secondi di distanza (es. Google Pay + Nexi SMS)
      const walletFollowUp = await ingestNotification({
        notificationText: 'Google Wallet: €42,80 pagati con carta presso Esselunga Superstore.',
        appName: 'Google Wallet',
        payer: 'user',
        shouldPersist: true,
      });
      expect(walletFollowUp.success).toBe(true);
      expect(walletFollowUp.persisted).toBe(true);
      expect(walletFollowUp.reconciled).toBe(true);
      expect(walletFollowUp.deduplicated).toBe(true);
      expect(notificationInMemoryDb.expenses).toHaveLength(1);
    });
  });
});
