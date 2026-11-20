import React from 'react';
import { Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  formatCurrency,
  getCategoryMeta,
} from '../../constants/categories';
import type { ExpenseCategory, SavingGoal } from '../../types';
import { CategoryBadge } from '../ui/CategoryBadge';

interface BulkCategoryBudgetPanelProps {
  categories: ExpenseCategory[];
  goals?: SavingGoal[];
  customCategories?: string[];
  currency: string;
  monthlyBudget: number;
  drafts: Record<ExpenseCategory, string>;
  draftTotal: number;
  onChangeDraft: (cat: ExpenseCategory, value: string) => void;
  onSaveAll: (e: React.FormEvent) => void;
  onResetAll: () => void;
  onCancel: () => void;
  onRemoveCategory?: (cat: string) => void;
  onOpenNewCategory?: () => void;
}

export const BulkCategoryBudgetPanel: React.FC<BulkCategoryBudgetPanelProps> = ({
  categories,
  goals,
  customCategories = [],
  currency,
  monthlyBudget,
  drafts,
  draftTotal,
  onChangeDraft,
  onSaveAll,
  onResetAll,
  onCancel,
  onRemoveCategory,
  onOpenNewCategory,
}) => {
  const customSet = new Set(customCategories);
  const goalSet = new Set((goals ?? []).map((g) => g.title.trim()));

  return (
    <form onSubmit={onSaveAll} className="ds-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-200/70">
        <div>
          <h3 className="text-sm font-bold text-stone-900">
            Configura Soglie Mensili per Ogni Categoria ({currency})
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Imposta obiettivi realistici: verranno usati in Mese (1x), 3 mesi (3x) e Anno (12x)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {onOpenNewCategory && (
            <button
              type="button"
              onClick={onOpenNewCategory}
              className="ds-btn-secondary min-h-9 px-3 text-xs"
            >
              <Plus className="w-3.5 h-3.5 text-orange-600" />
              <span>Nuova Categoria</span>
            </button>
          )}
          <button
            type="button"
            onClick={onResetAll}
            className="ds-btn-secondary min-h-9 px-3 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Ripristina Predefiniti</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        {categories.map((cat) => {
          const meta = getCategoryMeta(cat, goals);
          const isGoal = goalSet.has(cat.trim());
          const isCustom = customSet.has(cat);
          const canRemove = Boolean(onRemoveCategory && cat !== 'Altro' && !isGoal);

          return (
            <div key={cat} className="ds-subcard p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CategoryBadge category={cat} goals={goals} size="sm" />
                  <label
                    htmlFor={`bulk-budget-${cat}`}
                    className="font-semibold text-stone-900 truncate"
                  >
                    {cat}
                  </label>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-stone-500 font-mono">
                    Default: {formatCurrency(meta.defaultBudget, currency)}
                  </span>
                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => onRemoveCategory?.(cat)}
                      className="h-6 w-6 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer"
                      title={isCustom ? 'Elimina categoria' : 'Nascondi categoria'}
                      aria-label={isCustom ? `Elimina ${cat}` : `Nascondi ${cat}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <input
                id={`bulk-budget-${cat}`}
                type="number"
                min="1"
                step="any"
                value={drafts[cat] ?? ''}
                onChange={(e) => onChangeDraft(cat, e.target.value)}
                className="ds-input w-full px-3 py-2 text-xs font-mono font-semibold min-h-9"
              />
            </div>
          );
        })}
      </div>

      <div className="pt-3 border-t border-stone-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-stone-600 flex flex-wrap items-center gap-2">
          <span>
            Somma Budget Categorie:{' '}
            <strong className="font-mono text-stone-900">
              {formatCurrency(draftTotal, currency)}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Budget Mensile Coppia:{' '}
            <strong className="font-mono text-stone-900">
              {formatCurrency(monthlyBudget, currency)}
            </strong>
          </span>
          {draftTotal > monthlyBudget && (
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-500/12 border border-amber-500/25 px-2 py-0.5 rounded-md">
              Supera il budget mensile di{' '}
              {formatCurrency(draftTotal - monthlyBudget, currency)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="ds-btn-secondary min-h-9 px-3.5 text-xs"
          >
            Annulla
          </button>
          <button type="submit" className="ds-btn-primary min-h-9 px-4 text-xs">
            <Check className="w-3.5 h-3.5" />
            <span>Salva Tutti i Budget</span>
          </button>
        </div>
      </div>
    </form>
  );
};
