import type { Request, Response } from 'express';
import {
  createSavingsChallengesService,
  defaultSavingsChallengesService,
  type ChallengeActorContext,
} from '../services/savings-challenges.service';
import { sendControllerError } from '../utils/http-error';
import { sanitizeIdempotencyKey } from '../utils/sanitizers';

function extractActorContext(req: Request): ChallengeActorContext {
  const headerKey = req.get?.('idempotency-key');
  const bodyKey =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>).idempotencyKey
      : undefined;
  return {
    requesterEmail: req.googleUser?.email,
    idempotencyKey: sanitizeIdempotencyKey(headerKey ?? bodyKey),
  };
}

function getBodyObject(req: Request, res: Response): Record<string, unknown> | null {
  if (req.body === undefined || req.body === null) {
    return {};
  }
  if (typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Formato payload della richiesta non valido.' });
    return null;
  }
  return req.body as Record<string, unknown>;
}

export function createSavingsChallengesController(
  service: ReturnType<typeof createSavingsChallengesService> = defaultSavingsChallengesService
) {
  return {
    listChallenges(req: Request, res: Response) {
      try {
        const status = typeof req.query?.status === 'string' ? req.query.status : undefined;
        const goalId = typeof req.query?.goalId === 'string' ? req.query.goalId : undefined;
        const recalculate = req.query?.recalculate !== 'false';
        const data = service.listChallenges({ status, goalId, recalculate });
        return res.json(data);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nel caricamento delle sfide di risparmio.',
          'Savings challenges list error'
        );
      }
    },

    estimateChallenge(req: Request, res: Response) {
      try {
        const body = getBodyObject(req, res);
        if (!body) return;
        const result = service.estimateChallenge(body);
        return res.json(result);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nel calcolo della stima sfida.',
          'Savings challenge estimate error'
        );
      }
    },

    createChallenge(req: Request, res: Response) {
      try {
        const body = getBodyObject(req, res);
        if (!body) return;
        const result = service.createChallenge(body, extractActorContext(req));
        return res.status(result.status).json(result.body);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nella creazione della sfida di risparmio.',
          'Savings challenge create error'
        );
      }
    },

    updateChallenge(req: Request, res: Response) {
      try {
        const body = getBodyObject(req, res);
        if (!body) return;
        const result = service.updateChallenge(req.params.id, body, extractActorContext(req));
        return res.json(result);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nell’aggiornamento della sfida di risparmio.',
          'Savings challenge update error'
        );
      }
    },

    deleteChallenge(req: Request, res: Response) {
      try {
        const body = getBodyObject(req, res);
        if (!body) return;
        const result = service.deleteChallenge(req.params.id, body, extractActorContext(req));
        return res.json(result);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nell’eliminazione della sfida di risparmio.',
          'Savings challenge delete error'
        );
      }
    },

    pauseChallenge(req: Request, res: Response) {
      try {
        const body = getBodyObject(req, res);
        if (!body) return;
        const result = service.pauseChallenge(req.params.id, body, extractActorContext(req));
        return res.json(result);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nella sospensione della sfida.',
          'Savings challenge pause error'
        );
      }
    },

    resumeChallenge(req: Request, res: Response) {
      try {
        const body = getBodyObject(req, res);
        if (!body) return;
        const result = service.resumeChallenge(req.params.id, body, extractActorContext(req));
        return res.json(result);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nella riattivazione della sfida.',
          'Savings challenge resume error'
        );
      }
    },

    completeChallenge(req: Request, res: Response) {
      try {
        const body = getBodyObject(req, res);
        if (!body) return;
        const result = service.completeChallenge(req.params.id, body, extractActorContext(req));
        return res.json(result);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nella chiusura della sfida.',
          'Savings challenge complete error'
        );
      }
    },

    recalculateChallenge(req: Request, res: Response) {
      try {
        const result = service.recalculateChallenge(req.params.id, extractActorContext(req));
        return res.json(result);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nel ricalcolo della sfida.',
          'Savings challenge recalculate error'
        );
      }
    },

    confirmContribution(req: Request, res: Response) {
      try {
        const body = getBodyObject(req, res);
        if (!body) return;
        const result = service.confirmContribution(req.params.id, body, extractActorContext(req));
        return res.json(result);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nella registrazione del contributo virtuale.',
          'Savings challenge confirm contribution error'
        );
      }
    },

    revertContribution(req: Request, res: Response) {
      try {
        const body = getBodyObject(req, res);
        if (!body) return;
        const result = service.revertContribution(req.params.id, body, extractActorContext(req));
        return res.json(result);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nell’annullamento del contributo virtuale.',
          'Savings challenge revert contribution error'
        );
      }
    },

    getHistory(req: Request, res: Response) {
      try {
        const result = service.getChallengeHistory(req.params.id);
        return res.json(result);
      } catch (error) {
        return sendControllerError(
          res,
          error,
          500,
          'Errore nel recupero dello storico della sfida.',
          'Savings challenge history error'
        );
      }
    },
  };
}

const defaultController = createSavingsChallengesController();

export const getSavingsChallengesController = defaultController.listChallenges;
export const postEstimateSavingsChallengeController = defaultController.estimateChallenge;
export const postSavingsChallengeController = defaultController.createChallenge;
export const patchSavingsChallengeController = defaultController.updateChallenge;
export const deleteSavingsChallengeController = defaultController.deleteChallenge;
export const postPauseSavingsChallengeController = defaultController.pauseChallenge;
export const postResumeSavingsChallengeController = defaultController.resumeChallenge;
export const postCompleteSavingsChallengeController = defaultController.completeChallenge;
export const postRecalculateSavingsChallengeController = defaultController.recalculateChallenge;
export const postConfirmChallengeContributionController = defaultController.confirmContribution;
export const postRevertChallengeContributionController = defaultController.revertContribution;
export const getSavingsChallengeHistoryController = defaultController.getHistory;
