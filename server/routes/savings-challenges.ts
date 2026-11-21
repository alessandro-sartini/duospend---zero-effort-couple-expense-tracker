import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  deleteSavingsChallengeController,
  getSavingsChallengeHistoryController,
  getSavingsChallengesController,
  patchSavingsChallengeController,
  postCompleteSavingsChallengeController,
  postConfirmChallengeContributionController,
  postEstimateSavingsChallengeController,
  postPauseSavingsChallengeController,
  postRecalculateSavingsChallengeController,
  postResumeSavingsChallengeController,
  postRevertChallengeContributionController,
  postSavingsChallengeController,
} from '../controllers/savings-challenges.controller';
import { requireCoupleAuth } from '../middleware/auth';

const MAX_CHALLENGE_MUTATION_BYTES = 64 * 1024;

export function guardChallengeMutationRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const requestedWith = (req.get?.('x-requested-with') || '').trim().toLowerCase();
  if (requestedWith !== 'xmlhttprequest') {
    return res.status(403).json({
      error: 'Richiesta non autorizzata (header X-Requested-With mancante).',
    });
  }

  const contentLength = Number(req.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_CHALLENGE_MUTATION_BYTES) {
    return res.status(413).json({
      error: 'Payload della sfida troppo grande (massimo 64 KB).',
    });
  }

  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Formato JSON non valido.' });
    }
    try {
      const serializedBytes = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
      if (serializedBytes > MAX_CHALLENGE_MUTATION_BYTES) {
        return res.status(413).json({
          error: 'Payload della sfida troppo grande (massimo 64 KB).',
        });
      }
    } catch {
      return res.status(400).json({ error: 'Payload JSON non serializzabile.' });
    }
  }

  return next();
}

const router = Router();

router.use('/api/savings-challenges', requireCoupleAuth, guardChallengeMutationRequest);

router.get('/api/savings-challenges', getSavingsChallengesController);
router.post('/api/savings-challenges/estimate', postEstimateSavingsChallengeController);
router.post('/api/savings-challenges', postSavingsChallengeController);
router.patch('/api/savings-challenges/:id', patchSavingsChallengeController);
router.delete('/api/savings-challenges/:id', deleteSavingsChallengeController);
router.post('/api/savings-challenges/:id/pause', postPauseSavingsChallengeController);
router.post('/api/savings-challenges/:id/resume', postResumeSavingsChallengeController);
router.post('/api/savings-challenges/:id/complete', postCompleteSavingsChallengeController);
router.post('/api/savings-challenges/:id/recalculate', postRecalculateSavingsChallengeController);
router.post('/api/savings-challenges/:id/confirm-contribution', postConfirmChallengeContributionController);
router.post('/api/savings-challenges/:id/revert-contribution', postRevertChallengeContributionController);
router.get('/api/savings-challenges/:id/history', getSavingsChallengeHistoryController);

export default router;
