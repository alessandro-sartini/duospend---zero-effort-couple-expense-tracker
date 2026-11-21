import { randomBytes } from 'crypto';
import { Request, Response } from 'express';

const SESSION_COOKIE = 'duospend_google_session';
const DEFAULT_SESSION_IDLE_MINUTES = 30;
const DEFAULT_SESSION_MAX_HOURS = 4;

function parseClampedEnvNumber(
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function getSessionIdleTimeoutMs(): number {
  const minutes = parseClampedEnvNumber(
    process.env.DUOSPEND_SESSION_IDLE_MINUTES,
    DEFAULT_SESSION_IDLE_MINUTES,
    5,
    240
  );
  return minutes * 60 * 1000;
}

export function getSessionMaxDurationMs(): number {
  const hours = parseClampedEnvNumber(
    process.env.DUOSPEND_SESSION_MAX_HOURS,
    DEFAULT_SESSION_MAX_HOURS,
    1,
    12
  );
  return Math.max(hours * 60 * 60 * 1000, getSessionIdleTimeoutMs());
}

/**
 * Token OAuth 2.0 di Google custoditi SOLO lato server (BFF pattern).
 * Il browser riceve unicamente il cookie di sessione HttpOnly opaco.
 */
export interface GoogleOAuthTokens {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken?: string;
  scope: string;
}

interface GoogleSessionRecord {
  email: string;
  createdAt: number;
  absoluteExpiresAt: number;
  idleExpiresAt: number;
  oauth?: GoogleOAuthTokens;
  refreshInFlight?: Promise<GoogleOAuthTokens | null>;
}

const sessions = new Map<string, GoogleSessionRecord>();

function getCookie(req: Request, name: string): string | undefined {
  return req.headers?.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function getActiveSessionEntry(
  req: Request,
  options?: { touch?: boolean }
): { token: string; record: GoogleSessionRecord } | undefined {
  const token = getCookie(req, SESSION_COOKIE);
  const record = token ? sessions.get(token) : undefined;
  const now = Date.now();
  if (!token || !record || record.absoluteExpiresAt <= now || record.idleExpiresAt <= now) {
    if (token) sessions.delete(token);
    return undefined;
  }
  if (options?.touch !== false) {
    record.idleExpiresAt = Math.min(now + getSessionIdleTimeoutMs(), record.absoluteExpiresAt);
  }
  return { token, record };
}

export function createGoogleSession(
  email: string,
  res: Response,
  oauth?: GoogleOAuthTokens,
  previousReq?: Request
): void {
  // Rotazione dell'ID di sessione a ogni login (protezione da session fixation)
  const previousToken = previousReq ? getCookie(previousReq, SESSION_COOKIE) : undefined;
  if (previousToken) sessions.delete(previousToken);

  const now = Date.now();
  const maxDurationMs = getSessionMaxDurationMs();
  const idleTimeoutMs = getSessionIdleTimeoutMs();
  const absoluteExpiresAt = now + maxDurationMs;
  const idleExpiresAt = Math.min(now + idleTimeoutMs, absoluteExpiresAt);

  const token = randomBytes(32).toString('base64url');
  sessions.set(token, {
    email,
    createdAt: now,
    absoluteExpiresAt,
    idleExpiresAt,
    oauth,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
    maxAge: maxDurationMs,
  });
}

export function getGoogleSession(
  req: Request,
  options?: { touch?: boolean }
): { email: string } | undefined {
  const entry = getActiveSessionEntry(req, options);
  return entry ? { email: entry.record.email } : undefined;
}

export function getGoogleSessionMetadata(
  req: Request,
  options?: { touch?: boolean }
):
  | {
      email: string;
      idleExpiresAt: number;
      absoluteExpiresAt: number;
      idleTimeoutMs: number;
    }
  | undefined {
  const entry = getActiveSessionEntry(req, options);
  if (!entry) return undefined;
  return {
    email: entry.record.email,
    idleExpiresAt: entry.record.idleExpiresAt,
    absoluteExpiresAt: entry.record.absoluteExpiresAt,
    idleTimeoutMs: getSessionIdleTimeoutMs(),
  };
}

export function getGoogleSessionOAuth(
  req: Request,
  options?: { touch?: boolean }
): GoogleOAuthTokens | undefined {
  return getActiveSessionEntry(req, options)?.record.oauth;
}

export function hasGmailScope(oauth: GoogleOAuthTokens | undefined, gmailScope: string): boolean {
  return Boolean(oauth?.scope.split(/\s+/).includes(gmailScope));
}

/**
 * Restituisce un access token Gmail valido per la sessione corrente,
 * rinnovandolo automaticamente lato server tramite refresh token se scaduto.
 */
export async function getValidSessionAccessToken(
  req: Request,
  requiredScope: string,
  refresh: (refreshToken: string) => Promise<GoogleOAuthTokens>
): Promise<string | null> {
  const entry = getActiveSessionEntry(req);
  const oauth = entry?.record.oauth;
  if (!entry || !oauth || !hasGmailScope(oauth, requiredScope)) return null;

  if (oauth.accessTokenExpiresAt - 60_000 > Date.now()) {
    return oauth.accessToken;
  }
  if (!oauth.refreshToken) return null;

  const { record } = entry;
  if (!record.refreshInFlight) {
    const refreshToken = oauth.refreshToken;
    record.refreshInFlight = refresh(refreshToken)
      .then((renewed) => {
        record.oauth = {
          ...renewed,
          refreshToken: renewed.refreshToken || refreshToken,
          scope: renewed.scope || oauth.scope,
        };
        return record.oauth;
      })
      .catch((error) => {
        console.warn('Rinnovo token Google lato server non riuscito:', error);
        record.oauth = undefined;
        return null;
      })
      .finally(() => {
        record.refreshInFlight = undefined;
      });
  }

  const renewed = await record.refreshInFlight;
  return renewed?.accessToken ?? null;
}

export function revokeGoogleSession(req: Request, res: Response): GoogleOAuthTokens | undefined {
  const token = getCookie(req, SESSION_COOKIE);
  const oauth = token ? sessions.get(token)?.oauth : undefined;
  if (token) sessions.delete(token);
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
  });
  return oauth;
}

export function resetGoogleSessionsForTests(): void {
  sessions.clear();
}

export function pruneExpiredGoogleSessions(): number {
  const now = Date.now();
  let removed = 0;
  for (const [token, record] of sessions.entries()) {
    if (record.absoluteExpiresAt <= now || record.idleExpiresAt <= now) {
      sessions.delete(token);
      removed += 1;
    }
  }
  return removed;
}
