import {
  Bell,
  Camera,
  CreditCard,
  Gem,
  HeartPulse,
  Home,
  Mail,
  PenLine,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Target,
  Ticket,
  TrainFront,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { CoupleProfile, Expense, ExpenseCategory, SavingGoal } from '../types';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Spesa',
  'Ristoranti e Bar',
  'Casa e Affitto',
  'Bollette e Utenze',
  'Trasporti',
  'Shopping',
  'Svago e Intrattenimento',
  'Salute e Benessere',
  'Viaggi',
  'Altro',
];

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  chartColor: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  defaultBudget: number;
}

const SPESA_META: CategoryMeta = {
  label: 'Spesa',
  icon: ShoppingCart,
  chartColor: 'var(--chart-color-2)',
  bgClass: 'bg-emerald-500/12',
  textClass: 'text-emerald-700',
  borderClass: 'border-emerald-500/25',
  defaultBudget: 550,
};

const RISTORANTI_META: CategoryMeta = {
  label: 'Ristoranti e Bar',
  icon: Utensils,
  chartColor: 'var(--chart-color-1)',
  bgClass: 'bg-orange-500/12',
  textClass: 'text-orange-700',
  borderClass: 'border-orange-500/25',
  defaultBudget: 250,
};

const CASA_META: CategoryMeta = {
  label: 'Casa e Affitto',
  icon: Home,
  chartColor: 'var(--chart-color-3)',
  bgClass: 'bg-blue-500/12',
  textClass: 'text-blue-700',
  borderClass: 'border-blue-500/25',
  defaultBudget: 1200,
};

const BOLLETTE_META: CategoryMeta = {
  label: 'Bollette e Utenze',
  icon: Zap,
  chartColor: 'var(--chart-color-6)',
  bgClass: 'bg-amber-500/12',
  textClass: 'text-amber-700',
  borderClass: 'border-amber-500/25',
  defaultBudget: 200,
};

const TRASPORTI_META: CategoryMeta = {
  label: 'Trasporti',
  icon: TrainFront,
  chartColor: 'var(--chart-color-8)',
  bgClass: 'bg-indigo-500/12',
  textClass: 'text-indigo-700',
  borderClass: 'border-indigo-500/25',
  defaultBudget: 180,
};

const SHOPPING_META: CategoryMeta = {
  label: 'Shopping',
  icon: ShoppingBag,
  chartColor: 'var(--chart-color-4)',
  bgClass: 'bg-purple-500/12',
  textClass: 'text-purple-700',
  borderClass: 'border-purple-500/25',
  defaultBudget: 200,
};

const SVAGO_META: CategoryMeta = {
  label: 'Svago e Intrattenimento',
  icon: Ticket,
  chartColor: 'var(--chart-color-10)',
  bgClass: 'bg-violet-500/12',
  textClass: 'text-violet-700',
  borderClass: 'border-violet-500/25',
  defaultBudget: 100,
};

const SALUTE_META: CategoryMeta = {
  label: 'Salute e Benessere',
  icon: HeartPulse,
  chartColor: 'var(--chart-color-7)',
  bgClass: 'bg-teal-500/12',
  textClass: 'text-teal-700',
  borderClass: 'border-teal-500/25',
  defaultBudget: 120,
};

const VIAGGI_META: CategoryMeta = {
  label: 'Viaggi',
  icon: Plane,
  chartColor: 'var(--chart-color-9)',
  bgClass: 'bg-sky-500/12',
  textClass: 'text-sky-700',
  borderClass: 'border-sky-500/25',
  defaultBudget: 300,
};

const LEGACY_GOALS_META: CategoryMeta = {
  label: 'Matrimonio e Obiettivi',
  icon: Gem,
  chartColor: 'var(--chart-color-5)',
  bgClass: 'bg-rose-500/12',
  textClass: 'text-rose-700',
  borderClass: 'border-rose-500/25',
  defaultBudget: 300,
};

const ALTRO_META: CategoryMeta = {
  label: 'Altro',
  icon: CreditCard,
  chartColor: 'var(--chart-color-11)',
  bgClass: 'bg-stone-500/12',
  textClass: 'text-stone-700',
  borderClass: 'border-stone-500/25',
  defaultBudget: 100,
};

export const CATEGORY_META: Record<string, CategoryMeta> = {
  Spesa: SPESA_META,
  Groceries: { ...SPESA_META, label: 'Groceries' },
  'Ristoranti e Bar': RISTORANTI_META,
  'Dining Out': { ...RISTORANTI_META, label: 'Dining Out' },
  'Casa e Affitto': CASA_META,
  Housing: { ...CASA_META, label: 'Housing' },
  'Bollette e Utenze': BOLLETTE_META,
  Utilities: { ...BOLLETTE_META, label: 'Utilities' },
  Trasporti: TRASPORTI_META,
  Transportation: { ...TRASPORTI_META, label: 'Transportation' },
  Shopping: SHOPPING_META,
  'Svago e Intrattenimento': SVAGO_META,
  Entertainment: { ...SVAGO_META, label: 'Entertainment' },
  'Salute e Benessere': SALUTE_META,
  'Health & Wellness': { ...SALUTE_META, label: 'Health & Wellness' },
  Viaggi: VIAGGI_META,
  Travel: { ...VIAGGI_META, label: 'Travel' },
  'Matrimonio e Obiettivi': LEGACY_GOALS_META,
  'Wedding & Goals': { ...LEGACY_GOALS_META, label: 'Wedding & Goals' },
  Altro: ALTRO_META,
  Other: { ...ALTRO_META, label: 'Other' },
};

const DYNAMIC_CHART_COLORS = [
  'var(--chart-color-5)',
  'var(--chart-color-7)',
  'var(--chart-color-9)',
  'var(--chart-color-4)',
  'var(--chart-color-6)',
  'var(--chart-color-8)',
  'var(--chart-color-10)',
];

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function isBuiltinCategory(category: string): boolean {
  return EXPENSE_CATEGORIES.includes(category);
}

export function getSelectableCategoryGroups(
  profile?: Pick<CoupleProfile, 'customCategories' | 'hiddenCategories'>,
  goals?: SavingGoal[]
): {
  base: string[];
  custom: string[];
  goals: string[];
} {
  const hiddenSet = new Set(
    (profile?.hiddenCategories ?? []).filter((cat) => cat !== 'Altro' && cat !== 'Other')
  );
  const base = EXPENSE_CATEGORIES.filter((cat) => !hiddenSet.has(cat));
  const usedLower = new Set(base.map((cat) => cat.toLowerCase()));

  const custom: string[] = [];
  for (const raw of profile?.customCategories ?? []) {
    const clean = raw.trim();
    if (clean.length < 2) continue;
    const lower = clean.toLowerCase();
    if (usedLower.has(lower)) continue;
    usedLower.add(lower);
    custom.push(clean);
  }

  const goalCategories: string[] = [];
  for (const goal of goals ?? []) {
    const clean = goal.title.trim();
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (usedLower.has(lower)) continue;
    usedLower.add(lower);
    goalCategories.push(clean);
  }

  return { base, custom, goals: goalCategories };
}

export function getActiveCategories(
  profile?: Pick<CoupleProfile, 'customCategories' | 'hiddenCategories'>,
  goals?: SavingGoal[]
): string[] {
  const { base, custom, goals: goalCats } = getSelectableCategoryGroups(profile, goals);
  return [...base, ...custom, ...goalCats];
}

function estimateGoalMonthlyBudget(goal: SavingGoal): number {
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  if (remaining <= 0) return 100;
  if (!goal.targetDate) {
    return Math.max(50, Math.min(2000, Math.round(remaining / 12)));
  }
  const targetMs = Date.parse(`${goal.targetDate}T00:00:00`);
  if (!Number.isFinite(targetMs)) return 200;
  const monthsLeft = Math.max(1, (targetMs - Date.now()) / (1000 * 60 * 60 * 24 * 30.4375));
  return Math.max(25, Math.min(50_000, Math.round(remaining / monthsLeft)));
}

export function getCategoryMeta(category: string, goals?: SavingGoal[]): CategoryMeta {
  if (CATEGORY_META[category]) {
    return CATEGORY_META[category];
  }

  const matchedGoal = goals?.find(
    (g) => g.title.trim().toLowerCase() === category.trim().toLowerCase()
  );
  const colorIdx = hashString(category) % DYNAMIC_CHART_COLORS.length;
  const chartColor = DYNAMIC_CHART_COLORS[colorIdx];

  if (matchedGoal) {
    return {
      label: category,
      icon: Target,
      chartColor,
      bgClass: 'bg-rose-500/12',
      textClass: 'text-rose-700',
      borderClass: 'border-rose-500/25',
      defaultBudget: estimateGoalMonthlyBudget(matchedGoal),
    };
  }

  return {
    label: category || 'Altro',
    icon: Tag,
    chartColor,
    bgClass: 'bg-orange-500/12',
    textClass: 'text-orange-700',
    borderClass: 'border-orange-500/25',
    defaultBudget: 150,
  };
}

export function getCategoryBudget(
  category: string,
  profile?: Pick<CoupleProfile, 'categoryBudgets'>,
  goals?: SavingGoal[]
): number {
  const custom = profile?.categoryBudgets?.[category as ExpenseCategory];
  if (typeof custom === 'number' && Number.isFinite(custom) && custom > 0) {
    return custom;
  }
  return getCategoryMeta(category, goals).defaultBudget;
}

export interface SourceMeta {
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  badgeClass: string;
}

export const SOURCE_META: Record<Expense['source'], SourceMeta> = {
  gmail: {
    label: 'Gmail',
    shortLabel: 'Gmail',
    icon: Mail,
    badgeClass: 'bg-blue-500/12 text-blue-700 border-blue-500/25',
  },
  camera: {
    label: 'Scontrino OCR',
    shortLabel: 'Scontrino',
    icon: Camera,
    badgeClass: 'bg-orange-500/12 text-orange-700 border-orange-500/25',
  },
  notification: {
    label: 'Notifica / SMS',
    shortLabel: 'Notifica/SMS',
    icon: Bell,
    badgeClass: 'bg-purple-500/12 text-purple-700 border-purple-500/25',
  },
  manual: {
    label: 'Manuale',
    shortLabel: 'Manuale',
    icon: PenLine,
    badgeClass: 'bg-stone-500/10 text-stone-600 border-stone-500/20',
  },
};

export function formatCurrency(amount: number, currency = 'EUR'): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const symbol = currency === 'EUR' ? '€' : `${currency} `;
  return `${symbol}${safeAmount.toFixed(2)}`;
}

export function formatSplitLabel(expense: Pick<Expense, 'splitType' | 'customSplitRatio'>): string {
  if (expense.splitType === '50_50') return 'Diviso 50/50';
  if (expense.splitType === 'custom') {
    return `Personalizzato (${Math.round((expense.customSplitRatio ?? 0.5) * 100)}%)`;
  }
  return 'Personale';
}
