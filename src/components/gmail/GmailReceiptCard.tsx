import React, { useState } from 'react';
import { AlertTriangle, Ban, Check, Pencil, X } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import { CategoryBadge } from '../ui/CategoryBadge';
import type { DetectedGmailReceipt } from './types';

interface GmailReceiptCardProps {
  receipt: DetectedGmailReceipt;
  isChecked: boolean;
  currencyFallback: string;
  isRecurringSetupOpen: boolean;
  recurringAmountDraft: string;
  onToggleSelect: () => void;
  onIgnore: () => void;
  onUpdateReceipt?: (patch: Partial<Pick<DetectedGmailReceipt, 'merchant' | 'total'>>) => void;
  onToggleRecurringSetup: () => void;
  onChangeRecurringAmount: (value: string) => void;
  onSaveRecurringRule: () => void;
}

export const GmailReceiptCard: React.FC<GmailReceiptCardProps> = ({
  receipt,
  isChecked,
  currencyFallback,
  isRecurringSetupOpen,
  recurringAmountDraft,
  onToggleSelect,
  onIgnore,
  onUpdateReceipt,
  onToggleRecurringSetup,
  onChangeRecurringAmount,
  onSaveRecurringRule,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [merchantDraft, setMerchantDraft] = useState(receipt.merchant || '');
  const [totalDraft, setTotalDraft] = useState(
    Number.isFinite(Number(receipt.total)) ? String(receipt.total) : '0'
  );
  const hasUnknownAmount = !(Number(receipt.total) > 0);
  const category = receipt.category || 'Shopping';

  const openEditor = (event: React.MouseEvent) => {
    event.stopPropagation();
    setMerchantDraft(receipt.merchant || '');
    setTotalDraft(Number.isFinite(Number(receipt.total)) ? String(receipt.total) : '0');
    setIsEditing(true);
  };

  const saveEdit = (event: React.FormEvent | React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const parsedTotal = Number(String(totalDraft).replace(',', '.'));
    onUpdateReceipt?.({
      merchant: merchantDraft.trim() || receipt.merchant || 'Esercente',
      total:
        Number.isFinite(parsedTotal) && parsedTotal >= 0
          ? Math.round(parsedTotal * 100) / 100
          : Number(receipt.total) || 0,
    });
    setIsEditing(false);
  };

  return (
    <div
      onClick={onToggleSelect}
      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-3 ${
        isChecked
          ? 'bg-orange-50/50 border-orange-300 shadow-2xs'
          : 'bg-white border-stone-200 opacity-75 hover:opacity-100'
      }`}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onClick={(event) => event.stopPropagation()}
        onChange={onToggleSelect}
        aria-label={`Seleziona ${receipt.merchant || 'ricevuta'}`}
        className="mt-1 accent-orange-600 rounded"
      />

      <CategoryBadge category={category} size="sm" className="mt-0.5" />

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <form
            onSubmit={saveEdit}
            onClick={(event) => event.stopPropagation()}
            className="mb-2 space-y-2 rounded-lg border border-orange-200 bg-orange-50/40 p-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_7.5rem] gap-2">
              <input
                type="text"
                value={merchantDraft}
                onChange={(event) => setMerchantDraft(event.target.value)}
                aria-label="Modifica esercente rilevato"
                placeholder="Esercente"
                className="ds-input min-h-9 px-2.5 text-xs"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={totalDraft}
                onChange={(event) => setTotalDraft(event.target.value)}
                aria-label="Modifica importo rilevato"
                placeholder="Importo"
                className="ds-input min-h-9 px-2.5 text-xs font-mono"
              />
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsEditing(false);
                }}
                className="min-h-8 rounded-lg px-2.5 text-[11px] font-semibold text-stone-600 hover:bg-stone-200/70 cursor-pointer inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                Annulla
              </button>
              <button
                type="submit"
                className="min-h-8 rounded-lg bg-orange-600 px-2.5 text-[11px] font-semibold text-white hover:bg-orange-700 cursor-pointer inline-flex items-center gap-1"
              >
                <Check className="h-3 w-3" />
                Applica
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-bold text-stone-900 truncate">
              {receipt.merchant || 'Esercente'}
            </span>
            <span className="font-mono font-bold text-stone-900 tabular-nums shrink-0">
              {formatCurrency(Number(receipt.total || 0), receipt.currency || currencyFallback)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
          <span className="font-mono">{receipt.date || 'Recente'}</span>
          <span aria-hidden="true">·</span>
          <span>{category}</span>
        </div>

        {receipt.fallbackUsed && (
          <p className="mt-1 text-[11px] font-semibold text-amber-800">
            Modalità fallback locale · verifica importo ed esercente prima di importare
          </p>
        )}

        {Number.isFinite(receipt.confidence) && (
          <p
            className="mt-1 text-[11px] font-semibold text-emerald-800"
            title={receipt.reason || 'Stima AI non calibrata'}
          >
            Confidenza Gemini: {Math.round(receipt.confidence!)}% · stima non calibrata
          </p>
        )}

        {(receipt.sourceEmailSender || receipt.sourceEmailSubject) && (
          <p className="mt-1 break-words text-[10px] text-stone-500">
            Email: {receipt.sourceEmailSender || 'mittente sconosciuto'} ·{' '}
            {receipt.sourceEmailSubject || 'senza oggetto'}
          </p>
        )}

        {receipt.itemsDescription && (
          <p className="text-[11px] text-stone-600 mt-1 line-clamp-1 italic">
            "{receipt.itemsDescription}"
          </p>
        )}

        {receipt.recurringRuleApplied && (
          <p className="mt-1 text-[10px] font-semibold text-emerald-700">
            Importo fisso applicato dalla regola ricorrente
          </p>
        )}

        {receipt.recurringRuleMismatch && (
          <p className="mt-2 flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 p-2 font-semibold text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Mittente o oggetto diverso dalla regola salvata: verifica se l’importo è cambiato.
          </p>
        )}

        {hasUnknownAmount && (
          <p className="mt-2 flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 p-2 font-semibold text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Importo non verificato: €0,00
          </p>
        )}

        {receipt.sourceEmailSender && receipt.sourceEmailSubject && (
          <div className="mt-2">
            {!hasUnknownAmount && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleRecurringSetup();
                }}
                className="min-h-9 rounded-lg px-2 text-[11px] font-semibold text-orange-700 hover:bg-orange-50 transition-colors cursor-pointer"
              >
                {isRecurringSetupOpen
                  ? 'Chiudi regola ricorrente'
                  : 'Imposta importo ricorrente'}
              </button>
            )}

            {(hasUnknownAmount || isRecurringSetupOpen) && (
              <div
                className={`rounded-xl border p-2.5 mt-1 ${
                  hasUnknownAmount
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-stone-200 bg-stone-50'
                }`}
              >
                <p className="text-[10px] text-stone-600">
                  La regola si applica solo se mittente e oggetto restano uguali.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`recurring-amount-${receipt.id}`}>
                    Importo ricorrente per {receipt.merchant || 'questa email'}
                  </label>
                  <input
                    id={`recurring-amount-${receipt.id}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={recurringAmountDraft}
                    onChange={(event) => onChangeRecurringAmount(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    placeholder="Importo fisso"
                    className="ds-input min-h-9 w-32 px-2.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSaveRecurringRule();
                    }}
                    className="min-h-9 rounded-lg bg-stone-800 px-3 text-xs font-semibold text-white hover:bg-stone-900 cursor-pointer"
                  >
                    Salva regola
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {onUpdateReceipt && (
          <button
            type="button"
            onClick={openEditor}
            className="min-h-10 sm:min-h-9 rounded-lg px-2 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            aria-label={`Modifica ${receipt.merchant || 'ricevuta rilevata'}`}
          >
            <Pencil className="mr-1 inline h-3.5 w-3.5" />
            Modifica
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onIgnore();
          }}
          className="min-h-10 sm:min-h-9 rounded-lg px-2 text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
          aria-label={`Ignora email da ${receipt.merchant || 'questo messaggio'}`}
        >
          <Ban className="mr-1 inline h-3.5 w-3.5" />
          Ignora
        </button>
      </div>
    </div>
  );
};
