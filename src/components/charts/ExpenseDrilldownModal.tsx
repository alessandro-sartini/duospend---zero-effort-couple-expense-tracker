import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Pencil,
  Receipt,
  Scale,
} from 'lucide-react';
import { formatCurrency, formatSplitLabel } from '../../constants/categories';
import type { PayerFilter } from '../../services/analytics-math';
import type { CoupleProfile, Expense, Settlement } from '../../types';
import { CategoryBadge } from '../ui/CategoryBadge';
import { ModalShell } from '../ui/ModalShell';
import { SourceBadge } from '../ui/SourceBadge';

export interface ExpenseDrilldownPayload {
  title: string;
  subtitle: string;
  expenses: Expense[];
  settlements?: Settlement[];
  highlightNote?: string;
}

interface ExpenseDrilldownModalProps {
  payload: ExpenseDrilldownPayload | null;
  profile: CoupleProfile;
  onClose: () => void;
  onSelectExpense?: (expense: Expense) => void;
}

export const ExpenseDrilldownModal: React.FC<ExpenseDrilldownModalProps> = ({
  payload,
  profile,
  onClose,
  onSelectExpense,
}) => {
  const [sortBy, setSortBy] = useState<'amount' | 'date'>('amount');
  const [payerFilter, setPayerFilter] = useState<PayerFilter>('all');

  useEffect(() => {
    setSortBy('amount');
    setPayerFilter('all');
  }, [payload]);

  const rawExpenses = payload?.expenses ?? [];
  const rawSettlements = payload?.settlements ?? [];

  const summary = useMemo(() => {
    let total = 0;
    let userPaid = 0;
    let partnerPaid = 0;
    for (const exp of rawExpenses) {
      total += exp.amount;
      if (exp.payer === 'user') userPaid += exp.amount;
      else partnerPaid += exp.amount;
    }
    const userPct = total > 0 ? Math.round((userPaid / total) * 100) : 0;
    const partnerPct = total > 0 ? 100 - userPct : 0;
    return {
      total: Math.round(total * 100) / 100,
      userPaid: Math.round(userPaid * 100) / 100,
      partnerPaid: Math.round(partnerPaid * 100) / 100,
      userPct,
      partnerPct,
      hasBothPayers: userPaid > 0 && partnerPaid > 0,
    };
  }, [rawExpenses]);

  const visibleExpenses = useMemo(() => {
    const base =
      payerFilter === 'all'
        ? rawExpenses
        : rawExpenses.filter((exp) => exp.payer === payerFilter);
    return [...base].sort((a, b) => {
      if (sortBy === 'amount') {
        return b.amount - a.amount || b.date.localeCompare(a.date);
      }
      return b.date.localeCompare(a.date) || b.amount - a.amount;
    });
  }, [rawExpenses, payerFilter, sortBy]);

  const handleOpenExpense = (expense: Expense) => {
    onClose();
    onSelectExpense?.(expense);
  };

  return (
    <ModalShell
      isOpen={Boolean(payload)}
      onClose={onClose}
      title={payload?.title ?? 'Dettaglio Spese'}
      subtitle={payload?.subtitle}
      icon={Receipt}
      maxWidth="2xl"
      mobileBottomSheet
      closeOnBackdrop
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-stone-500">
            {onSelectExpense && visibleExpenses.length > 0
              ? 'Tocca una spesa per modificarla o vedere i dettagli'
              : `${visibleExpenses.length} ${
                  visibleExpenses.length === 1 ? 'spesa' : 'spese'
                } nel dettaglio`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ds-btn-secondary min-h-10 px-4 text-xs shrink-0"
          >
            Chiudi
          </button>
        </div>
      }
    >
      {payload && (
        <div>
          {/* Riepilogo KPI + Controlli Ordinamento/Filtro */}
          <div className="p-4 border-b border-stone-100 space-y-3">
            {payload.highlightNote && (
              <div className="ds-subcard px-3 py-2 text-xs font-medium text-stone-700">
                {payload.highlightNote}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="ds-subcard p-2.5 sm:p-3 min-w-0">
                <div className="text-stone-500 truncate">Totale</div>
                <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-stone-900 mt-0.5 truncate">
                  {formatCurrency(summary.total, profile.currency)}
                </div>
                <div className="text-[11px] text-stone-500 font-mono">
                  {rawExpenses.length}{' '}
                  {rawExpenses.length === 1 ? 'voce' : 'voci'}
                </div>
              </div>

              <div className="ds-subcard p-2.5 sm:p-3 min-w-0">
                <div className="text-stone-500 truncate">{profile.userName}</div>
                <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-stone-900 mt-0.5 truncate">
                  {formatCurrency(summary.userPaid, profile.currency)}
                </div>
                <div className="text-[11px] text-stone-500 font-mono">
                  {summary.userPct}%
                </div>
              </div>

              <div className="ds-subcard p-2.5 sm:p-3 min-w-0">
                <div className="text-stone-500 truncate">
                  {profile.partnerName}
                </div>
                <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-stone-900 mt-0.5 truncate">
                  {formatCurrency(summary.partnerPaid, profile.currency)}
                </div>
                <div className="text-[11px] text-stone-500 font-mono">
                  {summary.partnerPct}%
                </div>
              </div>
            </div>

            {rawExpenses.length > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <div
                  role="group"
                  aria-label="Ordina spese"
                  className="ds-nav-track grid grid-cols-2 gap-1 p-1 rounded-xl border border-stone-200/70 text-xs font-semibold"
                >
                  <button
                    type="button"
                    onClick={() => setSortBy('amount')}
                    className={`min-h-9 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      sortBy === 'amount'
                        ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-orange-500/30'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Più costose
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortBy('date')}
                    className={`min-h-9 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      sortBy === 'date'
                        ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-orange-500/30'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Più recenti
                  </button>
                </div>

                {summary.hasBothPayers && (
                  <div
                    role="group"
                    aria-label="Filtra per pagante"
                    className="ds-nav-track grid grid-cols-3 gap-1 p-1 rounded-xl border border-stone-200/70 text-xs font-semibold"
                  >
                    {[
                      { id: 'all' as PayerFilter, label: 'Tutti' },
                      { id: 'user' as PayerFilter, label: profile.userName },
                      { id: 'partner' as PayerFilter, label: profile.partnerName },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPayerFilter(opt.id)}
                        className={`min-h-9 px-2 py-1 rounded-lg transition-all cursor-pointer truncate ${
                          payerFilter === opt.id
                            ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-orange-500/30'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Elenco Spese Azionabile */}
          {visibleExpenses.length === 0 && rawSettlements.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-500">
              Nessun movimento trovato per questa selezione.
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {visibleExpenses.map((exp) => {
                const payerName =
                  exp.payer === 'user' ? profile.userName : profile.partnerName;
                const rowContent = (
                  <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 w-full text-left">
                    <div className="row-span-2 flex items-center justify-center">
                      <CategoryBadge category={exp.category} size="md" />
                    </div>

                    <span className="min-w-0 text-sm font-bold text-stone-900 truncate">
                      {exp.title}
                    </span>

                    <div className="shrink-0 flex items-center gap-2">
                      <div className="text-right space-y-1">
                        <div className="text-sm sm:text-base font-bold font-mono text-stone-900 tabular-nums">
                          {formatCurrency(exp.amount, exp.currency)}
                        </div>
                        <div className="flex justify-end">
                          <SourceBadge source={exp.source} compact />
                        </div>
                      </div>
                      {onSelectExpense && (
                        <span className="text-stone-400 shrink-0 hidden sm:inline-flex">
                          <Pencil className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {onSelectExpense && (
                        <span className="text-stone-400 shrink-0 sm:hidden inline-flex">
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      )}
                    </div>

                    <div className="col-span-2 col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500">
                      <span className="font-mono">{exp.date}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        <strong className="text-stone-700">{payerName}</strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatSplitLabel(exp)}</span>
                      {exp.notes && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[220px] sm:max-w-[340px]">
                            {exp.notes}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );

                return onSelectExpense ? (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => handleOpenExpense(exp)}
                    className="w-full min-h-14 px-4 sm:px-5 py-3.5 hover:bg-stone-50/70 transition-colors cursor-pointer block"
                  >
                    {rowContent}
                  </button>
                ) : (
                  <div key={exp.id} className="px-4 sm:px-5 py-3.5">
                    {rowContent}
                  </div>
                );
              })}
            </div>
          )}

          {/* Eventuali Pareggi nel Periodo */}
          {rawSettlements.length > 0 && (
            <div className="border-t border-stone-200/80">
              <div className="px-4 sm:px-5 py-2.5 bg-stone-50/60 border-b border-stone-100 text-xs font-bold text-stone-700 flex items-center justify-between">
                <span>Pareggi registrati nel periodo</span>
                <span className="font-mono text-stone-500">
                  {rawSettlements.length}
                </span>
              </div>
              <div className="divide-y divide-stone-100">
                {rawSettlements.map((stl) => {
                  const fromName =
                    stl.from === 'user'
                      ? profile.userName
                      : profile.partnerName;
                  const toName =
                    stl.to === 'user' ? profile.userName : profile.partnerName;
                  return (
                    <div
                      key={stl.id}
                      className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl border border-emerald-500/25 bg-emerald-500/12 text-emerald-600 flex items-center justify-center shrink-0">
                          <Scale className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                            <span>{fromName}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
                            <span>{toName}</span>
                          </div>
                          <div className="text-xs text-stone-500 truncate">
                            <span className="font-mono mr-2">{stl.date}</span>
                            {stl.note || 'Pareggio spese'}
                          </div>
                        </div>
                      </div>
                      <span className="text-sm sm:text-base font-bold font-mono text-emerald-600 tabular-nums shrink-0">
                        +{formatCurrency(stl.amount, stl.currency || profile.currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};
