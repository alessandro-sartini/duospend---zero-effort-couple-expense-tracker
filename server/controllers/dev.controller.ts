import type { Request, Response } from 'express';
import { issueDeveloperSession } from '../middleware/auth';
import {
  getDeveloperStatus,
  resetDatabaseWithMode,
  syncDatabaseToUbuntuServer,
} from '../services/dev.service';
import { sendControllerError } from '../utils/http-error';

export function postDevLoginController(req: Request, res: Response) {
  if (!issueDeveloperSession(req.body?.password, res, req)) {
    return res.status(401).json({ error: 'Credenziali sviluppatore non valide.' });
  }
  return res.json({ success: true, role: 'developer' });
}

export function getDevStatusController(_req: Request, res: Response) {
  try {
    return res.json(getDeveloperStatus());
  } catch (error: unknown) {
    return sendControllerError(
      res,
      error,
      500,
      'Errore stato database dev.',
      'Dev status error'
    );
  }
}

export function postResetDatabaseController(req: Request, res: Response) {
  try {
    const confirm =
      typeof req.body?.confirm === 'string' ? req.body.confirm.trim().toUpperCase() : '';
    if (confirm !== 'RESET') {
      return res
        .status(400)
        .json({ error: 'Conferma mancante: digita RESET per procedere.' });
    }
    const mode = req.body?.mode === 'empty' ? 'empty' : 'demo';
    return res.json(resetDatabaseWithMode(mode));
  } catch (error: unknown) {
    return sendControllerError(
      res,
      error,
      500,
      'Errore ripristino database.',
      'Reset database error'
    );
  }
}

export async function postUbuntuSyncController(_req: Request, res: Response) {
  try {
    const result = await syncDatabaseToUbuntuServer();
    return res.json(result);
  } catch (error: unknown) {
    return sendControllerError(
      res,
      error,
      502,
      'Impossibile raggiungere il server Ubuntu configurato.',
      'Ubuntu sync error'
    );
  }
}
