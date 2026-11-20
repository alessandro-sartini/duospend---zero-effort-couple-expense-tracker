import type { Request, Response } from 'express';
import { readDatabase } from '../database';
import { hasDeveloperSession, hasValidWebhookSecret } from '../middleware/auth';
import { getSynchronizedData, saveSynchronizedData } from '../services/data.service';
import { sendControllerError } from '../utils/http-error';

export function getDataController(_req: Request, res: Response) {
  try {
    const data = getSynchronizedData();
    return res.json(data);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      500,
      'Errore nel caricamento del database centrale.',
      'Data fetch error'
    );
  }
}

export function postDataController(req: Request, res: Response) {
  try {
    const currentProfile = readDatabase().profile;
    const isOwner =
      (process.env.NODE_ENV !== 'production' && hasDeveloperSession(req)) ||
      hasValidWebhookSecret(req.get('x-duospend-secret')) ||
      req.googleUser?.email.toLowerCase().trim() ===
        (currentProfile.userEmail || '').toLowerCase().trim();

    const result = saveSynchronizedData(req.body ?? {}, { isOwner });
    return res.json(result);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      500,
      'Errore nel salvataggio su database centrale.',
      'Data save error'
    );
  }
}
