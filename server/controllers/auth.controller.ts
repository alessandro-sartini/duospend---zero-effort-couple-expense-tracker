import type { Request, Response } from 'express';
import {
  exchangeCodeAndCreateGoogleSession,
  getPublicAuthConfig,
  resolveCurrentSession,
  revokeCurrentGoogleSession,
  verifyAndCreateGoogleSession,
} from '../services/auth.service';
import { sendControllerError } from '../utils/http-error';

/** Difesa CSRF raccomandata da Google per il Code Model in modalità popup. */
function hasXhrCsrfHeader(req: Request): boolean {
  return (req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
}

export function getAuthConfigController(_req: Request, res: Response) {
  return res.json(getPublicAuthConfig());
}

export async function postGoogleCodeController(req: Request, res: Response) {
  if (!hasXhrCsrfHeader(req)) {
    return res.status(403).json({ error: 'Richiesta di autorizzazione non valida.' });
  }
  try {
    const result = await exchangeCodeAndCreateGoogleSession(req.body?.code, req, res);
    return res.json({ success: true, user: result.user, gmailAccess: result.gmailAccess });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      503,
      'Verifica Google temporaneamente non disponibile.',
      'Google authorization code exchange failed'
    );
  }
}

export async function postGoogleSessionController(req: Request, res: Response) {
  // Con il flusso server-side attivo il vecchio Token Model viene disabilitato
  if (getPublicAuthConfig().codeFlowEnabled) {
    return res.status(410).json({ error: 'Usa il nuovo accesso Google sicuro (Authorization Code).' });
  }
  try {
    const result = await verifyAndCreateGoogleSession(req.body?.accessToken, res);
    return res.json({ success: true, user: result.user });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      503,
      'Verifica Google temporaneamente non disponibile.',
      'Google sign-in verification failed'
    );
  }
}

export function getAuthSessionController(req: Request, res: Response) {
  try {
    const session = resolveCurrentSession(req, res);
    return res.json(session);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      503,
      'Verifica accesso temporaneamente non disponibile.',
      'Session authorization lookup failed'
    );
  }
}

export async function postLogoutController(req: Request, res: Response) {
  await revokeCurrentGoogleSession(req, res);
  return res.json({ success: true });
}
