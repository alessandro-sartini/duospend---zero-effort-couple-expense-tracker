import { Router } from 'express';
import {
  postIngestNotificationController,
  postParseNotificationHistoryController,
} from '../controllers/notifications.controller';
import { requireNotificationAuth } from '../middleware/auth';

const router = Router();

// Android Payment Notification Ingestion & Italian SMS / Bank Push Parser
router.post('/api/notifications/ingest', requireNotificationAuth, postIngestNotificationController);
router.post(
  '/api/notifications/parse-history',
  requireNotificationAuth,
  postParseNotificationHistoryController
);

export default router;
