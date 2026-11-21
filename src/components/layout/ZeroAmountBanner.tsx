import React from 'react';
import { AlertTriangle, ArrowRight, GitMerge } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import type { ZeroQuarantineCandidateMatch } from '../../services/reconciliation';

interface ZeroAmountBannerProps {
  count: number;
  matches?: ZeroQuarantineCandidateMatch[];
  onGoToExpenses: () => void;
  onMergeMatch?: (zeroExpenseId: string, candidateExpenseId: string) => void;
}

export const ZeroAmountBanner: React.FC<ZeroAmountBannerProps> = ({
  count,
  matches = [],
  onGoToExpenses,
  onMergeMatch,
}) => {
  if (count <= 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-amber-950 sm:px-5 sm:py-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">
              Quarantena 0 €: {count} {count === 1 ? 'ricevuta è' : 'ricevute sono'} in attesa di importo reale.
            </p>
            <p className="text-xs text-amber-900/80">
              Non alterano il saldo finché non inserisci il prezzo o le unisci alla relativa notifica bancaria.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onGoToExpenses}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-800 px-4 text-xs font-semibold text-white hover:bg-amber-900 transition-colors cursor-pointer"
        >
          <span>{count === 1 ? 'Apri spesa da completare' : 'Filtra quarantena 0 €'}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {matches.length > 0 && onMergeMatch && (
        <div className="border-t border-amber-200/80 pt-2.5 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Possibile riscontro bancario trovato (unione in 1 tocco)
          </p>
          <div className="space-y-1.5">
            {matches.slice(0, 3).map(({ zeroExpense, candidateExpense, reason }) => (
              <div
                key={zeroExpense.id}
                className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-white/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-xs">
                  <span className="font-semibold text-stone-900">{zeroExpense.title}</span>{' '}
                  <span className="text-stone-500">({zeroExpense.date})</span> ↔{' '}
                  <strong className="text-emerald-800">
                    {candidateExpense.title} ·{' '}
                    {formatCurrency(candidateExpense.amount, candidateExpense.currency)}
                  </strong>{' '}
                  <span className="text-stone-500">· {reason}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onMergeMatch(zeroExpense.id, candidateExpense.id)}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-[11px] font-semibold text-white hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  <GitMerge className="h-3.5 w-3.5" />
                  <span>Unisci ed esci dalla quarantena</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
