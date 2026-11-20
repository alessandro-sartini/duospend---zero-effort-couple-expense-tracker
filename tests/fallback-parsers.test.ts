import { describe, expect, it } from 'vitest';
import {
  extractReceiptsHeuristically,
  isLikelyPromotionalOrNonExpenseEmail,
  parseNotificationHeuristically,
  parseNotificationHistoryHeuristically,
} from '../server/utils/security';
import { buildReceiptFallback, normalizeReceiptResponse } from '../server/services/ai.service';

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
});
