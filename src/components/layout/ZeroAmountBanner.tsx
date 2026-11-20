import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';

interface ZeroAmountBannerProps {
  count: number;
  onGoToExpenses: () => void;
}

export const ZeroAmountBanner: React.FC<ZeroAmountBannerProps> = ({
  count,
  onGoToExpenses,
}) => {
  if (count <= 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-amber-950 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <p className="text-sm font-semibold">
          {count} {count === 1 ? 'spesa ha' : 'spese hanno'} un importo non verificato (0 €). L’avviso resta finché non correggi o elimini {count === 1 ? 'la spesa' : 'le spese'}.
        </p>
      </div>
      <button
        type="button"
        onClick={onGoToExpenses}
        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-800 px-4 text-xs font-semibold text-white hover:bg-amber-900 transition-colors cursor-pointer"
      >
        <span>{count === 1 ? 'Apri spesa da correggere' : 'Filtra spese a 0 €'}</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
