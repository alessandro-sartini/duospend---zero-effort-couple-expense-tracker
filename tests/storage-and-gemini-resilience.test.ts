import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerDatabase } from '../server/database';

const initialMockDb: ServerDatabase = {
  expenses: [],
  settlements: [],
  goals: [],
  profile: {
    userName: 'Partner 1',
    partnerName: 'Partner 2',
    monthlyBudget: 2800,
    currency: 'EUR',
    weddingBudgetGoal: 15000,
    userEmail: 'owner@example.com',
    partnerEmail: 'partner@example.com',
  },
  lastUpdated: '2026-11-15T00:00:00.000Z',
};

let inMemoryDb: ServerDatabase;

const generateContentMock = vi.fn();
const listModelsMock = vi.fn();

vi.mock('../server/database', () => ({
  readDatabase: () => structuredClone(inMemoryDb),
  writeDatabase: (patch: Partial<ServerDatabase>) => {
    inMemoryDb = {
      ...inMemoryDb,
      ...patch,
      lastUpdated: new Date().toISOString(),
    };
    return structuredClone(inMemoryDb);
  },
  readAiModelRegistry: () => [],
  upsertAiModelRegistry: () => {},
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = {
      generateContent: generateContentMock,
      list: listModelsMock,
    };
  },
}));

import { saveExpenses, syncWithServerDatabase } from '../src/services/storage';
import {
  generateContentWithFallback,
  resetGeminiModelCachesForTests,
} from '../server/services/gemini';
import type { Expense } from '../src/types';

describe('Resilienza salvataggio OCR (localStorage quota) e cooldown modelli Gemini', () => {
  beforeEach(() => {
    inMemoryDb = structuredClone(initialMockDb);
    resetGeminiModelCachesForTests();
    generateContentMock.mockReset();
    listModelsMock.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('saveExpenses non lancia errori su QuotaExceededError e sincronizza comunque l’immagine completa verso /api/data', async () => {
    const store = new Map<string, string>();
    const setItemMock = vi.fn((key: string, value: string) => {
      if (value.includes('data:image/')) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      store.set(key, value);
    });

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: setItemMock,
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ lastUpdated: '2026-11-15T18:00:00.000Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const expenses: Expense[] = [
      {
        id: 'exp-ocr-1',
        title: 'Conad Supermercato',
        amount: 42.5,
        currency: 'EUR',
        date: '2026-11-15',
        category: 'Spesa',
        payer: 'user',
        splitType: '50_50',
        source: 'camera',
        receiptUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
      },
      {
        id: 'exp-https-2',
        title: 'Farmacia',
        amount: 18,
        currency: 'EUR',
        date: '2026-11-15',
        category: 'Salute e Benessere',
        payer: 'partner',
        splitType: '50_50',
        source: 'manual',
        receiptUrl: 'https://cdn.example.com/receipt.jpg',
      },
    ];

    expect(() => saveExpenses(expenses)).not.toThrow();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // La copia locale ha rimosso solo il data URI inline mantenendo tutte le spese e gli URL esterni
    const cachedExpenses = JSON.parse(store.get('duospend_expenses_v1') || '[]') as Expense[];
    expect(cachedExpenses).toHaveLength(2);
    expect(cachedExpenses[0]?.receiptUrl).toBeUndefined();
    expect(cachedExpenses[1]?.receiptUrl).toBe('https://cdn.example.com/receipt.jpg');

    // La sincronizzazione verso il server mantiene la foto completa
    const [, requestInit] = fetchMock.mock.calls[0]!;
    const sentPayload = JSON.parse(String((requestInit as RequestInit).body)) as {
      expenses: Expense[];
    };
    expect(sentPayload.expenses[0]?.receiptUrl).toBe(expenses[0]?.receiptUrl);
  });

  it('saveExpenses resta resiliente anche se localStorage.setItem fallisce sempre per quota esaurita', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ lastUpdated: '2026-11-15T18:05:00.000Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const expenses: Expense[] = [
      {
        id: 'exp-ocr-2',
        title: 'Esselunga',
        amount: 64.2,
        currency: 'EUR',
        date: '2026-11-15',
        category: 'Spesa',
        payer: 'user',
        splitType: '50_50',
        source: 'camera',
        receiptUrl: 'data:image/jpeg;base64,/9j/AAAA',
      },
    ];

    expect(() => saveExpenses(expenses)).not.toThrow();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('generateContentWithFallback mette in cooldown i modelli in errore transitorio 503 e salta al fallback al tentativo successivo', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'AIza' + 'SyDummyValidKeyForUnitTesting1234567890');

    listModelsMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { name: 'models/gemini-3.8-flash', supportedActions: ['generateContent'] };
        yield { name: 'models/gemini-3.5-flash-lite', supportedActions: ['generateContent'] };
      },
    });

    generateContentMock.mockImplementation(async ({ model }: { model: string }) => {
      if (model === 'gemini-3.8-flash') {
        const error = new Error('This model is currently experiencing high demand.') as Error & {
          status?: number;
        };
        error.status = 503;
        throw error;
      }
      return { text: '{"ok":true}' };
    });

    const first = await generateContentWithFallback({
      model: 'gemini-3.8-flash',
      fallbackModels: ['gemini-3.5-flash-lite'],
      contents: 'Analizza scontrino 1',
    });

    expect(first.modelUsed).toBe('gemini-3.5-flash-lite');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(generateContentMock.mock.calls.map((c) => c[0]?.model)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
    ]);

    const second = await generateContentWithFallback({
      model: 'gemini-3.8-flash',
      fallbackModels: ['gemini-3.5-flash-lite'],
      contents: 'Analizza scontrino 2',
    });

    expect(second.modelUsed).toBe('gemini-3.5-flash-lite');
    expect(generateContentMock).toHaveBeenCalledTimes(3);
    expect(generateContentMock.mock.calls[2]?.[0]?.model).toBe('gemini-3.5-flash-lite');
  });

  it('generateContentWithFallback mette in cooldown il modello bloccato su TimeoutError / "This operation was aborted" (Node 22 AbortSignal.timeout)', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'AIza' + 'SyDummyValidKeyForUnitTesting1234567890');

    generateContentMock.mockImplementation(async ({ model }: { model: string }) => {
      if (model === 'gemini-3.8-flash') {
        const timeoutErr = new Error('This operation was aborted');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      }
      return { text: '{"ok":true}' };
    });

    const first = await generateContentWithFallback({
      model: 'gemini-3.8-flash',
      fallbackModels: ['gemini-3.5-flash-lite'],
      timeoutMs: 8_000,
      contents: 'Notifica pagamento 1',
    });

    expect(first.modelUsed).toBe('gemini-3.5-flash-lite');
    expect(generateContentMock).toHaveBeenCalledTimes(2);

    // La chiamata successiva salta direttamente gemini-3.8-flash perché in cooldown cache
    const second = await generateContentWithFallback({
      model: 'gemini-3.8-flash',
      fallbackModels: ['gemini-3.5-flash-lite'],
      timeoutMs: 8_000,
      contents: 'Notifica pagamento 2',
    });

    expect(second.modelUsed).toBe('gemini-3.5-flash-lite');
    expect(generateContentMock).toHaveBeenCalledTimes(3);
    expect(generateContentMock.mock.calls[2]?.[0]?.model).toBe('gemini-3.5-flash-lite');
  });

  it('syncWithServerDatabase preserva le modifiche locali offline rispetto ai record server obsoleti mantenendo receiptUrl', async () => {
    const store = new Map<string, string>();
    const setItemMock = vi.fn((key: string, value: string) => {
      if (value.includes('data:image/')) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      store.set(key, value);
    });

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: setItemMock,
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });

    let phase: 'offline' | 'online' = 'offline';
    const capturedMergePostBodies: Array<{ expenses?: Expense[] }> = [];
    const serverReceiptUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === '/api/data' && method === 'POST') {
        if (phase === 'offline') {
          return new Response(JSON.stringify({ error: 'Offline' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        capturedMergePostBodies.push(
          JSON.parse(String(init?.body ?? '{}')) as { expenses?: Expense[] },
        );
        return new Response(JSON.stringify({ success: true, lastUpdated: '2026-11-15T19:00:00.000Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/data' && method === 'GET') {
        return new Response(
          JSON.stringify({
            success: true,
            expenses: [
              {
                id: 'exp-1',
                title: 'Titolo Vecchio Server',
                amount: 20,
                currency: 'EUR',
                date: '2026-11-15',
                category: 'Spesa',
                payer: 'user',
                splitType: '50_50',
                source: 'camera',
                receiptUrl: serverReceiptUrl,
              },
            ],
            settlements: [],
            goals: [],
            profile: initialMockDb.profile,
            lastUpdated: '2026-11-15T18:30:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    saveExpenses([
      {
        id: 'exp-1',
        title: 'Modifica Locale Offline',
        amount: 35.5,
        currency: 'EUR',
        date: '2026-11-15',
        category: 'Spesa',
        payer: 'user',
        splitType: '50_50',
        source: 'camera',
        receiptUrl: serverReceiptUrl,
      },
    ]);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.get('duospend_dirty_sync_v1')).toBe('1');

    phase = 'online';
    await syncWithServerDatabase();

    await vi.waitFor(() => {
      expect(capturedMergePostBodies.length).toBeGreaterThanOrEqual(1);
    });

    const latestBody = capturedMergePostBodies[capturedMergePostBodies.length - 1];
    const syncedExp = latestBody?.expenses?.find((exp) => exp.id === 'exp-1');
    expect(syncedExp?.title).toBe('Modifica Locale Offline');
    expect(syncedExp?.amount).toBe(35.5);
    expect(syncedExp?.receiptUrl).toBe(serverReceiptUrl);

    await vi.waitFor(() => {
      expect(store.has('duospend_dirty_sync_v1')).toBe(false);
    });
  });
});
