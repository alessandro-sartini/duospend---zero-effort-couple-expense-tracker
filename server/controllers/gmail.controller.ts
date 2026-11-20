import type { Request, Response } from 'express';
import { getValidSessionAccessToken } from '../services/google-auth';
import {
  GMAIL_READONLY_SCOPE,
  getGoogleOAuthClientConfig,
  refreshGoogleAccessToken,
} from '../services/google-oauth';
import { syncGmailReceipts } from '../services/gmail.service';
import { sendControllerError } from '../utils/http-error';

async function resolveGmailAccessToken(req: Request): Promise<string | undefined> {
  const sessionToken = await getValidSessionAccessToken(
    req,
    GMAIL_READONLY_SCOPE,
    refreshGoogleAccessToken
  );
  if (sessionToken) return sessionToken;

  // Fallback legacy (Token Model): accettato solo se il flusso server-side non è configurato
  if (!getGoogleOAuthClientConfig().codeFlowEnabled) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }
  }
  return undefined;
}

export async function postGmailSyncController(req: Request, res: Response) {
  try {
    const accessToken = await resolveGmailAccessToken(req);
    if (!accessToken) {
      return res.status(401).json({
        error: 'Autorizza l’accesso a Gmail per continuare la scansione.',
        code: 'GMAIL_AUTH_REQUIRED',
      });
    }
    const result = await syncGmailReceipts({
      accessToken,
      googleUserEmail: req.googleUser?.email,
      body: (req.body ?? {}) as Record<string, unknown>,
    });
    return res.json(result);
  } catch (error: unknown) {
    return sendControllerError(
      res,
      error,
      500,
      'Errore durante la sincronizzazione Gmail.',
      'Gmail sync error'
    );
  }
}
