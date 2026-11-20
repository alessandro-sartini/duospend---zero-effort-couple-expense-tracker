import { Router } from 'express';
import {
  getDevStatusController,
  postDevLoginController,
  postResetDatabaseController,
  postUbuntuSyncController,
} from '../controllers/dev.controller';
import {
  requireDeveloperConsoleAccess,
  requireDeveloperSession,
  revokeDeveloperSession,
} from '../middleware/auth';

const router = Router();

// Console amministratore / sviluppo protetta da DUOSPEND_DEV_PASSWORD
router.post('/api/auth/dev-login', requireDeveloperConsoleAccess, postDevLoginController);
router.use('/api/dev', requireDeveloperConsoleAccess);
router.post('/api/dev/logout', requireDeveloperSession, revokeDeveloperSession);
router.use('/api/dev', requireDeveloperSession);

router.get('/api/dev/status', getDevStatusController);
router.post('/api/dev/reset-database', postResetDatabaseController);
router.post('/api/dev/ubuntu-sync', postUbuntuSyncController);

export default router;
