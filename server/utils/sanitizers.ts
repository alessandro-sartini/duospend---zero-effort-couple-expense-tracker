import path from 'path';
import type {
  CoupleProfile,
  Expense,
  ExpenseCategory,
  Payer,
  SavingGoal,
  Settlement,
  SplitType,
} from '../../src/types';

export const ALLOWED_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Spesa',
  'Ristoranti e Bar',
  'Casa e Affitto',
  'Bollette e Utenze',
  'Trasporti',
  'Shopping',
  'Svago e Intrattenimento',
  'Salute e Benessere',
  'Viaggi',
  'Matrimonio e Obiettivi',
  'Altro',
  'Groceries',
  'Dining Out',
  'Housing',
  'Utilities',
  'Transportation',
  'Entertainment',
  'Health & Wellness',
  'Travel',
  'Wedding & Goals',
  'Other',
];

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ALLOWED_PAYERS = new Set<Payer>(['user', 'partner']);
const ALLOWED_SPLIT_TYPES = new Set<SplitType>([
  '50_50',
  '100_user',
  '100_partner',
  'custom',
]);
const ALLOWED_SOURCES = new Set<Expense['source']>([
  'gmail',
  'camera',
  'manual',
  'notification',
]);
const ALLOWED_IMAGE_SIZES = new Set(['1K', '2K', '4K']);
const LEGACY_USER_NAMES = new Set(['utente 1', 'legacy_user']);
const LEGACY_PARTNER_NAMES = new Set(['fidanzata']);

/**
 * Recursively clones plain JSON data while stripping prototype-pollution keys.
 */
export function stripDangerousKeys<T>(value: T, depth = 0): T {
  if (depth > 20 || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripDangerousKeys(item, depth + 1)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    clean[key] = stripDangerousKeys(entryValue, depth + 1);
  }
  return clean as T;
}

/**
 * Strips control characters, HTML tags, and normalizes untrusted plain text.
 */
export function sanitizePlainText(
  value: unknown,
  maxLength: number,
  fallback = ''
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return cleaned || fallback;
}

/**
 * Neutralizes prompt delimiters and common prompt-injection directives before sending untrusted text to AI models.
 */
export function sanitizePromptInput(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/"""|'''|<\|+|\|+>/g, ' ')
    .replace(
      /(?:^|\n)\s*(?:ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?|system\s*:|developer\s*:|assistant\s*:|you\s+are\s+now\b)/gi,
      '\n[testo-utente] '
    )
    .trim()
    .slice(0, maxLength);
}

const PRIVATE_OR_LOCAL_HOST_PATTERN =
  /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|\[?::1\]?|\[?fe80:.*|\[?f[cd][0-9a-f]{2}:.*|.*\.local)$/i;

const LOOPBACK_HOST_PATTERN = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?)$/i;

/**
 * Detects path traversal attempts, encoded dot-segments, backslashes, null bytes,
 * and direct access to sensitive backend files or internal directories.
 */
export function hasPathTraversalOrForbiddenRoute(rawPath: unknown): boolean {
  if (typeof rawPath !== 'string') return false;
  const pathWithoutQuery = rawPath.split(/[?#]/)[0] || '';
  if (!pathWithoutQuery) return false;

  if (/\0|%00/i.test(rawPath) || rawPath.includes('\\') || /%5c/i.test(rawPath)) {
    return true;
  }

  let decoded = pathWithoutQuery;
  for (let pass = 0; pass < 3; pass++) {
    if (/(?:^|[\\/])\.\.(?:$|[\\/])/i.test(decoded) || decoded.includes('\\')) {
      return true;
    }
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return true;
    }
  }

  if (/(?:^|[\\/])\.\.(?:$|[\\/])/i.test(decoded) || decoded.includes('\\')) {
    return true;
  }

  const normalized = decoded.replace(/\/+/g, '/').toLowerCase();
  if (
    /(?:^|\/)(?:\.env(?:\.|$)|duospend_database\.json(?:\.|$)|[^/]+\.(?:sqlite(?:-wal|-shm)?|db)(?:$|\/)|\.git(?:$|\/)|server(?:$|\/)|package(?:-lock)?\.json(?:$|\/)|tsconfig\.json(?:$|\/))/i.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Resolves a relative path safely within `rootDir`, preventing directory escape.
 */
export function resolveSafeChildPath(rootDir: string, relativeTarget: string): string | null {
  if (
    typeof relativeTarget !== 'string' ||
    !relativeTarget.trim() ||
    relativeTarget.includes('\0') ||
    path.isAbsolute(relativeTarget) ||
    hasPathTraversalOrForbiddenRoute(relativeTarget)
  ) {
    return null;
  }

  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, relativeTarget);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolvedTarget;
}

/**
 * Validates base64 image payloads for OCR upload by verifying MIME and binary magic bytes.
 */
export function validateUploadedImagePayload(
  imageBase64: unknown,
  declaredMimeType: unknown
): {
  valid: boolean;
  cleanBase64?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  error?: string;
} {
  if (typeof imageBase64 !== 'string' || imageBase64.length > 14_000_000) {
    return { valid: false, error: 'Immagine dello scontrino non valida o troppo grande.' };
  }

  const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const match = imageBase64.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i
  );
  if (!match) {
    return { valid: false, error: 'Formato data URL dell’immagine non supportato.' };
  }

  const headerMime = match[1].toLowerCase() as 'image/jpeg' | 'image/png' | 'image/webp';
  if (declaredMimeType !== undefined) {
    if (typeof declaredMimeType !== 'string' || !allowedMimes.has(declaredMimeType.toLowerCase())) {
      return { valid: false, error: 'MIME type dell’immagine non consentito.' };
    }
    if (declaredMimeType.toLowerCase() !== headerMime) {
      return { valid: false, error: 'Incongruenza tra MIME type dichiarato e contenuto immagine.' };
    }
  }

  const cleanBase64 = match[2].replace(/\s+/g, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (buffer.length < 12) {
    return { valid: false, error: 'File immagine vuoto o corrotto.' };
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if (
    (headerMime === 'image/jpeg' && !isJpeg) ||
    (headerMime === 'image/png' && !isPng) ||
    (headerMime === 'image/webp' && !isWebp)
  ) {
    return {
      valid: false,
      error: 'Firma binaria del file non valida per il formato immagine dichiarato.',
    };
  }

  return { valid: true, cleanBase64, mimeType: headerMime };
}

/**
 * Validates the Ubuntu home-server target URL, preventing SSRF loops and path navigation.
 */
export function validateUbuntuSyncTarget(
  rawUrl: unknown,
  backendPort = 3000
): { valid: boolean; targetUrl?: string; error?: string } {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: false, error: 'URL Ubuntu non configurato.' };
  }
  const trimmed = rawUrl.trim();
  if (hasPathTraversalOrForbiddenRoute(trimmed)) {
    return { valid: false, error: 'URL Ubuntu contiene sequenze di percorso non consentite.' };
  }

  try {
    const target = new URL(trimmed);
    if (!['http:', 'https:'].includes(target.protocol)) {
      return { valid: false, error: 'Protocollo URL Ubuntu non consentito.' };
    }
    if (target.username || target.password || target.search || target.hash) {
      return { valid: false, error: 'URL Ubuntu contiene credenziali o parametri non consentiti.' };
    }
    if (target.pathname && target.pathname !== '/') {
      return { valid: false, error: 'URL Ubuntu non deve includere sottopercorsi arbitrari.' };
    }

    const hostname = target.hostname.toLowerCase();
    if (
      hostname === '169.254.169.254' ||
      hostname === 'metadata.google.internal' ||
      hostname.startsWith('169.254.')
    ) {
      return { valid: false, error: 'Indirizzo metadata non consentito.' };
    }

    const effectivePort = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
    if (LOOPBACK_HOST_PATTERN.test(hostname) && effectivePort === backendPort) {
      return {
        valid: false,
        error: 'URL Ubuntu non può puntare allo stesso server backend locale.',
      };
    }

    return {
      valid: true,
      targetUrl: new URL('/api/data', target.origin).toString(),
    };
  } catch {
    return { valid: false, error: 'URL Ubuntu configurato non valido.' };
  }
}

/**
 * Validates and restricts image/receipt URLs to safe local asset paths, public HTTPS URLs, or safe raster/SVG base64 images.
 */
export function sanitizeSafeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 14_000_000) return undefined;

  if (
    /^\/(?:src\/)?assets\/[a-zA-Z0-9._\-/]+\.(?:jpe?g|png|webp|svg)$/i.test(trimmed) &&
    !hasPathTraversalOrForbiddenRoute(trimmed) &&
    !trimmed.includes('//')
  ) {
    return trimmed;
  }

  if (/^https:\/\//i.test(trimmed) && trimmed.length <= 2048) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        return undefined;
      }
      if (PRIVATE_OR_LOCAL_HOST_PATTERN.test(parsed.hostname)) {
        return undefined;
      }
      if (
        hasPathTraversalOrForbiddenRoute(parsed.pathname) ||
        /^\/(?:api|dev|server)(?:\/|$)/i.test(parsed.pathname)
      ) {
        return undefined;
      }
      return parsed.toString();
    } catch {
      return undefined;
    }
  }

  const dataMatch = trimmed.match(
    /^data:image\/(jpeg|png|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/i
  );
  if (dataMatch) {
    const kind = dataMatch[1].toLowerCase();
    if (kind === 'svg+xml') {
      try {
        const decodedSvg = Buffer.from(dataMatch[2], 'base64').toString('utf8');
        if (/<script|on\w+\s*=|javascript:|<foreignObject/i.test(decodedSvg)) {
          return undefined;
        }
      } catch {
        return undefined;
      }
      return trimmed;
    }

    const rasterCheck = validateUploadedImagePayload(trimmed, `image/${kind}`);
    return rasterCheck.valid ? trimmed : undefined;
  }

  return undefined;
}

export function sanitizeIsoDate(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = Date.parse(`${trimmed}T00:00:00Z`);
      if (Number.isFinite(parsed)) {
        return trimmed;
      }
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function sanitizeCurrency(value: unknown, fallback = 'EUR'): string {
  if (typeof value !== 'string') return fallback;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
}

const BUILTIN_CATEGORY_LOWER_SET = new Set(
  ALLOWED_EXPENSE_CATEGORIES.map((category) => category.toLowerCase())
);
const NON_HIDEABLE_CATEGORIES = new Set(['Altro', 'Other']);

export function sanitizeCustomCategories(
  raw: unknown,
  fallback?: string[]
): string[] | undefined {
  if (raw === undefined) return fallback;
  if (!Array.isArray(raw)) return undefined;

  const cleaned: string[] = [];
  const seenLower = new Set<string>();
  for (const entry of raw) {
    const label = sanitizePlainText(entry, 40);
    if (label.length < 2) continue;
    const lower = label.toLowerCase();
    if (BUILTIN_CATEGORY_LOWER_SET.has(lower) || seenLower.has(lower)) continue;
    seenLower.add(lower);
    cleaned.push(label);
    if (cleaned.length >= 40) break;
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

export function sanitizeHiddenCategories(
  raw: unknown,
  fallback?: string[]
): string[] | undefined {
  if (raw === undefined) return fallback;
  if (!Array.isArray(raw)) return undefined;

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (
      NON_HIDEABLE_CATEGORIES.has(trimmed) ||
      !ALLOWED_EXPENSE_CATEGORIES.includes(trimmed as ExpenseCategory) ||
      seen.has(trimmed)
    ) {
      continue;
    }
    seen.add(trimmed);
    cleaned.push(trimmed);
    if (cleaned.length >= 30) break;
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

export function buildAllowedCategorySet(
  profile?: Pick<CoupleProfile, 'customCategories'>,
  goals?: Array<Pick<SavingGoal, 'title'>>
): Set<string> {
  const allowed = new Set<string>(ALLOWED_EXPENSE_CATEGORIES);
  if (Array.isArray(profile?.customCategories)) {
    for (const cat of profile.customCategories) {
      const clean = sanitizePlainText(cat, 40);
      if (clean.length >= 2) allowed.add(clean);
    }
  }
  if (Array.isArray(goals)) {
    for (const goal of goals) {
      const clean = sanitizePlainText(goal?.title, 100);
      if (clean.length >= 1) allowed.add(clean);
    }
  }
  return allowed;
}

export function sanitizeExpenseCategory(
  value: unknown,
  fallback: ExpenseCategory = 'Altro',
  allowedCategories?: Set<string>
): ExpenseCategory {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      ALLOWED_EXPENSE_CATEGORIES.includes(trimmed as ExpenseCategory) ||
      (allowedCategories && allowedCategories.has(trimmed))
    ) {
      return trimmed as ExpenseCategory;
    }
  }
  return fallback;
}

export function sanitizeExpenseRecord(
  raw: unknown,
  allowedCategories?: Set<string>
): Expense | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const amount = Number(record.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return null;

  const id = sanitizePlainText(
    record.id,
    120,
    `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );
  const splitType: SplitType = ALLOWED_SPLIT_TYPES.has(record.splitType as SplitType)
    ? (record.splitType as SplitType)
    : '50_50';
  const rawRatio = Number(record.customSplitRatio);
  const normalizedRatio =
    Number.isFinite(rawRatio) && rawRatio > 1 && rawRatio <= 100
      ? rawRatio / 100
      : rawRatio;
  const customSplitRatio =
    splitType === 'custom' &&
    Number.isFinite(normalizedRatio) &&
    normalizedRatio >= 0 &&
    normalizedRatio <= 1
      ? Math.round(normalizedRatio * 1000) / 1000
      : undefined;

  const sanitizedItems = Array.isArray(record.items)
    ? record.items
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .slice(0, 100)
        .map((item) => ({
          name: sanitizePlainText(item.name, 120, 'Articolo'),
          price: Math.max(0, Math.min(100_000, Number(item.price) || 0)),
        }))
    : undefined;

  const receiptUrl = sanitizeSafeImageUrl(record.receiptUrl);
  const sourceReference = sanitizePlainText(record.sourceReference, 200);
  const notes = sanitizePlainText(record.notes, 1000);
  const rawTax = Number(record.tax);

  return {
    id,
    title: sanitizePlainText(record.title, 160, 'Spesa'),
    amount: Math.round(amount * 100) / 100,
    currency: sanitizeCurrency(record.currency),
    date: sanitizeIsoDate(record.date),
    category: sanitizeExpenseCategory(record.category, 'Altro', allowedCategories),
    payer: ALLOWED_PAYERS.has(record.payer as Payer) ? (record.payer as Payer) : 'user',
    splitType,
    ...(customSplitRatio !== undefined ? { customSplitRatio } : {}),
    source: ALLOWED_SOURCES.has(record.source as Expense['source'])
      ? (record.source as Expense['source'])
      : 'manual',
    ...(sourceReference ? { sourceReference } : {}),
    ...(notes ? { notes } : {}),
    ...(receiptUrl ? { receiptUrl } : {}),
    ...(sanitizedItems && sanitizedItems.length > 0 ? { items: sanitizedItems } : {}),
    ...(Number.isFinite(rawTax) && rawTax > 0 ? { tax: Math.round(rawTax * 100) / 100 } : {}),
  };
}

export function sanitizeSettlementRecord(raw: unknown): Settlement | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const amount = Number(record.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;

  const from: Payer = ALLOWED_PAYERS.has(record.from as Payer)
    ? (record.from as Payer)
    : 'partner';
  const to: Payer =
    ALLOWED_PAYERS.has(record.to as Payer) && record.to !== from
      ? (record.to as Payer)
      : from === 'user'
        ? 'partner'
        : 'user';

  return {
    id: sanitizePlainText(
      record.id,
      120,
      `stl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    ),
    date: sanitizeIsoDate(record.date),
    amount: Math.round(amount * 100) / 100,
    currency: sanitizeCurrency(record.currency),
    from,
    to,
    note: sanitizePlainText(record.note, 300, 'Pareggio spese'),
  };
}

export function sanitizeGoalRecord(raw: unknown): SavingGoal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const targetAmount = Number(record.targetAmount);
  if (!Number.isFinite(targetAmount) || targetAmount <= 0 || targetAmount > 50_000_000) {
    return null;
  }
  const currentAmount = Number(record.currentAmount);
  const safeCurrentAmount =
    Number.isFinite(currentAmount) && currentAmount >= 0
      ? Math.min(50_000_000, Math.round(currentAmount * 100) / 100)
      : 0;
  const imageUrl = sanitizeSafeImageUrl(record.imageUrl);
  const targetDate =
    typeof record.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.targetDate.trim())
      ? record.targetDate.trim()
      : undefined;
  const imageResolution =
    typeof record.imageResolution === 'string' && ALLOWED_IMAGE_SIZES.has(record.imageResolution)
      ? record.imageResolution
      : undefined;

  return {
    id: sanitizePlainText(
      record.id,
      120,
      `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    ),
    title: sanitizePlainText(record.title, 160, 'Obiettivo di Coppia'),
    targetAmount: Math.round(targetAmount * 100) / 100,
    currentAmount: safeCurrentAmount,
    ...(targetDate ? { targetDate } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(imageResolution ? { imageResolution } : {}),
  };
}

export function sanitizeCategoryBudgets(
  raw: unknown,
  fallback?: Partial<Record<ExpenseCategory, number>>,
  allowedCategories?: Set<string>
): Partial<Record<ExpenseCategory, number>> | undefined {
  if (raw === undefined) return fallback;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const cleaned: Partial<Record<ExpenseCategory, number>> = {};
  const validKeys = allowedCategories ?? new Set<string>(ALLOWED_EXPENSE_CATEGORIES);
  for (const category of validKeys) {
    const rawValue = record[category];
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    const numeric = Number(rawValue);
    if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 1_000_000) {
      cleaned[category] = Math.round(numeric * 100) / 100;
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function sanitizeTrackingStartDate(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
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

export function sanitizeProfileRecord(
  raw: Record<string, unknown>,
  currentProfile: CoupleProfile,
  partnerEmail: string,
  extraAllowedCategories?: Set<string>
): CoupleProfile {
  const rawUserName = sanitizePlainText(raw.userName, 100);
  const rawPartnerName = sanitizePlainText(raw.partnerName, 100);

  const userName =
    !rawUserName || LEGACY_USER_NAMES.has(rawUserName.toLowerCase())
      ? currentProfile.userName && !LEGACY_USER_NAMES.has(currentProfile.userName.toLowerCase())
        ? currentProfile.userName
        : 'Partner 1'
      : rawUserName;
  const partnerName =
    !rawPartnerName || LEGACY_PARTNER_NAMES.has(rawPartnerName.toLowerCase())
      ? currentProfile.partnerName &&
        !LEGACY_PARTNER_NAMES.has(currentProfile.partnerName.toLowerCase())
        ? currentProfile.partnerName
        : 'Partner 2'
      : rawPartnerName;

  const rawBudget = Number(raw.monthlyBudget);
  const monthlyBudget =
    Number.isFinite(rawBudget) && rawBudget > 0 && rawBudget <= 1_000_000
      ? Math.round(rawBudget * 100) / 100
      : currentProfile.monthlyBudget;
  const rawWeddingGoal = Number(raw.weddingBudgetGoal);
  const weddingBudgetGoal =
    Number.isFinite(rawWeddingGoal) && rawWeddingGoal >= 0 && rawWeddingGoal <= 10_000_000
      ? Math.round(rawWeddingGoal * 100) / 100
      : currentProfile.weddingBudgetGoal;

  const customCategories = sanitizeCustomCategories(
    raw.customCategories,
    currentProfile.customCategories
  );
  const hiddenCategories = sanitizeHiddenCategories(
    raw.hiddenCategories,
    currentProfile.hiddenCategories
  );

  const mergedAllowed = buildAllowedCategorySet({ customCategories });
  if (extraAllowedCategories) {
    for (const entry of extraAllowedCategories) {
      mergedAllowed.add(entry);
    }
  }

  const categoryBudgets = sanitizeCategoryBudgets(
    raw.categoryBudgets,
    currentProfile.categoryBudgets,
    mergedAllowed
  );

  const result: CoupleProfile = {
    ...currentProfile,
    userName,
    partnerName,
    monthlyBudget,
    currency: sanitizeCurrency(raw.currency, currentProfile.currency || 'EUR'),
    weddingBudgetGoal,
    userEmail: currentProfile.userEmail,
    partnerEmail,
    categoryBudgets,
  };

  if (raw.trackingStartDate === '' || raw.trackingStartDate === null) {
    delete result.trackingStartDate;
  } else if (raw.trackingStartDate !== undefined) {
    const validStartDate = sanitizeTrackingStartDate(raw.trackingStartDate);
    if (validStartDate) {
      result.trackingStartDate = validStartDate;
    } else if (currentProfile.trackingStartDate) {
      result.trackingStartDate = currentProfile.trackingStartDate;
    } else {
      delete result.trackingStartDate;
    }
  } else if (currentProfile.trackingStartDate) {
    result.trackingStartDate = currentProfile.trackingStartDate;
  }

  if (customCategories && customCategories.length > 0) {
    result.customCategories = customCategories;
  } else {
    delete result.customCategories;
  }

  if (hiddenCategories && hiddenCategories.length > 0) {
    result.hiddenCategories = hiddenCategories;
  } else {
    delete result.hiddenCategories;
  }

  return result;
}
