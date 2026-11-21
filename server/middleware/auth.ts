import { NextFunction, Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import {
  getDeveloperPassword,
  isDeveloperConsoleEnabled,
  WEBHOOK_SECRET,
} from '../config';
import { readDatabase } from '../database';
import { getGoogleSession } from '../services/google-auth';

declare global {
  namespace Express {
    interface Request {
      googleUser?: { email: string };
    }
  }
}

const sessions = new Map<string, number>();
const DEV_SESSION_DURATION_MS = 15 * 60 * 1000;
const MAX_DEV_SESSIONS = 50;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function getAllowedProfileEmails(): string[] {
  const profile = readDatabase().profile;
  return [profile.userEmail, profile.partnerEmail]
    .filter((email): email is string => typeof email === 'string' && email.length > 0)
    .map((email) => email.toLowerCase().trim());
}

export function hasAuthenticatedGoogleCoupleSession(req: Request): boolean {
  const user = getGoogleSession(req);
  if (!user) return false;

  const allowedEmails = getAllowedProfileEmails();
  if (allowedEmails.length > 0 && !allowedEmails.includes(user.email.toLowerCase().trim())) {
    return false;
  }

  req.googleUser = user;
  return true;
}

export async function requireCoupleAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (process.env.NODE_ENV !== 'production' && hasDeveloperSession(req)) {
    return next();
  }

  const routePath =
    `${req.baseUrl || ''}${req.path || ''}` || req.originalUrl?.split('?')[0] || '';
  if (
    req.method === 'POST' &&
    routePath === '/api/data' &&
    hasValidWebhookSecret(req.get('x-duospend-secret'))
  ) {
    return next();
  }

  const user = getGoogleSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Autenticazione richiesta.' });
  }

  try {
    const allowedEmails = getAllowedProfileEmails();
    if (allowedEmails.length > 0 && !allowedEmails.includes(user.email.toLowerCase().trim())) {
      return res.status(403).json({ error: 'Account Google non autorizzato per questa coppia.' });
    }
  } catch (error) {
    console.error('Authorization lookup failed:', error);
    return res.status(503).json({ error: 'Verifica accesso temporaneamente non disponibile.' });
  }

  req.googleUser = user;
  return next();
}

export function hasValidWebhookSecret(providedSecret: unknown): boolean {
  return Boolean(
    WEBHOOK_SECRET &&
      typeof providedSecret === 'string' &&
      providedSecret.length > 0 &&
      safeEqual(providedSecret, WEBHOOK_SECRET)
  );
}

export async function requireNotificationAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (process.env.NODE_ENV !== 'production' && hasDeveloperSession(req)) {
    return next();
  }

  const user = getGoogleSession(req);
  if (user) {
    try {
      const allowedEmails = getAllowedProfileEmails();
      if (allowedEmails.length === 0 || allowedEmails.includes(user.email.toLowerCase().trim())) {
        req.googleUser = user;
        return next();
      }
    } catch (error) {
      console.error('Notification authorization lookup failed:', error);
      return res.status(503).json({ error: 'Verifica accesso temporaneamente non disponibile.' });
    }
  }

  if (hasValidWebhookSecret(req.get('x-duospend-secret'))) {
    return next();
  }

  if (!WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Webhook disabilitato: segreto server non configurato.' });
  }
  return res.status(401).json({ error: 'Autenticazione richiesta.' });
}

export function resetDeveloperSessionsForTests(): void {
  sessions.clear();
}

export function pruneExpiredDeveloperSessions(): number {
  const now = Date.now();
  let removed = 0;
  for (const [token, expiresAt] of sessions.entries()) {
    if (expiresAt <= now) {
      sessions.delete(token);
      removed += 1;
    }
  }
  return removed;
}

export function issueDeveloperSession(password: unknown, res: Response, req?: Request): boolean {
  const configuredPassword = getDeveloperPassword();
  if (!isDeveloperConsoleEnabled() || typeof password !== 'string' || !safeEqual(password, configuredPassword)) {
    return false;
  }

  const previousToken = req ? getDeveloperSessionToken(req) : undefined;
  if (previousToken) sessions.delete(previousToken);

  pruneExpiredDeveloperSessions();
  while (sessions.size >= MAX_DEV_SESSIONS) {
    const oldestToken = sessions.keys().next().value;
    if (!oldestToken) break;
    sessions.delete(oldestToken);
  }

  const isSecure =
    process.env.NODE_ENV === 'production' ||
    Boolean(req?.secure) ||
    req?.get?.('x-forwarded-proto')?.split(',')[0]?.trim() === 'https';

  const token = randomBytes(32).toString('base64url');
  sessions.set(token, Date.now() + DEV_SESSION_DURATION_MS);
  res.cookie('duospend_dev_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecure,
    path: '/api',
    maxAge: DEV_SESSION_DURATION_MS,
  });
  return true;
}

function getDeveloperSessionToken(req: Request): string | undefined {
  const token = req.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('duospend_dev_session='))
    ?.slice('duospend_dev_session='.length);
  return token || undefined;
}

export function hasDeveloperSession(req: Request): boolean {
  const token = getDeveloperSessionToken(req);
  const expiresAt = token ? sessions.get(token) : undefined;
  if (!token || !expiresAt || expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return false;
  }
  return true;
}

export function requireDeveloperConsoleAccess(req: Request, res: Response, next: NextFunction) {
  if (!isDeveloperConsoleEnabled()) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Endpoint API non trovato.' });
    }
    return res
      .status(503)
      .json({ error: 'Imposta DUOSPEND_DEV_PASSWORD nel file .env per usare la console sviluppatore.' });
  }

  if (process.env.NODE_ENV === 'production') {
    try {
      if (!hasAuthenticatedGoogleCoupleSession(req)) {
        return res
          .status(401)
          .json({ error: 'Autenticazione Google richiesta per accedere al menu sviluppatore.' });
      }
    } catch (error) {
      console.error('Developer Google session lookup failed:', error);
      return res.status(503).json({ error: 'Verifica accesso temporaneamente non disponibile.' });
    }
  }

  return next();
}

export function requireDeveloperSession(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'production') {
    if (!isDeveloperConsoleEnabled()) {
      return res.status(404).json({ error: 'Endpoint API non trovato.' });
    }
    try {
      if (hasAuthenticatedGoogleCoupleSession(req) && hasDeveloperSession(req)) {
        return next();
      }
    } catch (error) {
      console.error('Developer Google session lookup failed:', error);
      return res.status(503).json({ error: 'Verifica accesso temporaneamente non disponibile.' });
    }
  } else {
    if (hasDeveloperSession(req)) {
      return next();
    }
    if (!isDeveloperConsoleEnabled()) {
      try {
        if (hasAuthenticatedGoogleCoupleSession(req)) {
          return next();
        }
      } catch (error) {
        console.error('Developer Google session lookup failed:', error);
      }
    }
  }

  res.clearCookie('duospend_dev_session', { path: '/api', sameSite: 'strict' });
  return res.status(401).json({ error: 'Sessione sviluppatore scaduta o non valida.' });
}

export function revokeDeveloperSession(req: Request, res: Response) {
  const token = getDeveloperSessionToken(req);
  if (token) sessions.delete(token);
  res.clearCookie('duospend_dev_session', { path: '/api', sameSite: 'strict' });
  return res.json({ success: true });
}
