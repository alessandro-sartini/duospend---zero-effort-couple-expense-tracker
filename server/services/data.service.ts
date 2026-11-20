import { readDatabase, ServerDatabase, writeDatabase } from '../database';
import { HttpError } from '../utils/http-error';
import {
  sanitizeExpenseRecord,
  sanitizeGoalRecord,
  sanitizeProfileRecord,
  sanitizeSettlementRecord,
} from '../utils/security';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

export interface SaveSynchronizedDataInput {
  expenses?: unknown;
  settlements?: unknown;
  goals?: unknown;
  profile?: unknown;
}

export function getSynchronizedData() {
  const db = readDatabase();
  return {
    success: true,
    expenses: db.expenses || [],
    settlements: db.settlements || [],
    goals: db.goals || [],
    profile: db.profile,
    lastUpdated: db.lastUpdated,
  };
}

export function saveSynchronizedData(
  payload: SaveSynchronizedDataInput,
  options: { isOwner: boolean }
) {
  const { expenses, settlements, goals, profile } = payload ?? {};
  const patch: Partial<ServerDatabase> = {};

  if (expenses !== undefined) {
    if (!Array.isArray(expenses) || expenses.length > 10_000) {
      throw new HttpError(400, 'Elenco spese non valido.');
    }
    const sanitizedExpenses = expenses
      .map(sanitizeExpenseRecord)
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (expenses.length > 0 && sanitizedExpenses.length === 0) {
      throw new HttpError(400, 'Formato delle spese non valido.');
    }
    patch.expenses = deduplicateById(sanitizedExpenses);
  }

  if (settlements !== undefined) {
    if (!Array.isArray(settlements) || settlements.length > 10_000) {
      throw new HttpError(400, 'Elenco pareggi non valido.');
    }
    const sanitizedSettlements = settlements
      .map(sanitizeSettlementRecord)
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (settlements.length > 0 && sanitizedSettlements.length === 0) {
      throw new HttpError(400, 'Formato dei pareggi non valido.');
    }
    patch.settlements = deduplicateById(sanitizedSettlements);
  }

  if (goals !== undefined) {
    if (!Array.isArray(goals) || goals.length > 1_000) {
      throw new HttpError(400, 'Elenco obiettivi non valido.');
    }
    const sanitizedGoals = goals
      .map(sanitizeGoalRecord)
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (goals.length > 0 && sanitizedGoals.length === 0) {
      throw new HttpError(400, 'Formato degli obiettivi non valido.');
    }
    patch.goals = deduplicateById(sanitizedGoals);
  }

  if (profile !== undefined) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new HttpError(400, 'Profilo non valido.');
    }
    const profileRecord = profile as Record<string, unknown>;
    const currentProfile = readDatabase().profile;
    const partnerEmail =
      typeof profileRecord.partnerEmail === 'string'
        ? profileRecord.partnerEmail.slice(0, 254).toLowerCase().trim()
        : currentProfile.partnerEmail || '';
    if (partnerEmail && !EMAIL_PATTERN.test(partnerEmail)) {
      throw new HttpError(400, 'Formato email del partner non valido.');
    }
    if (!options.isOwner && partnerEmail !== (currentProfile.partnerEmail || '').toLowerCase().trim()) {
      throw new HttpError(403, 'Solo il titolare può modificare l’account partner autorizzato.');
    }
    patch.profile = sanitizeProfileRecord(profileRecord, currentProfile, partnerEmail);
  }

  const updated = writeDatabase(patch);
  return {
    success: true,
    lastUpdated: updated.lastUpdated,
    count: {
      expenses: updated.expenses.length,
      settlements: updated.settlements.length,
      goals: updated.goals.length,
    },
  };
}
