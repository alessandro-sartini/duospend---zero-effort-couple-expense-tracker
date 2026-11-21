import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateContentMock, generateImagesMock, listModelsMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  generateImagesMock: vi.fn(),
  listModelsMock: vi.fn(),
}));

vi.mock('../server/database', () => ({
  readDatabase: vi.fn(() => ({
    expenses: [],
    goals: [],
    settlements: [],
    trips: [],
    recurringRules: [],
    gmailSyncState: { lastSyncedAt: null, processedMessageIds: [], processedSignatures: [] },
    profile: { userName: 'Ale', partnerName: 'Eli', currency: 'EUR' },
  })),
  writeDatabase: vi.fn(),
  readAiModelRegistry: vi.fn(() => []),
  upsertAiModelRegistry: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: generateContentMock,
      generateImages: generateImagesMock,
      list: listModelsMock,
    };
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    ARRAY: 'ARRAY',
  },
}));

import {
  generateImageWithFallback,
  resetGeminiModelCachesForTests,
} from '../server/services/gemini';
import { generateVisionImageWithAiOrFallback } from '../server/services/ai.service';
import { VisionImageGenerator } from '../src/components/vision/VisionImageGenerator';
import type { SavingGoal } from '../src/types';

function emptyAsyncModelsList() {
  return {
    async *[Symbol.asyncIterator]() {
      // empty list
    },
  };
}

describe('Vision Image fallback chain and redesigned UI', () => {
  beforeEach(() => {
    resetGeminiModelCachesForTests();
    generateContentMock.mockReset();
    generateImagesMock.mockReset();
    listModelsMock.mockReset();
    listModelsMock.mockResolvedValue(emptyAsyncModelsList());
    vi.stubEnv('GEMINI_API_KEY', 'AIza' + 'SyDummyValidKeyForVisionImageTesting12345');
  });

  it('invia responseModalities IMAGE+TEXT e ritenta senza imageSize su errore 400 di modello immagine', async () => {
    generateContentMock
      .mockRejectedValueOnce({
        status: 400,
        message: 'INVALID_ARGUMENT: imageSize is not supported by this model',
      })
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                { inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUg==' } },
                { text: 'Tramonto sulla costiera' },
              ],
            },
          },
        ],
      });

    const result = await generateImageWithFallback({
      model: 'gemini-2.5-flash-image',
      prompt: 'Tramonto romantico',
      imageSize: '2K',
      aspectRatio: '1:1',
    });

    expect(result.modelUsed).toBe('gemini-2.5-flash-image');
    expect(result.imageDataUrl).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(generateContentMock.mock.calls[0]?.[0]?.config?.responseModalities).toEqual([
      'IMAGE',
      'TEXT',
    ]);
    expect(generateContentMock.mock.calls[0]?.[0]?.config?.imageConfig?.imageSize).toBe('2K');
    expect(generateContentMock.mock.calls[1]?.[0]?.config?.responseModalities).toEqual([
      'IMAGE',
      'TEXT',
    ]);
    expect(generateContentMock.mock.calls[1]?.[0]?.config?.imageConfig?.imageSize).toBeUndefined();
  });

  it('salta risposte solo testo e switcha tra modelli Gemini image su 404/text-only', async () => {
    generateContentMock.mockImplementation(async (params: { model: string }) => {
      if (params.model === 'gemini-3.1-flash-image-preview') {
        throw { status: 404, message: 'NOT_FOUND: model not found' };
      }
      if (params.model === 'gemini-2.5-flash-image') {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: 'Risposta solo testuale senza immagine inline' }],
              },
            },
          ],
        };
      }
      if (params.model === 'gemini-3-pro-image-preview') {
        return {
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRg==' } }],
              },
            },
          ],
        };
      }
      throw { status: 404, message: 'NOT_FOUND' };
    });

    const result = await generateImageWithFallback({
      prompt: 'Casa in campagna',
      imageSize: '1K',
      aspectRatio: '1:1',
    });

    expect(result.modelUsed).toBe('gemini-3-pro-image-preview');
    expect(result.imageDataUrl).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
    expect(result.attemptedModels).toEqual([
      'gemini-3.1-flash-image-preview',
      'gemini-2.5-flash-image',
      'gemini-3-pro-image-preview',
    ]);
  });

  it('effettua fallback automatico sui modelli Imagen quando Gemini generateContent image non è disponibile', async () => {
    generateContentMock.mockRejectedValue({
      status: 503,
      message: 'UNAVAILABLE: model temporarily overloaded',
    });

    generateImagesMock.mockImplementation(async (params: { model: string }) => {
      if (params.model === 'imagen-4.0-fast-generate-001') {
        return {
          generatedImages: [
            {
              image: { imageBytes: 'QUJDREVGRw==', mimeType: 'image/png' },
              enhancedPrompt: 'Casetta luminosa',
            },
          ],
        };
      }
      throw { status: 404, message: 'NOT_FOUND' };
    });

    const result = await generateImageWithFallback({
      prompt: 'Casa luminosa con giardino',
      imageSize: '1K',
      aspectRatio: '1:1',
    });

    expect(generateImagesMock).toHaveBeenCalled();
    expect(result.modelUsed).toBe('imagen-4.0-fast-generate-001');
    expect(result.imageDataUrl).toBe('data:image/png;base64,QUJDREVGRw==');
  });

  it('classifica 429 quota/billing (limit: 0) in modo trasparente nel fallback SVG locale', async () => {
    generateContentMock.mockRejectedValue({
      status: 429,
      message: 'RESOURCE_EXHAUSTED: Quota exceeded, limit: 0 for image generation on free tier',
    });
    generateImagesMock.mockRejectedValue({
      status: 429,
      message: 'RESOURCE_EXHAUSTED: Billing account required',
    });

    const response = await generateVisionImageWithAiOrFallback({
      prompt: 'Viaggio in Giappone a primavera',
      imageSize: '1K',
      aspectRatio: '1:1',
    });

    expect(response.success).toBe(true);
    expect(response.fallbackUsed).toBe(true);
    expect(response.modelUsed).toBe('fallback-svg-locale');
    expect(response.fallbackReason).toBe('quota_or_billing');
    expect(response.diagnosticMessage).toContain('billing');
    expect(response.diagnosticMessage).toContain('galleria');
    expect(response.attemptedModels.length).toBeGreaterThanOrEqual(3);
    expect(response.imageUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('segnala missing_api_key se GEMINI_API_KEY non è configurata senza invocare il SDK', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('API_KEY', '');

    const response = await generateVisionImageWithAiOrFallback({
      prompt: 'Fondo emergenze',
    });

    expect(response.fallbackUsed).toBe(true);
    expect(response.fallbackReason).toBe('missing_api_key');
    expect(response.attemptedModels).toEqual([]);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('renderizza VisionImageGenerator collassato di default e con tab AI + Carica foto accessibili quando espanso', () => {
    const sampleGoals: SavingGoal[] = [
      {
        id: 'goal-1',
        title: 'Luna di Miele',
        targetAmount: 4000,
        currentAmount: 1500,
      },
    ];

    const collapsedHtml = renderToStaticMarkup(
      React.createElement(VisionImageGenerator, {
        goals: sampleGoals,
        onUpdateGoalImage: () => {},
      })
    );
    expect(collapsedHtml).toContain('Copertina Obiettivi');
    expect(collapsedHtml).toContain('aria-expanded="false"');
    expect(collapsedHtml).not.toContain('gemini-3-pro-image-preview');
    expect(collapsedHtml).not.toContain('Genera con AI');

    const expandedHtml = renderToStaticMarkup(
      React.createElement(VisionImageGenerator, {
        goals: sampleGoals,
        preferredGoalId: 'goal-1',
        onUpdateGoalImage: () => {},
        defaultExpanded: true,
      })
    );
    expect(expandedHtml).toContain('aria-expanded="true"');
    expect(expandedHtml).toContain('Genera con AI');
    expect(expandedHtml).toContain('Carica foto');
    expect(expandedHtml).toContain('Costiera Amalfitana');
    expect(expandedHtml).toContain('Casa nel verde');
    expect(expandedHtml).toContain('Soggiorno nordico');
    expect(expandedHtml).toContain('Viaggio Dolomiti');
    expect(expandedHtml).not.toContain('vi...');
    expect(expandedHtml).not.toContain('gemini-3-pro-image-preview');
  });
});
