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
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-3.1-flash-lite-image',
  'gemini-2.5-flash-image',
];

const MODEL_ALIAS_MAP: Record<string, string> = {
  'gemini-3-pro-image-preview': 'gemini-3-pro-image',
  'gemini-2.0-flash-preview-image-generation': 'gemini-3.1-flash-image',
  'gemini-2.5-flash': 'gemini-3.8-flash',
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-2.0-flash': 'gemini-3.8-flash',
};

const ACTIVE_DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;
const DEPRECATED_MODEL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TRANSIENT_UNAVAILABLE_TTL_MS = 10 * 60 * 1000;
const GEMINI_REQUEST_TIMEOUT_MS = 22_000;
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

export function resetGeminiModelCachesForTests(): void {
  unavailableModelsCache.clear();
  deprecatedReplacementCache.clear();
  discoveredModelsCache = null;
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
}) {
  hydrateModelCachesFromDatabase();
  const ai = getGeminiClient();
  const isImageTask =
    Boolean(options.config && 'imageConfig' in options.config) ||
    Boolean(options.model && /image/i.test(options.model));
  const defaultFallbacks = isImageTask ? DEFAULT_IMAGE_FALLBACK_MODELS : DEFAULT_TEXT_FALLBACK_MODELS;
  const now = Date.now();

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
          ? { abortSignal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS) }
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
          errorMessage.includes('timeout') ||
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
