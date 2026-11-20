import { Router } from 'express';
import {
  postGeminiChatController,
  postGenerateVisionImageController,
  postParseReceiptController,
} from '../controllers/ai.controller';
import { requireCoupleAuth } from '../middleware/auth';

const router = Router();

// 1. Multi-turn AI Financial Chat
router.post('/api/gemini/chat', requireCoupleAuth, postGeminiChatController);

// 2. Multimodal Receipt OCR & Structured Extraction
router.post('/api/gemini/parse-receipt', requireCoupleAuth, postParseReceiptController);

// 3. Milestone & Vision Image Generation
router.post('/api/gemini/generate-vision-image', requireCoupleAuth, postGenerateVisionImageController);

export default router;
