import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  lastUpdated: '2026-11-01T00:00:00.000Z',
  gmailScanCache: [],
};

let inMemoryDb: ServerDatabase;

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
}));

import {
  exchangeCodeAndCreateGoogleSession,
  resolveCurrentSession,
  verifyAndCreateGoogleSession,
} from '../server/services/auth.service';
import { postGoogleCodeController } from '../server/controllers/auth.controller';
import {
  createGoogleSession,
  getGoogleSession,
  getGoogleSessionOAuth,
  getValidSessionAccessToken,
  resetGoogleSessionsForTests,
} from '../server/services/google-auth';
import { GMAIL_READONLY_SCOPE } from '../server/services/google-oauth';
import { hasGeminiApiKey } from '../server/services/gemini';
import { syncGmailReceipts } from '../server/services/gmail.service';
import { HttpError } from '../server/utils/http-error';

describe('Google Authentication & Gmail Sync Services', () => {
  beforeEach(() => {
    inMemoryDb = structuredClone(initialMockDb);
    resetGoogleSessionsForTests();
    vi.restoreAllMocks();
  });

  describe('Google Sign-in verification (verifyAndCreateGoogleSession)', () => {
    it('genera errore se il token è assente o non valido', async () => {
      const mockRes = { cookie: vi.fn() } as any;
      await expect(verifyAndCreateGoogleSession(null, mockRes)).rejects.toThrow(HttpError);
      await expect(verifyAndCreateGoogleSession('', mockRes)).rejects.toThrow('Token Google mancante');
    });

    it('rifiuta la sessione se Google restituisce 401 (token scaduto o revocato)', async () => {
      const mockRes = { cookie: vi.fn() } as any;
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401 })
      );

      await expect(verifyAndCreateGoogleSession('expired-token', mockRes)).rejects.toThrow(
        'La sessione Google non è valida o è scaduta.'
      );
    });

    it('rifiuta un account Google con email non verificata', async () => {
      const mockRes = { cookie: vi.fn() } as any;
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ email: 'unverified@example.com', email_verified: false }),
          { status: 200 }
        )
      );

      await expect(verifyAndCreateGoogleSession('valid-token', mockRes)).rejects.toThrow(
        'Google non ha verificato l’indirizzo email'
      );
    });

    it('blocca con 403 un account Google estraneo non autorizzato per la coppia', async () => {
      const mockRes = { cookie: vi.fn() } as any;
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ email: 'stranger@example.com', email_verified: true }),
          { status: 200 }
        )
      );

      await expect(verifyAndCreateGoogleSession('valid-token', mockRes)).rejects.toThrow(
        'Account Google non autorizzato per questa coppia.'
      );
    });

    it('accetta il login se l’email corrisponde all’owner o al partner autorizzato e imposta il cookie', async () => {
      const mockRes = { cookie: vi.fn() } as any;
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ email: 'PARTNER@example.com', email_verified: true }),
          { status: 200 }
        )
      );

      const result = await verifyAndCreateGoogleSession('partner-token', mockRes);
      expect(result.user.email).toBe('partner@example.com');
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'duospend_google_session',
        expect.any(String),
        expect.objectContaining({ httpOnly: true, path: '/api' })
      );
    });

    it('assegna automaticamente il primo account Google come proprietario se il db non ha email configurate', async () => {
      inMemoryDb.profile.userEmail = '';
      inMemoryDb.profile.partnerEmail = '';
      const mockRes = { cookie: vi.fn() } as any;
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ email: 'first.user@example.com', email_verified: true }),
          { status: 200 }
        )
      );

      const result = await verifyAndCreateGoogleSession('first-token', mockRes);
      expect(result.user.email).toBe('first.user@example.com');
      expect(inMemoryDb.profile.userEmail).toBe('first.user@example.com');
    });

    it('con DUOSPEND_OWNER_EMAIL impostata, uno sconosciuto non può rivendicare un database vuoto', async () => {
      inMemoryDb.profile.userEmail = '';
      inMemoryDb.profile.partnerEmail = '';
      vi.stubEnv('DUOSPEND_OWNER_EMAIL', 'owner@example.com');
      const mockRes = { cookie: vi.fn() } as any;
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ email: 'attacker@example.com', email_verified: true }),
          { status: 200 }
        )
      );

      try {
        await expect(verifyAndCreateGoogleSession('attacker-token', mockRes)).rejects.toThrow(
          'Account Google non autorizzato per questa coppia.'
        );
        expect(inMemoryDb.profile.userEmail).toBe('');
        expect(mockRes.cookie).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe('Risoluzione sessione utente (resolveCurrentSession)', () => {
    it('restituisce authenticated: false se nessun cookie è presente', () => {
      const mockReq = { headers: {} } as any;
      const mockRes = { clearCookie: vi.fn() } as any;
      const session = resolveCurrentSession(mockReq, mockRes);
      expect(session.authenticated).toBe(false);
    });
  });

  describe('Gmail Receipt Scanner (syncGmailReceipts)', () => {
    it('rifiuta la chiamata se manca il token Gmail di sessione', async () => {
      await expect(
        syncGmailReceipts({
          accessToken: undefined,
          googleUserEmail: 'owner@example.com',
          body: {},
        })
      ).rejects.toThrow('Missing or invalid Google Bearer access token.');
    });

    it('ricerca messaggi tramite Gmail API e applica regole ricorrenti note', async () => {
      const mockProfile = { emailAddress: 'owner@example.com' };
      const mockMessagesList = {
        messages: [{ id: 'msg-101' }],
        resultSizeEstimate: 1,
      };

      const mockMessageDetail = {
        id: 'msg-101',
        payload: {
          mimeType: 'text/plain',
          body: {
            data: Buffer.from(
              'Ricevuta ordine n. 9845. Totale pagato: €45,00 con carta di credito.',
              'utf8'
            ).toString('base64url'),
          },
          headers: [
            { name: 'Subject', value: 'Conferma Ordine Spesa Esselunga' },
            { name: 'From', value: 'Esselunga Online <ordini@esselunga.it>' },
            { name: 'Date', value: 'Wed, 11 Nov 2026 10:00:00 +0100' },
          ],
        },
      };

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockProfile), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockMessagesList), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockMessageDetail), { status: 200 }));

      const result = await syncGmailReceipts({
        accessToken: 'ya29.test-mock-token-abc-123',
        googleUserEmail: 'owner@example.com',
        body: {
          lookbackDays: 30,
          gmailRecurringRules: [
            {
              sender: 'Esselunga Online <ordini@esselunga.it>',
              subject: 'Conferma Ordine Spesa Esselunga',
              merchant: 'Esselunga Spesa',
              amount: 45,
              currency: 'EUR',
              category: 'Spesa',
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.receipts).toHaveLength(1);
      expect(result.receipts[0]).toMatchObject({
        merchant: 'Esselunga Spesa',
        total: 45,
        category: 'Spesa',
        recurringRuleApplied: true,
      });

      // Verifica che il risultato sia stato salvato nella cache per scansioni successive
      expect(inMemoryDb.gmailScanCache?.some((c) => c.messageId === 'msg-101')).toBe(true);
    });

    it('utilizza la cache per messaggi già scansionati senza riscaricare il corpo', async () => {
      inMemoryDb.gmailScanCache = [
        {
          accountEmail: 'owner@example.com',
          messageId: 'msg-cached-1',
          scannedAt: new Date().toISOString(),
          receipt: {
            id: 'msg-cached-1',
            isExpense: true,
            total: 25.5,
            currency: 'EUR',
            merchant: 'Iliad Italia',
            category: 'Bollette e Utenze',
          },
        },
      ];

      const mockProfile = { emailAddress: 'owner@example.com' };
      const mockMessagesList = {
        messages: [{ id: 'msg-cached-1' }],
        resultSizeEstimate: 1,
      };

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockProfile), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockMessagesList), { status: 200 }));

      const result = await syncGmailReceipts({
        accessToken: 'ya29.test-mock-token-abc-123',
        googleUserEmail: 'owner@example.com',
        body: { lookbackDays: 30 },
      });

      expect(result.success).toBe(true);
      expect(result.receipts).toHaveLength(1);
      expect(result.receipts[0]).toMatchObject({ merchant: 'Iliad Italia' });
      expect(result.skippedScannedCount).toBe(1);
      // Ha fatto solo profile + search messages, senza scaricare il dettaglio
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('salva comunque nella cache SQLite le email scansionate in modalità fallback (es. chiave API assente)', async () => {
      vi.stubEnv('GEMINI_API_KEY', '');
      const mockProfile = { emailAddress: 'owner@example.com' };
      const mockMessagesList = {
        messages: [{ id: 'msg-fallback-1' }],
        resultSizeEstimate: 1,
      };
      const mockMessageDetail = {
        id: 'msg-fallback-1',
        snippet: 'Ricevuta pagamento €19,90',
        payload: {
          mimeType: 'text/plain',
          body: {
            data: Buffer.from(
              'Conferma pagamento ricevuta Amazon: Totale pagato €19,90.',
              'utf8'
            ).toString('base64url'),
          },
          headers: [
            { name: 'Subject', value: 'Conferma ricevuta ordine Amazon' },
            { name: 'From', value: 'Amazon.it <ordini@amazon.it>' },
            { name: 'Date', value: 'Wed, 11 Nov 2026 11:00:00 +0100' },
          ],
        },
      };

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockProfile), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockMessagesList), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockMessageDetail), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockProfile), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockMessagesList), { status: 200 }));

      try {
        expect(hasGeminiApiKey()).toBe(false);

        const firstRun = await syncGmailReceipts({
          accessToken: 'ya29.test-mock-token-abc-123',
          googleUserEmail: 'owner@example.com',
          body: { lookbackDays: 30 },
        });

        expect(firstRun.success).toBe(true);
        expect(firstRun.fallbackUsed).toBe(true);
        expect(firstRun.receipts).toHaveLength(1);
        expect(inMemoryDb.gmailScanCache?.some((entry) => entry.messageId === 'msg-fallback-1')).toBe(
          true
        );

        const secondRun = await syncGmailReceipts({
          accessToken: 'ya29.test-mock-token-abc-123',
          googleUserEmail: 'owner@example.com',
          body: { lookbackDays: 30 },
        });

        expect(secondRun.success).toBe(true);
        expect(secondRun.skippedScannedCount).toBe(1);
        expect(secondRun.messagesAnalyzed).toBe(0);
        // Prima scansione: 3 chiamate (profile, list, detail); seconda scansione: 2 chiamate (profile, list)
        expect(fetchSpy).toHaveBeenCalledTimes(5);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('esclude categorie promozionali nella query Gmail e bonifica vecchi falsi positivi/fallback dalla cache SQLite', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'AQ.' + 'DummyValidKeyForCacheCleanup12345');
      inMemoryDb.gmailScanCache = [
        {
          accountEmail: 'owner@example.com',
          messageId: 'msg-conio-stale',
          scannedAt: new Date().toISOString(),
          receipt: {
            id: 'msg-conio-stale',
            isExpense: true,
            confidence: 78,
            reason: 'Estratto tramite motore euristico locale (fallback offline AI).',
            merchant: 'Conio News',
            total: 63110,
            currency: 'EUR',
            sourceEmailSubject: '#210 Midterm USA: cosa cambia per le crypto?',
            sourceEmailSender: 'Conio News <support@conio.com>',
          },
        },
        {
          accountEmail: 'owner@example.com',
          messageId: 'msg-samsung-stale',
          scannedAt: new Date().toISOString(),
          reviewCandidate: {
            id: 'msg-samsung-stale',
            subject: 'Offerte Black Friday da scoprire!',
            sender: 'Samsung <no-reply@m1.email.samsung.com>',
            confidence: 52,
            isExpense: true,
            reason: 'Email transazionale rilevata dal fallback locale: importo da verificare.',
            merchant: 'Samsung',
            total: 0,
          },
        },
        {
          accountEmail: 'owner@example.com',
          messageId: 'msg-paypal-valid',
          scannedAt: new Date().toISOString(),
          receipt: {
            id: 'msg-paypal-valid',
            isExpense: true,
            confidence: 95,
            reason: 'Conferma di pagamento inviato tramite PayPal.',
            merchant: 'Negozio Locale',
            total: 10,
            currency: 'EUR',
            sourceEmailSubject: 'Hai inviato un pagamento',
            sourceEmailSender: '"assistenza@paypal.it" <assistenza@paypal.it>',
          },
        },
      ];

      const mockProfile = { emailAddress: 'owner@example.com' };
      const mockMessagesList = {
        messages: [
          { id: 'msg-paypal-valid' },
          { id: 'msg-conio-stale' },
          { id: 'msg-samsung-stale' },
        ],
        resultSizeEstimate: 3,
      };
      const mockConioDetail = {
        id: 'msg-conio-stale',
        snippet: 'Bitcoin supera €63.110',
        payload: {
          mimeType: 'text/plain',
          body: { data: Buffer.from('Quotazione €63.110,00', 'utf8').toString('base64url') },
          headers: [
            { name: 'Subject', value: '#210 Midterm USA: cosa cambia per le crypto?' },
            { name: 'From', value: 'Conio News <support@conio.com>' },
            { name: 'Date', value: 'Sat, 14 Nov 2026 10:00:00 +0100' },
          ],
        },
      };
      const mockSamsungDetail = {
        id: 'msg-samsung-stale',
        snippet: 'Sconto fino a €400',
        payload: {
          mimeType: 'text/plain',
          body: { data: Buffer.from('Black Friday Samsung', 'utf8').toString('base64url') },
          headers: [
            { name: 'Subject', value: 'Offerte Black Friday da scoprire!' },
            { name: 'From', value: 'Samsung <no-reply@m1.email.samsung.com>' },
            { name: 'Date', value: 'Sun, 15 Nov 2026 07:30:00 +0100' },
          ],
        },
      };

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(mockProfile), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockMessagesList), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockConioDetail), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockSamsungDetail), { status: 200 }));

      try {
        const result = await syncGmailReceipts({
          accessToken: 'ya29.test-mock-token-abc-123',
          googleUserEmail: 'owner@example.com',
          body: { lookbackDays: 30 },
        });

        const searchCallUrl = String(fetchSpy.mock.calls[1]?.[0] || '');
        expect(decodeURIComponent(searchCallUrl)).toContain('-category:promotions -category:social -category:forums');

        expect(result.success).toBe(true);
        expect(result.skippedNonTransactionalCount).toBe(2);
        expect(result.messagesAnalyzed).toBe(0);
        expect(result.reviewCandidates).toHaveLength(0);
        expect(result.receipts).toHaveLength(1);
        expect(result.receipts[0]).toMatchObject({
          id: 'msg-paypal-valid',
          total: 10,
        });
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('rispetta startDate nella query Gmail (after:YYYY/MM/DD) ed esclude spese o bozze antecedenti', async () => {
      inMemoryDb.gmailScanCache = [
        {
          accountEmail: 'owner@example.com',
          messageId: 'msg-old-oct',
          scannedAt: new Date().toISOString(),
          receipt: {
            id: 'msg-old-oct',
            isExpense: true,
            total: 42,
            currency: 'EUR',
            date: '2026-10-31',
            merchant: 'Vecchio Acquisto Ottobre',
            category: 'Shopping',
          },
        },
        {
          accountEmail: 'owner@example.com',
          messageId: 'msg-nov-valid',
          scannedAt: new Date().toISOString(),
          receipt: {
            id: 'msg-nov-valid',
            isExpense: true,
            total: 18.5,
            currency: 'EUR',
            date: '2026-11-01',
            merchant: 'Acquisto Novembre',
            category: 'Spesa',
          },
        },
      ];

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ emailAddress: 'owner@example.com' }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              messages: [{ id: 'msg-old-oct' }, { id: 'msg-nov-valid' }],
              resultSizeEstimate: 2,
            }),
            { status: 200 }
          )
        );

      const result = await syncGmailReceipts({
        accessToken: 'ya29.test-mock-token-abc-123',
        googleUserEmail: 'owner@example.com',
        body: { lookbackDays: 30, startDate: '2026-11-01' },
      });

      const searchUrl = String(fetchSpy.mock.calls[1]?.[0] || '');
      expect(decodeURIComponent(searchUrl)).toContain('after:2026/10/31');
      expect(result.receipts).toHaveLength(1);
      expect(result.receipts[0]).toMatchObject({
        id: 'msg-nov-valid',
        date: '2026-11-01',
      });
    });
  });

  describe('Validazione chiave API Gemini (hasGeminiApiKey)', () => {
    it('rifiuta chiavi vuote o segnaposto, accetta chiavi valide AQ. e AIza...', () => {
      try {
        vi.stubEnv('GEMINI_API_KEY', '');
        expect(hasGeminiApiKey()).toBe(false);

        vi.stubEnv('GEMINI_API_KEY', 'replace-with-your-key');
        expect(hasGeminiApiKey()).toBe(false);

        vi.stubEnv('GEMINI_API_KEY', 'AQ.' + 'DummyValidKeyForUnitTesting1234567890');
        expect(hasGeminiApiKey()).toBe(true);

        vi.stubEnv('GEMINI_API_KEY', 'AIza' + 'SyDummyValidKeyForUnitTesting1234567890');
        expect(hasGeminiApiKey()).toBe(true);
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe('Google OAuth Code Model & Server-Side Session', () => {
    it('scambia il codice con redirect_uri=postmessage, imposta cookie HttpOnly e preserva il refresh_token al re-consenso', async () => {
      vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret');

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: 'ya29.code-access-1',
              expires_in: 3600,
              refresh_token: '1//refresh-token-1',
              scope: `openid email profile ${GMAIL_READONLY_SCOPE}`,
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              email: 'owner@example.com',
              email_verified: true,
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: 'ya29.code-access-2',
              expires_in: 3600,
              scope: `openid email profile ${GMAIL_READONLY_SCOPE}`,
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              email: 'owner@example.com',
              email_verified: true,
            }),
            { status: 200 }
          )
        );

      try {
        const res1 = { cookie: vi.fn(), clearCookie: vi.fn() } as any;
        const req1 = { headers: {} } as any;
        const first = await exchangeCodeAndCreateGoogleSession('auth-code-1', req1, res1);

        expect(first).toEqual({
          user: { email: 'owner@example.com' },
          gmailAccess: true,
        });
        expect(fetchSpy).toHaveBeenNthCalledWith(
          1,
          'https://oauth2.googleapis.com/token',
          expect.objectContaining({
            method: 'POST',
          })
        );
        const firstBody = String((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body || '');
        expect(firstBody).toContain('redirect_uri=postmessage');
        expect(firstBody).toContain('code=auth-code-1');

        expect(res1.cookie).toHaveBeenCalledWith(
          'duospend_google_session',
          expect.any(String),
          expect.objectContaining({
            httpOnly: true,
            sameSite: 'strict',
            path: '/api',
          })
        );
        const sessionCookie1 = res1.cookie.mock.calls[0][1] as string;

        // Re-auth without refresh_token in response preserves previous refreshToken
        const res2 = { cookie: vi.fn(), clearCookie: vi.fn() } as any;
        const req2 = { headers: { cookie: `duospend_google_session=${sessionCookie1}` } } as any;
        await exchangeCodeAndCreateGoogleSession('auth-code-2', req2, res2);

        const sessionCookie2 = res2.cookie.mock.calls[0][1] as string;
        expect(sessionCookie2).not.toBe(sessionCookie1);
        const storedOAuth = getGoogleSessionOAuth({
          headers: { cookie: `duospend_google_session=${sessionCookie2}` },
        } as any);
        expect(storedOAuth?.accessToken).toBe('ya29.code-access-2');
        expect(storedOAuth?.refreshToken).toBe('1//refresh-token-1');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('revoca il token su Google se l’email non è autorizzata', async () => {
      vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret');

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: 'ya29.unauth-access',
              expires_in: 3600,
              refresh_token: '1//unauth-refresh',
              scope: 'openid email profile',
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              email: 'intruder@example.com',
              email_verified: true,
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(new Response('', { status: 200 }));

      try {
        const res = { cookie: vi.fn(), clearCookie: vi.fn() } as any;
        const req = { headers: {} } as any;
        await expect(exchangeCodeAndCreateGoogleSession('bad-code-123456', req, res)).rejects.toThrow(
          'Account Google non autorizzato per questa coppia.'
        );
        expect(fetchSpy).toHaveBeenCalledWith(
          'https://oauth2.googleapis.com/revoke',
          expect.objectContaining({ method: 'POST' })
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('riutilizza il token fresco e aggiorna automaticamente quello scaduto tramite refreshToken', async () => {
      const resFresh = { cookie: vi.fn() } as any;
      createGoogleSession('owner@example.com', resFresh, {
        accessToken: 'ya29.fresh',
        accessTokenExpiresAt: Date.now() + 600_000,
        refreshToken: '1//refresh-1',
        scope: GMAIL_READONLY_SCOPE,
      });
      const freshCookie = resFresh.cookie.mock.calls[0][1] as string;
      const refreshMock = vi.fn();

      const freshToken = await getValidSessionAccessToken(
        { headers: { cookie: `duospend_google_session=${freshCookie}` } } as any,
        GMAIL_READONLY_SCOPE,
        refreshMock
      );
      expect(freshToken).toBe('ya29.fresh');
      expect(refreshMock).not.toHaveBeenCalled();

      const resExpired = { cookie: vi.fn() } as any;
      createGoogleSession('owner@example.com', resExpired, {
        accessToken: 'ya29.expired',
        accessTokenExpiresAt: Date.now() - 10_000,
        refreshToken: '1//refresh-2',
        scope: GMAIL_READONLY_SCOPE,
      });
      const expiredCookie = resExpired.cookie.mock.calls[0][1] as string;
      const refreshExpiredMock = vi.fn().mockResolvedValue({
        accessToken: 'ya29.refreshed',
        accessTokenExpiresAt: Date.now() + 3600_000,
        refreshToken: '1//refresh-2',
        scope: GMAIL_READONLY_SCOPE,
      });

      const refreshedToken = await getValidSessionAccessToken(
        { headers: { cookie: `duospend_google_session=${expiredCookie}` } } as any,
        GMAIL_READONLY_SCOPE,
        refreshExpiredMock
      );
      expect(refreshedToken).toBe('ya29.refreshed');
      expect(refreshExpiredMock).toHaveBeenCalledWith('1//refresh-2');
    });

    it('postGoogleCodeController rifiuta richieste prive di header CSRF X-Requested-With', async () => {
      const req = {
        get: vi.fn().mockReturnValue(undefined),
        body: { code: 'abc' },
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await postGoogleCodeController(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Richiesta di autorizzazione non valida.',
      });
    });

    it('scade dopo 30 minuti di inattività, si rinnova su attività e rispetta il limite massimo assoluto di 4 ore', () => {
      const baseTime = 1_700_000_000_000;
      let currentTime = baseTime;
      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      try {
        const res1 = { cookie: vi.fn() } as any;
        createGoogleSession('owner@example.com', res1);
        const cookie1 = `duospend_google_session=${res1.cookie.mock.calls[0][1]}`;
        const req1 = { headers: { cookie: cookie1 } } as any;

        // 1. Dopo 30 minuti senza attività la sessione scade
        currentTime = baseTime + 30 * 60 * 1000 + 1;
        expect(getGoogleSession(req1)).toBeUndefined();

        // 2. Controllo passivo (touch: false / resolveCurrentSession) NON estende il timer di inattività
        currentTime = baseTime;
        const res2 = { cookie: vi.fn() } as any;
        createGoogleSession('owner@example.com', res2);
        const cookie2 = `duospend_google_session=${res2.cookie.mock.calls[0][1]}`;
        const req2 = { headers: { cookie: cookie2 } } as any;

        currentTime = baseTime + 20 * 60 * 1000;
        const passive = resolveCurrentSession(req2, { clearCookie: vi.fn() } as any);
        expect(passive).toMatchObject({
          authenticated: true,
          idleExpiresAt: baseTime + 30 * 60 * 1000,
          absoluteExpiresAt: baseTime + 4 * 60 * 60 * 1000,
        });

        currentTime = baseTime + 30 * 60 * 1000 + 1;
        expect(getGoogleSession(req2, { touch: false })).toBeUndefined();

        // 3. Attività ogni 20 min rinnova oltre i 30 min, ma dopo 4 ore scade sempre per limite assoluto
        currentTime = baseTime;
        const res3 = { cookie: vi.fn() } as any;
        createGoogleSession('owner@example.com', res3);
        const cookie3 = `duospend_google_session=${res3.cookie.mock.calls[0][1]}`;
        const req3 = { headers: { cookie: cookie3 } } as any;

        for (let step = 1; step <= 11; step++) {
          currentTime = baseTime + step * 20 * 60 * 1000; // fino a +220 min (3h40m)
          expect(getGoogleSession(req3)).toEqual({ email: 'owner@example.com' });
        }

        // L'attività a 3h40m non può superare il tetto massimo assoluto di 4h
        currentTime = baseTime + 4 * 60 * 60 * 1000 + 1;
        expect(getGoogleSession(req3)).toBeUndefined();
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});
