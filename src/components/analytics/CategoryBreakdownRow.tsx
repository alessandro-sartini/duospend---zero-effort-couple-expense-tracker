import React from 'react';
import { AlertCircle, Check, Pencil } from 'lucide-react';
import {
  formatCurrency,
  getCategoryBudget,
  getCategoryMeta,
} from '../../constants/categories';
import { CoupleProfile, ExpenseCategory } from '../../types';
import { ProgressBar } from '../ProgressBar';
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
  timeframe: 'month' | 'quarter' | 'year' | 'all';
  periodMultiplier: number | null;
  isEditing: boolean;
  inlineBudgetDraft: string;
  onChangeDraft: (val: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveInline: (e: React.FormEvent) => void;
  onResetToDefault: () => void;
}

export const CategoryBreakdownRow: React.FC<CategoryBreakdownRowProps> = ({
  category,
  stats,
  totalSpent,
  profile,
  timeframe,
  periodMultiplier,
  isEditing,
  inlineBudgetDraft,
  onChangeDraft,
  onStartEdit,
  onCancelEdit,
  onSaveInline,
  onResetToDefault,
}) => {
  const percentOfTotal = Math.round((stats.total / (totalSpent || 1)) * 100);
  const meta = getCategoryMeta(category);
  const monthlyBudget = getCategoryBudget(category, profile);
  const hasCustomBudget = Boolean(
    profile.categoryBudgets &&
      typeof profile.categoryBudgets[category as ExpenseCategory] === 'number' &&
      (profile.categoryBudgets[category as ExpenseCategory] ?? 0) > 0
  );
  const periodBudget = periodMultiplier ? monthlyBudget * periodMultiplier : null;
  const isOverBudget = periodBudget !== null && stats.total > periodBudget;

  return (
    <div
      onDoubleClick={() => {
        if (!isEditing) onStartEdit();
      }}
      className="p-4 sm:p-5 hover:bg-stone-50/50 transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <CategoryBadge category={category} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-bold text-stone-900">{category}</h4>
              {hasCustomBudget && (
                <span className="text-[10px] text-orange-700 bg-orange-500/12 border border-orange-500/25 px-1.5 py-0.5 rounded-md font-semibold">
                  Personalizzato
                </span>
              )}
              {periodBudget !== null &&
                (isOverBudget ? (
                  <span className="text-[10px] text-rose-700 bg-rose-500/12 border border-rose-500/25 px-1.5 py-0.5 rounded-md font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Oltre Budget
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-700 bg-emerald-500/12 border border-emerald-500/25 px-1.5 py-0.5 rounded-md font-semibold">
                    In linea
                  </span>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 mt-1">
              <span>{stats.count} spese</span>
              <span aria-hidden="true">·</span>
              <span>
                {profile.userName} ha pagato:{' '}
                <strong className="text-stone-700 font-mono">
                  {formatCurrency(stats.userPaid, profile.currency)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {profile.partnerName} ha pagato:{' '}
                <strong className="text-stone-700 font-mono">
                  {formatCurrency(stats.partnerPaid, profile.currency)}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          {!isEditing && (
            <button
              type="button"
              onClick={onStartEdit}
              className="ds-btn-secondary min-h-8 px-2.5 py-1 text-[11px]"
              title="Modifica soglia mensile"
            >
              <Pencil className="w-3 h-3" />
              <span>Modifica Soglia</span>
            </button>
          )}
          <div className="text-right">
            <div className="text-base font-bold font-mono text-stone-900 tabular-nums">
              {formatCurrency(stats.total, profile.currency)}
            </div>
            <div className="text-xs text-stone-500 font-mono">{percentOfTotal}% del totale</div>
          </div>
        </div>
      </div>

      {isEditing && (
        <form
          onSubmit={onSaveInline}
          className="ds-subcard mt-3 p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`inline-budget-${category}`} className="font-semibold text-stone-700">
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
            <button type="submit" className="ds-btn-primary min-h-8 px-3 text-[11px]">
              <Check className="w-3 h-3" />
              <span>Salva</span>
            </button>
          </div>
        </form>
      )}

      {periodBudget !== null && (
        <div className="mt-3 pt-2">
          <div className="flex justify-between text-[11px] text-stone-500 mb-1">
            <span>
              Budget Obiettivo{' '}
              {timeframe === 'month'
                ? 'Mensile'
                : timeframe === 'quarter'
                  ? 'Trimestrale (3x)'
                  : 'Annuale (12x)'}
              : {formatCurrency(periodBudget, profile.currency)}
            </span>
            <span>{Math.round((stats.total / periodBudget) * 100)}% utilizzato</span>
          </div>
          <ProgressBar
            value={(stats.total / periodBudget) * 100}
            variant={stats.total > periodBudget ? 'danger' : 'default'}
            label={`Budget ${category} utilizzato`}
          />
        </div>
      )}
    </div>
  );
};
