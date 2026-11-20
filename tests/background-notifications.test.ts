import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getGmailNotificationSignature,
  getReceiptNotificationSignature,
  loadDismissedBackgroundNotifications,
  saveDismissedBackgroundNotifications,
  shouldDismissSwipeRight,
} from '../src/components/layout/backgroundNotifications';
import { loadGmailDraft, loadOcrDraft, saveGmailDraft, saveOcrDraft } from '../src/services/storage';

const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    store,
    api: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  };
};

describe('Notifiche popup di background e swipe verso destra', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Firme di stato per Gmail e OCR', () => {
    it('calcola correttamente la transizione syncing -> ready -> null per Gmail', () => {
      expect(
        getGmailNotificationSignature({
          isSyncing: false,
          detectedCount: 0,
          reviewCount: 0,
          scanProgress: null,
        })
      ).toBeNull();

      expect(
        getGmailNotificationSignature({
          isSyncing: true,
          detectedCount: 2,
          reviewCount: 1,
          scanProgress: { page: 2 },
        })
      ).toBe('syncing');

      expect(
        getGmailNotificationSignature({
          isSyncing: false,
          detectedCount: 2,
          reviewCount: 1,
          scanProgress: null,
        })
      ).toBe('ready:2:1');
    });

    it('calcola correttamente la transizione analyzing -> ready -> null per OCR scontrini', () => {
      expect(
        getReceiptNotificationSignature({
          isAnalyzing: false,
          hasDraft: false,
          fallbackUsed: false,
        })
      ).toBeNull();

      expect(
        getReceiptNotificationSignature({
          isAnalyzing: true,
          hasDraft: false,
          fallbackUsed: false,
        })
      ).toBe('analyzing');

      expect(
        getReceiptNotificationSignature({
          isAnalyzing: false,
          hasDraft: true,
          fallbackUsed: false,
        })
      ).toBe('ready:ok');

      expect(
        getReceiptNotificationSignature({
          isAnalyzing: false,
          hasDraft: true,
          fallbackUsed: true,
        })
      ).toBe('ready:fallback');
    });
  });

  describe('Soglia swipe/lancio verso destra (shouldDismissSwipeRight)', () => {
    it('non chiude su trascinamento corto o verso sinistra', () => {
      expect(shouldDismissSwipeRight({ offsetX: 40, velocityX: 0.1, width: 280 })).toBe(false);
      expect(shouldDismissSwipeRight({ offsetX: 90, velocityX: 0.1, width: 280 })).toBe(false);
      expect(shouldDismissSwipeRight({ offsetX: -120, velocityX: -1.2, width: 280 })).toBe(false);
      expect(shouldDismissSwipeRight({ offsetX: 15, velocityX: 0.9, width: 280 })).toBe(false);
    });

    it('chiude su trascinamento deciso a destra o lancio veloce a destra', () => {
      // Su width=280: soglia distanza = Math.min(110, Math.max(72, 98)) = 98
      expect(shouldDismissSwipeRight({ offsetX: 98, velocityX: 0.05, width: 280 })).toBe(true);
      // Su width=160: soglia minima clampata a 72
      expect(shouldDismissSwipeRight({ offsetX: 72, velocityX: 0.05, width: 160 })).toBe(true);
      // Su width=420: soglia massima clampata a 110
      expect(shouldDismissSwipeRight({ offsetX: 109, velocityX: 0.1, width: 420 })).toBe(false);
      expect(shouldDismissSwipeRight({ offsetX: 110, velocityX: 0.1, width: 420 })).toBe(true);
      // Lancio veloce (>= 28px e >= 0.45 px/ms)
      expect(shouldDismissSwipeRight({ offsetX: 30, velocityX: 0.48, width: 320 })).toBe(true);
    });
  });

  describe('Persistenza dismissal in sessionStorage senza cancellare le ricerche salvate', () => {
    it('nasconde le notifiche in sessionStorage mantenendo intatte le bozze Gmail e OCR in localStorage', () => {
      const sessionMem = createMemoryStorage();
      const localMem = createMemoryStorage();
      vi.stubGlobal('sessionStorage', sessionMem.api);
      vi.stubGlobal('localStorage', localMem.api);

      saveGmailDraft({
        detectedReceipts: [{ id: 'msg-1', merchant: 'Esselunga', total: 42.5 }],
        reviewCandidates: [],
        selectedIds: { 'msg-1': true },
        nextPageToken: null,
        analysisModel: 'gemini-3.8-flash',
        scanStats: null,
        scanStatus: 'complete',
        wasSyncing: false,
        lookbackDays: 30,
      });

      saveOcrDraft({
        imagePreview: 'data:image/jpeg;base64,abc',
        imageMimeType: 'image/jpeg',
        extractedData: { merchant: 'Conad', total: 19.9 },
        wasAnalyzing: false,
        payer: 'user',
        splitType: '50_50',
      });

      expect(loadDismissedBackgroundNotifications()).toEqual({});

      saveDismissedBackgroundNotifications({
        gmail: 'ready:1:0',
        receipt: 'ready:ok',
      });

      expect(loadDismissedBackgroundNotifications()).toEqual({
        gmail: 'ready:1:0',
        receipt: 'ready:ok',
      });

      // Le ricerche salvate in localStorage restano integre
      const gmailDraft = loadGmailDraft<{ id: string }>();
      const ocrDraft = loadOcrDraft<{ merchant: string }>();
      expect(gmailDraft?.detectedReceipts).toHaveLength(1);
      expect(gmailDraft?.detectedReceipts[0]?.id).toBe('msg-1');
      expect(ocrDraft?.extractedData?.merchant).toBe('Conad');

      // Azzerando entrambi i campi, solo la chiave dismissal viene ripulita mentre la bozza OCR in sessionStorage resta intatta
      saveDismissedBackgroundNotifications({});
      expect(sessionMem.store.has('duospend_dismissed_bg_notifications_v1')).toBe(false);
      expect(sessionMem.store.has('duospend_ocr_draft_v1')).toBe(true);
    });
  });
});
