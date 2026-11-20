import { Router } from 'express';
import { getDataController, postDataController } from '../controllers/data.controller';
import { requireCoupleAuth } from '../middleware/auth';

const router = Router();

// Central Database Synchronization Endpoints (Cross-Device Shared Storage)
router.get('/api/data', requireCoupleAuth, getDataController);
router.post('/api/data', requireCoupleAuth, postDataController);

export default router;
