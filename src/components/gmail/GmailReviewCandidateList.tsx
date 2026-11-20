import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '../../constants/categories';
import type { ExpenseCategory } from '../../types';
import type { DetectedGmailReceipt, GmailReviewCandidate } from './types';
import { getDefaultMerchant } from './types';

interface GmailReviewCandidateListProps {
  candidates: GmailReviewCandidate[];
  currency: string;
  recurringSetupId: string | null;
  recurringMerchantDrafts: Record<string, string>;
  recurringAmountDrafts: Record<string, string>;
  recurringCategoryDrafts: Record<string, ExpenseCategory>;
  onOpenIgnoreAllConfirm: () => void;
  onIgnoreCandidate: (id: string) => void;
  onPromoteCandidate: (candidate: GmailReviewCandidate) => void;
  onSetRecurringSetupId: (id: string | null) => void;
  onChangeMerchantDraft: (id: string, value: string) => void;
  onChangeAmountDraft: (id: string, value: string) => void;
  onChangeCategoryDraft: (id: string, category: ExpenseCategory) => void;
  onSaveRecurringRule: (receipt: DetectedGmailReceipt) => void;
}

export const GmailReviewCandidateList: React.FC<GmailReviewCandidateListProps> = ({
  candidates,
  currency,
  recurringSetupId,
  recurringMerchantDrafts,
  recurringAmountDrafts,
  recurringCategoryDrafts,
  onOpenIgnoreAllConfirm,
  onIgnoreCandidate,
  onPromoteCandidate,
  onSetRecurringSetupId,
  onChangeMerchantDraft,
  onChangeAmountDraft,
  onChangeCategoryDraft,
  onSaveRecurringRule,
}) => {
  if (candidates.length === 0) return null;

  return (
    <details open className="rounded-xl border border-stone-200 p-3">
      <summary className="min-h-10 cursor-pointer py-2 text-xs font-bold text-stone-800">
        {candidates.length} email da controllare
      </summary>

      <button
        type="button"
        onClick={onOpenIgnoreAllConfirm}
        className="mb-2 min-h-9 rounded-lg px-2.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
      >
        Ignora tutte
      </button>

      <p className="pb-3 text-[11px] text-stone-500">
        Punteggio Gemini: stima non calibrata della probabilità che sia una spesa. Da 40 a 64% resta da verificare; sotto 40% viene esclusa automaticamente. Ignorare le email le esclude solo da DuoSpend, senza cancellarle da Gmail.
      </p>

      <div className="space-y-2">
        {candidates.map((candidate) => {
          const merchant =
            recurringMerchantDrafts[candidate.id] || getDefaultMerchant(candidate.sender);
          const category = recurringCategoryDrafts[candidate.id] || 'Bollette e Utenze';

          return (
            <div
              key={candidate.id}
              className="ds-subcard p-3 text-xs space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-stone-800">
                    {candidate.subject || '(senza oggetto)'}
                  </p>
                  <p className="mt-1 break-words text-[10px] text-stone-500">
                    {candidate.dateHeader} · {candidate.sender}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-amber-800">
                    Confidenza spesa: {candidate.confidence}% · {candidate.reason}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onIgnoreCandidate(candidate.id)}
                  className="min-h-9 shrink-0 rounded-lg px-2 text-[11px] font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Ignora email
                </button>
              </div>

              {candidate.recurringRuleMismatch && (
                <p className="flex items-center gap-1 rounded-lg bg-amber-50 p-2 text-[11px] font-semibold text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Mittente o oggetto diverso da una regola salvata: ricontrolla l'importo.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPromoteCandidate(candidate)}
                  className="min-h-9 rounded-lg bg-orange-50 px-3 text-[11px] font-semibold text-orange-800 hover:bg-orange-100 transition-colors cursor-pointer"
                >
                  Considera spesa e aggiungi
                </button>
                {recurringSetupId !== candidate.id && (
                  <button
                    type="button"
                    onClick={() => onSetRecurringSetupId(candidate.id)}
                    className="min-h-9 rounded-lg px-3 text-[11px] font-semibold text-orange-700 hover:bg-orange-50 transition-colors cursor-pointer"
                  >
                    Imposta come spesa ricorrente
                  </button>
                )}
              </div>

              {recurringSetupId === candidate.id && (
                <div className="mt-2 space-y-2 pt-2 border-t border-stone-200/70">
                  <label
                    className="block text-[11px] font-medium text-stone-600"
                    htmlFor={`recurring-merchant-${candidate.id}`}
                  >
                    Nome spesa
                  </label>
                  <input
                    id={`recurring-merchant-${candidate.id}`}
                    value={merchant}
                    onChange={(event) => onChangeMerchantDraft(candidate.id, event.target.value)}
                    className="ds-input min-h-9 w-full px-2.5 text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <label className="sr-only" htmlFor={`recurring-amount-${candidate.id}`}>
                      Importo ricorrente
                    </label>
                    <input
                      id={`recurring-amount-${candidate.id}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={recurringAmountDrafts[candidate.id] ?? ''}
                      onChange={(event) => onChangeAmountDraft(candidate.id, event.target.value)}
                      placeholder="Importo fisso"
                      className="ds-input min-h-9 w-32 px-2.5 text-xs"
                    />
                    <label className="sr-only" htmlFor={`recurring-category-${candidate.id}`}>
                      Categoria spesa
                    </label>
                    <select
                      id={`recurring-category-${candidate.id}`}
                      value={category}
                      onChange={(event) =>
                        onChangeCategoryDraft(candidate.id, event.target.value as ExpenseCategory)
                      }
                      className="ds-input min-h-9 min-w-44 px-2.5 text-xs"
                    >
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onSetRecurringSetupId(null)}
                      className="ds-btn-secondary min-h-9 px-3 text-xs"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSaveRecurringRule({
                          id: candidate.id,
                          sourceEmailSender: candidate.sender,
                          sourceEmailSubject: candidate.subject,
                          merchant,
                          total: 0,
                          currency,
                          category,
                          dateHeader: candidate.dateHeader,
                        })
                      }
                      className="ds-btn-primary min-h-9 px-3 text-xs"
                    >
                      Salva regola e aggiungi spesa
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
};
