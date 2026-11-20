import { Router } from 'express';
import {
  getAuthConfigController,
  getAuthSessionController,
  postGoogleCodeController,
  postGoogleSessionController,
  postLogoutController,
} from '../controllers/auth.controller';

const router = Router();

router.get('/api/auth/config', getAuthConfigController);
router.post('/api/auth/google-code', postGoogleCodeController);
router.post('/api/auth/google-session', postGoogleSessionController);
router.get('/api/auth/session', getAuthSessionController);
router.post('/api/auth/logout', postLogoutController);

export default router;
