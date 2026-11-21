import type { Request, Response } from 'express';
import { isDeveloperConsoleEnabled } from '../config';
import { readDatabase, writeDatabase } from '../database';
import { hasDeveloperSession } from '../middleware/auth';
import {
  createGoogleSession,
  getGoogleSession,
  getGoogleSessionMetadata,
  getGoogleSessionOAuth,
  hasGmailScope,
  revokeGoogleSession,
  type GoogleOAuthTokens,
} from './google-auth';
import {
  GMAIL_READONLY_SCOPE,
  exchangeGoogleAuthorizationCode,
  getGoogleOAuthClientConfig,
  revokeGoogleToken,
} from './google-oauth';
import { HttpError } from '../utils/http-error';

async function verifyGoogleIdentity(accessToken: unknown): Promise<string> {
  if (typeof accessToken !== 'string' || !accessToken.trim() || accessToken.length > 4096) {
    throw new HttpError(400, 'Token Google mancante o non valido.');
  }

  let googleResponse: globalThis.Response;
  try {
    googleResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error('Google sign-in verification failed:', error);
    throw new HttpError(503, 'Verifica Google temporaneamente non disponibile.');
  }

  if (!googleResponse.ok) {
    throw new HttpError(401, 'La sessione Google non è valida o è scaduta.');
  }

  const identity = (await googleResponse.json()) as {
    email?: unknown;
    email_verified?: unknown;
  };
  if (typeof identity.email !== 'string' || identity.email_verified !== true) {
    throw new HttpError(401, 'Google non ha verificato l’indirizzo email dell’account.');
  }

  const email = identity.email.toLowerCase().trim();
  const db = readDatabase();
  const profile = db.profile;
  const allowedEmails = [profile.userEmail, profile.partnerEmail]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => value.toLowerCase().trim());

  if (allowedEmails.length === 0) {
    const ownerEmail = (process.env.DUOSPEND_OWNER_EMAIL || '').toLowerCase().trim();
    if (ownerEmail && ownerEmail !== email) {
      throw new HttpError(403, 'Account Google non autorizzato per questa coppia.');
    }
    writeDatabase({
      profile: {
        ...profile,
        userEmail: email,
      },
    });
  } else if (!allowedEmails.includes(email)) {
    throw new HttpError(403, 'Account Google non autorizzato per questa coppia.');
  }

  return email;
}

/** Flusso legacy (GIS Token Model): usato solo se GOOGLE_CLIENT_SECRET non è configurato. */
export async function verifyAndCreateGoogleSession(
  accessToken: unknown,
  res: Response,
  req?: Request
): Promise<{ user: { email: string } }> {
  const email = await verifyGoogleIdentity(accessToken);
  createGoogleSession(email, res, undefined, req);
  return { user: { email } };
}

/**
 * Flusso OAuth 2.0 Authorization Code (GIS Code Model popup + "postmessage"):
 * il server scambia il codice, verifica l'identità e conserva access/refresh token
 * esclusivamente lato server, associati al cookie di sessione HttpOnly.
 */
export async function exchangeCodeAndCreateGoogleSession(
  code: unknown,
  req: Request,
  res: Response
): Promise<{ user: { email: string }; gmailAccess: boolean }> {
  const tokens = await exchangeGoogleAuthorizationCode(code);
  let email: string;
  try {
    email = await verifyGoogleIdentity(tokens.accessToken);
  } catch (error) {
    await revokeGoogleToken(tokens.refreshToken || tokens.accessToken);
    throw error;
  }

  // Google restituisce il refresh token solo al primo consenso: conserva quello già noto
  const previousSession = getGoogleSession(req);
  const previousOAuth = getGoogleSessionOAuth(req);
  const mergedTokens: GoogleOAuthTokens = {
    ...tokens,
    refreshToken:
      tokens.refreshToken ||
      (previousSession?.email.toLowerCase() === email ? previousOAuth?.refreshToken : undefined),
  };

  createGoogleSession(email, res, mergedTokens, req);
  return { user: { email }, gmailAccess: hasGmailScope(mergedTokens, GMAIL_READONLY_SCOPE) };
}

export function getPublicAuthConfig() {
  const { codeFlowEnabled, clientId } = getGoogleOAuthClientConfig();
  return {
    codeFlowEnabled,
    developerConsoleEnabled: isDeveloperConsoleEnabled(),
    ...(clientId ? { googleClientId: clientId } : {}),
  };
}

export async function revokeCurrentGoogleSession(req: Request, res: Response): Promise<void> {
  const oauth = revokeGoogleSession(req, res);
  await revokeGoogleToken(oauth?.refreshToken || oauth?.accessToken);
}

export function resolveCurrentSession(req: Request, res: Response) {
  const googleSession = getGoogleSessionMetadata(req, { touch: false });
  if (googleSession) {
    const profile = readDatabase().profile;
    const allowedEmails = [profile.userEmail, profile.partnerEmail]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => value.toLowerCase().trim());
    if (
      allowedEmails.length > 0 &&
      !allowedEmails.includes(googleSession.email.toLowerCase().trim())
    ) {
      revokeGoogleSession(req, res);
      return { authenticated: false };
    }
    const oauth = getGoogleSessionOAuth(req, { touch: false });
    return {
      authenticated: true,
      user: { email: googleSession.email },
      method: 'google' as const,
      gmailAccess: hasGmailScope(oauth, GMAIL_READONLY_SCOPE),
      gmailOffline: Boolean(oauth?.refreshToken),
      idleExpiresAt: googleSession.idleExpiresAt,
      absoluteExpiresAt: googleSession.absoluteExpiresAt,
      idleTimeoutMs: googleSession.idleTimeoutMs,
    };
  }

  if (process.env.NODE_ENV !== 'production' && hasDeveloperSession(req)) {
    return { authenticated: true, user: {}, method: 'development' as const };
  }

  return { authenticated: false };
}
