import path from 'path';
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
};

let inMemoryDb: ServerDatabase;

vi.mock('../server/database', () => ({
  readDatabase: () => structuredClone(inMemoryDb),
  writeDatabase: (patch: Partial<ServerDatabase>) => {
    inMemoryDb = {
      ...inMemoryDb,
      ...patch,
      lastUpdated: '2026-11-14T18:00:00.000Z',
    };
    return structuredClone(inMemoryDb);
  },
}));

import { saveSynchronizedData } from '../server/services/data.service';
import { HttpError } from '../server/utils/http-error';
import {
  hasPathTraversalOrForbiddenRoute,
  resolveSafeChildPath,
  sanitizeSafeImageUrl,
  stripDangerousKeys,
  validateUploadedImagePayload,
  validateUbuntuSyncTarget,
} from '../server/utils/security';

describe('Sicurezza server, anti-traversal e sanitizzazione POST /api/data', () => {
  beforeEach(() => {
    inMemoryDb = structuredClone(initialMockDb);
  });

  describe('Sanitizzazione dati in POST /api/data (saveSynchronizedData)', () => {
    it('sanitizza XSS, importi, valute, budget per categoria e rimuove nomi legacy', () => {
      const result = saveSynchronizedData(
        {
          expenses: [
            {
              id: 'exp-1',
              title: '<script>alert(1)</script> Cena <b>Sushi</b>',
              amount: 45.678,
              currency: 'eur',
              date: '2026-11-14',
              category: 'Ristoranti e Bar',
              payer: 'user',
              splitType: '50_50',
              source: 'manual',
              receiptUrl: 'https://cdn.example.com/receipt.png',
              notes: 'Nota <img src=x onerror=alert(1)> pulita',
            },
            {
              id: 'exp-bad-url',
              title: 'Con URL malevolo',
              amount: 10,
              receiptUrl: 'https://localhost:3000/api/data',
            },
            {
              id: 'exp-negative',
              title: 'Importo negativo invalido',
              amount: -25,
            },
          ],
          profile: {
            userName: 'Utente 1',
            partnerName: 'Fidanzata',
            monthlyBudget: 3000,
            currency: 'EUR',
            partnerEmail: 'partner@example.com',
            categoryBudgets: {
              Spesa: 450.555,
              Viaggi: -10,
              NonEsistente: 999,
            },
          },
        },
        { isOwner: false }
      );

      expect(result.success).toBe(true);
      expect(inMemoryDb.expenses).toHaveLength(2);
      expect(inMemoryDb.expenses[0]).toMatchObject({
        id: 'exp-1',
        title: 'Cena Sushi',
        amount: 45.68,
        currency: 'EUR',
        receiptUrl: 'https://cdn.example.com/receipt.png',
        notes: 'Nota pulita',
      });
      // L'URL locale verso /api/data deve essere rimosso dal record
      expect(inMemoryDb.expenses[1].receiptUrl).toBeUndefined();

      expect(inMemoryDb.profile.userName).toBe('Partner 1');
      expect(inMemoryDb.profile.partnerName).toBe('Partner 2');
      expect(inMemoryDb.profile.categoryBudgets).toEqual({ Spesa: 450.56 });
    });

    it('impedisce a un non-titolare di cambiare partnerEmail (HTTP 403)', () => {
      expect(() =>
        saveSynchronizedData(
          {
            profile: {
              partnerEmail: 'attacker@example.com',
            },
          },
          { isOwner: false }
        )
      ).toThrowError(HttpError);

      try {
        saveSynchronizedData(
          { profile: { partnerEmail: 'attacker@example.com' } },
          { isOwner: false }
        );
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).status).toBe(403);
      }
    });

    it('consente al titolare di aggiornare partnerEmail ma rifiuta email non valide (HTTP 400)', () => {
      saveSynchronizedData(
        { profile: { partnerEmail: 'nuovo.partner@example.com' } },
        { isOwner: true }
      );
      expect(inMemoryDb.profile.partnerEmail).toBe('nuovo.partner@example.com');

      try {
        saveSynchronizedData({ profile: { partnerEmail: 'not-an-email' } }, { isOwner: true });
        expect.unreachable('Avrebbe dovuto lanciare HttpError 400');
      } catch (err) {
        expect((err as HttpError).status).toBe(400);
      }
    });

    it('deduplica ID ripetuti su spese, pareggi e obiettivi e normalizza customSplitRatio tra 0..1 e 0..100', () => {
      const result = saveSynchronizedData(
        {
          expenses: [
            {
              id: 'exp-ratio-dec',
              title: 'Spesa Decimale',
              amount: 100,
              splitType: 'custom',
              customSplitRatio: 0.65,
            },
            {
              id: 'exp-ratio-pct',
              title: 'Spesa Percentuale v1',
              amount: 50,
              splitType: 'custom',
              customSplitRatio: 65,
            },
            {
              id: 'exp-ratio-pct',
              title: 'Spesa Percentuale v2',
              amount: 80,
              splitType: 'custom',
              customSplitRatio: 75,
            },
          ],
          settlements: [
            { id: 'stl-1', amount: 20, from: 'partner', to: 'user' },
            { id: 'stl-1', amount: 40, from: 'partner', to: 'user', note: 'Aggiornato' },
          ],
          goals: [
            { id: 'goal-1', title: 'Bozza', targetAmount: 1000, currentAmount: 100 },
            { id: 'goal-1', title: 'Finale', targetAmount: 2000, currentAmount: 500 },
          ],
        },
        { isOwner: true }
      );

      expect(result.success).toBe(true);
      expect(inMemoryDb.expenses).toHaveLength(2);
      expect(inMemoryDb.expenses[0]?.customSplitRatio).toBe(0.65);
      expect(inMemoryDb.expenses[1]?.title).toBe('Spesa Percentuale v2');
      expect(inMemoryDb.expenses[1]?.customSplitRatio).toBe(0.75);
      expect(inMemoryDb.settlements).toHaveLength(1);
      expect(inMemoryDb.settlements[0]?.amount).toBe(40);
      expect(inMemoryDb.goals).toHaveLength(1);
      expect(inMemoryDb.goals[0]?.title).toBe('Finale');
    });
  });

  describe('Protezione prototype pollution, path traversal, file upload e SSRF Ubuntu', () => {
    it('rimuove chiavi __proto__, constructor e prototype annidate', () => {
      const raw = JSON.parse(
        '{"safe":"ok","__proto__":{"polluted":true},"nested":{"constructor":{"evil":1}}}'
      );
      const cleaned = stripDangerousKeys(raw) as Record<string, any>;
      expect(cleaned.safe).toBe('ok');
      expect(Object.prototype.hasOwnProperty.call(cleaned, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(cleaned.nested, 'constructor')).toBe(false);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('rileva path traversal codificati e tentativi di accesso a file/directory backend', () => {
      expect(hasPathTraversalOrForbiddenRoute('/api/../../duospend_database.json')).toBe(true);
      expect(hasPathTraversalOrForbiddenRoute('/%2e%2e/%2e%2e/.env')).toBe(true);
      expect(hasPathTraversalOrForbiddenRoute('/assets/%252e%252e/server/config.ts')).toBe(true);
      expect(hasPathTraversalOrForbiddenRoute('/server/routes/dev.ts')).toBe(true);
      expect(hasPathTraversalOrForbiddenRoute('/duospend_database.json')).toBe(true);
      expect(hasPathTraversalOrForbiddenRoute('/duospend.sqlite')).toBe(true);
      expect(hasPathTraversalOrForbiddenRoute('/duospend.sqlite-wal')).toBe(true);
      expect(hasPathTraversalOrForbiddenRoute('/duospend.sqlite-shm')).toBe(true);
      expect(hasPathTraversalOrForbiddenRoute('/api/data?foo=bar%00')).toBe(true);

      // Rotte applicative legittime
      expect(hasPathTraversalOrForbiddenRoute('/api/data')).toBe(false);
      expect(hasPathTraversalOrForbiddenRoute('/assets/photo.png')).toBe(false);
    });

    it('confinamento path con resolveSafeChildPath', () => {
      const root = path.resolve('/tmp/duospend-root');
      expect(resolveSafeChildPath(root, 'assets/goal.png')).toBe(
        path.resolve(root, 'assets/goal.png')
      );
      expect(resolveSafeChildPath(root, '../.env')).toBeNull();
      expect(resolveSafeChildPath(root, '/etc/passwd')).toBeNull();
    });

    it('valida i magic bytes reali dei file immagine caricati e rifiuta file falsi', () => {
      const validPngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]).toString('base64');
      const pngCheck = validateUploadedImagePayload(
        `data:image/png;base64,${validPngHeader}`,
        'image/png'
      );
      expect(pngCheck.valid).toBe(true);
      expect(pngCheck.mimeType).toBe('image/png');

      // HTML camuffato da PNG
      const fakeHtml = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
      const fakeCheck = validateUploadedImagePayload(
        `data:image/png;base64,${fakeHtml}`,
        'image/png'
      );
      expect(fakeCheck.valid).toBe(false);
    });

    it('sanitizza imageUrl bloccando host privati, rotte interne /api e SVG con script', () => {
      expect(sanitizeSafeImageUrl('/src/assets/images/amalfi_honeymoon_goal.jpg')).toBe(
        '/src/assets/images/amalfi_honeymoon_goal.jpg'
      );
      expect(sanitizeSafeImageUrl('https://192.168.1.10/photo.png')).toBeUndefined();
      expect(sanitizeSafeImageUrl('https://169.254.169.254/latest/meta-data')).toBeUndefined();
      expect(sanitizeSafeImageUrl('https://example.com/api/dev/status')).toBeUndefined();

      const evilSvg = Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64');
      expect(sanitizeSafeImageUrl(`data:image/svg+xml;base64,${evilSvg}`)).toBeUndefined();
    });

    it('protegge il target di sincronizzazione Ubuntu da loop SSRF e path traversal', () => {
      expect(validateUbuntuSyncTarget('http://127.0.0.1:3000', 3000).valid).toBe(false);
      expect(validateUbuntuSyncTarget('http://localhost:3000', 3000).valid).toBe(false);
      expect(validateUbuntuSyncTarget('http://169.254.169.254', 3000).valid).toBe(false);
      expect(validateUbuntuSyncTarget('http://ubuntu-home.lan:3001/..', 3000).valid).toBe(false);

      const validUbuntu = validateUbuntuSyncTarget('http://192.168.1.50:3001', 3000);
      expect(validUbuntu).toEqual({
        valid: true,
        targetUrl: 'http://192.168.1.50:3001/api/data',
      });
    });
  });
});
