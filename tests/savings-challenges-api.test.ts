import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSqliteDatabase,
  type ServerDatabase,
  type SqliteDatabaseHandle,
} from '../server/database';
import { createSavingsChallengesController } from '../server/controllers/savings-challenges.controller';
import { guardChallengeMutationRequest } from '../server/routes/savings-challenges';
import { createSavingsChallengesService } from '../server/services/savings-challenges.service';
import { HttpError } from '../server/utils/http-error';

function makeMockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      res.body = payload;
      return res;
    }),
    setHeader: vi.fn((k: string, v: string) => {
      res.headers[k] = v;
    }),
    getHeader: vi.fn((k: string) => res.headers[k]),
  };
  return res;
}

describe('API, transazioni SQLite, idempotenza, sicurezza e backup Sfide di Risparmio', () => {
  const handles: SqliteDatabaseHandle[] = [];
  const tempDirs: string[] = [];

  const trackHandle = (handle: SqliteDatabaseHandle): SqliteDatabaseHandle => {
    handles.push(handle);
    return handle;
  };

  const makeTempDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duospend-sc-test-'));
    tempDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    while (handles.length > 0) {
      try {
        handles.pop()?.close();
      } catch {
        // Ignore already-closed handles
      }
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('esegue ciclo completo CRUD: creazione, modifica limite/categoria/obiettivo, pausa, riattivazione e eliminazione', () => {
    const db = trackHandle(createSqliteDatabase({ dbFile: ':memory:' }));
    const service = createSavingsChallengesService(db);
    const now = new Date('2026-11-21T12:00:00Z');

    const createdRes = service.createChallenge(
      {
        title: 'Sfida Ristoranti Novembre',
        goalId: 'goal-1',
        categories: ['Ristoranti e Bar'],
        monthlyLimit: 300,
        startMonth: '2026-11',
        durationMonths: 1,
      },
      { requesterEmail: '', now }
    );
    expect(createdRes.status).toBe(201);
    const challenge = createdRes.body.challenge as { id: string; version: number; monthlyLimit: number };
    expect(challenge.monthlyLimit).toBe(300);

    // Modifica non-retroattiva (solo titolo) non richiede confirmRetroactive
    const renamed = service.updateChallenge(
      challenge.id,
      { title: 'Sfida Cene Amalfi', expectedVersion: challenge.version },
      { now }
    );
    expect((renamed.challenge as { title: string }).title).toBe('Sfida Cene Amalfi');

    // Modifica limite/categoria/obiettivo su sfida già avviata -> richiede confirmRetroactive
    try {
      service.updateChallenge(
        challenge.id,
        {
          monthlyLimit: 350,
          categories: ['Ristoranti e Bar', 'Svago e Intrattenimento'],
          goalId: 'goal-2',
          expectedVersion: 2,
        },
        { now }
      );
      expect.unreachable('Doveva richiedere conferma retroattiva');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(409);
      expect((err as HttpError).details?.code).toBe('RETROACTIVE_CONFIRMATION_REQUIRED');
    }

    const updated = service.updateChallenge(
      challenge.id,
      {
        monthlyLimit: 350,
        categories: ['Ristoranti e Bar', 'Svago e Intrattenimento'],
        goalId: 'goal-2',
        expectedVersion: 2,
        confirmRetroactive: true,
      },
      { now }
    );
    const updatedCh = updated.challenge as {
      monthlyLimit: number;
      categories: string[];
      goalId: string;
      version: number;
    };
    expect(updatedCh.monthlyLimit).toBe(350);
    expect(updatedCh.categories).toEqual(['Ristoranti e Bar', 'Svago e Intrattenimento']);
    expect(updatedCh.goalId).toBe('goal-2');

    // Pausa & riattivazione
    const paused = service.pauseChallenge(challenge.id, { expectedVersion: updatedCh.version }, { now });
    expect((paused.challenge as { status: string }).status).toBe('paused');

    const resumed = service.resumeChallenge(
      challenge.id,
      { expectedVersion: (paused.challenge as { version: number }).version },
      { now }
    );
    expect((resumed.challenge as { status: string }).status).toBe('active');

    // Doppia sfida attiva simultanea sulla stessa coppia
    const secondRes = service.createChallenge(
      {
        title: 'Sfida Spesa Casa',
        goalId: 'goal-3',
        categories: ['Spesa'],
        monthlyLimit: 400,
        startMonth: '2026-11',
        durationMonths: 1,
      },
      { now }
    );
    expect(secondRes.status).toBe(201);
    expect(service.listChallenges({ now }).challenges).toHaveLength(2);

    // Verifica storico registrato
    const historyRes = service.getChallengeHistory(challenge.id);
    expect(historyRes.history.some((h) => h.action === 'retroactive_update')).toBe(true);
    expect(historyRes.history.some((h) => h.action === 'paused')).toBe(true);
    expect(historyRes.history.some((h) => h.action === 'resumed')).toBe(true);

    // Eliminazione
    const deleted = service.deleteChallenge(challenge.id, {}, { now });
    expect(deleted.success).toBe(true);
    expect(service.listChallenges({ now }).challenges).toHaveLength(1);
  });

  it('aggiorna il calcolo quando una spesa viene eliminata dopo il calcolo iniziale', () => {
    const db = trackHandle(createSqliteDatabase({ dbFile: ':memory:' }));
    const service = createSavingsChallengesService(db);
    const now = new Date('2026-11-21T12:00:00Z');

    // Seed ha exp-2 = 88.00 EUR in Ristoranti e Bar (2026-11-06)
    const created = service.createChallenge(
      {
        title: 'Ristoranti',
        goalId: 'goal-1',
        categories: ['Ristoranti e Bar'],
        monthlyLimit: 300,
        startMonth: '2026-11',
        durationMonths: 1,
      },
      { now }
    );
    const ch = created.body.challenge as { id: string; metrics: { validSpend: number; virtualSavingsAvailable: number } };
    expect(ch.metrics.validSpend).toBe(88);
    expect(ch.metrics.virtualSavingsAvailable).toBe(212);

    // Eliminiamo la spesa exp-2 dal registro reale
    const currentData = db.readDatabase();
    db.writeDatabase({
      expenses: currentData.expenses.filter((e) => e.id !== 'exp-2'),
    });

    const recalc = service.recalculateChallenge(ch.id, { now });
    const recalcCh = recalc.challenge as { metrics: { validSpend: number; virtualSavingsAvailable: number } };
    expect(recalcCh.metrics.validSpend).toBe(0);
    expect(recalcCh.metrics.virtualSavingsAvailable).toBe(300);
  });

  it('applica e annulla contributi virtuali atomicamente con protezione replay/doppio clic e conflitti di versione', () => {
    const db = trackHandle(createSqliteDatabase({ dbFile: ':memory:' }));
    const service = createSavingsChallengesService(db);
    const now = new Date('2026-11-21T12:00:00Z');

    const goalBefore = db.readDatabase().goals.find((g) => g.id === 'goal-1')!;
    expect(goalBefore.currentAmount).toBe(2650);

    const created = service.createChallenge(
      {
        title: 'Sfida Amalfi',
        goalId: 'goal-1',
        categories: ['Ristoranti e Bar'],
        monthlyLimit: 300,
        startMonth: '2026-11',
        durationMonths: 1,
      },
      { now }
    );
    const chId = (created.body.challenge as { id: string }).id;

    // Anteprima (dryRun) non modifica obiettivo
    const previewRes = service.confirmContribution(chId, { dryRun: true }, { now });
    const preview = previewRes.preview as { availableVirtualSavings: number; projectedGoalAmount: number };
    expect(preview.availableVirtualSavings).toBe(212);
    expect(preview.projectedGoalAmount).toBe(2862);
    expect(db.readDatabase().goals.find((g) => g.id === 'goal-1')?.currentAmount).toBe(2650);

    // Conferma parziale 1 (100 EUR) con Idempotency-Key
    const idem1 = 'idem-confirm-100';
    const commit1 = service.confirmContribution(
      chId,
      { confirmed: true, amount: 100, expectedVersion: 1 },
      { idempotencyKey: idem1, now }
    );
    expect((commit1.updatedGoal as { currentAmount: number }).currentAmount).toBe(2750);

    // Replay / doppio clic con la stessa Idempotency-Key -> NON riapplica!
    const replay1 = service.confirmContribution(
      chId,
      { confirmed: true, amount: 100, expectedVersion: 1 },
      { idempotencyKey: idem1, now }
    );
    expect(replay1.idempotentReplay).toBe(true);
    expect(db.readDatabase().goals.find((g) => g.id === 'goal-1')?.currentAmount).toBe(2750);

    // Modifica concorrente da secondo dispositivo con versione obsoleta -> 409 VERSION_CONFLICT
    try {
      service.confirmContribution(
        chId,
        { confirmed: true, amount: 50, expectedVersion: 1 },
        { idempotencyKey: 'idem-stale-ver', now }
      );
      expect.unreachable('Versione obsoleta doveva fallire con 409');
    } catch (err) {
      expect((err as HttpError).status).toBe(409);
      expect((err as HttpError).details?.code).toBe('VERSION_CONFLICT');
    }

    // Secondo contributo valido (50 EUR) con versione aggiornata (2)
    const commit2 = service.confirmContribution(
      chId,
      { confirmed: true, amount: 50, expectedVersion: 2 },
      { idempotencyKey: 'idem-confirm-50', now }
    );
    expect((commit2.updatedGoal as { currentAmount: number }).currentAmount).toBe(2800);

    // Eliminazione bloccata senza revertAppliedContributions quando ci sono contributi applicati
    try {
      service.deleteChallenge(chId, {}, { now });
      expect.unreachable('Doveva richiedere storno dei contributi');
    } catch (err) {
      expect((err as HttpError).status).toBe(409);
      expect((err as HttpError).details?.code).toBe('APPLIED_CONTRIBUTIONS_EXIST');
    }

    // Annullamento ultimo contributo (50 EUR) -> torna a 2750
    const reverted = service.revertContribution(chId, { expectedVersion: 3 }, { now });
    expect((reverted.updatedGoal as { currentAmount: number }).currentAmount).toBe(2750);

    // Eliminazione con storno del residuo (100 EUR) -> obiettivo torna esattamente a 2650
    const deleted = service.deleteChallenge(
      chId,
      { revertAppliedContributions: true, expectedVersion: 4 },
      { now }
    );
    expect(deleted.revertedAmount).toBe(100);
    expect(db.readDatabase().goals.find((g) => g.id === 'goal-1')?.currentAmount).toBe(2650);
  });

  it('garantisce il rollback completo in caso di crash SQLite durante la transazione di contributo', () => {
    const db = trackHandle(createSqliteDatabase({ dbFile: ':memory:' }));
    const service = createSavingsChallengesService(db);
    const now = new Date('2026-11-21T12:00:00Z');

    const created = service.createChallenge(
      {
        title: 'Sfida Atomica',
        goalId: 'goal-1',
        categories: ['Ristoranti e Bar'],
        monthlyLimit: 300,
        startMonth: '2026-11',
        durationMonths: 1,
      },
      { now }
    );
    const chId = (created.body.challenge as { id: string }).id;

    // Trigger SQLite che simula un crash hardware/DB subito dopo l'insert del contributo ma durante l'update dell'obiettivo
    db.getRawDatabase().exec(`
      CREATE TRIGGER crash_goal_update BEFORE UPDATE ON goals
      BEGIN
        SELECT RAISE(ABORT, 'SIMULATED_CRASH');
      END;
    `);

    expect(() =>
      service.confirmContribution(
        chId,
        { confirmed: true, amount: 80, expectedVersion: 1 },
        { idempotencyKey: 'idem-crash-test-1', now }
      )
    ).toThrow(/SIMULATED_CRASH/);

    // Verifica rollback totale: nessun contributo salvato, versione ancora 1, obiettivo invariato a 2650
    expect(db.readDatabase().goals.find((g) => g.id === 'goal-1')?.currentAmount).toBe(2650);
    const history = service.getChallengeHistory(chId);
    expect(history.contributions).toHaveLength(0);
    expect(service.listChallenges({ now }).challenges[0]?.version).toBe(1);
  });

  it('supporta migrazione additiva da DB legacy, reset empty/demo e backup/restore completi', () => {
    const tempDir = makeTempDir();
    const dbFile = path.join(tempDir, 'legacy-upgrade.sqlite');

    // Crea DB pre-esistente senza le nuove tabelle delle sfide
    const legacy = new DatabaseSync(dbFile);
    try {
      legacy.exec(`
        CREATE TABLE expenses (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL,
          date TEXT NOT NULL, category TEXT NOT NULL, payer TEXT NOT NULL, split_type TEXT NOT NULL,
          custom_split_ratio REAL, source TEXT NOT NULL, source_reference TEXT, notes TEXT,
          receipt_url TEXT, items_json TEXT, tax REAL, position INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE settlements (
          id TEXT PRIMARY KEY, date TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL,
          from_payer TEXT NOT NULL, to_payer TEXT NOT NULL, note TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE goals (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, target_amount REAL NOT NULL, current_amount REAL NOT NULL,
          target_date TEXT, image_url TEXT, image_resolution TEXT, position INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE profile (
          id INTEGER PRIMARY KEY CHECK (id = 1), user_name TEXT NOT NULL, partner_name TEXT NOT NULL,
          monthly_budget REAL NOT NULL, currency TEXT NOT NULL, wedding_budget_goal REAL,
          user_email TEXT NOT NULL DEFAULT '', partner_email TEXT NOT NULL DEFAULT '',
          category_budgets_json TEXT, last_updated TEXT NOT NULL
        );
        INSERT INTO goals (id, title, target_amount, current_amount, position) VALUES ('goal-legacy', 'Casa', 5000, 1000, 0);
        INSERT INTO profile (id, user_name, partner_name, monthly_budget, currency, user_email, partner_email, last_updated)
          VALUES (1, 'Partner 1', 'Partner 2', 3000, 'EUR', 'owner@example.com', 'partner@example.com', '2026-11-01T00:00:00Z');
      `);
    } finally {
      legacy.close();
    }

    // Riapertura con schema additivo: dati legacy intatti + nuove tabelle pronte
    const db = trackHandle(createSqliteDatabase({ dbFile }));
    expect(db.readDatabase().goals[0]?.title).toBe('Casa');

    const service = createSavingsChallengesService(db);
    const now = new Date('2026-11-21T12:00:00Z');
    const created = service.createChallenge(
      {
        title: 'Sfida Casa',
        goalId: 'goal-legacy',
        categories: ['Shopping'],
        monthlyLimit: 150,
        startMonth: '2026-11',
        durationMonths: 1,
      },
      { now }
    );
    const chId = (created.body.challenge as { id: string }).id;
    service.confirmContribution(
      chId,
      { confirmed: true, amount: 50, expectedVersion: 1 },
      { idempotencyKey: 'idem-backup-1', now }
    );

    // Backup completo -> clear -> restore
    const backup = db.exportSavingsChallengesBackup();
    expect(backup.challenges).toHaveLength(1);
    expect(backup.contributions).toHaveLength(1);

    db.clearSavingsChallenges();
    expect(service.listChallenges({ now }).challenges).toHaveLength(0);

    db.restoreSavingsChallengesBackup(backup);
    const restored = service.listChallenges({ now }).challenges;
    expect(restored).toHaveLength(1);
    expect(restored[0]?.metrics.virtualSavingsApplied).toBe(50);

    // Reset DB con writeDatabase({ savingsChallengesBackup: vuoto }) preserva email
    db.writeDatabase({
      expenses: [],
      settlements: [],
      goals: [],
      savingsChallengesBackup: {
        challenges: [],
        categories: [],
        periods: [],
        contributions: [],
        history: [],
      },
      profile: db.readDatabase().profile,
    });
    expect(service.listChallenges({ now }).challenges).toHaveLength(0);
    expect(db.readDatabase().profile.userEmail).toBe('owner@example.com');
    expect(db.readDatabase().profile.partnerEmail).toBe('partner@example.com');
  });

  it('valida input, IDOR/ID falsi, limite <= 0, XSS, CSRF header e payload > 64KB tramite controller e middleware', () => {
    const db = trackHandle(createSqliteDatabase({ dbFile: ':memory:' }));
    const service = createSavingsChallengesService(db);
    const controller = createSavingsChallengesController(service);

    // 1. CSRF header X-Requested-With mancante su POST -> 403
    const csrfRes = makeMockRes();
    const csrfNext = vi.fn();
    guardChallengeMutationRequest(
      { method: 'POST', get: () => undefined, body: {} } as any,
      csrfRes as any,
      csrfNext
    );
    expect(csrfNext).not.toHaveBeenCalled();
    expect(csrfRes.statusCode).toBe(403);

    // 2. Payload > 64 KB -> 413
    const largeRes = makeMockRes();
    const largeNext = vi.fn();
    guardChallengeMutationRequest(
      {
        method: 'POST',
        get: (name: string) =>
          name.toLowerCase() === 'x-requested-with' ? 'XMLHttpRequest' : undefined,
        body: { title: 'x'.repeat(70_000) },
      } as any,
      largeRes as any,
      largeNext
    );
    expect(largeNext).not.toHaveBeenCalled();
    expect(largeRes.statusCode).toBe(413);

    // 3. ID falso / traversal -> 400
    const badIdRes = makeMockRes();
    controller.getHistory({ params: { id: '../etc/passwd' } } as any, badIdRes as any);
    expect(badIdRes.statusCode).toBe(400);

    // 4. ID inesistente (IDOR) -> 404
    const missingIdRes = makeMockRes();
    controller.getHistory({ params: { id: 'chg-nonexistent-999' } } as any, missingIdRes as any);
    expect(missingIdRes.statusCode).toBe(404);

    // 5. Limite negativo / zero -> 400
    const negLimitRes = makeMockRes();
    controller.createChallenge(
      {
        body: {
          title: 'Test Negativo',
          goalId: 'goal-1',
          categories: ['Spesa'],
          monthlyLimit: -10,
          startMonth: '2026-11',
          durationMonths: 1,
        },
        get: () => undefined,
      } as any,
      negLimitRes as any
    );
    expect(negLimitRes.statusCode).toBe(400);

    // 6. Sanitizzazione XSS su creazione
    const xssRes = makeMockRes();
    controller.createChallenge(
      {
        body: {
          title: '<script>alert(1)</script> Sfida Sicura',
          goalId: 'goal-1',
          categories: ['Spesa'],
          monthlyLimit: 250,
          startMonth: '2026-11',
          durationMonths: 1,
        },
        get: () => undefined,
      } as any,
      xssRes as any
    );
    expect(xssRes.statusCode).toBe(201);
    expect((xssRes.body as { challenge: { title: string } }).challenge.title).toBe('Sfida Sicura');
  });

  it('blocca sessioni scadute (401), account estranei (403) e webhook secret (401) tramite requireCoupleAuth', async () => {
    vi.resetModules();
    const mockDb: ServerDatabase = {
      expenses: [],
      settlements: [],
      goals: [],
      profile: {
        userName: 'Partner 1',
        partnerName: 'Partner 2',
        monthlyBudget: 2800,
        currency: 'EUR',
        userEmail: 'owner@example.com',
        partnerEmail: 'partner@example.com',
      },
      lastUpdated: '2026-11-21T00:00:00.000Z',
    };

    vi.doMock('../server/database', () => ({
      readDatabase: () => structuredClone(mockDb),
    }));
    vi.doMock('../server/config', async () => {
      const actual = await vi.importActual<typeof import('../server/config')>('../server/config');
      return {
        ...actual,
        WEBHOOK_SECRET: 'super-webhook-secret-value-123456',
      };
    });

    try {
      const { requireCoupleAuth } = await import('../server/middleware/auth');
      const { createGoogleSession, resetGoogleSessionsForTests } = await import(
        '../server/services/google-auth'
      );
      resetGoogleSessionsForTests();

      // 1. Nessuna sessione -> 401
      const resNoAuth = makeMockRes();
      const nextNoAuth = vi.fn();
      await requireCoupleAuth(
        { method: 'GET', baseUrl: '', path: '/api/savings-challenges', headers: {}, get: () => undefined } as any,
        resNoAuth as any,
        nextNoAuth
      );
      expect(nextNoAuth).not.toHaveBeenCalled();
      expect(resNoAuth.statusCode).toBe(401);

      // 2. Webhook secret rifiutato su /api/savings-challenges -> 401
      const resWebhook = makeMockRes();
      const nextWebhook = vi.fn();
      await requireCoupleAuth(
        {
          method: 'POST',
          baseUrl: '',
          path: '/api/savings-challenges',
          headers: {},
          get: (name: string) =>
            name.toLowerCase() === 'x-duospend-secret' ? 'super-webhook-secret-value-123456' : undefined,
        } as any,
        resWebhook as any,
        nextWebhook
      );
      expect(nextWebhook).not.toHaveBeenCalled();
      expect(resWebhook.statusCode).toBe(401);

      // 3. Account Google non autorizzato -> 403
      const outsiderRes = { cookie: vi.fn() } as any;
      createGoogleSession('intruder@example.com', outsiderRes);
      const outsiderCookie = `duospend_google_session=${outsiderRes.cookie.mock.calls[0][1]}`;

      const resOutsider = makeMockRes();
      const nextOutsider = vi.fn();
      await requireCoupleAuth(
        {
          method: 'GET',
          baseUrl: '',
          path: '/api/savings-challenges',
          headers: { cookie: outsiderCookie },
          get: () => undefined,
        } as any,
        resOutsider as any,
        nextOutsider
      );
      expect(nextOutsider).not.toHaveBeenCalled();
      expect(resOutsider.statusCode).toBe(403);

      // 4. Partner autorizzato -> next()
      const partnerRes = { cookie: vi.fn() } as any;
      createGoogleSession('partner@example.com', partnerRes);
      const partnerCookie = `duospend_google_session=${partnerRes.cookie.mock.calls[0][1]}`;

      const resPartner = makeMockRes();
      const nextPartner = vi.fn();
      await requireCoupleAuth(
        {
          method: 'GET',
          baseUrl: '',
          path: '/api/savings-challenges',
          headers: { cookie: partnerCookie },
          get: () => undefined,
        } as any,
        resPartner as any,
        nextPartner
      );
      expect(nextPartner).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock('../server/database');
      vi.doUnmock('../server/config');
      vi.resetModules();
    }
  });
});
