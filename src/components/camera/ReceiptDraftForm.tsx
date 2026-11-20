import React from 'react';
import { Sparkles } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import type { CoupleProfile, ExpenseCategory, Payer, SplitType } from '../../types';
import { CategoryBadge } from '../ui/CategoryBadge';
import { PayerSelector } from '../ui/PayerSelector';
import type { ExtractedReceiptDraft } from './receiptOcrUtils';

interface ReceiptDraftFormProps {
  draft: ExtractedReceiptDraft;
  categoryOptions: ExpenseCategory[];
  profile: CoupleProfile;
  payer: Payer;
  splitType: SplitType;
  onChangeDraft: React.Dispatch<React.SetStateAction<ExtractedReceiptDraft | null>>;
  onChangePayer: (payer: Payer) => void;
  onChangeSplitType: (splitType: SplitType) => void;
  onRetakePhoto: () => void;
}

export const ReceiptDraftForm: React.FC<ReceiptDraftFormProps> = ({
  draft,
  categoryOptions,
  profile,
  payer,
  splitType,
  onChangeDraft,
  onChangePayer,
  onChangeSplitType,
  onRetakePhoto,
}) => (
  <div className="p-4 rounded-xl bg-orange-50/40 border border-orange-200/60 space-y-3">
    <div className="flex items-center justify-between pb-2 border-b border-orange-200/50">
      <div className="flex items-center gap-1.5 text-xs font-bold text-orange-900">
        <Sparkles className="w-3.5 h-3.5 text-orange-600" />
        <span>
          {draft.fallbackUsed
            ? 'Bozza Modificabile (Verifica Dati)'
            : 'Dati Estratti (Modificabili)'}
        </span>
      </div>
      <button
        type="button"
        onClick={onRetakePhoto}
        className="text-[11px] text-stone-500 hover:text-stone-800 underline cursor-pointer"
      >
        Rifai Foto
      </button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
      <div>
        <label
          htmlFor="camera-receipt-merchant"
          className="text-stone-600 font-semibold block text-[11px] mb-1"
        >
          Esercente
        </label>
        <input
          id="camera-receipt-merchant"
          type="text"
          value={draft.merchant}
          onChange={(e) =>
            onChangeDraft((prev) =>
              prev ? { ...prev, merchant: e.target.value } : prev
            )
          }
          placeholder="Nome negozio o ristorante"
          className="ds-input min-h-9 w-full px-2.5 text-xs font-semibold"
        />
      </div>
      <div>
        <label
          htmlFor="camera-receipt-total"
          className="text-stone-600 font-semibold block text-[11px] mb-1"
        >
          Importo Totale ({draft.currency || profile.currency})
        </label>
        <input
          id="camera-receipt-total"
          type="number"
          min="0"
          step="0.01"
          value={Number.isFinite(draft.total) ? draft.total : 0}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            onChangeDraft((prev) =>
              prev
                ? { ...prev, total: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 }
                : prev
            );
          }}
          className="ds-input min-h-9 w-full px-2.5 text-xs font-mono font-bold"
        />
      </div>
      <div>
        <label
          htmlFor="camera-receipt-date"
          className="text-stone-600 font-semibold block text-[11px] mb-1"
        >
          Data
        </label>
        <input
          id="camera-receipt-date"
          type="date"
          value={draft.date}
          onChange={(e) =>
            onChangeDraft((prev) =>
              prev ? { ...prev, date: e.target.value } : prev
            )
          }
          className="ds-input min-h-9 w-full px-2.5 text-xs font-mono"
        />
      </div>
      <div>
        <label
          htmlFor="camera-receipt-category"
          className="text-stone-600 font-semibold block text-[11px] mb-1"
        >
          Categoria
        </label>
        <div className="flex items-center gap-2">
          <CategoryBadge category={draft.category} size="sm" />
          <select
            id="camera-receipt-category"
            value={draft.category}
            onChange={(e) =>
              onChangeDraft((prev) =>
                prev
                  ? { ...prev, category: e.target.value as ExpenseCategory }
                  : prev
              )
            }
            className="ds-input min-h-9 flex-1 px-2 text-xs font-medium"
          >
            {categoryOptions.map((categoryOption) => (
              <option key={categoryOption} value={categoryOption}>
                {categoryOption}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>

    {draft.items && draft.items.length > 0 && (
      <div className="pt-2 border-t border-orange-200/40">
        <span className="text-[11px] text-stone-500 font-semibold block mb-1">
          Singoli Articoli Rilevati ({draft.items.length})
        </span>
        <div className="max-h-24 overflow-y-auto space-y-1 text-[11px]">
          {draft.items.map((it: any, idx: number) => (
            <div key={idx} className="flex justify-between text-stone-700">
              <span className="truncate pr-2">{it.name}</span>
              <span className="font-mono font-medium shrink-0">
                {formatCurrency(
                  Number(it.price || 0),
                  draft.currency || profile.currency
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}

    <div className="pt-3 border-t border-orange-200/40 space-y-2.5">
      <div>
        <label className="block text-[11px] font-semibold text-stone-700 mb-1">
          Chi ha pagato questo scontrino?
        </label>
        <PayerSelector
          value={payer}
          onChange={onChangePayer}
          profile={profile}
          size="sm"
        />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-stone-700 mb-1">
          Ripartizione
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChangeSplitType('50_50')}
            className={`py-1.5 px-2 text-xs rounded-xl border text-center transition-all cursor-pointer ${
              splitType === '50_50'
                ? 'border-orange-500 bg-orange-100/60 text-orange-950 font-semibold'
                : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 font-medium'
            }`}
          >
            Diviso 50 / 50
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeSplitType(payer === 'user' ? '100_user' : '100_partner')
            }
            className={`py-1.5 px-2 text-xs rounded-xl border text-center transition-all cursor-pointer ${
              splitType === '100_user' || splitType === '100_partner'
                ? 'border-orange-500 bg-orange-100/60 text-orange-950 font-semibold'
                : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 font-medium'
            }`}
          >
            100% Personale
          </button>
        </div>
      </div>
    </div>
  </div>
);
