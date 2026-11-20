import { EXPENSE_CATEGORIES } from '../constants/categories';
import type { CoupleProfile, ExpenseCategory } from '../types';
import { defaultProfile } from './seed-data';

const LEGACY_USER_NAMES = new Set(['utente 1', 'legacy_user']);
const LEGACY_PARTNER_NAMES = new Set(['fidanzata']);

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

const sanitizeCategoryBudgets = (
  raw: unknown
): Partial<Record<ExpenseCategory, number>> | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const cleaned: Partial<Record<ExpenseCategory, number>> = {};
  for (const category of EXPENSE_CATEGORIES) {
    const rawValue = record[category];
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    const numeric = Number(rawValue);
    if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 1_000_000) {
      cleaned[category] = Math.round(numeric * 100) / 100;
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

  return {
    userName,
    partnerName,
    monthlyBudget,
    currency,
    weddingBudgetGoal,
    userEmail,
    partnerEmail,
    categoryBudgets: sanitizeCategoryBudgets(raw.categoryBudgets),
  };
};
