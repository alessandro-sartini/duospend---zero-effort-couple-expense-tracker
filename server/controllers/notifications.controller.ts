import type { Request, Response } from 'express';
import { hasValidWebhookSecret } from '../middleware/auth';
import { ingestNotification, parseNotificationHistory } from '../services/notification.service';
import { sendControllerError } from '../utils/http-error';

export async function postIngestNotificationController(req: Request, res: Response) {
  try {
    const { notificationText, appName, payer, persist, eventId } = req.body ?? {};
    const shouldPersist =
      persist === true ||
      persist === 'true' ||
      persist === 1 ||
      persist === '1' ||
      hasValidWebhookSecret(req.get('x-duospend-secret'));

    const result = await ingestNotification({
      notificationText,
      appName,
      payer,
      shouldPersist,
      eventId,
    });
    return res.json(result);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      500,
      'Errore durante la decodifica della notifica.',
      'Notification ingest error'
    );
  }
}

export async function postParseNotificationHistoryController(req: Request, res: Response) {
  try {
    const { historyText, payer } = req.body ?? {};
    const result = await parseNotificationHistory({ historyText, payer });
    return res.json(result);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      500,
      'Errore durante la decodifica della cronologia notifiche.',
      'Notification history error'
    );
  }
}
