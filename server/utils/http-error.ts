import type { Response } from 'express';

export class HttpError extends Error {
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
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
    return res.status(error.status).json({
      error: error.message,
      ...(error.details ?? {}),
    });
  }
  if (logContext) {
    console.error(`${logContext}:`, error);
  }
  return res.status(fallbackStatus).json({ error: fallbackMessage });
}
