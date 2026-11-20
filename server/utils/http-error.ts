import type { Response } from 'express';

export class HttpError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function sendControllerError(
  res: Response,
  error: unknown,
  fallbackStatus: number,
  fallbackMessage: string,
  logContext?: string
) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (logContext) {
    console.error(`${logContext}:`, error);
  }
  return res.status(fallbackStatus).json({ error: fallbackMessage });
}
