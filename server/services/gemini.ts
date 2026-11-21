import { GoogleGenAI } from '@google/genai';
import * as database from '../database';
import type { AiModelRegistryEntry } from '../database';

export const DEFAULT_TEXT_FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
];

export const DEFAULT_IMAGE_FALLBACK_MODELS = [
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-3.1-flash-lite-image',
  'gemini-2.0-flash-preview-image-generation',
];

export const DEFAULT_IMAGEN_FALLBACK_MODELS = [
  'imagen-4.0-fast-generate-001',
  'imagen-4.0-generate-001',
  'imagen-3.0-generate-002',
];

const MODEL_ALIAS_MAP: Record<string, string> = {
  'gemini-2.5-flash': 'gemini-3.8-flash',
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-2.0-flash': 'gemini-3.8-flash',
};

const ACTIVE_DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;
const DEPRECATED_MODEL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TRANSIENT_UNAVAILABLE_TTL_MS = 10 * 60 * 1000;
const GEMINI_REQUEST_TIMEOUT_MS = 22_000;
const GEMINI_IMAGE_REQUEST_TIMEOUT_MS = 45_000;
const unavailableModelsCache = new Map<string, number>();
const deprecatedReplacementCache = new Map<string, string>();
let discoveredModelsCache: { expiresAt: number; textModels: string[]; imageModels: string[] } | null = null;
let registryHydrated = false;
let loggedInvalidKeyWarning = false;

function hydrateModelCachesFromDatabase(): void {
  if (registryHydrated) return;
  registryHydrated = true;

  try {
    const readRegistry = (
      database as { readAiModelRegistry?: () => AiModelRegistryEntry[] }
    ).readAiModelRegistry;
    if (typeof readRegistry !== 'function') return;

    const entries = readRegistry();
    const now = Date.now();
    const textModels: string[] = [];
    const imageModels: string[] = [];
    let maxActiveExpiresAt = 0;

    for (const entry of entries) {
      if (entry.expiresAt <= now) continue;
      if (entry.status === 'deprecated') {
        unavailableModelsCache.set(entry.modelId, entry.expiresAt);
        if (entry.replacementModel) {
          deprecatedReplacementCache.set(entry.modelId, entry.replacementModel);
        }
      } else {
        maxActiveExpiresAt = Math.max(maxActiveExpiresAt, entry.expiresAt);
        if (entry.kind === 'image') {
          imageModels.push(entry.modelId);
        } else {
          textModels.push(entry.modelId);
        }
      }
    }

    if (textModels.length > 0 || imageModels.length > 0) {
      const sortByNewest = (list: string[]) =>
        [...new Set(list)].sort((a, b) => parseGeminiVersionScore(b) - parseGeminiVersionScore(a));
      discoveredModelsCache = {
        expiresAt: maxActiveExpiresAt || now + ACTIVE_DISCOVERY_TTL_MS,
        textModels: sortByNewest(textModels),
        imageModels: sortByNewest(imageModels),
      };
    }
  } catch (error) {
    console.warn('Unable to hydrate AI model registry from SQLite:', error);
  }
}

function persistAiModelEntries(entries: AiModelRegistryEntry[]): void {
  if (entries.length === 0) return;
  try {
    const upsertRegistry = (
      database as { upsertAiModelRegistry?: (items: AiModelRegistryEntry[]) => void }
    ).upsertAiModelRegistry;
    if (typeof upsertRegistry === 'function') {
      upsertRegistry(entries);
    }
  } catch (error) {
    console.warn('Unable to persist AI model registry to SQLite:', error);
  }
}

export function resolveGeminiModelName(model?: string): string {
  const trimmed = typeof model === 'string' ? model.trim().replace(/^models\//i, '') : '';
  if (!trimmed) {
    return 'gemini-3.8-flash';
  }
  const aliased = MODEL_ALIAS_MAP[trimmed] ?? trimmed;
  return deprecatedReplacementCache.get(aliased) ?? aliased;
}

export function extractSuggestedModelFromError(error: unknown): string | null {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  const match = message.match(/(?:use|try|switch to)\s+models\/([a-z0-9][a-z0-9._-]+)/i);
  return match?.[1] ? match[1].trim() : null;
}

function parseGeminiVersionScore(modelName: string): number {
  const versionMatch = modelName.match(/gemini-(\d+)(?:\.(\d+))?/i);
  if (!versionMatch) return 0;
  const major = Number(versionMatch[1] || 0);
  const minor = Number(versionMatch[2] || 0);
  const isFlash = /flash/i.test(modelName) ? 0.05 : 0;
  const isLite = /lite/i.test(modelName) ? -0.01 : 0;
  return major * 100 + minor + isFlash + isLite;
}

async function discoverAvailableGeminiModels(
  ai: GoogleGenAI,
  kind: 'text' | 'image'
): Promise<string[]> {
  const now = Date.now();
  if (discoveredModelsCache && discoveredModelsCache.expiresAt > now) {
    return kind === 'image' ? discoveredModelsCache.imageModels : discoveredModelsCache.textModels;
  }

  try {
    const pager = await ai.models.list();
    const textModels: string[] = [];
    const imageModels: string[] = [];

    for await (const model of pager) {
      const actions = model.supportedActions ?? [];
      if (!actions.includes('generateContent')) continue;
      const cleanName = String(model.name || '').replace(/^models\//i, '').trim();
      if (!cleanName || !cleanName.startsWith('gemini-')) continue;
      if (/embedding|deep-research|nano-banana|omni/i.test(cleanName)) continue;

      if (/image/i.test(cleanName)) {
        imageModels.push(cleanName);
      } else {
        textModels.push(cleanName);
      }
    }

    const sortByNewest = (list: string[]) =>
      [...new Set(list)].sort((a, b) => parseGeminiVersionScore(b) - parseGeminiVersionScore(a));

    const sortedText = sortByNewest(textModels);
    const sortedImage = sortByNewest(imageModels);

    const expiresAt = now + ACTIVE_DISCOVERY_TTL_MS;
    discoveredModelsCache = {
      expiresAt,
      textModels: sortedText,
      imageModels: sortedImage,
    };

    const updatedAt = new Date(now).toISOString();
    persistAiModelEntries([
      ...sortedText.slice(0, 12).map((modelId) => ({
        modelId,
        kind: 'text' as const,
        status: 'active' as const,
        expiresAt,
        updatedAt,
      })),
      ...sortedImage.slice(0, 8).map((modelId) => ({
        modelId,
        kind: 'image' as const,
        status: 'active' as const,
        expiresAt,
        updatedAt,
      })),
    ]);

    return kind === 'image' ? sortedImage : sortedText;
  } catch (listError) {
    console.warn('Gemini dynamic model discovery failed:', listError);
    return [];
  }
}

export type ImageFallbackReason =
  | 'missing_api_key'
  | 'quota_or_billing'
  | 'api_key_invalid'
  | 'safety_filtered'
  | 'models_unavailable';

export class VisionImageGenerationError extends Error {
  readonly reason: ImageFallbackReason;
  readonly attemptedModels: string[];
  readonly diagnosticMessage: string;

  constructor(params: {
    reason: ImageFallbackReason;
    attemptedModels: string[];
    diagnosticMessage: string;
  }) {
    super(params.diagnosticMessage);
    this.name = 'VisionImageGenerationError';
    this.reason = params.reason;
    this.attemptedModels = params.attemptedModels;
    this.diagnosticMessage = params.diagnosticMessage;
  }
}

let discoveredImagenModelsCache: { expiresAt: number; models: string[] } | null = null;
const imageFailureReasonCache = new Map<string, ImageFallbackReason>();

async function discoverAvailableImagenModels(ai: GoogleGenAI): Promise<string[]> {
  const now = Date.now();
  if (discoveredImagenModelsCache && discoveredImagenModelsCache.expiresAt > now) {
    return discoveredImagenModelsCache.models;
  }

  try {
    const pager = await ai.models.list();
    const imagenModels: string[] = [];
    for await (const model of pager) {
      const cleanName = String(model.name || '').replace(/^models\//i, '').trim();
      if (!cleanName.startsWith('imagen-')) continue;
      const actions = model.supportedActions ?? [];
      if (
        actions.length === 0 ||
        actions.includes('predict') ||
        actions.includes('generateImages')
      ) {
        imagenModels.push(cleanName);
      }
    }

    const sorted = [...new Set(imagenModels)].sort(
      (a, b) => parseGeminiVersionScore(b) - parseGeminiVersionScore(a)
    );
    discoveredImagenModelsCache = {
      expiresAt: now + ACTIVE_DISCOVERY_TTL_MS,
      models: sorted,
    };
    return sorted;
  } catch (error) {
    console.warn('Imagen model discovery failed:', error);
    return [];
  }
}

function parseGeminiErrorDetails(error: unknown): {
  status: number | undefined;
  message: string;
  isApiKeyError: boolean;
  isQuotaOrBilling: boolean;
  isDeprecatedOrNotFound: boolean;
  isParameterError: boolean;
  isSafety: boolean;
  isTransient: boolean;
} {
  const errObj = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
    error?: { code?: unknown; message?: unknown };
  } | undefined;
  const rawStatus = Number(errObj?.status ?? errObj?.code ?? errObj?.error?.code);
  const status = Number.isFinite(rawStatus) && rawStatus > 0 ? rawStatus : undefined;
  const message = String(errObj?.message || errObj?.error?.message || error || '');

  const isBillingPermission =
    status === 403 && /billing|tier|quota|enable/i.test(message);

  const isApiKeyError =
    status === 401 ||
    (status === 403 && !isBillingPermission) ||
    /API_KEY_INVALID|API key not valid|API key expired|PERMISSION_DENIED.*api key/i.test(message);

  const isQuotaOrBilling =
    status === 429 ||
    isBillingPermission ||
    /RESOURCE_EXHAUSTED|quota|rate limit|billing|free_tier|limit:\s*0|exceeded your current quota/i.test(
      message
    );

  const isDeprecatedOrNotFound =
    status === 404 ||
    /NOT_FOUND|not found|deprecated|no longer available|not supported for generateContent|not supported for generateImages|not supported for predict/i.test(
      message
    );

  const isParameterError =
    !isApiKeyError &&
    !isDeprecatedOrNotFound &&
    !isQuotaOrBilling &&
    (status === 400 ||
      /INVALID_ARGUMENT|imageSize|imageConfig|aspectRatio|responseModalities|outputMimeType|includeRaiReason/i.test(
        message
      ));

  const isSafety =
    /SAFETY|IMAGE_SAFETY|PROHIBITED_CONTENT|BLOCKLIST|RAI|filtered out/i.test(message);

  const isTransient =
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 408 ||
    /UNAVAILABLE|DEADLINE_EXCEEDED|TimeoutError|AbortError|timed out|aborted|high demand|overloaded|temporarily unavailable|fetch failed|network/i.test(
      message
    );

  return {
    status,
    message,
    isApiKeyError,
    isQuotaOrBilling,
    isDeprecatedOrNotFound,
    isParameterError,
    isSafety,
    isTransient,
  };
}

export async function generateImageWithFallback(options: {
  model?: string;
  fallbackModels?: string[];
  imagenModels?: string[];
  prompt: string;
  imageSize?: string;
  aspectRatio?: string;
}): Promise<{
  imageDataUrl: string;
  caption: string;
  modelUsed: string;
  attemptedModels: string[];
}> {
  hydrateModelCachesFromDatabase();
  const ai = getGeminiClient();
  const now = Date.now();

  const rawGeminiSeeds = [
    options.model,
    ...(options.fallbackModels ?? []),
    ...DEFAULT_IMAGE_FALLBACK_MODELS,
    ...(discoveredModelsCache?.expiresAt && discoveredModelsCache.expiresAt > now
      ? discoveredModelsCache.imageModels
      : []),
  ];

  const resolvedGeminiSeeds = Array.from(
    new Set(
      rawGeminiSeeds
        .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
        .map((m) => resolveGeminiModelName(m))
        .filter((m): m is string => Boolean(m))
    )
  );

  const activeGeminiQueue = resolvedGeminiSeeds.filter((m) => {
    const exp = unavailableModelsCache.get(m);
    return !exp || exp <= now;
  });

  // If every non-404 candidate was put into transient cooldown, re-probe once on explicit retry
  // so newly enabled AI Studio billing or refreshed quotas recover immediately.
  const queue =
    activeGeminiQueue.length > 0
      ? [...activeGeminiQueue]
      : resolvedGeminiSeeds.filter((m) => {
          const reason = imageFailureReasonCache.get(m);
          return reason !== 'models_unavailable' || (unavailableModelsCache.get(m) ?? 0) <= now;
        });

  const attempted: string[] = [];
  const attemptedSet = new Set<string>();
  const failures: Array<{
    model: string;
    reason: ImageFallbackReason;
    message: string;
  }> = [];

  let discoveryRun = false;
  let abortedForInvalidKey = false;

  const enqueueDiscoveredGemini = async () => {
    if (discoveryRun) return;
    discoveryRun = true;
    const discovered = await discoverAvailableGeminiModels(ai, 'image');
    for (const modelName of discovered) {
      const exp = unavailableModelsCache.get(modelName);
      if (
        !attemptedSet.has(modelName) &&
        !queue.includes(modelName) &&
        (!exp || exp <= Date.now())
      ) {
        queue.push(modelName);
      }
    }
  };

  while (queue.length > 0) {
    const candidateModel = queue.shift()!;
    if (attemptedSet.has(candidateModel)) continue;
    attemptedSet.add(candidateModel);
    attempted.push(candidateModel);

    const callGeminiImage = async (withImageSize: boolean, withImageConfig: boolean) => {
      const imageConfig: Record<string, string> = {};
      if (withImageConfig) {
        if (options.aspectRatio) imageConfig.aspectRatio = options.aspectRatio;
        if (withImageSize && options.imageSize) imageConfig.imageSize = options.imageSize;
      }

      return ai.models.generateContent({
        model: candidateModel,
        contents: { parts: [{ text: options.prompt }] },
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          ...(withImageConfig && Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
          abortSignal: AbortSignal.timeout(GEMINI_IMAGE_REQUEST_TIMEOUT_MS),
        },
      });
    };

    try {
      const response = await callGeminiImage(Boolean(options.imageSize), true).catch(async (err) => {
        const info = parseGeminiErrorDetails(err);
        if (info.isParameterError && options.imageSize) {
          return callGeminiImage(false, true).catch((err2) => {
            const info2 = parseGeminiErrorDetails(err2);
            if (info2.isParameterError) {
              return callGeminiImage(false, false);
            }
            throw err2;
          });
        }
        if (info.isParameterError) {
          return callGeminiImage(false, false);
        }
        throw err;
      });

      let imageDataUrl: string | null = null;
      let caption = '';

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          caption += part.text;
        }
      }

      if (imageDataUrl) {
        unavailableModelsCache.delete(candidateModel);
        imageFailureReasonCache.delete(candidateModel);
        return {
          imageDataUrl,
          caption: caption.trim(),
          modelUsed: candidateModel,
          attemptedModels: attempted,
        };
      }

      const finishReason = String(response.candidates?.[0]?.finishReason || '');
      const blockReason = String(
        (response as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason || ''
      );
      const isSafety = /SAFETY|IMAGE_SAFETY|PROHIBITED|BLOCK/i.test(`${finishReason} ${blockReason}`);
      failures.push({
        model: candidateModel,
        reason: isSafety ? 'safety_filtered' : 'models_unavailable',
        message: isSafety
          ? `Safety filter triggered (${finishReason || blockReason})`
          : 'Response contained text only without inlineData image',
      });
      await enqueueDiscoveredGemini();
    } catch (error) {
      const info = parseGeminiErrorDetails(error);
      if (info.isApiKeyError) {
        failures.push({ model: candidateModel, reason: 'api_key_invalid', message: info.message });
        abortedForInvalidKey = true;
        break;
      }

      if (info.isQuotaOrBilling) {
        unavailableModelsCache.set(candidateModel, Date.now() + TRANSIENT_UNAVAILABLE_TTL_MS);
        imageFailureReasonCache.set(candidateModel, 'quota_or_billing');
        failures.push({ model: candidateModel, reason: 'quota_or_billing', message: info.message });
      } else if (info.isDeprecatedOrNotFound) {
        const expiresAt = Date.now() + DEPRECATED_MODEL_TTL_MS;
        unavailableModelsCache.set(candidateModel, expiresAt);
        imageFailureReasonCache.set(candidateModel, 'models_unavailable');
        const suggestedModel = extractSuggestedModelFromError(error);
        if (suggestedModel) {
          deprecatedReplacementCache.set(candidateModel, suggestedModel);
          if (!attemptedSet.has(suggestedModel) && !queue.includes(suggestedModel)) {
            queue.unshift(suggestedModel);
          }
        }
        persistAiModelEntries([
          {
            modelId: candidateModel,
            kind: 'image',
            status: 'deprecated',
            ...(suggestedModel ? { replacementModel: suggestedModel } : {}),
            expiresAt,
            updatedAt: new Date().toISOString(),
          },
        ]);
        failures.push({ model: candidateModel, reason: 'models_unavailable', message: info.message });
      } else if (info.isSafety) {
        failures.push({ model: candidateModel, reason: 'safety_filtered', message: info.message });
      } else {
        if (info.isTransient) {
          unavailableModelsCache.set(candidateModel, Date.now() + TRANSIENT_UNAVAILABLE_TTL_MS);
        }
        failures.push({ model: candidateModel, reason: 'models_unavailable', message: info.message });
      }

      await enqueueDiscoveredGemini();
    }

    if (queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }

  if (!abortedForInvalidKey && typeof ai.models.generateImages === 'function') {
    const discoveredImagen = await discoverAvailableImagenModels(ai);
    const imagenCandidates = Array.from(
      new Set([
        ...(options.imagenModels ?? []),
        ...DEFAULT_IMAGEN_FALLBACK_MODELS,
        ...discoveredImagen,
      ])
    ).filter((modelId) => {
      const exp = unavailableModelsCache.get(modelId);
      const cachedReason = imageFailureReasonCache.get(modelId);
      return !exp || exp <= Date.now() || cachedReason === 'quota_or_billing';
    });

    for (const imagenModel of imagenCandidates) {
      if (attemptedSet.has(imagenModel)) continue;
      attemptedSet.add(imagenModel);
      attempted.push(imagenModel);

      try {
        const aspect = options.aspectRatio || '1:1';
        const imgResponse = await ai.models
          .generateImages({
            model: imagenModel,
            prompt: options.prompt,
            config: {
              numberOfImages: 1,
              aspectRatio: aspect,
              outputMimeType: 'image/png',
              includeRaiReason: true,
              abortSignal: AbortSignal.timeout(GEMINI_IMAGE_REQUEST_TIMEOUT_MS),
            },
          })
          .catch((err) => {
            const info = parseGeminiErrorDetails(err);
            if (info.isParameterError) {
              return ai.models.generateImages({
                model: imagenModel,
                prompt: options.prompt,
                config: {
                  numberOfImages: 1,
                  aspectRatio: aspect,
                  abortSignal: AbortSignal.timeout(GEMINI_IMAGE_REQUEST_TIMEOUT_MS),
                },
              });
            }
            throw err;
          });

        const first = imgResponse?.generatedImages?.[0];
        if (first?.image?.imageBytes) {
          const mime = first.image.mimeType || 'image/png';
          unavailableModelsCache.delete(imagenModel);
          imageFailureReasonCache.delete(imagenModel);
          return {
            imageDataUrl: `data:${mime};base64,${first.image.imageBytes}`,
            caption: first.enhancedPrompt ? String(first.enhancedPrompt).trim() : '',
            modelUsed: imagenModel,
            attemptedModels: attempted,
          };
        }

        failures.push({
          model: imagenModel,
          reason: first?.raiFilteredReason ? 'safety_filtered' : 'models_unavailable',
          message: first?.raiFilteredReason || 'Imagen returned no generated image bytes',
        });
      } catch (error) {
        const info = parseGeminiErrorDetails(error);
        if (info.isApiKeyError) {
          failures.push({ model: imagenModel, reason: 'api_key_invalid', message: info.message });
          break;
        }
        if (info.isQuotaOrBilling) {
          unavailableModelsCache.set(imagenModel, Date.now() + TRANSIENT_UNAVAILABLE_TTL_MS);
          imageFailureReasonCache.set(imagenModel, 'quota_or_billing');
          failures.push({ model: imagenModel, reason: 'quota_or_billing', message: info.message });
        } else if (info.isDeprecatedOrNotFound) {
          unavailableModelsCache.set(imagenModel, Date.now() + DEPRECATED_MODEL_TTL_MS);
          imageFailureReasonCache.set(imagenModel, 'models_unavailable');
          failures.push({ model: imagenModel, reason: 'models_unavailable', message: info.message });
        } else {
          if (info.isTransient) {
            unavailableModelsCache.set(imagenModel, Date.now() + TRANSIENT_UNAVAILABLE_TTL_MS);
          }
          failures.push({
            model: imagenModel,
            reason: info.isSafety ? 'safety_filtered' : 'models_unavailable',
            message: info.message,
          });
        }
      }
    }
  }

  const reasonPriority: ImageFallbackReason[] = [
    'api_key_invalid',
    'quota_or_billing',
    'safety_filtered',
    'models_unavailable',
  ];
  const observedReasons = new Set(failures.map((f) => f.reason));
  for (const seed of resolvedGeminiSeeds) {
    const cachedReason = imageFailureReasonCache.get(seed);
    if (cachedReason) observedReasons.add(cachedReason);
  }
  const finalReason = reasonPriority.find((r) => observedReasons.has(r)) ?? 'models_unavailable';

  const diagnosticByReason: Record<ImageFallbackReason, string> = {
    missing_api_key:
      'Chiave GEMINI_API_KEY non configurata sul server: generato poster locale. Puoi anche caricare una foto dalla galleria.',
    api_key_invalid:
      'La chiave GEMINI_API_KEY non risulta valida o autorizzata per generare immagini.',
    quota_or_billing:
      'Tutti i modelli Gemini Image e Imagen hanno restituito quota esaurita o free-tier a limite 0 (su Google AI Studio i modelli immagine richiedono billing/Tier 1 attivo). Puoi caricare subito una foto dalla galleria.',
    safety_filtered:
      'La descrizione è stata bloccata dai filtri di sicurezza AI. Prova a riformulare la scena o carica una foto dalla galleria.',
    models_unavailable:
      'Nessun modello Gemini Image o Imagen disponibile per questa chiave API ha generato un’immagine. Puoi riprovare tra poco o caricare una foto dalla galleria.',
  };

  throw new VisionImageGenerationError({
    reason: finalReason,
    attemptedModels: attempted,
    diagnosticMessage: diagnosticByReason[finalReason],
  });
}

export function resetGeminiModelCachesForTests(): void {
  unavailableModelsCache.clear();
  deprecatedReplacementCache.clear();
  imageFailureReasonCache.clear();
  discoveredModelsCache = null;
  discoveredImagenModelsCache = null;
  registryHydrated = false;
}

export const hasGeminiApiKey = (): boolean => {
  const key = process.env.GEMINI_API_KEY?.trim() || '';
  if (!key) {
    return false;
  }
  if (/replace|changeme|example/i.test(key) || key.length < 20) {
    if (!loggedInvalidKeyWarning) {
      loggedInvalidKeyWarning = true;
      console.warn(
        '[Gemini AI] GEMINI_API_KEY non valida o segnaposto. Inserisci una chiave API valida da https://aistudio.google.com/apikey in .env.production.local e .env.development.local.'
      );
    }
    return false;
  }
  return true;
};

// Shared server-side Gemini client
export const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment secrets.');
  }
  return new GoogleGenAI({ apiKey });
};

export function shouldRetryWithFallbackModel(error: unknown): boolean {
  const details =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; status?: unknown; message?: unknown })
      : {};
  const code = Number(details.code ?? details.status);
  const description = [details.code, details.status, details.message, error]
    .map((value) => String(value ?? ''))
    .join(' ');

  if (
    code === 401 ||
    code === 403 ||
    /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|UNAUTHENTICATED|invalid api key/i.test(
      description
    )
  ) {
    return false;
  }

  return (
    [404, 429, 500, 502, 503, 504].includes(code) ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|TimeoutError|AbortError|timed out|aborted|quota|high demand|temporarily unavailable|fetch failed|network/i.test(
      description
    ) ||
    /model.*(?:not found|not supported|unavailable|deprecated)/i.test(description)
  );
}

export async function generateContentWithFallback(options: {
  model?: string;
  contents: unknown;
  config?: Record<string, unknown>;
  fallbackModels?: string[];
  timeoutMs?: number;
}) {
  hydrateModelCachesFromDatabase();
  const ai = getGeminiClient();
  const isImageTask =
    Boolean(options.config && 'imageConfig' in options.config) ||
    Boolean(options.model && /image/i.test(options.model));
  const defaultFallbacks = isImageTask ? DEFAULT_IMAGE_FALLBACK_MODELS : DEFAULT_TEXT_FALLBACK_MODELS;
  const now = Date.now();
  const effectiveTimeoutMs =
    typeof options.timeoutMs === 'number' &&
    Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > 0
      ? options.timeoutMs
      : GEMINI_REQUEST_TIMEOUT_MS;

  const initialQueue = [
    ...new Set(
      [
        ...(options.model ? [resolveGeminiModelName(options.model)] : []),
        ...(options.fallbackModels ?? defaultFallbacks).map((candidate) =>
          resolveGeminiModelName(candidate)
        ),
      ].filter((candidate) => {
        const expiresAt = unavailableModelsCache.get(candidate);
        return !expiresAt || expiresAt <= now;
      })
    ),
  ];

  const queue = initialQueue.length > 0 ? [...initialQueue] : [...defaultFallbacks];
  const attempted = new Set<string>();
  let discoveryLoaded = false;
  let lastError: unknown;

  while (queue.length > 0) {
    const candidateModel = queue.shift()!;
    if (attempted.has(candidateModel)) continue;
    attempted.add(candidateModel);

    try {
      const requestConfig = {
        ...(options.config ?? {}),
        ...(!options.config?.abortSignal
          ? { abortSignal: AbortSignal.timeout(effectiveTimeoutMs) }
          : {}),
      };
      const response = await ai.models.generateContent({
        model: candidateModel,
        contents: options.contents as any,
        config: requestConfig as any,
      });
      if (attempted.size > 1) {
        console.info(`Gemini request succeeded with fallback model ${candidateModel}.`);
      }
      persistAiModelEntries([
        {
          modelId: candidateModel,
          kind: isImageTask ? 'image' : 'text',
          status: 'active',
          expiresAt: Date.now() + ACTIVE_DISCOVERY_TTL_MS,
          updatedAt: new Date().toISOString(),
        },
      ]);
      return { response, modelUsed: candidateModel };
    } catch (error) {
      lastError = error;
      if (!shouldRetryWithFallbackModel(error)) {
        throw error;
      }

      const details =
        typeof error === 'object' && error !== null
          ? (error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown })
          : {};
      const statusCode = Number(details.code ?? details.status);
      const suggestedModel = extractSuggestedModelFromError(error);

      if (statusCode === 404) {
        const expiresAt = Date.now() + DEPRECATED_MODEL_TTL_MS;
        unavailableModelsCache.set(candidateModel, expiresAt);
        persistAiModelEntries([
          {
            modelId: candidateModel,
            kind: isImageTask ? 'image' : 'text',
            status: 'deprecated',
            ...(suggestedModel ? { replacementModel: suggestedModel } : {}),
            expiresAt,
            updatedAt: new Date().toISOString(),
          },
        ]);
      } else {
        const errorName =
          error instanceof Error ? error.name : typeof details.name === 'string' ? details.name : '';
        const errorMessage = (
          error instanceof Error
            ? error.message
            : typeof details.message === 'string'
              ? details.message
              : ''
        ).toLowerCase();
        const isTransientUnavailable =
          statusCode === 429 ||
          statusCode === 502 ||
          statusCode === 503 ||
          statusCode === 504 ||
          errorName === 'AbortError' ||
          errorName === 'TimeoutError' ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('timed out') ||
          errorMessage.includes('aborted') ||
          errorMessage.includes('unavailable') ||
          errorMessage.includes('high demand') ||
          errorMessage.includes('resource_exhausted') ||
          errorMessage.includes('overloaded');

        if (isTransientUnavailable) {
          unavailableModelsCache.set(candidateModel, Date.now() + TRANSIENT_UNAVAILABLE_TTL_MS);
        }
      }

      if (suggestedModel) {
        deprecatedReplacementCache.set(candidateModel, suggestedModel);
        if (!attempted.has(suggestedModel) && !queue.includes(suggestedModel)) {
          queue.unshift(suggestedModel);
        }
      }

      if (queue.length === 0 && !discoveryLoaded) {
        discoveryLoaded = true;
        const discovered = await discoverAvailableGeminiModels(ai, isImageTask ? 'image' : 'text');
        const currentNow = Date.now();
        for (const modelName of discovered) {
          const expiresAt = unavailableModelsCache.get(modelName);
          if (
            !attempted.has(modelName) &&
            !queue.includes(modelName) &&
            (!expiresAt || expiresAt <= currentNow)
          ) {
            queue.push(modelName);
          }
        }
      }

      if (queue.length === 0) {
        throw error;
      }

      console.warn(
        `Gemini model ${candidateModel} failed; falling back to next model.`,
        error instanceof Error ? error.message : error
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}
