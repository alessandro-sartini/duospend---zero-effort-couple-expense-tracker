import React from 'react';
import { Check, X } from 'lucide-react';

interface NewCategoryFormProps {
  name: string;
  budget: string;
  error: string | null;
  currency: string;
  onChangeName: (value: string) => void;
  onChangeBudget: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

/**
 * Form presentazionale per creare una categoria personalizzata.
 * Lo stato delle bozze resta nel componente padre, così il testo digitato
 * sopravvive alla chiusura/riapertura del form come in precedenza.
 */
export const NewCategoryForm: React.FC<NewCategoryFormProps> = ({
  name,
  budget,
  error,
  currency,
  onChangeName,
  onChangeBudget,
  onSubmit,
  onCancel,
}) => (
  <form
    onSubmit={onSubmit}
    className="ds-card p-4 sm:p-5 space-y-3 border border-orange-500/30"
  >
    <div className="flex items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-bold text-stone-900">
          Nuova Categoria Personalizzata
        </h3>
        <p className="text-xs text-stone-500">
          Sarà subito disponibile quando registri o filtri una spesa
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="ds-btn-secondary min-h-8 px-2.5 text-xs"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-[1fr_11rem] gap-3 text-xs">
      <div>
        <label
          htmlFor="new-category-name"
          className="block font-semibold text-stone-700 mb-1"
        >
          Nome Categoria
        </label>
        <input
          id="new-category-name"
          type="text"
          maxLength={40}
          value={name}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder="Es. Animali, Regali, Formazione"
          className="ds-input w-full px-3 py-2 text-xs min-h-10"
        />
      </div>
      <div>
        <label
          htmlFor="new-category-budget"
          className="block font-semibold text-stone-700 mb-1"
        >
          Soglia Mensile ({currency})
        </label>
        <input
          id="new-category-budget"
          type="number"
          min="1"
          step="any"
          value={budget}
          onChange={(e) => onChangeBudget(e.target.value)}
          className="ds-input w-full px-3 py-2 text-xs font-mono font-bold min-h-10"
        />
      </div>
    </div>

    {error && (
      <p className="text-xs font-semibold text-rose-600">
        {error}
      </p>
    )}

    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="ds-btn-secondary min-h-9 px-3 text-xs"
      >
        Annulla
      </button>
      <button
        type="submit"
        className="ds-btn-primary min-h-9 px-4 text-xs"
      >
        <Check className="w-3.5 h-3.5" />
        <span>Crea Categoria</span>
      </button>
    </div>
  </form>
);
