import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  formatCurrency,
  getCategoryMeta,
} from '../../constants/categories';
import { ExpenseCategory } from '../../types';
import { CategoryBadge } from '../ui/CategoryBadge';

interface BulkCategoryBudgetPanelProps {
  currency: string;
  monthlyBudget: number;
  drafts: Record<ExpenseCategory, string>;
  draftTotal: number;
  onChangeDraft: (cat: ExpenseCategory, value: string) => void;
  onSaveAll: (e: React.FormEvent) => void;
  onResetAll: () => void;
  onCancel: () => void;
}

export const BulkCategoryBudgetPanel: React.FC<BulkCategoryBudgetPanelProps> = ({
  currency,
  monthlyBudget,
  drafts,
  draftTotal,
  onChangeDraft,
  onSaveAll,
  onResetAll,
  onCancel,
}) => {
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
        <button
          type="button"
          onClick={onResetAll}
          className="ds-btn-secondary min-h-9 px-3 text-xs self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Ripristina Predefiniti</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        {EXPENSE_CATEGORIES.map((cat) => {
          const meta = getCategoryMeta(cat);
          return (
            <div key={cat} className="ds-subcard p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CategoryBadge category={cat} size="sm" />
                  <label
                    htmlFor={`bulk-budget-${cat}`}
                    className="font-semibold text-stone-900 truncate"
                  >
                    {cat}
                  </label>
                </div>
                <span className="text-[10px] text-stone-500 font-mono shrink-0">
                  Default: {formatCurrency(meta.defaultBudget, currency)}
                </span>
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
