import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(PROJECT_ROOT, '.env.production.local'), override: true });
} else {
  dotenv.config({ path: path.join(PROJECT_ROOT, '.env.development.local'), override: true });
}

const LEGACY_ROOT_SQLITE_DB_FILE = path.join(PROJECT_ROOT, 'duospend.sqlite');
const DEFAULT_DATA_SQLITE_DB_FILE = path.join(PROJECT_ROOT, 'data', 'duospend.sqlite');
const DEFAULT_SQLITE_DB_FILE = fs.existsSync(LEGACY_ROOT_SQLITE_DB_FILE)
  ? LEGACY_ROOT_SQLITE_DB_FILE
  : DEFAULT_DATA_SQLITE_DB_FILE;

function resolveSafeSqliteFilePath(envPath: string | undefined): string {
  if (!envPath || typeof envPath !== 'string' || envPath.includes('\0')) {
    return DEFAULT_SQLITE_DB_FILE;
  }
  const trimmed = envPath.trim();
  if (!trimmed) {
    return DEFAULT_SQLITE_DB_FILE;
  }
  const resolved = path.resolve(trimmed);
  if (!/\.(?:sqlite|db)$/i.test(resolved)) {
    console.warn('DB_PATH/DUOSPEND_DB_FILE non valido (richiesta estensione .sqlite o .db); uso percorso predefinito.');
    return DEFAULT_SQLITE_DB_FILE;
  }
  return resolved;
}

export const PORT = Number(process.env.PORT || 3000);
// In produzione (es. dentro Docker) ascolta su 0.0.0.0 così il port binding host (127.0.0.1:3000:3000) può inoltrare il traffico.
// In sviluppo ascolta solo su loopback 127.0.0.1.
export const HOST = (
  process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')
).trim();
// Email Google del titolare: se impostata, solo questo account può "rivendicare" un database vuoto.
export const OWNER_EMAIL = (process.env.DUOSPEND_OWNER_EMAIL || '').toLowerCase().trim();
export const SQLITE_DB_FILE = resolveSafeSqliteFilePath(
  process.env.DB_PATH || process.env.DUOSPEND_DB_FILE
);
export const LEGACY_JSON_DB_FILE = path.join(PROJECT_ROOT, 'duospend_database.json');
export const DB_FILE = SQLITE_DB_FILE;
export const DEVELOPER_PASSWORD = process.env.DUOSPEND_DEV_PASSWORD;
export function getDeveloperPassword(): string {
  return (process.env.DUOSPEND_DEV_PASSWORD || '').trim();
}
export function isDeveloperConsoleEnabled(): boolean {
  const password = getDeveloperPassword();
  return Boolean(password) && !/^replace[-_]with/i.test(password);
}
export const WEBHOOK_SECRET = process.env.DUOSPEND_WEBHOOK_SECRET;
export const UBUNTU_SERVER_URL = process.env.DUOSPEND_UBUNTU_SERVER_URL;
export const UBUNTU_SERVER_TOKEN = process.env.DUOSPEND_UBUNTU_TOKEN;
