import type { Request, Response } from 'express';
import {
  generateAdvisorChatReply,
  generateVisionImageWithAiOrFallback,
  parseReceiptWithAiOrFallback,
} from '../services/ai.service';
import { sendControllerError } from '../utils/http-error';

export async function postGeminiChatController(req: Request, res: Response) {
  try {
    const { model, messages, systemInstruction, financialContext } = req.body ?? {};
    const result = await generateAdvisorChatReply({
      model,
      messages,
      systemInstruction,
      financialContext,
    });
    return res.json(result);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      500,
      'Errore interno nella chat AI.',
      'Gemini chat controller error'
    );
  }
}

export async function postParseReceiptController(req: Request, res: Response) {
  try {
    const { imageBase64, mimeType, textContent } = req.body ?? {};
    const result = await parseReceiptWithAiOrFallback({
      imageBase64,
      mimeType,
      textContent,
    });
    return res.json(result);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      500,
      'Errore durante analisi scontrino.',
      'Parse receipt controller error'
    );
  }
}

export async function postGenerateVisionImageController(req: Request, res: Response) {
  try {
    const { prompt, imageSize, aspectRatio } = req.body ?? {};
    const result = await generateVisionImageWithAiOrFallback({
      prompt,
      imageSize,
      aspectRatio,
    });
    return res.json(result);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      500,
      'Errore durante generazione immagine.',
      'Vision image controller error'
    );
  }
}
