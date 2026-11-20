import { HttpError } from '../utils/http-error';
import type { GoogleOAuthTokens } from './google-auth';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const SAFE_AUTH_CODE_PATTERN = /^[^\s\r\n]{10,2048}$/;

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/**
 * Configurazione OAuth 2.0 Authorization Code (GIS Code Model, popup + "postmessage").
 * Letta a runtime così test e riavvii riflettono sempre l'ambiente corrente.
 */
export function getGoogleOAuthClientConfig() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  return {
    clientId,
    clientSecret,
    codeFlowEnabled: Boolean(clientId && clientSecret),
  };
}

type GoogleTokenEndpointResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
};

async function postToTokenEndpoint(params: Record<string, string>): Promise<GoogleOAuthTokens> {
  let response: globalThis.Response;
  try {
    response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error('Google token endpoint unreachable:', error);
    throw new HttpError(503, 'Servizio OAuth di Google temporaneamente non raggiungibile.');
  }

  const payload = (await response.json().catch(() => ({}))) as GoogleTokenEndpointResponse;
  if (!response.ok || typeof payload.access_token !== 'string' || !payload.access_token) {
    const reason = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
    console.warn(`Google OAuth token exchange rejected: ${reason}`);
    throw new HttpError(401, 'Autorizzazione Google non valida o scaduta. Riprova l’accesso.');
  }

  const expiresInSeconds = Number(payload.expires_in);
  return {
    accessToken: payload.access_token,
    accessTokenExpiresAt:
      Date.now() + (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds : 3600) * 1000,
    refreshToken:
      typeof payload.refresh_token === 'string' && payload.refresh_token
        ? payload.refresh_token
        : undefined,
    scope: typeof payload.scope === 'string' ? payload.scope : '',
  };
}

export async function exchangeGoogleAuthorizationCode(code: unknown): Promise<GoogleOAuthTokens> {
  const { clientId, clientSecret, codeFlowEnabled } = getGoogleOAuthClientConfig();
  if (!codeFlowEnabled) {
    throw new HttpError(503, 'Flusso OAuth server non configurato: imposta GOOGLE_CLIENT_SECRET sul server.');
  }
  if (typeof code !== 'string' || !SAFE_AUTH_CODE_PATTERN.test(code)) {
    throw new HttpError(400, 'Codice di autorizzazione Google mancante o non valido.');
  }

  return postToTokenEndpoint({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    // Per il GIS Code Model in modalità popup il redirect_uri dello scambio è sempre "postmessage"
    redirect_uri: 'postmessage',
    grant_type: 'authorization_code',
  });
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleOAuthTokens> {
  const { clientId, clientSecret, codeFlowEnabled } = getGoogleOAuthClientConfig();
  if (!codeFlowEnabled) {
    throw new HttpError(503, 'Flusso OAuth server non configurato.');
  }
  return postToTokenEndpoint({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
}

export async function revokeGoogleToken(token: string | undefined): Promise<void> {
  if (!token) return;
  try {
    await fetch(GOOGLE_REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    console.warn('Revoca token Google non riuscita (best effort):', error);
  }
}
