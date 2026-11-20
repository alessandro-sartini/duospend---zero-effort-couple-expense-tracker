import { Router } from 'express';
import { postGmailSyncController } from '../controllers/gmail.controller';
import { requireCoupleAuth } from '../middleware/auth';

const router = Router();

// Gmail Receipt Scanner (Search & Extraction Proxy)
router.post('/api/gmail/sync', requireCoupleAuth, postGmailSyncController);

export default router;
