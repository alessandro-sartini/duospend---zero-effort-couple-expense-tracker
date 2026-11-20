import React, { useState } from 'react';
import { ArrowRight, History, Scale, Trash2 } from 'lucide-react';
import { formatCurrency } from '../constants/categories';
import { CoupleProfile, Expense, Settlement } from '../types';
import { BalanceHeroCard } from './dashboard/BalanceHeroCard';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface SettlementViewProps {
  expenses: Expense[];
  settlements: Settlement[];
  profile: CoupleProfile;
  netBalance: number;
  totalSharedSpend: number;
  userTotalPaid: number;
  partnerTotalPaid: number;
  onOpenSettlement: () => void;
  onDeleteSettlement?: (id: string) => void;
}

export const SettlementView: React.FC<SettlementViewProps> = ({
  expenses,
  settlements,
  profile,
  netBalance,
  totalSharedSpend,
  userTotalPaid,
  partnerTotalPaid,
  onOpenSettlement,
  onDeleteSettlement,
}) => {
  const [settlementPendingDelete, setSettlementPendingDelete] = useState<Settlement | null>(null);

  return (
    <div className="space-y-6">
      <BalanceHeroCard
        profile={profile}
        netBalance={netBalance}
        totalSharedSpend={totalSharedSpend}
        userTotalPaid={userTotalPaid}
        partnerTotalPaid={partnerTotalPaid}
        expensesCount={expenses.length}
        variant="settlement"
        onOpenSettlement={onOpenSettlement}
      />

      {/* 2. Storico Rimborsi Effettuati */}
      <div className="ds-card overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-100 bg-stone-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-stone-600" />
            <h3 className="text-sm font-bold text-stone-900">
              Storico Pareggi e Rimborsi Effettuati
            </h3>
          </div>
          <span className="text-xs text-stone-500 font-mono">
            {settlements.length} Rimborsi Registrati
          </span>
        </div>

        {settlements.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500">
            Nessun rimborso registrato finora. Quando effettuate un bonifico o scambio di denaro, apparirà qui.
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {settlements.map((stl) => {
              const fromName = stl.from === 'user' ? profile.userName : profile.partnerName;
              const toName = stl.to === 'user' ? profile.userName : profile.partnerName;

              return (
                <div
                  key={stl.id}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-stone-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl border border-emerald-500/25 bg-emerald-500/12 text-emerald-600 flex items-center justify-center shrink-0">
                      <Scale className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-bold text-stone-900">
                        <span>{fromName}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
                        <span>{toName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500 mt-0.5">
                        <span className="font-mono">{stl.date}</span>
                        <span aria-hidden="true">·</span>
                        <span>{stl.note || 'Pareggio spese'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="text-base font-bold font-mono text-emerald-600 tabular-nums">
                        {formatCurrency(stl.amount, stl.currency || profile.currency)}
                      </span>
                      <span className="block text-[11px] text-stone-400">Pareggiato</span>
                    </div>
                    {onDeleteSettlement && (
                      <button
                        type="button"
                        onClick={() => setSettlementPendingDelete(stl)}
                        className="min-h-10 min-w-10 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                        aria-label={`Annulla rimborso del ${stl.date}`}
                        title="Elimina / Annulla rimborso"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(settlementPendingDelete)}
        variant="danger"
        title="Annullare questo rimborso?"
        description={
          settlementPendingDelete
            ? `Il rimborso di ${formatCurrency(
                settlementPendingDelete.amount,
                settlementPendingDelete.currency || profile.currency
              )} del ${settlementPendingDelete.date} verrà rimosso e il saldo netto verrà ricalcolato.`
            : ''
        }
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        onConfirm={() => {
          if (settlementPendingDelete && onDeleteSettlement) {
            onDeleteSettlement(settlementPendingDelete.id);
          }
          setSettlementPendingDelete(null);
        }}
        onCancel={() => setSettlementPendingDelete(null)}
      />
    </div>
  );
};
