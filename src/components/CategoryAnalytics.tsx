import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Calculator,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Flame,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Target,
  Wallet,
  X,
} from 'lucide-react';
import {
  formatCurrency,
  getActiveCategories,
  getCategoryBudget,
  getCategoryMeta,
  isBuiltinCategory,
  SOURCE_META,
} from '../constants/categories';
import {
  computeMonthlyTrendSeries,
  computeSourceDistribution,
  computeWeekdayDistribution,
  filterExpenses,
  filterExpensesByMonth,
  formatCompactCurrency,
  getActiveDaysInPeriod,
  getPreviousPeriodComparison,
  parseIsoDateParts,
  type AnalyticsTimeframe,
  type MonthlyTrendPoint,
  type PayerFilter,
  type SourceStat,
  type SplitFilter,
  type WeekdayStat,
} from '../services/analytics-math';
import { CoupleProfile, Expense, ExpenseCategory, SavingGoal } from '../types';
import { BulkCategoryBudgetPanel } from './analytics/BulkCategoryBudgetPanel';
import {
  CategoryBreakdownRow,
  CategoryStatSummary,
} from './analytics/CategoryBreakdownRow';
import {
  ExpenseDrilldownModal,
  type ExpenseDrilldownPayload,
} from './charts/ExpenseDrilldownModal';
import {
  InteractiveDonutChart,
  type DonutSlice,
} from './charts/InteractiveDonutChart';
import { MonthlyTrendBarChart } from './charts/MonthlyTrendBarChart';
import { WeekdayAndSourceInsights } from './charts/WeekdayAndSourceInsights';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface CategoryAnalyticsProps {
  expenses: Expense[];
  profile: CoupleProfile;
  goals?: SavingGoal[];
  onUpdateProfile: (updated: Partial<CoupleProfile>) => void;
  onSelectExpense?: (expense: Expense) => void;
  onNavigateTab?: (tab: string) => void;
}

const PERIOD_MULTIPLIERS: Record<AnalyticsTimeframe, number | null> = {
  month: 1,
  quarter: 3,
  year: 12,
  all: null,
};

const SPLIT_FILTERS: Array<{ id: SplitFilter; label: string }> = [
  { id: 'all', label: 'Tutte' },
  { id: 'shared', label: 'Condivise' },
  { id: 'personal', label: 'Personali' },
];

export const CategoryAnalytics: React.FC<CategoryAnalyticsProps> = ({
  expenses,
  profile,
  goals = [],
  onUpdateProfile,
  onSelectExpense,
  onNavigateTab,
}) => {
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>('month');
  const [splitFilter, setSplitFilter] = useState<SplitFilter>('all');
  const [payerFilter, setPayerFilter] = useState<PayerFilter>('all');
  const [barMode, setBarMode] = useState<'partner' | 'category'>('partner');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'charts' | 'budgets'>('charts');
  const [drilldown, setDrilldown] = useState<ExpenseDrilldownPayload | null>(null);
  const [showZeroSpendCategories, setShowZeroSpendCategories] = useState(true);

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [inlineBudgetDraft, setInlineBudgetDraft] = useState('');
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);

  // Creazione nuova categoria personalizzata
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryBudget, setNewCategoryBudget] = useState('150');
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);

  // Conferma eliminazione/nascondimento categoria
  const [categoryPendingRemove, setCategoryPendingRemove] = useState<string | null>(null);

  const activeCategories = useMemo(
    () => getActiveCategories(profile, goals),
    [profile, goals]
  );

  const [bulkDrafts, setBulkDrafts] = useState<Record<ExpenseCategory, string>>(() => {
    const initial: Record<ExpenseCategory, string> = {};
    for (const cat of activeCategories) {
      initial[cat] = String(getCategoryBudget(cat, profile, goals));
    }
    return initial;
  });
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  const timeframes: Array<{
    id: AnalyticsTimeframe;
    shortLabel: string;
    fullLabel: string;
  }> = useMemo(
    () => [
      { id: 'month', shortLabel: 'Mese', fullLabel: 'Questo Mese' },
      { id: 'quarter', shortLabel: '3M', fullLabel: 'Ultimi 3 Mesi' },
      { id: 'year', shortLabel: 'Anno', fullLabel: `Anno ${currentYear} (YTD)` },
      { id: 'all', shortLabel: 'Tutto', fullLabel: 'Tutto lo Storico' },
    ],
    [currentYear]
  );

  const payerFilters: Array<{ id: PayerFilter; label: string }> = useMemo(
    () => [
      { id: 'all', label: 'Entrambi' },
      { id: 'user', label: profile.userName },
      { id: 'partner', label: profile.partnerName },
    ],
    [profile.userName, profile.partnerName]
  );

  const customCategorySet = useMemo(
    () => new Set(profile.customCategories ?? []),
    [profile.customCategories]
  );

  const goalTitleSet = useMemo(
    () => new Set(goals.map((g) => g.title.trim())),
    [goals]
  );

  const hiddenCategories = useMemo(
    () =>
      (profile.hiddenCategories ?? []).filter(
        (cat) => cat !== 'Altro' && cat !== 'Other'
      ),
    [profile.hiddenCategories]
  );

  const flashSaved = (message: string) => {
    setSavedBanner(message);
    setTimeout(() => setSavedBanner(null), 2800);
  };

  const handleSelectTimeframe = (next: AnalyticsTimeframe) => {
    setTimeframe(next);
    setSelectedCategory(null);
  };

  const handleSelectSplitFilter = (next: SplitFilter) => {
    setSplitFilter(next);
    setSelectedCategory(null);
  };

  const handleSelectPayerFilter = (next: PayerFilter) => {
    setPayerFilter(next);
    setSelectedCategory(null);
  };

  const handleResetAllFilters = () => {
    setTimeframe('month');
    setSplitFilter('all');
    setPayerFilter('all');
    setSelectedCategory(null);
  };

  const startInlineEdit = (category: string) => {
    setEditingCategory(category);
    setInlineBudgetDraft(String(getCategoryBudget(category, profile, goals)));
  };

  const saveInlineBudget = (category: string, e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(inlineBudgetDraft.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1_000_000) return;

    const cleanValue = Math.round(parsed * 100) / 100;
    const defaultValue = getCategoryMeta(category, goals).defaultBudget;
    const nextBudgets: Partial<Record<ExpenseCategory, number>> = {
      ...(profile.categoryBudgets || {}),
    };

    if (cleanValue === defaultValue) {
      delete nextBudgets[category];
    } else {
      nextBudgets[category] = cleanValue;
    }

    onUpdateProfile({ categoryBudgets: nextBudgets });
    setEditingCategory(null);
    flashSaved(
      `Budget mensile di "${category}" aggiornato a ${formatCurrency(cleanValue, profile.currency)}`
    );
  };

  const resetCategoryToDefault = (category: string) => {
    const nextBudgets: Partial<Record<ExpenseCategory, number>> = {
      ...(profile.categoryBudgets || {}),
    };
    delete nextBudgets[category];
    onUpdateProfile({ categoryBudgets: nextBudgets });
    setEditingCategory(null);
    flashSaved(`Budget di "${category}" ripristinato al valore predefinito`);
  };

  const handleCreateCustomCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCategoryName.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (cleanName.length < 2) {
      setNewCategoryError('Inserisci un nome di almeno 2 caratteri.');
      return;
    }

    const existsActive = activeCategories.some(
      (cat) => cat.toLowerCase() === cleanName.toLowerCase()
    );
    const existsHidden = hiddenCategories.some(
      (cat) => cat.toLowerCase() === cleanName.toLowerCase()
    );

    if (existsActive || existsHidden) {
      setNewCategoryError(
        existsHidden
          ? `La categoria "${cleanName}" è tra quelle nascoste: ripristinala in fondo.`
          : `La categoria "${cleanName}" esiste già.`
      );
      return;
    }

    const parsedBudget = Number(newCategoryBudget.replace(',', '.'));
    const nextCustom = [...(profile.customCategories ?? []), cleanName];
    const nextBudgets: Partial<Record<ExpenseCategory, number>> = {
      ...(profile.categoryBudgets || {}),
    };
    if (
      Number.isFinite(parsedBudget) &&
      parsedBudget >= 1 &&
      parsedBudget <= 1_000_000
    ) {
      nextBudgets[cleanName] = Math.round(parsedBudget * 100) / 100;
    }

    onUpdateProfile({
      customCategories: nextCustom,
      categoryBudgets: nextBudgets,
    });

    setNewCategoryName('');
    setNewCategoryBudget('150');
    setNewCategoryError(null);
    setIsAddingCategory(false);
    setShowZeroSpendCategories(true);
    flashSaved(`Categoria "${cleanName}" creata!`);
  };

  const confirmRemoveOrHideCategory = (category: string) => {
    if (category === 'Altro' || goalTitleSet.has(category.trim())) return;

    const nextBudgets: Partial<Record<ExpenseCategory, number>> = {
      ...(profile.categoryBudgets || {}),
    };

    if (customCategorySet.has(category)) {
      const nextCustom = (profile.customCategories ?? []).filter(
        (cat) => cat !== category
      );
      delete nextBudgets[category];
      onUpdateProfile({
        customCategories: nextCustom,
        categoryBudgets: nextBudgets,
      });
      flashSaved(`Categoria "${category}" eliminata dalle scelte.`);
    } else if (isBuiltinCategory(category)) {
      const nextHidden = Array.from(new Set([...hiddenCategories, category]));
      onUpdateProfile({
        hiddenCategories: nextHidden,
      });
      flashSaved(
        `Categoria "${category}" nascosta (puoi ripristinarla in qualsiasi momento).`
      );
    }

    if (selectedCategory === category) {
      setSelectedCategory(null);
    }
    setCategoryPendingRemove(null);
  };

  const handleRestoreHiddenCategory = (category: string) => {
    const nextHidden = hiddenCategories.filter((cat) => cat !== category);
    onUpdateProfile({ hiddenCategories: nextHidden });
    flashSaved(`Categoria "${category}" ripristinata!`);
  };

  const toggleConfigurePanel = () => {
    if (!isConfigureOpen) {
      const refreshed: Record<ExpenseCategory, string> = {};
      for (const cat of activeCategories) {
        refreshed[cat] = String(getCategoryBudget(cat, profile, goals));
      }
      setBulkDrafts(refreshed);
    }
    setIsConfigureOpen((open) => !open);
  };

  const saveAllBulkBudgets = (e: React.FormEvent) => {
    e.preventDefault();
    const nextBudgets: Partial<Record<ExpenseCategory, number>> = {};
    for (const cat of activeCategories) {
      const parsed = Number((bulkDrafts[cat] ?? '').replace(',', '.'));
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 1_000_000) {
        const rounded = Math.round(parsed * 100) / 100;
        if (rounded !== getCategoryMeta(cat, goals).defaultBudget) {
          nextBudgets[cat] = rounded;
        }
      }
    }
    onUpdateProfile({ categoryBudgets: nextBudgets });
    setIsConfigureOpen(false);
    flashSaved('Tutti i budget di categoria sono stati salvati e sincronizzati!');
  };

  const resetAllBudgets = () => {
    const defaults: Record<ExpenseCategory, string> = {};
    for (const cat of activeCategories) {
      defaults[cat] = String(getCategoryMeta(cat, goals).defaultBudget);
    }
    setBulkDrafts(defaults);
    onUpdateProfile({ categoryBudgets: {} });
    flashSaved('Budget di tutte le categorie ripristinati ai valori predefiniti.');
  };

  const bulkDraftTotal = activeCategories.reduce((sum, cat) => {
    const parsed = Number((bulkDrafts[cat] ?? '').replace(',', '.'));
    return (
      sum +
      (Number.isFinite(parsed) && parsed > 0
        ? parsed
        : getCategoryBudget(cat, profile, goals))
    );
  }, 0);

  const filtered = useMemo(
    () =>
      filterExpenses(expenses, {
        timeframe,
        splitFilter,
        payerFilter,
      }),
    [expenses, timeframe, splitFilter, payerFilter]
  );

  const comparison = useMemo(
    () =>
      getPreviousPeriodComparison(expenses, {
        timeframe,
        splitFilter,
        payerFilter,
      }),
    [expenses, timeframe, splitFilter, payerFilter]
  );

  const totalSpent = useMemo(
    () => filtered.reduce((acc, curr) => acc + curr.amount, 0),
    [filtered]
  );

  const activeDays = useMemo(
    () => getActiveDaysInPeriod(filtered, timeframe),
    [filtered, timeframe]
  );

  const sortedCategories = useMemo(() => {
    const stats: Record<string, CategoryStatSummary> = {};
    for (const e of filtered) {
      if (!stats[e.category]) {
        stats[e.category] = { total: 0, count: 0, userPaid: 0, partnerPaid: 0 };
      }
      stats[e.category].total += e.amount;
      stats[e.category].count += 1;
      if (e.payer === 'user') {
        stats[e.category].userPaid += e.amount;
      } else {
        stats[e.category].partnerPaid += e.amount;
      }
    }
    return Object.entries(stats).sort(([, a], [, b]) => b.total - a.total);
  }, [filtered]);

  const budgetCategoriesList = useMemo(() => {
    const byCategory = new Map<string, CategoryStatSummary>(sortedCategories);
    const merged: Array<[string, CategoryStatSummary]> = [...sortedCategories];

    if (showZeroSpendCategories) {
      for (const cat of activeCategories) {
        if (!byCategory.has(cat)) {
          merged.push([
            cat,
            { total: 0, count: 0, userPaid: 0, partnerPaid: 0 },
          ]);
        }
      }
    }

    return selectedCategory
      ? merged.filter(([cat]) => cat === selectedCategory)
      : merged;
  }, [sortedCategories, activeCategories, showZeroSpendCategories, selectedCategory]);

  const topCategoriesForTrend = useMemo(
    () => sortedCategories.slice(0, 4).map(([cat]) => cat),
    [sortedCategories]
  );

  const monthlySeries = useMemo(
    () =>
      computeMonthlyTrendSeries(
        expenses,
        { timeframe, splitFilter, payerFilter },
        topCategoriesForTrend
      ),
    [expenses, timeframe, splitFilter, payerFilter, topCategoriesForTrend]
  );

  const donutSlices: DonutSlice[] = useMemo(
    () =>
      sortedCategories.map(([category, st]) => ({
        id: category,
        label: category,
        value: Math.round(st.total * 100) / 100,
        color: getCategoryMeta(category, goals).chartColor,
      })),
    [sortedCategories, goals]
  );

  const scopedForInsights = useMemo(
    () =>
      selectedCategory
        ? filtered.filter((e) => e.category === selectedCategory)
        : filtered,
    [filtered, selectedCategory]
  );

  const weekdayStats = useMemo(
    () => computeWeekdayDistribution(scopedForInsights),
    [scopedForInsights]
  );

  const sourceStats = useMemo(
    () => computeSourceDistribution(scopedForInsights),
    [scopedForInsights]
  );

  const periodMultiplier = PERIOD_MULTIPLIERS[timeframe];

  const overBudgetCount = useMemo(() => {
    if (periodMultiplier === null) return 0;
    return sortedCategories.filter(([cat, st]) => {
      const scaled = getCategoryBudget(cat, profile, goals) * periodMultiplier;
      return st.total > scaled;
    }).length;
  }, [sortedCategories, profile, goals, periodMultiplier]);

  const topCategoryName = sortedCategories[0]?.[0] || 'Nessuna';
  const topCategoryTotal = sortedCategories[0]?.[1]?.total || 0;
  const topCategoryPercent =
    totalSpent > 0 ? Math.round((topCategoryTotal / totalSpent) * 100) : 0;
  const hasSecondaryFilters =
    splitFilter !== 'all' || payerFilter !== 'all' || selectedCategory !== null;

  const activePeriodLabel =
    timeframes.find((tf) => tf.id === timeframe)?.fullLabel ?? 'Periodo';

  const openCategoryDrilldown = (category: string) => {
    const items = filtered.filter((e) => e.category === category);
    setDrilldown({
      title: category,
      subtitle: `${activePeriodLabel} · ${items.length} ${
        items.length === 1 ? 'spesa' : 'spese'
      }`,
      expenses: items,
    });
  };

  const openMonthDrilldown = (point: MonthlyTrendPoint) => {
    const items = filterExpensesByMonth(
      expenses,
      point.ym,
      splitFilter,
      payerFilter
    );
    const budget = profile.monthlyBudget || 2800;
    const diff = point.total - budget;
    setDrilldown({
      title: `Spese di ${point.fullLabel}`,
      subtitle: `${items.length} ${items.length === 1 ? 'spesa' : 'spese'}`,
      expenses: items,
      highlightNote: `Confronto budget mensile (${formatCurrency(
        budget,
        profile.currency
      )}): ${diff >= 0 ? '+' : ''}${formatCurrency(diff, profile.currency)}`,
    });
  };

  const openWeekdayDrilldown = (weekday: WeekdayStat) => {
    const items = scopedForInsights.filter((exp) => {
      const parts = parseIsoDateParts(exp.date);
      if (!parts) return false;
      const jsDay = new Date(parts.year, parts.month - 1, parts.day).getDay();
      return (jsDay + 6) % 7 === weekday.index;
    });
    setDrilldown({
      title: `Spese di ${weekday.fullLabel}`,
      subtitle: `${activePeriodLabel}${
        selectedCategory ? ` · ${selectedCategory}` : ''
      } · ${items.length} ${items.length === 1 ? 'spesa' : 'spese'}`,
      expenses: items,
    });
  };

  const openSourceDrilldown = (sourceStat: SourceStat) => {
    const items = scopedForInsights.filter(
      (exp) => exp.source === sourceStat.source
    );
    setDrilldown({
      title: `Fonte: ${SOURCE_META[sourceStat.source].label}`,
      subtitle: `${activePeriodLabel}${
        selectedCategory ? ` · ${selectedCategory}` : ''
      } · ${items.length} ${items.length === 1 ? 'spesa' : 'spese'}`,
      expenses: items,
    });
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Intestazione & Filtri Allineati Full-Width */}
      <div className="ds-card p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-stone-900 font-display">
            Statistiche e Trend per Categoria
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Analisi delle uscite di coppia, categorie personalizzate, obiettivi collegati e soglie mensili
          </p>
        </div>

        <div className="space-y-3 pt-2 border-t border-stone-100">
          {/* Riga 1: Periodo allineato a tutta larghezza */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 block">
              Periodo
            </span>
            <div
              role="group"
              aria-label="Filtra per periodo"
              className="ds-nav-track grid grid-cols-4 gap-1 p-1 rounded-xl border border-stone-200/70 text-xs font-semibold"
            >
              {timeframes.map((tf) => {
                const isActive = timeframe === tf.id;
                return (
                  <button
                    key={tf.id}
                    type="button"
                    onClick={() => handleSelectTimeframe(tf.id)}
                    className={`min-h-10 px-2 sm:px-3 py-1.5 rounded-lg transition-all text-center cursor-pointer truncate ${
                      isActive
                        ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-stone-200/70'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <span className="sm:hidden">{tf.shortLabel}</span>
                    <span className="hidden sm:inline">{tf.fullLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Riga 2: Natura Spesa + Pagato da allineati su 2 colonne */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 block">
                Natura Spesa
              </span>
              <div
                role="group"
                aria-label="Filtra per natura della spesa"
                className="ds-nav-track grid grid-cols-3 gap-1 p-1 rounded-xl border border-stone-200/70 text-xs font-semibold"
              >
                {SPLIT_FILTERS.map((sf) => {
                  const isActive = splitFilter === sf.id;
                  return (
                    <button
                      key={sf.id}
                      type="button"
                      onClick={() => handleSelectSplitFilter(sf.id)}
                      className={`min-h-10 px-2 py-1.5 rounded-lg transition-all text-center cursor-pointer truncate ${
                        isActive
                          ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-stone-200/70'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      {sf.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 block">
                Pagato da
              </span>
              <div
                role="group"
                aria-label="Filtra per chi ha pagato"
                className="ds-nav-track grid grid-cols-3 gap-1 p-1 rounded-xl border border-stone-200/70 text-xs font-semibold"
              >
                {payerFilters.map((pf) => {
                  const isActive = payerFilter === pf.id;
                  return (
                    <button
                      key={pf.id}
                      type="button"
                      onClick={() => handleSelectPayerFilter(pf.id)}
                      className={`min-h-10 px-2 py-1.5 rounded-lg transition-all text-center cursor-pointer truncate ${
                        isActive
                          ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-stone-200/70'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      {pf.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {hasSecondaryFilters && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <span className="text-stone-500">
                Filtri attivi:{' '}
                <strong className="text-stone-800">
                  {filtered.length} spese corrispondenti
                </strong>
                {selectedCategory ? ` · ${selectedCategory}` : ''}
              </span>
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="ds-btn-secondary min-h-8 px-2.5 py-1 text-xs"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Azzera filtri</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {savedBanner && (
        <div
          role="status"
          className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/12 text-emerald-700 text-xs font-semibold flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      {/* 4 Schede KPI Aggregate in Matrice Unificata */}
      <div className="ds-card overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--theme-border-subtle)]">
          {/* Cella 1: Totale Spese */}
          {(() => {
            const cellBody = (
              <>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1.5 min-w-0 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    <Wallet
                      className="w-3.5 h-3.5 text-orange-600 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">Totale Spese</span>
                  </span>
                  {filtered.length > 0 && (
                    <ChevronRight
                      className="w-3.5 h-3.5 text-stone-400 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-stone-900 leading-tight truncate">
                  {formatCurrency(totalSpent, profile.currency)}
                </div>

                <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-stone-500">
                  {comparison.deltaPercent !== null ? (
                    <>
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-mono font-semibold tabular-nums shrink-0 ${
                          comparison.deltaPercent > 0
                            ? 'bg-rose-500/12 text-rose-700 border-rose-500/25'
                            : 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25'
                        }`}
                      >
                        {comparison.deltaPercent >= 0 ? '+' : ''}
                        {comparison.deltaPercent}%
                      </span>
                      <span className="truncate">
                        {comparison.comparisonLabel}
                      </span>
                    </>
                  ) : (
                    <span className="truncate">
                      {filtered.length} transazioni
                    </span>
                  )}
                </div>
              </>
            );

            return filtered.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setDrilldown({
                    title: 'Tutte le Spese',
                    subtitle: `${activePeriodLabel} · ${filtered.length} ${
                      filtered.length === 1 ? 'spesa' : 'spese'
                    }`,
                    expenses: filtered,
                  })
                }
                className="bg-[var(--theme-surface)] hover:bg-stone-50/70 p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0 text-left transition-colors cursor-pointer"
              >
                {cellBody}
              </button>
            ) : (
              <div className="bg-[var(--theme-surface)] p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0 text-left">
                {cellBody}
              </div>
            );
          })()}

          {/* Cella 2: Categoria Top */}
          {(() => {
            const hasTopCategory = Boolean(sortedCategories[0]);
            const topMeta = getCategoryMeta(topCategoryName, goals);
            const cellBody = (
              <>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1.5 min-w-0 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    <Flame
                      className="w-3.5 h-3.5 text-rose-500 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">Categoria Top</span>
                  </span>
                  {hasTopCategory && (
                    <ChevronRight
                      className="w-3.5 h-3.5 text-stone-400 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: topMeta.chartColor }}
                    aria-hidden="true"
                  />
                  <span className="font-display font-bold text-lg sm:text-xl text-stone-900 leading-tight truncate">
                    {topCategoryName}
                  </span>
                </div>

                <div className="text-[11px] text-stone-500 font-mono tabular-nums truncate">
                  {formatCompactCurrency(topCategoryTotal, profile.currency)} ·{' '}
                  {topCategoryPercent}%
                </div>
              </>
            );

            return hasTopCategory ? (
              <button
                type="button"
                onClick={() => openCategoryDrilldown(topCategoryName)}
                className="bg-[var(--theme-surface)] hover:bg-stone-50/70 p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0 text-left transition-colors cursor-pointer"
              >
                {cellBody}
              </button>
            ) : (
              <div className="bg-[var(--theme-surface)] p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0 text-left">
                {cellBody}
              </div>
            );
          })()}

          {/* Cella 3: Media / Spesa */}
          <div className="bg-[var(--theme-surface)] p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0 text-left">
            <div className="flex items-center justify-between gap-1.5">
              <span className="inline-flex items-center gap-1.5 min-w-0 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                <Calculator
                  className="w-3.5 h-3.5 text-emerald-600 shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">Media / Spesa</span>
              </span>
            </div>

            <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-stone-900 leading-tight truncate">
              {formatCurrency(
                filtered.length > 0 ? totalSpent / filtered.length : 0,
                profile.currency
              )}
            </div>

            <div className="text-[11px] text-stone-500 truncate">
              Su {filtered.length} voci
            </div>
          </div>

          {/* Cella 4: Media / Giorno */}
          <div className="bg-[var(--theme-surface)] p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0 text-left">
            <div className="flex items-center justify-between gap-1.5">
              <span className="inline-flex items-center gap-1.5 min-w-0 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                <CalendarClock
                  className="w-3.5 h-3.5 text-blue-500 shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">Media / Giorno</span>
              </span>
            </div>

            <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-stone-900 leading-tight truncate">
              {formatCurrency(totalSpent / activeDays, profile.currency)}
            </div>

            <div className="text-[11px] text-stone-500 truncate">
              Su {activeDays} giorni
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigazione Pulita tra Grafici e Budget/Soglie */}
      <div
        role="tablist"
        aria-label="Sezioni statistiche"
        className="ds-nav-track grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl border border-stone-200/80 text-xs sm:text-sm font-semibold"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'charts'}
          onClick={() => setActiveSection('charts')}
          className={`min-h-11 px-3 py-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeSection === 'charts'
              ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-stone-200/70'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <BarChart3
            className={`w-4 h-4 shrink-0 ${
              activeSection === 'charts' ? 'text-orange-600' : 'text-stone-400'
            }`}
          />
          <span>Grafici e Trend</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'budgets'}
          onClick={() => setActiveSection('budgets')}
          className={`min-h-11 px-3 py-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeSection === 'budgets'
              ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-stone-200/70'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <SlidersHorizontal
            className={`w-4 h-4 shrink-0 ${
              activeSection === 'budgets' ? 'text-orange-600' : 'text-stone-400'
            }`}
          />
          <span>Budget e Soglie</span>
          <span className="font-mono text-xs px-1.5 py-0.5 rounded-md bg-stone-500/10 text-stone-600">
            {activeCategories.length}
          </span>
          {overBudgetCount > 0 && (
            <span className="hidden sm:inline-flex font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-rose-500/12 text-rose-700 border border-rose-500/25">
              {overBudgetCount} oltre
            </span>
          )}
        </button>
      </div>

      {/* SEZIONE 1: GRAFICI E TREND */}
      {activeSection === 'charts' && (
        <div className="space-y-5 sm:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
            <div className="lg:col-span-7 min-w-0">
              <MonthlyTrendBarChart
                series={monthlySeries}
                monthlyBudget={profile.monthlyBudget || 2800}
                currency={profile.currency}
                mode={barMode}
                onChangeMode={setBarMode}
                userName={profile.userName}
                partnerName={profile.partnerName}
                topCategories={topCategoriesForTrend}
                onInspectMonth={openMonthDrilldown}
              />
            </div>

            <div className="lg:col-span-5 min-w-0">
              <InteractiveDonutChart
                title="Ripartizione Categorie"
                subtitle="Tocca una fetta per filtrare o aprire le spese"
                slices={donutSlices}
                currency={profile.currency}
                totalAmount={totalSpent}
                centerTopDefault="Totale Periodo"
                centerMainDefault={formatCompactCurrency(
                  totalSpent,
                  profile.currency
                )}
                centerSubDefault={`${filtered.length} spese`}
                selectedId={selectedCategory}
                onSelectSlice={setSelectedCategory}
                onInspectSlice={openCategoryDrilldown}
                className="h-full"
              />
            </div>
          </div>

          {selectedCategory && (
            <div className="ds-card p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
              <span className="text-stone-700">
                Categoria selezionata:{' '}
                <strong className="text-stone-900">{selectedCategory}</strong>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openCategoryDrilldown(selectedCategory)}
                  className="ds-btn-secondary min-h-9 px-3 py-1.5 text-xs"
                >
                  <span>Vedi spese</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('budgets')}
                  className="ds-btn-primary min-h-9 px-3 py-1.5 text-xs"
                >
                  <span>Gestisci Soglia</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="ds-btn-secondary min-h-9 px-3 py-1.5 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Mostra tutte</span>
                </button>
              </div>
            </div>
          )}

          <WeekdayAndSourceInsights
            weekdays={weekdayStats}
            sources={sourceStats}
            currency={profile.currency}
            totalTransactions={scopedForInsights.length}
            onInspectWeekday={openWeekdayDrilldown}
            onInspectSource={openSourceDrilldown}
          />
        </div>
      )}

      {/* SEZIONE 2: BUDGET, CATEGORIE & SOGLIE */}
      {activeSection === 'budgets' && (
        <div className="space-y-5">
          {isConfigureOpen && (
            <BulkCategoryBudgetPanel
              categories={activeCategories}
              goals={goals}
              customCategories={profile.customCategories}
              currency={profile.currency}
              monthlyBudget={profile.monthlyBudget}
              drafts={bulkDrafts}
              draftTotal={bulkDraftTotal}
              onChangeDraft={(cat, value) =>
                setBulkDrafts((prev) => ({ ...prev, [cat]: value }))
              }
              onSaveAll={saveAllBulkBudgets}
              onResetAll={resetAllBudgets}
              onCancel={() => setIsConfigureOpen(false)}
              onRemoveCategory={(cat) => setCategoryPendingRemove(cat)}
              onOpenNewCategory={() => {
                setIsConfigureOpen(false);
                setIsAddingCategory(true);
                setNewCategoryError(null);
              }}
            />
          )}

          {isAddingCategory && (
            <form
              onSubmit={handleCreateCustomCategory}
              className="ds-card p-4 sm:p-5 space-y-3 border border-orange-500/30"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    Nuova Categoria Personalizzata
                  </h3>
                  <p className="text-xs text-stone-500">
                    Sarà subito disponibile quando registri o filtri una spesa
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingCategory(false);
                    setNewCategoryError(null);
                  }}
                  className="ds-btn-secondary min-h-8 px-2.5 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_11rem] gap-3 text-xs">
                <div>
                  <label
                    htmlFor="new-category-name"
                    className="block font-semibold text-stone-700 mb-1"
                  >
                    Nome Categoria
                  </label>
                  <input
                    id="new-category-name"
                    type="text"
                    maxLength={40}
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Es. Animali, Regali, Formazione"
                    className="ds-input w-full px-3 py-2 text-xs min-h-10"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-category-budget"
                    className="block font-semibold text-stone-700 mb-1"
                  >
                    Soglia Mensile ({profile.currency})
                  </label>
                  <input
                    id="new-category-budget"
                    type="number"
                    min="1"
                    step="any"
                    value={newCategoryBudget}
                    onChange={(e) => setNewCategoryBudget(e.target.value)}
                    className="ds-input w-full px-3 py-2 text-xs font-mono font-bold min-h-10"
                  />
                </div>
              </div>

              {newCategoryError && (
                <p className="text-xs font-semibold text-rose-600">
                  {newCategoryError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingCategory(false);
                    setNewCategoryError(null);
                  }}
                  className="ds-btn-secondary min-h-9 px-3 text-xs"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="ds-btn-primary min-h-9 px-4 text-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Crea Categoria</span>
                </button>
              </div>
            </form>
          )}

          <div className="ds-card overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-stone-100 bg-stone-50/60 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-stone-900 font-display">
                    Budget, Categorie e Soglie
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Gli obiettivi della Bacheca appaiono automaticamente qui · Tocca Modifica Soglia o aggiungi categorie personalizzate
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto shrink-0">
                  {selectedCategory && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(null)}
                      className="col-span-2 sm:col-span-1 ds-btn-secondary min-h-9 px-3 py-1.5 text-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Mostra tutte</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCategory((open) => !open);
                      setNewCategoryError(null);
                    }}
                    className="ds-btn-primary min-h-9 px-3 py-1.5 text-xs"
                  >
                    {isAddingCategory ? (
                      <X className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isAddingCategory ? 'Chiudi' : 'Nuova Categoria'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleConfigurePanel}
                    className="ds-btn-secondary min-h-9 px-3 py-1.5 text-xs"
                  >
                    {isConfigureOpen ? (
                      <X className="w-3.5 h-3.5" />
                    ) : (
                      <SlidersHorizontal className="w-3.5 h-3.5 text-orange-600" />
                    )}
                    <span>
                      {isConfigureOpen
                        ? 'Chiudi Configurazione'
                        : 'Configura Tutti'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-stone-200/60">
                <label className="inline-flex items-center gap-2 text-stone-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showZeroSpendCategories}
                    onChange={(e) => setShowZeroSpendCategories(e.target.checked)}
                    className="accent-orange-600 rounded"
                  />
                  <span>Mostra anche categorie/obiettivi a €0 nel periodo</span>
                </label>

                {goals.length > 0 && onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('vision')}
                    className="text-orange-600 hover:text-orange-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Target className="w-3.5 h-3.5" />
                    <span>Gestisci Obiettivi ({goals.length})</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {budgetCategoriesList.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500 space-y-3">
                <p>Nessuna spesa trovata con i filtri selezionati.</p>
                {hasSecondaryFilters && (
                  <button
                    type="button"
                    onClick={handleResetAllFilters}
                    className="ds-btn-secondary min-h-9 px-3.5 text-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Azzera filtri</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {budgetCategoriesList.map(([cat, stats]) => {
                  const isGoalCategory = goalTitleSet.has(cat.trim());
                  const isCustomCategory = customCategorySet.has(cat);
                  const canRemove =
                    cat !== 'Altro' &&
                    cat !== 'Other' &&
                    !isGoalCategory &&
                    (isCustomCategory || isBuiltinCategory(cat));

                  return (
                    <CategoryBreakdownRow
                      key={cat}
                      category={cat}
                      stats={stats}
                      totalSpent={totalSpent}
                      profile={profile}
                      goals={goals}
                      timeframe={timeframe}
                      periodMultiplier={periodMultiplier}
                      isGoalCategory={isGoalCategory}
                      isCustomCategory={isCustomCategory}
                      canRemove={canRemove}
                      isEditing={editingCategory === cat}
                      inlineBudgetDraft={inlineBudgetDraft}
                      onChangeDraft={setInlineBudgetDraft}
                      onStartEdit={() => startInlineEdit(cat)}
                      onCancelEdit={() => setEditingCategory(null)}
                      onSaveInline={(e) => saveInlineBudget(cat, e)}
                      onResetToDefault={() => resetCategoryToDefault(cat)}
                      onInspectCategory={() => openCategoryDrilldown(cat)}
                      onRemoveCategory={() => setCategoryPendingRemove(cat)}
                    />
                  );
                })}
              </div>
            )}

            {hiddenCategories.length > 0 && (
              <div className="px-4 sm:px-6 py-3.5 border-t border-stone-100 bg-stone-50/50 space-y-2">
                <span className="text-xs font-semibold text-stone-600 block">
                  Categorie predefinite nascoste ({hiddenCategories.length}) — tocca per ripristinare:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {hiddenCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleRestoreHiddenCategory(cat)}
                      className="ds-btn-secondary min-h-8 px-2.5 py-1 text-xs"
                    >
                      <RotateCcw className="w-3 h-3 text-orange-600" />
                      <span>{cat}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(categoryPendingRemove)}
        variant="danger"
        title={
          categoryPendingRemove && customCategorySet.has(categoryPendingRemove)
            ? `Eliminare la categoria "${categoryPendingRemove}"?`
            : `Nascondere la categoria "${categoryPendingRemove}"?`
        }
        description={
          categoryPendingRemove && customCategorySet.has(categoryPendingRemove)
            ? 'La categoria personalizzata verrà rimossa dall’elenco delle scelte. Le spese già registrate resteranno intatte nello storico.'
            : 'La categoria non verrà più proposta tra le scelte, ma potrai ripristinarla in qualsiasi momento in fondo a questa scheda.'
        }
        confirmLabel={
          categoryPendingRemove && customCategorySet.has(categoryPendingRemove)
            ? 'Elimina'
            : 'Nascondi'
        }
        cancelLabel="Annulla"
        onConfirm={() => {
          if (categoryPendingRemove) {
            confirmRemoveOrHideCategory(categoryPendingRemove);
          }
        }}
        onCancel={() => setCategoryPendingRemove(null)}
      />

      <ExpenseDrilldownModal
        payload={drilldown}
        profile={profile}
        goals={goals}
        onClose={() => setDrilldown(null)}
        onSelectExpense={onSelectExpense}
      />
    </div>
  );
};
