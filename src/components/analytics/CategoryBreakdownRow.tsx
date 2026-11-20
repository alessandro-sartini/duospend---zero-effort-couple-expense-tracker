import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Eye,
  Pencil,
  Target,
  Trash2,
} from 'lucide-react';
import {
  formatCurrency,
  getCategoryBudget,
  getCategoryMeta,
} from '../../constants/categories';
import type { AnalyticsTimeframe } from '../../services/analytics-math';
import { CoupleProfile, ExpenseCategory, SavingGoal } from '../../types';
import { CategoryBadge } from '../ui/CategoryBadge';

export interface CategoryStatSummary {
  total: number;
  count: number;
  userPaid: number;
  partnerPaid: number;
}

interface CategoryBreakdownRowProps {
  category: string;
  stats: CategoryStatSummary;
  totalSpent: number;
  profile: CoupleProfile;
  goals?: SavingGoal[];
  timeframe: AnalyticsTimeframe;
  periodMultiplier: number | null;
  isGoalCategory?: boolean;
  isCustomCategory?: boolean;
  canRemove?: boolean;
  isEditing: boolean;
  inlineBudgetDraft: string;
  onChangeDraft: (val: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveInline: (e: React.FormEvent) => void;
  onResetToDefault: () => void;
  onInspectCategory?: () => void;
  onRemoveCategory?: () => void;
}

export const CategoryBreakdownRow: React.FC<CategoryBreakdownRowProps> = ({
  category,
  stats,
  totalSpent,
  profile,
  goals,
  timeframe,
  periodMultiplier,
  isGoalCategory = false,
  isCustomCategory = false,
  canRemove = false,
  isEditing,
  inlineBudgetDraft,
  onChangeDraft,
  onStartEdit,
  onCancelEdit,
  onSaveInline,
  onResetToDefault,
  onInspectCategory,
  onRemoveCategory,
}) => {
  const percentOfTotal =
    totalSpent > 0 ? Math.round((stats.total / totalSpent) * 100) : 0;
  const meta = getCategoryMeta(category, goals);
  const monthlyBudget = getCategoryBudget(category, profile, goals);
  const hasCustomBudget = Boolean(
    profile.categoryBudgets &&
      typeof profile.categoryBudgets[category as ExpenseCategory] === 'number' &&
      (profile.categoryBudgets[category as ExpenseCategory] ?? 0) > 0
  );
  const periodBudget = periodMultiplier ? monthlyBudget * periodMultiplier : null;
  const usagePercent =
    periodBudget !== null && periodBudget > 0
      ? Math.round((stats.total / periodBudget) * 100)
      : null;
  const isOverBudget = usagePercent !== null && usagePercent > 100;
  const isNearBudget =
    usagePercent !== null && usagePercent >= 80 && usagePercent <= 100;

  const maxScale =
    periodBudget !== null
      ? Math.max(periodBudget, stats.total, 1) * 1.15
      : Math.max(totalSpent, 1);
  const fillWidth =
    periodBudget !== null
      ? Math.min(100, (stats.total / maxScale) * 100)
      : Math.min(100, percentOfTotal);
  const markerLeft =
    periodBudget !== null ? Math.min(98, (periodBudget / maxScale) * 100) : null;

  let barFillClass = 'bg-emerald-500';
  let usageBadgeClass =
    'bg-emerald-500/12 text-emerald-700 border-emerald-500/25';

  if (isOverBudget) {
    barFillClass = 'bg-rose-500';
    usageBadgeClass = 'bg-rose-500/12 text-rose-700 border-rose-500/25';
  } else if (isNearBudget) {
    barFillClass = 'bg-amber-500';
    usageBadgeClass = 'bg-amber-500/12 text-amber-700 border-amber-500/25';
  }

  const countLabel = stats.count === 1 ? '1 spesa' : `${stats.count} spese`;
  const budgetPeriodLabel =
    timeframe === 'month'
      ? 'Budget Mensile'
      : timeframe === 'quarter'
        ? 'Budget Trimestrale (3x)'
        : 'Budget Annuale (12x)';

  return (
    <div
      onDoubleClick={() => {
        if (!isEditing) onStartEdit();
      }}
      className="p-4 sm:p-5 space-y-3.5 hover:bg-stone-50/40 transition-colors"
    >
      {/* Riga 1: Categoria, Badge Stato, Totale */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <CategoryBadge category={category} goals={goals} size="md" />
          <div className="min-w-0">
            <h4 className="text-sm sm:text-base font-bold text-stone-900 truncate">
              {category}
            </h4>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {periodBudget !== null &&
                (isOverBudget ? (
                  <span className="text-[11px] text-rose-700 bg-rose-500/12 border border-rose-500/25 px-2 py-0.5 rounded-md font-semibold inline-flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Oltre Budget
                  </span>
                ) : isNearBudget ? (
                  <span className="text-[11px] text-amber-700 bg-amber-500/12 border border-amber-500/25 px-2 py-0.5 rounded-md font-semibold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Attenzione
                  </span>
                ) : (
                  <span className="text-[11px] text-emerald-700 bg-emerald-500/12 border border-emerald-500/25 px-2 py-0.5 rounded-md font-semibold">
                    In linea
                  </span>
                ))}
              {isGoalCategory && (
                <span className="text-[11px] text-rose-700 bg-rose-500/12 border border-rose-500/25 px-2 py-0.5 rounded-md font-semibold inline-flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  Obiettivo automatico
                </span>
              )}
              {isCustomCategory && (
                <span className="text-[11px] text-orange-700 bg-orange-500/12 border border-orange-500/25 px-2 py-0.5 rounded-md font-semibold">
                  Personalizzata
                </span>
              )}
              {hasCustomBudget && (
                <span className="text-[11px] text-orange-700 bg-orange-500/12 border border-orange-500/25 px-2 py-0.5 rounded-md font-semibold">
                  Soglia modificata
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-lg sm:text-xl font-bold font-mono text-stone-900 tabular-nums leading-tight">
            {formatCurrency(stats.total, profile.currency)}
          </div>
          <div className="text-xs text-stone-500 font-mono tabular-nums mt-0.5">
            {percentOfTotal}% del totale
          </div>
        </div>
      </div>

      {/* Riga 2: Barra Bullet Unificata con Tacca Soglia */}
      {periodBudget !== null ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-stone-500">
              {budgetPeriodLabel}:{' '}
              <strong className="font-mono text-stone-800 tabular-nums">
                {formatCurrency(periodBudget, profile.currency)}
              </strong>
            </span>
            <span
              className={`font-mono font-bold tabular-nums px-2 py-0.5 rounded-md border ${usageBadgeClass}`}
            >
              {usagePercent}%
            </span>
          </div>

          <div
            role="progressbar"
            aria-label={`Budget ${category} utilizzato`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, usagePercent ?? 0)}
            className="relative h-3 w-full rounded-full progress-track overflow-visible"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${barFillClass}`}
              style={{ width: `${fillWidth.toFixed(1)}%` }}
            />
            {markerLeft !== null && (
              <span
                aria-hidden="true"
                title={`Soglia: ${formatCurrency(periodBudget, profile.currency)}`}
                className="absolute -top-1 -bottom-1 w-0.5 rounded-full"
                style={{
                  left: `${markerLeft.toFixed(1)}%`,
                  backgroundColor: 'var(--theme-text)',
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="progress-track h-2.5 w-full overflow-hidden rounded-full">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${fillWidth.toFixed(1)}%`,
              backgroundColor: meta.chartColor,
            }}
          />
        </div>
      )}

      {/* Riga 3: Chip Partner Ordinate + Azioni Categoria */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-stone-100">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="ds-subcard px-2.5 py-1 text-stone-600 font-medium">
            {countLabel}
          </span>
          <span className="ds-subcard px-2.5 py-1 text-stone-600">
            {profile.userName}:{' '}
            <strong className="font-mono text-stone-900 tabular-nums">
              {formatCurrency(stats.userPaid, profile.currency)}
            </strong>
          </span>
          <span className="ds-subcard px-2.5 py-1 text-stone-600">
            {profile.partnerName}:{' '}
            <strong className="font-mono text-stone-900 tabular-nums">
              {formatCurrency(stats.partnerPaid, profile.currency)}
            </strong>
          </span>
        </div>

        {!isEditing && (
          <div className="flex flex-wrap items-center gap-2 ml-auto shrink-0">
            {onInspectCategory && stats.count > 0 && (
              <button
                type="button"
                onClick={onInspectCategory}
                className="ds-btn-secondary min-h-9 px-3 py-1.5 text-xs"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Vedi spese ({stats.count})</span>
              </button>
            )}
            <button
              type="button"
              onClick={onStartEdit}
              className="ds-btn-secondary min-h-9 px-3 py-1.5 text-xs"
              title="Modifica soglia mensile"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Modifica Soglia</span>
            </button>
            {canRemove && onRemoveCategory && (
              <button
                type="button"
                onClick={onRemoveCategory}
                className="min-h-9 min-w-9 rounded-xl border border-stone-200/80 text-stone-400 hover:text-rose-600 hover:border-rose-500/30 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer"
                title={isCustomCategory ? 'Elimina categoria' : 'Nascondi categoria'}
                aria-label={
                  isCustomCategory
                    ? `Elimina categoria ${category}`
                    : `Nascondi categoria ${category}`
                }
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {isEditing && (
        <form
          onSubmit={onSaveInline}
          className="ds-subcard p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={`inline-budget-${category}`}
              className="font-semibold text-stone-700"
            >
              Soglia mensile ({profile.currency}):
            </label>
            <input
              id={`inline-budget-${category}`}
              type="number"
              min="1"
              step="any"
              value={inlineBudgetDraft}
              onChange={(e) => onChangeDraft(e.target.value)}
              className="ds-input w-28 px-2.5 py-1.5 text-xs font-mono font-bold min-h-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onResetToDefault}
              className="ds-btn-secondary min-h-8 px-2.5 text-[11px]"
            >
              Default ({formatCurrency(meta.defaultBudget, profile.currency)})
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="ds-btn-secondary min-h-8 px-2.5 text-[11px]"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="ds-btn-primary min-h-8 px-3 text-[11px]"
            >
              <Check className="w-3 h-3" />
              <span>Salva</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
