import React, { useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  Flame,
  SlidersHorizontal,
  Wallet,
  X,
} from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  formatCurrency,
  getCategoryBudget,
  getCategoryMeta,
} from '../constants/categories';
import { CoupleProfile, Expense, ExpenseCategory } from '../types';
import { BulkCategoryBudgetPanel } from './analytics/BulkCategoryBudgetPanel';
import {
  CategoryBreakdownRow,
  CategoryStatSummary,
} from './analytics/CategoryBreakdownRow';
import { StatCard } from './ui/StatCard';

interface CategoryAnalyticsProps {
  expenses: Expense[];
  profile: CoupleProfile;
  onUpdateProfile: (updated: Partial<CoupleProfile>) => void;
}

const TIMEFRAMES: Array<{
  id: 'month' | 'quarter' | 'year' | 'all';
  shortLabel: string;
  fullLabel: string;
}> = [
  { id: 'month', shortLabel: 'Mese', fullLabel: 'Questo Mese' },
  { id: 'quarter', shortLabel: '3 mesi', fullLabel: 'Ultimi 3 Mesi' },
  { id: 'year', shortLabel: 'Anno', fullLabel: 'Anno 2026 (YTD)' },
  { id: 'all', shortLabel: 'Tutto', fullLabel: 'Tutto lo Storico' },
];

const PERIOD_MULTIPLIERS: Record<'month' | 'quarter' | 'year' | 'all', number | null> = {
  month: 1,
  quarter: 3,
  year: 12,
  all: null,
};

export const CategoryAnalytics: React.FC<CategoryAnalyticsProps> = ({
  expenses,
  profile,
  onUpdateProfile,
}) => {
  const [timeframe, setTimeframe] = useState<'month' | 'quarter' | 'year' | 'all'>('month');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [inlineBudgetDraft, setInlineBudgetDraft] = useState('');
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);
  const [bulkDrafts, setBulkDrafts] = useState<Record<ExpenseCategory, string>>(() => {
    const initial = {} as Record<ExpenseCategory, string>;
    for (const cat of EXPENSE_CATEGORIES) {
      initial[cat] = String(getCategoryBudget(cat, profile));
    }
    return initial;
  });
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const flashSaved = (message: string) => {
    setSavedBanner(message);
    setTimeout(() => setSavedBanner(null), 2500);
  };

  const startInlineEdit = (category: string) => {
    setEditingCategory(category);
    setInlineBudgetDraft(String(getCategoryBudget(category, profile)));
  };

  const saveInlineBudget = (category: string, e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(inlineBudgetDraft.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1_000_000) return;

    const cleanValue = Math.round(parsed * 100) / 100;
    const defaultValue = getCategoryMeta(category).defaultBudget;
    const nextBudgets: Partial<Record<ExpenseCategory, number>> = {
      ...(profile.categoryBudgets || {}),
    };

    if (cleanValue === defaultValue) {
      delete nextBudgets[category as ExpenseCategory];
    } else {
      nextBudgets[category as ExpenseCategory] = cleanValue;
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
    delete nextBudgets[category as ExpenseCategory];
    onUpdateProfile({ categoryBudgets: nextBudgets });
    setEditingCategory(null);
    flashSaved(`Budget di "${category}" ripristinato al valore predefinito`);
  };

  const toggleConfigurePanel = () => {
    if (!isConfigureOpen) {
      const refreshed = {} as Record<ExpenseCategory, string>;
      for (const cat of EXPENSE_CATEGORIES) {
        refreshed[cat] = String(getCategoryBudget(cat, profile));
      }
      setBulkDrafts(refreshed);
    }
    setIsConfigureOpen((open) => !open);
  };

  const saveAllBulkBudgets = (e: React.FormEvent) => {
    e.preventDefault();
    const nextBudgets: Partial<Record<ExpenseCategory, number>> = {};
    for (const cat of EXPENSE_CATEGORIES) {
      const parsed = Number((bulkDrafts[cat] ?? '').replace(',', '.'));
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 1_000_000) {
        const rounded = Math.round(parsed * 100) / 100;
        if (rounded !== getCategoryMeta(cat).defaultBudget) {
          nextBudgets[cat] = rounded;
        }
      }
    }
    onUpdateProfile({ categoryBudgets: nextBudgets });
    setIsConfigureOpen(false);
    flashSaved('Tutti i budget di categoria sono stati salvati e sincronizzati!');
  };

  const resetAllBudgets = () => {
    const defaults = {} as Record<ExpenseCategory, string>;
    for (const cat of EXPENSE_CATEGORIES) {
      defaults[cat] = String(getCategoryMeta(cat).defaultBudget);
    }
    setBulkDrafts(defaults);
    onUpdateProfile({ categoryBudgets: {} });
    flashSaved('Budget di tutte le categorie ripristinati ai valori predefiniti.');
  };

  const bulkDraftTotal = EXPENSE_CATEGORIES.reduce((sum, cat) => {
    const parsed = Number((bulkDrafts[cat] ?? '').replace(',', '.'));
    return sum + (Number.isFinite(parsed) && parsed > 0 ? parsed : getCategoryBudget(cat, profile));
  }, 0);

  const now = new Date();
  const currentMonthStr = now.toISOString().slice(0, 7);
  const currentYearStr = now.getFullYear().toString();

  const filtered = expenses.filter((e) => {
    if (timeframe === 'month') return e.date.startsWith(currentMonthStr);
    if (timeframe === 'year') return e.date.startsWith(currentYearStr);
    if (timeframe === 'quarter') {
      const expDate = new Date(e.date);
      const diffMonths =
        (now.getFullYear() - expDate.getFullYear()) * 12 +
        (now.getMonth() - expDate.getMonth());
      return diffMonths >= 0 && diffMonths <= 3;
    }
    return true;
  });

  const totalSpent = filtered.reduce((acc, curr) => acc + curr.amount, 0);

  const categoryStats: Record<string, CategoryStatSummary> = {};

  filtered.forEach((e) => {
    if (!categoryStats[e.category]) {
      categoryStats[e.category] = { total: 0, count: 0, userPaid: 0, partnerPaid: 0 };
    }
    categoryStats[e.category].total += e.amount;
    categoryStats[e.category].count += 1;
    if (e.payer === 'user') {
      categoryStats[e.category].userPaid += e.amount;
    } else {
      categoryStats[e.category].partnerPaid += e.amount;
    }
  });

  const sortedCategories = Object.entries(categoryStats).sort(([, a], [, b]) => b.total - a.total);

  const topCategoryName = sortedCategories[0]?.[0] || 'Nessuna';
  const topCategoryTotal = sortedCategories[0]?.[1]?.total || 0;
  const topCategoryPercent = totalSpent > 0 ? Math.round((topCategoryTotal / totalSpent) * 100) : 0;
  const periodMultiplier = PERIOD_MULTIPLIERS[timeframe];

  return (
    <div className="space-y-6">
      {/* Intestazione e Scelta Periodo */}
      <div className="ds-card p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900 font-display">
            Statistiche e Trend per Categoria
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Analisi delle uscite di coppia, confronto quote tra partner e budget personalizzati per categoria
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <button
            type="button"
            onClick={toggleConfigurePanel}
            className="ds-btn-secondary min-h-10 px-3.5 py-2 text-xs shrink-0"
          >
            {isConfigureOpen ? (
              <X className="w-3.5 h-3.5" />
            ) : (
              <SlidersHorizontal className="w-3.5 h-3.5 text-orange-600" />
            )}
            <span>
              {isConfigureOpen ? 'Chiudi Configurazione' : 'Configura Budget per Categoria'}
            </span>
          </button>

          <div className="ds-nav-track grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1 p-1 rounded-xl border border-stone-200/70 text-xs font-semibold">
            {TIMEFRAMES.map((tf) => {
              const isActive = timeframe === tf.id;
              return (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => setTimeframe(tf.id)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                    isActive
                      ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-orange-500/30'
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

      {/* Pannello Configurazione Bulk Budget per Categoria */}
      {isConfigureOpen && (
        <BulkCategoryBudgetPanel
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
        />
      )}

      {/* Schede KPI Aggregate */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Totale Spese Sostenute"
          value={formatCurrency(totalSpent, profile.currency)}
          icon={Wallet}
          iconClassName="bg-orange-500/12 text-orange-600 border-orange-500/25"
          subtitle={`Su un totale di ${filtered.length} transazioni registrate`}
        />

        <StatCard
          label="Categoria Più Incisiva"
          value={<span className="font-display truncate block">{topCategoryName}</span>}
          valueClassName="text-orange-600"
          icon={Flame}
          iconClassName="bg-rose-500/12 text-rose-600 border-rose-500/25"
          subtitle={
            <span className="font-mono">
              {formatCurrency(topCategoryTotal, profile.currency)} ({topCategoryPercent}%)
            </span>
          }
        />

        <StatCard
          label="Spesa Media per Scontrino"
          value={formatCurrency(
            filtered.length > 0 ? totalSpent / filtered.length : 0,
            profile.currency
          )}
          icon={Calculator}
          iconClassName="bg-emerald-500/12 text-emerald-600 border-emerald-500/25"
          subtitle="Coerente con il ritmo di vita della coppia"
        />
      </div>

      {/* Barra Proporzionale a Spettro */}
      {totalSpent > 0 && (
        <div className="ds-card p-5 sm:p-6 space-y-3">
          <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">
            Ripartizione Percentuale Categorie
          </span>
          <div className="progress-track flex h-4 w-full overflow-hidden rounded-full">
            {sortedCategories.map(([cat, stats]) => {
              const width = (stats.total / totalSpent) * 100;
              const meta = getCategoryMeta(cat);
              return (
                <div
                  key={cat}
                  style={{
                    width: `${width}%`,
                    backgroundColor: meta.chartColor,
                  }}
                  title={`${cat}: ${formatCurrency(stats.total, profile.currency)} (${Math.round(width)}%)`}
                  className="h-full hover:opacity-90 transition-opacity"
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-xs text-stone-600">
            {sortedCategories.map(([cat, stats]) => {
              const meta = getCategoryMeta(cat);
              return (
                <div key={cat} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-xs"
                    style={{ backgroundColor: meta.chartColor }}
                  />
                  <span className="font-medium text-stone-800">{cat}</span>
                  <span className="font-mono text-stone-400 tabular-nums">
                    {Math.round((stats.total / totalSpent) * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabella Dettagliata per Categoria */}
      <div className="ds-card overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-100 bg-stone-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-stone-900">
              Dettaglio Spese Categorie e Quote Pagate dai Partner
            </h3>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Suggerimento: doppio clic su una categoria o tocca Modifica Soglia per personalizzarne il budget mensile
            </p>
          </div>
          <span className="text-xs text-stone-500 font-mono shrink-0">
            {sortedCategories.length} Categorie Attive
          </span>
        </div>

        <div className="divide-y divide-stone-100">
          {sortedCategories.map(([cat, stats]) => (
            <CategoryBreakdownRow
              key={cat}
              category={cat}
              stats={stats}
              totalSpent={totalSpent}
              profile={profile}
              timeframe={timeframe}
              periodMultiplier={periodMultiplier}
              isEditing={editingCategory === cat}
              inlineBudgetDraft={inlineBudgetDraft}
              onChangeDraft={setInlineBudgetDraft}
              onStartEdit={() => startInlineEdit(cat)}
              onCancelEdit={() => setEditingCategory(null)}
              onSaveInline={(e) => saveInlineBudget(cat, e)}
              onResetToDefault={() => resetCategoryToDefault(cat)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
