import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSqliteDatabase,
  getInitialDatabase,
  type SqliteDatabaseHandle,
} from '../server/database';

describe('Persistenza SQLite (node:sqlite) e migrazione automatica da JSON', () => {
  const handlesToClose: SqliteDatabaseHandle[] = [];
  const tempDirs: string[] = [];

  const trackHandle = (handle: SqliteDatabaseHandle): SqliteDatabaseHandle => {
    handlesToClose.push(handle);
    return handle;
  };

  const createTempDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duospend-sqlite-test-'));
    tempDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    while (handlesToClose.length > 0) {
      const handle = handlesToClose.pop();
      try {
        handle?.close();
      } catch {
        // Ignora errori se già chiuso nel test
      }
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('inizializza un database SQLite :memory: con i dati predefiniti', () => {
    const db = trackHandle(createSqliteDatabase({ dbFile: ':memory:' }));
    const snapshot = db.readDatabase();
    const initial = getInitialDatabase();

    expect(snapshot.expenses).toHaveLength(initial.expenses.length);
    expect(snapshot.expenses[0]?.id).toBe('exp-1');
    expect(snapshot.expenses[0]?.items).toHaveLength(5);
    expect(snapshot.expenses[0]?.tax).toBe(14.2);
    expect(snapshot.settlements).toHaveLength(initial.settlements.length);
    expect(snapshot.goals).toHaveLength(initial.goals.length);
    expect(snapshot.profile.userName).toBe('Partner 1');
    expect(snapshot.profile.partnerName).toBe('Partner 2');
    expect(snapshot.profile.monthlyBudget).toBe(2800);
    expect(snapshot.gmailScanCache).toBeUndefined();
  });

  it('migra automaticamente un file legacy duospend_database.json in SQLite su disco ripulendo i campi deprecati', () => {
    const tempDir = createTempDir();
    const sqliteFile = path.join(tempDir, 'duospend.sqlite');
    const legacyJsonFile = path.join(tempDir, 'duospend_database.json');

    const legacyPayload = {
      expenses: [
        {
          id: 'exp-7',
          title: 'Decathlon Abbigliamento Running (Utente 1)',
          amount: 45,
          currency: 'EUR',
          date: '2026-10-25',
          category: 'Salute e Benessere',
          payer: 'user',
          splitType: '100_user',
          source: 'manual',
          notes: 'Acquisto personale',
        },
      ],
      settlements: [
        {
          id: 'stl-legacy',
          date: '2026-11-01',
          amount: 55,
          currency: 'EUR',
          from: 'partner',
          to: 'user',
          note: 'Saldo migrato',
        },
      ],
      goals: [
        {
          id: 'goal-legacy',
          title: 'Fondo Casa',
          targetAmount: 5000,
          currentAmount: 1200,
        },
      ],
      profile: {
        userName: 'Utente 1',
        partnerName: 'Fidanzata',
        monthlyBudget: 3100,
        currency: 'EUR',
        userEmail: 'owner@example.com',
        partnerEmail: 'partner@example.com',
        categoryBudgets: {
          Spesa: 500,
          'Ristoranti e Bar': 300,
        },
        securityPin: '1234',
        webhookSecret: 'super-secret',
      },
      gmailScanCache: [
        {
          accountEmail: 'owner@example.com',
          messageId: 'msg-1',
          scannedAt: '2026-11-10T10:00:00.000Z',
          suppressedLowConfidence: true,
        },
      ],
      lastUpdated: '2026-11-10T12:00:00.000Z',
    };

    fs.writeFileSync(legacyJsonFile, JSON.stringify(legacyPayload, null, 2), 'utf-8');

    const db = trackHandle(
      createSqliteDatabase({ dbFile: sqliteFile, legacyJsonFile })
    );
    const migrated = db.readDatabase();

    expect(fs.existsSync(sqliteFile)).toBe(true);
    expect(migrated.profile.userName).toBe('Partner 1');
    expect(migrated.profile.partnerName).toBe('Partner 2');
    expect(migrated.profile.monthlyBudget).toBe(3100);
    expect(migrated.profile.categoryBudgets).toEqual({
      Spesa: 500,
      'Ristoranti e Bar': 300,
    });
    expect(Object.prototype.hasOwnProperty.call(migrated.profile, 'securityPin')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(migrated.profile, 'webhookSecret')).toBe(false);
    expect(migrated.expenses).toHaveLength(1);
    expect(migrated.expenses[0]?.title).toBe('Decathlon Abbigliamento Running (Personale)');
    expect(migrated.settlements).toHaveLength(1);
    expect(migrated.goals).toHaveLength(1);
    expect(migrated.gmailScanCache).toEqual([
      {
        accountEmail: 'owner@example.com',
        messageId: 'msg-1',
        scannedAt: '2026-11-10T10:00:00.000Z',
        suppressedLowConfidence: true,
      },
    ]);

    // Una riapertura successiva non deve sovrascrivere i dati SQLite già presenti con il vecchio JSON
    db.writeDatabase({
      profile: {
        ...migrated.profile,
        monthlyBudget: 3500,
      },
    });
    db.close();

    const reopened = trackHandle(
      createSqliteDatabase({ dbFile: sqliteFile, legacyJsonFile })
    );
    expect(reopened.readDatabase().profile.monthlyBudget).toBe(3500);
  });

  it('supporta aggiornamenti transazionali parziali con writeDatabase preservando relazioni e campi complessi', () => {
    const db = trackHandle(createSqliteDatabase({ dbFile: ':memory:' }));
    const initial = db.readDatabase();

    const afterExpensesAndProfile = db.writeDatabase({
      expenses: [
        {
          id: 'exp-custom',
          title: 'Supermercato Bio',
          amount: 120.5,
          currency: 'EUR',
          date: '2026-11-12',
          category: 'Spesa',
          payer: 'partner',
          splitType: 'custom',
          customSplitRatio: 0.65,
          source: 'camera',
          sourceReference: 'ocr-123',
          notes: 'Divisione 65/35',
          receiptUrl: 'data:image/png;base64,iVBORw0KGgo=',
          items: [
            { name: 'Frutta', price: 40.5 },
            { name: 'Dispensa', price: 80.0 },
          ],
          tax: 10.25,
        },
      ],
      settlements: [
        {
          id: 'stl-new',
          date: '2026-11-12',
          amount: 60,
          currency: 'EUR',
          from: 'user',
          to: 'partner',
          note: 'Bonifico istantaneo',
        },
      ],
      goals: [
        {
          id: 'goal-new',
          title: 'Viaggio Giappone',
          targetAmount: 7000,
          currentAmount: 2500,
          targetDate: '2027-09-01',
          imageUrl: '/src/assets/images/amalfi_honeymoon_goal_1794425601686.jpg',
          imageResolution: '1K',
        },
      ],
      profile: {
        ...initial.profile,
        monthlyBudget: 4200,
        categoryBudgets: {
          Spesa: 650,
          Viaggi: 900,
        },
      },
      gmailScanCache: [
        {
          accountEmail: 'owner@example.com',
          messageId: 'gmail-msg-42',
          scannedAt: '2026-11-12T08:30:00.000Z',
          receipt: { merchant: 'Supermercato Bio', amount: 120.5 },
          reviewCandidate: { confidence: 0.92 },
        },
      ],
    });

    expect(afterExpensesAndProfile.expenses).toEqual([
      {
        id: 'exp-custom',
        title: 'Supermercato Bio',
        amount: 120.5,
        currency: 'EUR',
        date: '2026-11-12',
        category: 'Spesa',
        payer: 'partner',
        splitType: 'custom',
        customSplitRatio: 0.65,
        source: 'camera',
        sourceReference: 'ocr-123',
        notes: 'Divisione 65/35',
        receiptUrl: 'data:image/png;base64,iVBORw0KGgo=',
        items: [
          { name: 'Frutta', price: 40.5 },
          { name: 'Dispensa', price: 80.0 },
        ],
        tax: 10.25,
      },
    ]);
    expect(afterExpensesAndProfile.profile.categoryBudgets).toEqual({
      Spesa: 650,
      Viaggi: 900,
    });
    expect(afterExpensesAndProfile.gmailScanCache).toHaveLength(1);

    // Un patch parziale su settlements non deve intaccare expenses, goals, profile o gmailScanCache
    const afterPartialSettlements = db.writeDatabase({
      settlements: [],
    });
    expect(afterPartialSettlements.settlements).toEqual([]);
    expect(afterPartialSettlements.expenses).toHaveLength(1);
    expect(afterPartialSettlements.goals).toHaveLength(1);
    expect(afterPartialSettlements.profile.monthlyBudget).toBe(4200);
    expect(afterPartialSettlements.gmailScanCache).toHaveLength(1);
  });

  it('inserisce e aggiorna singole spese atomicamente in testa tramite insertExpenseRecord', () => {
    const db = trackHandle(createSqliteDatabase({ dbFile: ':memory:' }));
    const initialCount = db.readDatabase().expenses.length;

    db.insertExpenseRecord({
      id: 'exp-notif-1',
      title: 'Farmacia Centrale',
      amount: 12.5,
      currency: 'EUR',
      date: '2026-11-14',
      category: 'Salute e Benessere',
      payer: 'user',
      splitType: '50_50',
      source: 'notification',
      notes: 'Notifica Revolut',
    });

    const afterInsert = db.readDatabase();
    expect(afterInsert.expenses).toHaveLength(initialCount + 1);
    expect(afterInsert.expenses[0]?.id).toBe('exp-notif-1');
    expect(afterInsert.expenses[0]?.amount).toBe(12.5);

    // Upsert sullo stesso ID mantiene posizione e non duplica righe
    db.insertExpenseRecord({
      id: 'exp-notif-1',
      title: 'Farmacia Centrale Aggiornata',
      amount: 18.75,
      currency: 'EUR',
      date: '2026-11-14',
      category: 'Salute e Benessere',
      payer: 'user',
      splitType: '50_50',
      source: 'notification',
      notes: 'Importo corretto',
    });

    const afterUpsert = db.readDatabase();
    expect(afterUpsert.expenses).toHaveLength(initialCount + 1);
    expect(afterUpsert.expenses[0]?.title).toBe('Farmacia Centrale Aggiornata');
    expect(afterUpsert.expenses[0]?.amount).toBe(18.75);
  });

  it('ripristina completamente i dati iniziali con resetDatabase', () => {
    const db = trackHandle(createSqliteDatabase({ dbFile: ':memory:' }));
    const initial = getInitialDatabase();

    db.writeDatabase({
      expenses: [],
      settlements: [],
      goals: [],
      profile: {
        ...initial.profile,
        monthlyBudget: 9999,
        userName: 'Modificato',
      },
      gmailScanCache: [
        {
          accountEmail: 'owner@example.com',
          messageId: 'cache-to-clear',
          scannedAt: '2026-11-14T10:00:00.000Z',
        },
      ],
    });

    const reset = db.resetDatabase();
    expect(reset.expenses).toHaveLength(initial.expenses.length);
    expect(reset.settlements).toHaveLength(initial.settlements.length);
    expect(reset.goals).toHaveLength(initial.goals.length);
    expect(reset.profile.monthlyBudget).toBe(2800);
    expect(reset.profile.userName).toBe('Partner 1');
    expect(reset.gmailScanCache).toBeUndefined();
  });

  it('gestisce senza errori ID duplicati in settlements e goals tramite upsert (ON CONFLICT)', () => {
    const db = trackHandle(createSqliteDatabase({ dbFile: ':memory:' }));

    const result = db.writeDatabase({
      settlements: [
        {
          id: 'stl-dup',
          date: '2026-11-10',
          amount: 50,
          currency: 'EUR',
          from: 'partner',
          to: 'user',
          note: 'Prima versione',
        },
        {
          id: 'stl-dup',
          date: '2026-11-14',
          amount: 75,
          currency: 'EUR',
          from: 'partner',
          to: 'user',
          note: 'Versione aggiornata',
        },
      ],
      goals: [
        {
          id: 'goal-dup',
          title: 'Vacanza Bozza',
          targetAmount: 2000,
          currentAmount: 100,
        },
        {
          id: 'goal-dup',
          title: 'Vacanza Finale',
          targetAmount: 2500,
          currentAmount: 500,
        },
      ],
    });

    expect(result.settlements).toHaveLength(1);
    expect(result.settlements[0]?.amount).toBe(75);
    expect(result.settlements[0]?.note).toBe('Versione aggiornata');
    expect(result.goals).toHaveLength(1);
    expect(result.goals[0]?.title).toBe('Vacanza Finale');
    expect(result.goals[0]?.targetAmount).toBe(2500);
  });

  it('sanitizza JSON legacy corrotto o malevolo rimuovendo __proto__, tipi invalidi e gmailScanCache non valida', () => {
    const tempDir = createTempDir();
    const sqliteFile = path.join(tempDir, 'duospend-hardened.sqlite');
    const legacyJsonFile = path.join(tempDir, 'duospend_database.json');

    const maliciousJson = JSON.stringify({
      expenses: [
        null,
        { id: 'bad-neg', title: 'Negativa', amount: -20 },
        {
          id: 'ok-1',
          title: '<script>alert(1)</script> Spesa Sicura',
          amount: 33.339,
          currency: 'eur',
          splitType: 'custom',
          customSplitRatio: 70,
          receiptUrl: 'https://192.168.1.10/private.png',
        },
      ],
      settlements: [null, { id: 'stl-zero', amount: 0 }],
      goals: [{ id: 'goal-bad', targetAmount: -100 }],
      profile: {
        userName: '<b>Hacker</b>',
        monthlyBudget: 'non-numerico',
        userEmail: 'owner@example.com',
      },
      gmailScanCache: [
        null,
        { accountEmail: 'not-an-email', messageId: 'msg-x', scannedAt: '2026-11-10T00:00:00Z' },
        { accountEmail: 'owner@example.com', messageId: '../traversal', scannedAt: '2026-11-10T00:00:00Z' },
        {
          accountEmail: 'OWNER@example.com',
          messageId: 'valid-msg_1',
          scannedAt: 'invalid-date',
          receipt: { merchant: 'Conad', extraLargeBlob: 'x'.repeat(35_000) },
          reviewCandidate: { confidence: 0.85 },
        },
      ],
      lastUpdated: 'non-iso',
    }).replace('"id":"ok-1"', '"id":"ok-1","__proto__":{"polluted":true}');

    fs.writeFileSync(legacyJsonFile, maliciousJson, 'utf-8');

    const db = trackHandle(createSqliteDatabase({ dbFile: sqliteFile, legacyJsonFile }));
    const migrated = db.readDatabase();

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(migrated.expenses).toHaveLength(1);
    expect(migrated.expenses[0]).toMatchObject({
      id: 'ok-1',
      title: 'Spesa Sicura',
      amount: 33.34,
      currency: 'EUR',
      customSplitRatio: 0.7,
    });
    expect(migrated.expenses[0]?.receiptUrl).toBeUndefined();
    expect(migrated.settlements).toEqual([]);
    expect(migrated.goals).toEqual([]);
    expect(migrated.profile.userName).toBe('Hacker');
    expect(migrated.profile.monthlyBudget).toBe(2800);
    expect(migrated.profile.userEmail).toBe('owner@example.com');
    expect(migrated.gmailScanCache).toHaveLength(1);
    expect(migrated.gmailScanCache?.[0]?.accountEmail).toBe('owner@example.com');
    expect(migrated.gmailScanCache?.[0]?.messageId).toBe('valid-msg_1');
    expect(migrated.gmailScanCache?.[0]?.receipt).toBeUndefined();
    expect(migrated.gmailScanCache?.[0]?.reviewCandidate).toEqual({ confidence: 0.85 });
  });

  it('salva e filtra correttamente i modelli AI attivi e dismessi in ai_model_registry (con scadenza TTL)', () => {
    const db = trackHandle(createSqliteDatabase({ dbFile: ':memory:' }));
    const now = Date.now();

    db.upsertAiModelRegistry([
      {
        modelId: 'gemini-3.8-flash',
        kind: 'text',
        status: 'active',
        expiresAt: now + 60_000,
        updatedAt: new Date(now).toISOString(),
      },
      {
        modelId: 'gemini-2.5-flash',
        kind: 'text',
        status: 'deprecated',
        replacementModel: 'gemini-3.8-flash',
        expiresAt: now + 60_000,
        updatedAt: new Date(now).toISOString(),
      },
      {
        modelId: 'gemini-expired-model',
        kind: 'text',
        status: 'deprecated',
        expiresAt: now - 10_000,
        updatedAt: new Date(now - 10_000).toISOString(),
      },
    ]);

    const entries = db.readAiModelRegistry();
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.modelId === 'gemini-3.8-flash')).toMatchObject({
      kind: 'text',
      status: 'active',
    });
    expect(entries.find((e) => e.modelId === 'gemini-2.5-flash')).toMatchObject({
      status: 'deprecated',
      replacementModel: 'gemini-3.8-flash',
    });
    expect(entries.some((e) => e.modelId === 'gemini-expired-model')).toBe(false);
  });
});
