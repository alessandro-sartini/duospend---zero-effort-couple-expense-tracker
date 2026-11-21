import fs from 'fs';
import path from 'path';
import {
  DB_FILE,
  isDeveloperConsoleEnabled,
  PORT,
  UBUNTU_SERVER_TOKEN,
  UBUNTU_SERVER_URL,
} from '../config';
import * as databaseModule from '../database';
import { readDatabase, resetDatabase, writeDatabase } from '../database';
import { HttpError } from '../utils/http-error';
import { validateUbuntuSyncTarget } from '../utils/security';

function getFileSizeSafe(filePath: string): number {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}

export function getDeveloperStatus() {
  const dbSizeBytes = getFileSizeSafe(DB_FILE) + getFileSizeSafe(`${DB_FILE}-wal`);
  const db = readDatabase();
  const getHandle = (databaseModule as { getDefaultDatabaseHandle?: typeof databaseModule.getDefaultDatabaseHandle })
    .getDefaultDatabaseHandle;
  const savingsChallengesCount =
    typeof getHandle === 'function'
      ? getHandle().exportSavingsChallengesBackup().challenges.length
      : db.savingsChallengesBackup?.challenges.length ?? 0;

  return {
    success: true,
    status: 'online',
    engine: 'SQLite (WAL)',
    dbPath: path.basename(DB_FILE),
    dbSizeBytes,
    recordCount: {
      expenses: db.expenses.length,
      settlements: db.settlements.length,
      goals: db.goals.length,
      savingsChallenges: savingsChallengesCount,
    },
    lastUpdated: db.lastUpdated,
    serverUptimeSec: Math.floor(process.uptime()),
    nodeVersion: process.version,
    platform: process.platform,
    developerPasswordConfigured: isDeveloperConsoleEnabled(),
  };
}

export function resetDatabaseWithMode(mode: 'empty' | 'demo' = 'demo') {
  const currentProfile = readDatabase().profile;

  if (mode === 'empty') {
    writeDatabase({
      expenses: [],
      settlements: [],
      goals: [],
      trips: [],
      recurringExpenses: [],
      gmailScanCache: [],
      savingsChallengesBackup: {
        challenges: [],
        categories: [],
        periods: [],
        contributions: [],
        history: [],
      },
      profile: currentProfile,
    });
    return {
      success: true,
      mode: 'empty' as const,
      message: 'Database svuotato con successo. Profilo ed email autorizzate conservati.',
    };
  }

  const reset = resetDatabase();
  const preservedUserEmail = currentProfile.userEmail || reset.profile.userEmail;
  const preservedPartnerEmail = currentProfile.partnerEmail || reset.profile.partnerEmail;
  if (
    preservedUserEmail !== reset.profile.userEmail ||
    preservedPartnerEmail !== reset.profile.partnerEmail
  ) {
    writeDatabase({
      profile: {
        ...reset.profile,
        userEmail: preservedUserEmail,
        partnerEmail: preservedPartnerEmail,
      },
    });
  }

  return {
    success: true,
    mode: 'demo' as const,
    message: 'Database ripristinato con successo allo stato iniziale demo (email autorizzate conservate).',
  };
}

export function resetDatabaseToInitial() {
  return resetDatabaseWithMode('demo');
}

export async function syncDatabaseToUbuntuServer() {
  if (!UBUNTU_SERVER_URL || !UBUNTU_SERVER_TOKEN) {
    throw new HttpError(503, 'Sincronizzazione Ubuntu non configurata sul server.');
  }

  const targetValidation = validateUbuntuSyncTarget(UBUNTU_SERVER_URL, PORT);
  if (!targetValidation.valid || !targetValidation.targetUrl) {
    throw new HttpError(500, targetValidation.error || 'URL Ubuntu configurato non valido.');
  }

  const currentDb = readDatabase();
  const remoteRes = await fetch(targetValidation.targetUrl, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: {
      'Content-Type': 'application/json',
      'x-duospend-secret': UBUNTU_SERVER_TOKEN,
    },
    body: JSON.stringify(currentDb),
  });

  if (!remoteRes.ok) {
    const errText = await remoteRes.text();
    throw new HttpError(
      502,
      `Risposta dal server Ubuntu (${remoteRes.status}): ${errText}`
    );
  }

  const data = await remoteRes.json();
  return {
    success: true,
    message: 'Sincronizzazione con il server Ubuntu avvenuta con successo!',
    remoteResult: data,
  };
}
