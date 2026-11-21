import { EXPENSE_CATEGORIES } from '../constants/categories';
import type { CoupleProfile, ExpenseCategory } from '../types';
import { defaultProfile } from './seed-data';

const LEGACY_USER_NAMES = new Set(['utente 1', 'legacy_user']);
const LEGACY_PARTNER_NAMES = new Set(['fidanzata']);
const BUILTIN_LOWER_SET = new Set(EXPENSE_CATEGORIES.map((c) => c.toLowerCase()));

export const sanitizeTrackingStartDate = (raw: unknown): string | undefined => {
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
};

export const deriveNameFromEmail = (email?: string): string => {
  if (typeof email !== 'string') return '';
  const trimmed = email.trim();
  if (!trimmed.includes('@')) return '';
  const localPart = trimmed.split('@')[0] || '';
  const cleaned = localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\s*\d+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
    .slice(0, 60);
};

const sanitizeCustomCategories = (raw: unknown): string[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const clean = entry.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (clean.length < 2) continue;
    const lower = clean.toLowerCase();
    if (BUILTIN_LOWER_SET.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    cleaned.push(clean);
    if (cleaned.length >= 40) break;
  }
  return cleaned.length > 0 ? cleaned : undefined;
};

const sanitizeHiddenCategories = (raw: unknown): string[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const clean = entry.trim();
    if (
      clean === 'Altro' ||
      clean === 'Other' ||
      !EXPENSE_CATEGORIES.includes(clean) ||
      seen.has(clean)
    ) {
      continue;
    }
    seen.add(clean);
    cleaned.push(clean);
  }
  return cleaned.length > 0 ? cleaned : undefined;
};

const sanitizeCategoryBudgets = (
  raw: unknown
): Partial<Record<ExpenseCategory, number>> | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const cleaned: Partial<Record<ExpenseCategory, number>> = {};
  for (const [category, rawValue] of Object.entries(record)) {
    const cleanCategory = category.trim();
    if (cleanCategory.length < 2 || cleanCategory.length > 100) continue;
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    const numeric = Number(rawValue);
    if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 1_000_000) {
      cleaned[cleanCategory] = Math.round(numeric * 100) / 100;
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
};

export const sanitizeAndMigrateProfile = (
  raw: Partial<CoupleProfile> & Record<string, unknown>,
  activeEmail?: string
): CoupleProfile => {
  const rawUserName = typeof raw.userName === 'string' ? raw.userName.trim().slice(0, 100) : '';
  const rawPartnerName = typeof raw.partnerName === 'string' ? raw.partnerName.trim().slice(0, 100) : '';

  const userName =
    !rawUserName || LEGACY_USER_NAMES.has(rawUserName.toLowerCase())
      ? (deriveNameFromEmail(activeEmail) || defaultProfile.userName)
      : rawUserName;
  const partnerName =
    !rawPartnerName || LEGACY_PARTNER_NAMES.has(rawPartnerName.toLowerCase())
      ? defaultProfile.partnerName
      : rawPartnerName;

  const monthlyBudget =
    typeof raw.monthlyBudget === 'number' && Number.isFinite(raw.monthlyBudget) && raw.monthlyBudget > 0
      ? Math.min(raw.monthlyBudget, 1_000_000)
      : defaultProfile.monthlyBudget;
  const weddingBudgetGoal =
    typeof raw.weddingBudgetGoal === 'number' && Number.isFinite(raw.weddingBudgetGoal) && raw.weddingBudgetGoal >= 0
      ? Math.min(raw.weddingBudgetGoal, 10_000_000)
      : defaultProfile.weddingBudgetGoal;
  const rawCurrency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
  const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : defaultProfile.currency;

  const userEmail = typeof raw.userEmail === 'string' ? raw.userEmail.slice(0, 254).toLowerCase().trim() : '';
  const partnerEmail = typeof raw.partnerEmail === 'string' ? raw.partnerEmail.slice(0, 254).toLowerCase().trim() : '';

  const customCategories = sanitizeCustomCategories(raw.customCategories);
  const hiddenCategories = sanitizeHiddenCategories(raw.hiddenCategories);
  const trackingStartDate = sanitizeTrackingStartDate(raw.trackingStartDate);

  return {
    userName,
    partnerName,
    monthlyBudget,
    currency,
    weddingBudgetGoal,
    userEmail,
    partnerEmail,
    ...(trackingStartDate ? { trackingStartDate } : {}),
    categoryBudgets: sanitizeCategoryBudgets(raw.categoryBudgets),
    ...(customCategories ? { customCategories } : {}),
    ...(hiddenCategories ? { hiddenCategories } : {}),
  };
};
