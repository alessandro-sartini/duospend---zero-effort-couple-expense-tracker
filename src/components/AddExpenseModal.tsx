import React, { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '../constants/categories';
import { CoupleProfile, Expense, ExpenseCategory, Payer, SplitType } from '../types';
import { ModalShell } from './ui/ModalShell';
import { PayerSelector } from './ui/PayerSelector';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: Omit<Expense, 'id'>) => void;
  profile: CoupleProfile;
  initialData?: Partial<Expense>;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  profile,
  initialData,
}) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [currency, setCurrency] = useState(initialData?.currency || profile.currency);
  const [date, setDate] = useState(
    initialData?.date || new Date().toISOString().slice(0, 10)
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    initialData?.category || 'Spesa'
  );
  const [payer, setPayer] = useState<Payer>(initialData?.payer || 'user');
  const [splitType, setSplitType] = useState<SplitType>(
    initialData?.splitType || '50_50'
  );
  const [customRatio, setCustomRatio] = useState(
    initialData?.customSplitRatio ? Math.round(initialData.customSplitRatio * 100) : 50
  );
  const [notes, setNotes] = useState(initialData?.notes || '');

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialData?.title || '');
    setAmount(initialData?.amount != null ? String(initialData.amount) : '');
    setCurrency(initialData?.currency || profile.currency);
    setDate(initialData?.date || new Date().toISOString().slice(0, 10));
    setCategory(initialData?.category || 'Spesa');
    setPayer(initialData?.payer || 'user');
    setSplitType(initialData?.splitType || '50_50');
    setCustomRatio(
      initialData?.customSplitRatio != null
        ? Math.round(initialData.customSplitRatio * 100)
        : 50
    );
    setNotes(initialData?.notes || '');
  }, [isOpen, initialData, profile.currency]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    onSave({
      title: title.trim() || 'Spesa Senza Nome',
      amount: parsedAmount,
      currency,
      date,
      category,
      payer,
      splitType,
      customSplitRatio: splitType === 'custom' ? customRatio / 100 : undefined,
      source: initialData?.source || 'manual',
      sourceReference: initialData?.sourceReference,
      notes: notes.trim(),
      items: initialData?.items,
      tax: initialData?.tax,
    });
    onClose();
  };

  const splitOptions: Array<{
    id: string;
    label: string;
    active: boolean;
    onSelect: () => void;
  }> = [
    {
      id: '50_50',
      label: 'Diviso 50 / 50',
      active: splitType === '50_50',
      onSelect: () => setSplitType('50_50'),
    },
    {
      id: 'personal',
      label: '100% Personale',
      active: splitType === '100_user' || splitType === '100_partner',
      onSelect: () => setSplitType(payer === 'user' ? '100_user' : '100_partner'),
    },
    {
      id: 'custom',
      label: 'Personalizzata %',
      active: splitType === 'custom',
      onSelect: () => setSplitType('custom'),
    },
  ];

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="ds-btn-secondary min-h-10 px-4 text-xs"
      >
        Annulla
      </button>
      <button
        type="submit"
        form="add-expense-form"
        className="ds-btn-primary min-h-10 px-5 text-xs"
      >
        Salva Spesa
      </button>
    </div>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={initialData?.title ? 'Modifica Spesa' : 'Registra Nuova Spesa'}
      subtitle="Registrata nel fondo comune di coppia"
      icon={Receipt}
      closeLabel="Chiudi modifica spesa"
      footer={footer}
    >
      <form id="add-expense-form" onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
        {/* Importo e Titolo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Importo ({currency})
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-stone-400 font-mono">
                {currency === 'EUR' ? '€' : currency}
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="ds-input w-full pl-7 pr-3 py-2 text-base font-mono font-bold"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Esercente / Descrizione
            </label>
            <input
              type="text"
              required
              placeholder="es. Esselunga, Trattoria, Bolletta Luce"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="ds-input w-full px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Data & Categoria */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Data
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ds-input w-full px-3 py-2 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Categoria
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="ds-input w-full px-3 py-2 text-xs"
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Chi ha pagato */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1.5">
            Chi ha pagato?
          </label>
          <PayerSelector value={payer} onChange={setPayer} profile={profile} />
        </div>

        {/* Regola di Ripartizione */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1.5">
            Ripartizione della Spesa
          </label>
          <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-2">
            {splitOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={opt.onSelect}
                className={`min-h-11 py-2 px-2 text-xs rounded-xl border text-center transition-all cursor-pointer ${
                  opt.active
                    ? 'border-orange-500 bg-orange-50/50 text-orange-950 font-semibold'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 font-medium'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {splitType === 'custom' && (
            <div className="ds-subcard mt-3 p-3">
              <div className="flex justify-between text-xs font-semibold text-stone-700 mb-1">
                <span>
                  {profile.userName}: {customRatio}%
                </span>
                <span>
                  {profile.partnerName}: {100 - customRatio}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={customRatio}
                onChange={(e) => setCustomRatio(parseInt(e.target.value, 10))}
                className="w-full accent-orange-600"
              />
            </div>
          )}
        </div>

        {/* Note */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Note Aggiuntive (Opzionale)
          </label>
          <textarea
            rows={3}
            placeholder="es. pagato con buoni pasto, mancia inclusa"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="ds-input w-full resize-y px-3 py-2 text-sm"
          />
        </div>
      </form>
    </ModalShell>
  );
};
