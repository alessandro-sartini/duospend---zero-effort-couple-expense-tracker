import type {
  ContributionPreview,
  GoalVirtualSavingsSummary,
  SavingGoal,
  SavingsChallenge,
  SavingsChallengeContribution,
  SavingsChallengeEstimate,
  SavingsChallengeHistoryEntry,
  SavingsChallengeSplitScope,
  SavingsChallengesCalculationPolicy,
} from '../types';
import { UNAUTHORIZED_EVENT } from './storage';

const CHALLENGES_CACHE_KEY = 'duospend_savings_challenges_cache_v1';

export interface SavingsChallengesListResponse {
  success: boolean;
  challenges: SavingsChallenge[];
  goalSummaries: GoalVirtualSavingsSummary[];
  policy: SavingsChallengesCalculationPolicy;
  lastUpdated: string;
}

export interface CachedSavingsChallengesSnapshot {
  challenges: SavingsChallenge[];
  goalSummaries: GoalVirtualSavingsSummary[];
  policy?: SavingsChallengesCalculationPolicy;
  cachedAt: string;
}

export class SavingsChallengeApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SavingsChallengeApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sc-${crypto.randomUUID()}`;
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `sc-${hex}`;
  }
  return `sc-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function isOfflineNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error) {
    return /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);
  }
  return false;
}

export function loadCachedSavingsChallenges(): CachedSavingsChallengesSnapshot | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CHALLENGES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSavingsChallengesSnapshot;
    if (!parsed || !Array.isArray(parsed.challenges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedSavingsChallenges(snapshot: {
  challenges: SavingsChallenge[];
  goalSummaries: GoalVirtualSavingsSummary[];
  policy?: SavingsChallengesCalculationPolicy;
}): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: CachedSavingsChallengesSnapshot = {
      challenges: snapshot.challenges,
      goalSummaries: snapshot.goalSummaries,
      ...(snapshot.policy ? { policy: snapshot.policy } : {}),
      cachedAt: new Date().toISOString(),
    };
    localStorage.setItem(CHALLENGES_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to cache savings challenges locally:', error);
  }
}

export function clearCachedSavingsChallenges(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CHALLENGES_CACHE_KEY);
  } catch {
    // Ignore cleanup failures
  }
}

async function requestChallengeApi<T>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: Record<string, unknown>;
    idempotencyKey?: string;
  } = {}
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers['X-Requested-With'] = 'XMLHttpRequest';
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    ...(method !== 'GET' ? { body: JSON.stringify(options.body ?? {}) } : {}),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    const message =
      typeof data.error === 'string' && data.error.trim()
        ? data.error
        : `Errore nella richiesta (${res.status}).`;
    const code = typeof data.code === 'string' ? data.code : undefined;
    throw new SavingsChallengeApiError(message, res.status, code, data);
  }

  return data as T;
}

export async function fetchSavingsChallenges(options?: {
  status?: string;
  goalId?: string;
  recalculate?: boolean;
}): Promise<SavingsChallengesListResponse> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.goalId) params.set('goalId', options.goalId);
  if (options?.recalculate === false) params.set('recalculate', 'false');
  const query = params.toString();
  const data = await requestChallengeApi<SavingsChallengesListResponse>(
    `/api/savings-challenges${query ? `?${query}` : ''}`
  );
  saveCachedSavingsChallenges({
    challenges: data.challenges,
    goalSummaries: data.goalSummaries,
    policy: data.policy,
  });
  return data;
}

export async function estimateSavingsChallenge(payload: {
  categories: string[];
  startMonth: string;
  durationMonths: number;
  monthlyLimit?: number;
  goalId?: string;
  splitScope?: SavingsChallengeSplitScope;
  timezone?: string;
  currency?: string;
}): Promise<{ success: boolean; estimate: SavingsChallengeEstimate }> {
  return requestChallengeApi('/api/savings-challenges/estimate', {
    method: 'POST',
    body: payload,
  });
}

export async function createSavingsChallenge(
  payload: {
    title: string;
    goalId: string;
    categories: string[];
    monthlyLimit: number;
    startMonth: string;
    durationMonths: number;
    splitScope?: SavingsChallengeSplitScope;
    timezone?: string;
    currency?: string;
  },
  idempotencyKey = generateIdempotencyKey()
): Promise<{
  success: boolean;
  challenge: SavingsChallenge;
  goalSummaries: GoalVirtualSavingsSummary[];
}> {
  return requestChallengeApi('/api/savings-challenges', {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export async function updateSavingsChallenge(
  id: string,
  payload: {
    title?: string;
    goalId?: string;
    categories?: string[];
    monthlyLimit?: number;
    startMonth?: string;
    durationMonths?: number;
    splitScope?: SavingsChallengeSplitScope;
    timezone?: string;
    expectedVersion?: number;
    confirmRetroactive?: boolean;
  },
  idempotencyKey = generateIdempotencyKey()
): Promise<{
  success: boolean;
  challenge: SavingsChallenge;
  goalSummaries: GoalVirtualSavingsSummary[];
}> {
  return requestChallengeApi(`/api/savings-challenges/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: payload,
    idempotencyKey,
  });
}

export async function deleteSavingsChallenge(
  id: string,
  payload: { expectedVersion?: number; revertAppliedContributions?: boolean } = {}
): Promise<{
  success: boolean;
  deletedId: string;
  revertedAmount: number;
  updatedGoals: SavingGoal[];
  goalSummaries: GoalVirtualSavingsSummary[];
}> {
  return requestChallengeApi(`/api/savings-challenges/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: payload,
  });
}

export async function pauseSavingsChallenge(
  id: string,
  expectedVersion?: number,
  idempotencyKey = generateIdempotencyKey()
): Promise<{
  success: boolean;
  challenge: SavingsChallenge;
  goalSummaries: GoalVirtualSavingsSummary[];
}> {
  return requestChallengeApi(`/api/savings-challenges/${encodeURIComponent(id)}/pause`, {
    method: 'POST',
    body: expectedVersion !== undefined ? { expectedVersion } : {},
    idempotencyKey,
  });
}

export async function resumeSavingsChallenge(
  id: string,
  expectedVersion?: number,
  idempotencyKey = generateIdempotencyKey()
): Promise<{
  success: boolean;
  challenge: SavingsChallenge;
  goalSummaries: GoalVirtualSavingsSummary[];
}> {
  return requestChallengeApi(`/api/savings-challenges/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
    body: expectedVersion !== undefined ? { expectedVersion } : {},
    idempotencyKey,
  });
}

export async function completeSavingsChallenge(
  id: string,
  expectedVersion?: number,
  idempotencyKey = generateIdempotencyKey()
): Promise<{
  success: boolean;
  challenge: SavingsChallenge;
  goalSummaries: GoalVirtualSavingsSummary[];
}> {
  return requestChallengeApi(`/api/savings-challenges/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    body: expectedVersion !== undefined ? { expectedVersion } : {},
    idempotencyKey,
  });
}

export async function recalculateSavingsChallenge(id: string): Promise<{
  success: boolean;
  challenge: SavingsChallenge;
  goalSummaries: GoalVirtualSavingsSummary[];
}> {
  return requestChallengeApi(`/api/savings-challenges/${encodeURIComponent(id)}/recalculate`, {
    method: 'POST',
    body: {},
  });
}

export async function previewChallengeContribution(
  id: string,
  payload: { amount?: number } = {}
): Promise<{ success: boolean; preview: ContributionPreview }> {
  return requestChallengeApi(
    `/api/savings-challenges/${encodeURIComponent(id)}/confirm-contribution`,
    {
      method: 'POST',
      body: { ...payload, dryRun: true },
    }
  );
}

export async function confirmChallengeContribution(
  id: string,
  payload: {
    amount?: number;
    periodYm?: string;
    note?: string;
    expectedVersion?: number;
  },
  idempotencyKey = generateIdempotencyKey()
): Promise<{
  success: boolean;
  challenge: SavingsChallenge;
  contribution: SavingsChallengeContribution;
  updatedGoal: SavingGoal;
  goalSummaries: GoalVirtualSavingsSummary[];
  idempotentReplay?: boolean;
}> {
  return requestChallengeApi(
    `/api/savings-challenges/${encodeURIComponent(id)}/confirm-contribution`,
    {
      method: 'POST',
      body: { ...payload, confirmed: true, idempotencyKey },
      idempotencyKey,
    }
  );
}

export async function revertChallengeContribution(
  id: string,
  payload: {
    contributionId?: string;
    reason?: string;
    expectedVersion?: number;
  } = {},
  idempotencyKey = generateIdempotencyKey()
): Promise<{
  success: boolean;
  challenge: SavingsChallenge;
  revertedContribution: SavingsChallengeContribution;
  updatedGoal?: SavingGoal;
  goalSummaries: GoalVirtualSavingsSummary[];
}> {
  return requestChallengeApi(
    `/api/savings-challenges/${encodeURIComponent(id)}/revert-contribution`,
    {
      method: 'POST',
      body: { ...payload, idempotencyKey },
      idempotencyKey,
    }
  );
}

export async function fetchSavingsChallengeHistory(id: string): Promise<{
  success: boolean;
  challengeId: string;
  history: SavingsChallengeHistoryEntry[];
  contributions: SavingsChallengeContribution[];
}> {
  return requestChallengeApi(`/api/savings-challenges/${encodeURIComponent(id)}/history`);
}
