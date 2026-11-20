import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerDatabase } from '../server/database';

const initialMockDb: ServerDatabase = {
  expenses: [
    {
      id: 'exp-existing',
      title: 'Spesa Reale Esselunga',
      amount: 85.5,
      currency: 'EUR',
      date: '2026-11-18',
      category: 'Spesa',
      payer: 'user',
      splitType: '50_50',
      source: 'manual',
    },
  ],
  settlements: [
    {
      id: 'set-existing',
      date: '2026-11-18',
      amount: 20,
      currency: 'EUR',
      from: 'partner',
      to: 'user',
      note: 'Pareggio novembre',
    },
  ],
  goals: [
    {
      id: 'goal-existing',
      title: 'Viaggio Giappone',
      targetAmount: 4000,
      currentAmount: 1200,
    },
  ],
  gmailScanCache: [
    {
      accountEmail: 'owner@example.com',
      messageId: 'msg-1',
      scannedAt: '2026-11-18T10:00:00.000Z',
    },
  ],
  profile: {
    userName: 'Partner 1',
    partnerName: 'Partner 2',
    monthlyBudget: 2800,
    currency: 'EUR',
    weddingBudgetGoal: 15000,
    userEmail: 'owner@example.com',
    partnerEmail: 'partner@example.com',
  },
  lastUpdated: '2026-11-18T12:00:00.000Z',
};

const demoMockDb: ServerDatabase = {
  expenses: [
    {
      id: 'exp-demo-1',
      title: 'Demo Supermercato',
      amount: 50,
      currency: 'EUR',
      date: '2026-11-01',
      category: 'Spesa',
      payer: 'user',
      splitType: '50_50',
      source: 'manual',
    },
  ],
  settlements: [],
  goals: [
    {
      id: 'goal-demo-1',
      title: 'Fondo Emergenze',
      targetAmount: 3000,
      currentAmount: 500,
    },
  ],
  gmailScanCache: [],
  profile: {
    userName: 'Partner 1',
    partnerName: 'Partner 2',
    monthlyBudget: 2800,
    currency: 'EUR',
    weddingBudgetGoal: 15000,
    userEmail: 'default-demo@example.com',
    partnerEmail: '',
  },
  lastUpdated: '2026-11-01T00:00:00.000Z',
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
  resetDatabase: () => {
    inMemoryDb = structuredClone(demoMockDb);
    return structuredClone(inMemoryDb);
  },
}));

import { postResetDatabaseController } from '../server/controllers/dev.controller';
import {
  issueDeveloperSession,
  requireDeveloperConsoleAccess,
  requireDeveloperSession,
  resetDeveloperSessionsForTests,
} from '../server/middleware/auth';
import { getPublicAuthConfig } from '../server/services/auth.service';
import { createGoogleSession, resetGoogleSessionsForTests } from '../server/services/google-auth';

describe('Console Sviluppatore (.env password) e Reset Database protetto', () => {
  beforeEach(() => {
    inMemoryDb = structuredClone(initialMockDb);
    resetDeveloperSessionsForTests();
    resetGoogleSessionsForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('in produzione senza DUOSPEND_DEV_PASSWORD la console è disabilitata e risponde 404', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DUOSPEND_DEV_PASSWORD', '');

    expect(getPublicAuthConfig().developerConsoleEnabled).toBe(false);

    const req = { headers: {} } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    requireDeveloperConsoleAccess(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Endpoint API non trovato.' });
  });

  it('in produzione con DUOSPEND_DEV_PASSWORD richiede sia sessione Google coppia sia password .env', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DUOSPEND_DEV_PASSWORD', 'super-secret-prod-123');

    expect(getPublicAuthConfig().developerConsoleEnabled).toBe(true);

    // 1. Senza sessione Google coppia -> 401 su requireDeveloperConsoleAccess
    const nextNoGoogle = vi.fn();
    const resNoGoogle = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    requireDeveloperConsoleAccess({ headers: {} } as any, resNoGoogle, nextNoGoogle);
    expect(nextNoGoogle).not.toHaveBeenCalled();
    expect(resNoGoogle.status).toHaveBeenCalledWith(401);

    // Creiamo una sessione Google coppia autorizzata
    const googleRes = { cookie: vi.fn() } as any;
    createGoogleSession('owner@example.com', googleRes);
    const googleCookie = `duospend_google_session=${googleRes.cookie.mock.calls[0][1]}`;

    const nextWithGoogle = vi.fn();
    const resWithGoogle = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    requireDeveloperConsoleAccess(
      { headers: { cookie: googleCookie } } as any,
      resWithGoogle,
      nextWithGoogle
    );
    expect(nextWithGoogle).toHaveBeenCalledTimes(1);

    // 2. Solo sessione Google senza password dev -> 401 su requireDeveloperSession
    const resOnlyGoogle = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      clearCookie: vi.fn(),
    } as any;
    const nextOnlyGoogle = vi.fn();
    requireDeveloperSession({ headers: { cookie: googleCookie } } as any, resOnlyGoogle, nextOnlyGoogle);
    expect(nextOnlyGoogle).not.toHaveBeenCalled();
    expect(resOnlyGoogle.status).toHaveBeenCalledWith(401);

    // 3. Password errata rifiutata, password corretta emette cookie HttpOnly + Secure
    const wrongRes = { cookie: vi.fn() } as any;
    expect(issueDeveloperSession('wrong-password', wrongRes)).toBe(false);
    expect(wrongRes.cookie).not.toHaveBeenCalled();

    const devRes = { cookie: vi.fn() } as any;
    expect(issueDeveloperSession('super-secret-prod-123', devRes)).toBe(true);
    expect(devRes.cookie).toHaveBeenCalledWith(
      'duospend_dev_session',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        secure: true,
        path: '/api',
      })
    );
    const devCookie = `duospend_dev_session=${devRes.cookie.mock.calls[0][1]}`;

    // 4. Solo cookie dev senza sessione Google -> 401 in produzione
    const resOnlyDev = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      clearCookie: vi.fn(),
    } as any;
    const nextOnlyDev = vi.fn();
    requireDeveloperSession({ headers: { cookie: devCookie } } as any, resOnlyDev, nextOnlyDev);
    expect(nextOnlyDev).not.toHaveBeenCalled();
    expect(resOnlyDev.status).toHaveBeenCalledWith(401);

    // 5. Sessione Google coppia + cookie dev -> accesso consentito
    const resBoth = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      clearCookie: vi.fn(),
    } as any;
    const nextBoth = vi.fn();
    requireDeveloperSession(
      { headers: { cookie: `${googleCookie}; ${devCookie}` } } as any,
      resBoth,
      nextBoth
    );
    expect(nextBoth).toHaveBeenCalledTimes(1);
  });

  it('postResetDatabaseController richiede confirm RESET e gestisce modalità empty e demo preservando le email', () => {
    // 1. Senza confirm="RESET" -> 400
    const resMissingConfirm = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    postResetDatabaseController({ body: { mode: 'empty' } } as any, resMissingConfirm);
    expect(resMissingConfirm.status).toHaveBeenCalledWith(400);
    expect(inMemoryDb.expenses).toHaveLength(1);

    // 2. Modalità empty -> svuota tutto ma conserva userEmail e partnerEmail
    const resEmpty = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    postResetDatabaseController(
      { body: { confirm: 'reset', mode: 'empty' } } as any,
      resEmpty
    );
    expect(resEmpty.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, mode: 'empty' })
    );
    expect(inMemoryDb.expenses).toHaveLength(0);
    expect(inMemoryDb.settlements).toHaveLength(0);
    expect(inMemoryDb.goals).toHaveLength(0);
    expect(inMemoryDb.gmailScanCache).toHaveLength(0);
    expect(inMemoryDb.profile.userEmail).toBe('owner@example.com');
    expect(inMemoryDb.profile.partnerEmail).toBe('partner@example.com');

    // 3. Modalità demo -> carica i dati demo conservando userEmail e partnerEmail configurati
    const resDemo = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    postResetDatabaseController(
      { body: { confirm: 'RESET', mode: 'demo' } } as any,
      resDemo
    );
    expect(resDemo.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, mode: 'demo' })
    );
    expect(inMemoryDb.expenses).toHaveLength(1);
    expect(inMemoryDb.expenses[0]?.id).toBe('exp-demo-1');
    expect(inMemoryDb.profile.userEmail).toBe('owner@example.com');
    expect(inMemoryDb.profile.partnerEmail).toBe('partner@example.com');
  });
});
