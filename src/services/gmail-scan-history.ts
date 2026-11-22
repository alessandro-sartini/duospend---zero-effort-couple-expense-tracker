import type {
  GmailAccountScanHistory,
  GmailScanInterval,
  GmailScanState,
  GmailSearchMode,
} from '../types';

export const ALLOWED_GMAIL_LOOKBACK_DAYS = [7, 30, 90, 180, 365] as const;

export const ALLOWED_GMAIL_SEARCH_MODES: readonly GmailSearchMode[] = [
  'tracking_start',
  'month_start',
  'prev_month_start',
  'year_start',
  'custom_date',
  'days',
];

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_STORED_ACCOUNTS = 6;
const MAX_COVERAGE_INTERVALS = 12;

export const DEFAULT_GMAIL_STALE_THRESHOLD_DAYS = 7;

export function sanitizeGmailIsoDate(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  const match = ISO_DATE_RE.exec(trimmed);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  const check = new Date(year, month - 1, day);
  if (
    check.getFullYear() !== year ||
    check.getMonth() !== month - 1 ||
    check.getDate() !== day
  ) {
    return undefined;
  }
  return trimmed;
}

export function getLocalIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const clean = sanitizeGmailIsoDate(isoDate) || getLocalIsoDate();
  const [y, m, d] = clean.split('-').map(Number);
  const shifted = new Date(y, m - 1, d + deltaDays);
  return getLocalIsoDate(shifted);
}

export function diffIsoDays(fromIso: string, toIso: string): number {
  const cleanFrom = sanitizeGmailIsoDate(fromIso);
  const cleanTo = sanitizeGmailIsoDate(toIso);
  if (!cleanFrom || !cleanTo) return 0;
  const [fy, fm, fd] = cleanFrom.split('-').map(Number);
  const [ty, tm, td] = cleanTo.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd, 12, 0, 0);
  const toUtc = Date.UTC(ty, tm - 1, td, 12, 0, 0);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

export function formatDateItShort(iso?: string): string {
  const clean = sanitizeGmailIsoDate(iso);
  if (!clean) return '';
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

export function normalizeGmailAccountKey(accountEmail?: string): string {
  if (typeof accountEmail !== 'string') return 'default';
  const normalized = accountEmail.trim().toLowerCase().slice(0, 254);
  return normalized || 'default';
}

export function mergeScanIntervals(intervals: GmailScanInterval[]): GmailScanInterval[] {
  const valid = intervals
    .map((entry) => {
      const from = sanitizeGmailIsoDate(entry?.from);
      const until = sanitizeGmailIsoDate(entry?.until);
      if (!from || !until) return null;
      return from <= until ? { from, until } : { from: until, until: from };
    })
    .filter((entry): entry is GmailScanInterval => entry !== null)
    .sort((a, b) => a.from.localeCompare(b.from) || a.until.localeCompare(b.until));

  if (valid.length === 0) return [];

  const merged: GmailScanInterval[] = [{ ...valid[0] }];
  for (let i = 1; i < valid.length; i += 1) {
    const current = valid[i];
    const last = merged[merged.length - 1];
    const nextAdjacentDay = shiftIsoDate(last.until, 1);
    if (current.from <= nextAdjacentDay) {
      if (current.until > last.until) {
        last.until = current.until;
      }
    } else {
      merged.push({ ...current });
    }
  }

  return merged.slice(-MAX_COVERAGE_INTERVALS);
}

export function sanitizeGmailScanState(
  raw: unknown,
  fallback?: GmailScanState
): GmailScanState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback;
  }

  const record = raw as Record<string, unknown>;
  const rawMode = typeof record.searchMode === 'string' ? record.searchMode.trim() : '';
  const searchMode: GmailSearchMode = (ALLOWED_GMAIL_SEARCH_MODES as readonly string[]).includes(
    rawMode
  )
    ? (rawMode as GmailSearchMode)
    : fallback?.searchMode ?? 'month_start';

  const rawDays = Number(record.lookbackDays);
  const lookbackDays = (ALLOWED_GMAIL_LOOKBACK_DAYS as readonly number[]).includes(rawDays)
    ? rawDays
    : fallback?.lookbackDays ?? 30;

  const customStartDate =
    record.customStartDate === '' || record.customStartDate === null
      ? undefined
      : sanitizeGmailIsoDate(record.customStartDate) ??
        (record.customStartDate === undefined ? fallback?.customStartDate : undefined);

  let accounts: Record<string, GmailAccountScanHistory> | undefined;
  if (record.accounts && typeof record.accounts === 'object' && !Array.isArray(record.accounts)) {
    const cleanedAccounts: Record<string, GmailAccountScanHistory> = {};
    for (const [rawKey, rawHistory] of Object.entries(
      record.accounts as Record<string, unknown>
    )) {
      if (Object.keys(cleanedAccounts).length >= MAX_STORED_ACCOUNTS) break;
      const accountKey = normalizeGmailAccountKey(rawKey);
      if (!rawHistory || typeof rawHistory !== 'object' || Array.isArray(rawHistory)) continue;
      const hist = rawHistory as Record<string, unknown>;
      const lastScanStartDate = sanitizeGmailIsoDate(hist.lastScanStartDate);
      const lastScanEndDate = sanitizeGmailIsoDate(hist.lastScanEndDate);
      const rawIntervals = Array.isArray(hist.coverageIntervals)
        ? (hist.coverageIntervals as GmailScanInterval[])
        : [];
      const mergedIntervals = mergeScanIntervals([
        ...rawIntervals,
        ...(lastScanStartDate && lastScanEndDate
          ? [{ from: lastScanStartDate, until: lastScanEndDate }]
          : []),
      ]);
      if (mergedIntervals.length === 0) continue;
      const latestInterval = mergedIntervals[mergedIntervals.length - 1];
      const rawTimestamp =
        typeof hist.lastCompletedScanAt === 'string' ? hist.lastCompletedScanAt.trim().slice(0, 40) : '';
      const parsedTs = rawTimestamp ? Date.parse(rawTimestamp) : NaN;
      const lastCompletedScanAt = Number.isFinite(parsedTs)
        ? new Date(parsedTs).toISOString()
        : `${latestInterval.until}T12:00:00.000Z`;

      cleanedAccounts[accountKey] = {
        lastCompletedScanAt,
        lastScanStartDate: lastScanStartDate ?? latestInterval.from,
        lastScanEndDate: lastScanEndDate ?? latestInterval.until,
        coverageIntervals: mergedIntervals,
      };
    }
    if (Object.keys(cleanedAccounts).length > 0) {
      accounts = cleanedAccounts;
    }
  } else if (fallback?.accounts && Object.keys(fallback.accounts).length > 0) {
    accounts = fallback.accounts;
  }

  return {
    searchMode,
    lookbackDays,
    ...(customStartDate ? { customStartDate } : {}),
    ...(accounts ? { accounts } : {}),
  };
}

export function resolveRequestedScanStartDate(params: {
  searchMode: GmailSearchMode;
  lookbackDays: number;
  customStartDate?: string;
  trackingStartDate?: string;
  todayIso?: string;
}): string | undefined {
  const today = sanitizeGmailIsoDate(params.todayIso) || getLocalIsoDate();
  const floorDate = sanitizeGmailIsoDate(params.trackingStartDate);
  const maxIsoDate = (candidate?: string, floor?: string): string | undefined => {
    if (!candidate) return floor;
    if (!floor) return candidate;
    return candidate >= floor ? candidate : floor;
  };

  const [y, m] = today.split('-').map(Number);

  if (params.searchMode === 'tracking_start') {
    return floorDate || `${y}-${String(m).padStart(2, '0')}-01`;
  }
  if (params.searchMode === 'month_start') {
    return maxIsoDate(`${y}-${String(m).padStart(2, '0')}-01`, floorDate);
  }
  if (params.searchMode === 'prev_month_start') {
    const prev = new Date(y, m - 2, 1);
    return maxIsoDate(
      `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`,
      floorDate
    );
  }
  if (params.searchMode === 'year_start') {
    return maxIsoDate(`${y}-01-01`, floorDate);
  }
  if (params.searchMode === 'custom_date') {
    const cleanCustom = sanitizeGmailIsoDate(params.customStartDate);
    return maxIsoDate(cleanCustom, floorDate);
  }

  const days = Math.max(0, Number(params.lookbackDays) || 30);
  const lookbackIso = shiftIsoDate(today, -days);
  return maxIsoDate(lookbackIso, floorDate);
}

function getAccountHistory(
  gmailScanState: GmailScanState | undefined,
  accountEmail?: string,
  allowMostRecentFallback = false
): GmailAccountScanHistory | undefined {
  const accounts = gmailScanState?.accounts;
  if (!accounts) return undefined;

  if (accountEmail) {
    const key = normalizeGmailAccountKey(accountEmail);
    if (accounts[key]) return accounts[key];
    if (accounts.default) return accounts.default;
    if (!allowMostRecentFallback) return undefined;
  } else if (accounts.default) {
    return accounts.default;
  }

  const entries = Object.values(accounts);
  if (entries.length === 0) return undefined;
  return entries.sort((a, b) =>
    b.lastCompletedScanAt.localeCompare(a.lastCompletedScanAt)
  )[0];
}

export interface SmartGmailProposal {
  shouldApply: boolean;
  proposedStartDate: string;
  requestedStartDate: string;
  coveredUntilDate: string;
  savedDays: number;
  daysSinceLastScan: number;
  alreadyScannedToday: boolean;
}

export function computeSmartIncrementalProposal(params: {
  gmailScanState?: GmailScanState;
  accountEmail?: string;
  searchMode: GmailSearchMode;
  requestedStartDate?: string;
  todayIso?: string;
}): SmartGmailProposal | null {
  if (params.searchMode === 'custom_date') return null;
  const requestedStartDate = sanitizeGmailIsoDate(params.requestedStartDate);
  if (!requestedStartDate) return null;

  const today = sanitizeGmailIsoDate(params.todayIso) || getLocalIsoDate();
  const history = getAccountHistory(params.gmailScanState, params.accountEmail, false);
  if (!history) return null;

  const intervals = mergeScanIntervals([
    ...(history.coverageIntervals || []),
    { from: history.lastScanStartDate, until: history.lastScanEndDate },
  ]);

  const coveringInterval = intervals.find(
    (interval) => interval.from <= requestedStartDate && interval.until >= requestedStartDate
  );
  if (!coveringInterval) return null;

  const coveredUntilDate =
    coveringInterval.until <= today ? coveringInterval.until : today;
  const proposedStartDate = coveredUntilDate;
  const savedDays = Math.max(0, diffIsoDays(requestedStartDate, proposedStartDate));
  const alreadyScannedToday = coveredUntilDate === today;

  if (savedDays <= 0 && !alreadyScannedToday) {
    return null;
  }

  return {
    shouldApply: true,
    proposedStartDate,
    requestedStartDate,
    coveredUntilDate,
    savedDays,
    daysSinceLastScan: Math.max(0, diffIsoDays(coveredUntilDate, today)),
    alreadyScannedToday,
  };
}

export function recordCompletedGmailScan(
  currentState: GmailScanState | undefined,
  params: {
    accountEmail?: string;
    searchMode: GmailSearchMode;
    lookbackDays: number;
    customStartDate?: string;
    scanStartDate: string;
    scanEndDate?: string;
    completedAtIso?: string;
  }
): GmailScanState {
  const endDate = sanitizeGmailIsoDate(params.scanEndDate) || getLocalIsoDate();
  const rawStartDate = sanitizeGmailIsoDate(params.scanStartDate) || endDate;
  const startDate = rawStartDate <= endDate ? rawStartDate : endDate;
  const completedAtIso = params.completedAtIso || new Date().toISOString();
  const accountKey = normalizeGmailAccountKey(params.accountEmail);

  const prevAccounts = currentState?.accounts ? { ...currentState.accounts } : {};
  const prevHistory = prevAccounts[accountKey];
  const coverageIntervals = mergeScanIntervals([
    ...(prevHistory?.coverageIntervals || []),
    { from: startDate, until: endDate },
  ]);
  const latestEndDate =
    prevHistory && prevHistory.lastScanEndDate > endDate
      ? prevHistory.lastScanEndDate
      : endDate;

  prevAccounts[accountKey] = {
    lastCompletedScanAt: completedAtIso,
    lastScanStartDate: startDate,
    lastScanEndDate: latestEndDate,
    coverageIntervals,
  };

  return {
    searchMode: params.searchMode,
    lookbackDays: params.lookbackDays,
    ...(params.customStartDate ? { customStartDate: sanitizeGmailIsoDate(params.customStartDate) } : {}),
    accounts: prevAccounts,
  };
}

export interface GmailScanFreshnessStatus {
  isStale: true;
  daysSinceLastScan: number;
  lastScannedDate: string;
  suggestedResumeDate: string;
}

export function evaluateGmailScanFreshness(params: {
  gmailScanState?: GmailScanState;
  accountEmail?: string;
  trackingStartDate?: string;
  todayIso?: string;
  staleThresholdDays?: number;
}): GmailScanFreshnessStatus | null {
  const threshold = params.staleThresholdDays ?? DEFAULT_GMAIL_STALE_THRESHOLD_DAYS;
  const today = sanitizeGmailIsoDate(params.todayIso) || getLocalIsoDate();
  const history = getAccountHistory(params.gmailScanState, params.accountEmail, true);
  if (!history) return null;

  const lastScannedDate = sanitizeGmailIsoDate(history.lastScanEndDate);
  if (!lastScannedDate) return null;

  const daysSinceLastScan = diffIsoDays(lastScannedDate, today);
  if (daysSinceLastScan < threshold) {
    return null;
  }

  const floorDate = sanitizeGmailIsoDate(params.trackingStartDate);
  if (floorDate && floorDate > today) {
    return null;
  }

  const suggestedResumeDate =
    floorDate && floorDate > lastScannedDate ? floorDate : lastScannedDate;

  return {
    isStale: true,
    daysSinceLastScan,
    lastScannedDate,
    suggestedResumeDate,
  };
}
