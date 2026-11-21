import React, { useEffect, useMemo, useState } from 'react';
import { Receipt, Target, Trash2 } from 'lucide-react';
import {
  formatCurrency,
  getSelectableCategoryGroups,
} from '../constants/categories';
import {
  CoupleProfile,
  Expense,
  ExpenseCategory,
  Payer,
  SavingGoal,
  SplitType,
  TripProject,
} from '../types';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { ModalShell } from './ui/ModalShell';
import { PayerSelector } from './ui/PayerSelector';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: Omit<Expense, 'id'>) => void;
  onDelete?: (id: string) => void;
  onCreditGoal?: (goalId: string, delta: number) => void;
  profile: CoupleProfile;
  goals?: SavingGoal[];
  trips?: TripProject[];
  initialData?: Partial<Expense>;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  onCreditGoal,
  profile,
  goals = [],
  trips = [],
  initialData,
}) => {
  const categoryGroups = useMemo(
    () => getSelectableCategoryGroups(profile, goals),
    [profile, goals]
  );

  const fallbackCategory = categoryGroups.base[0] || 'Altro';
  const activeTrip = useMemo(() => trips.find((t) => t.isActive) ?? null, [trips]);

  const [title, setTitle] = useState(initialData?.title || '');
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [currency, setCurrency] = useState(initialData?.currency || profile.currency);
  const [date, setDate] = useState(
    initialData?.date || new Date().toISOString().slice(0, 10)
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    initialData?.category || fallbackCategory
  );
  const [payer, setPayer] = useState<Payer>(initialData?.payer || 'user');
  const [splitType, setSplitType] = useState<SplitType>(
    initialData?.splitType || '50_50'
  );
  const [customRatio, setCustomRatio] = useState(
    initialData?.customSplitRatio ? Math.round(initialData.customSplitRatio * 100) : 50
  );
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [tripId, setTripId] = useState(initialData?.tripId ?? activeTrip?.id ?? '');
  const [creditGoalOnSave, setCreditGoalOnSave] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isEditing = Boolean(initialData?.id);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialData?.title || '');
    setAmount(initialData?.amount != null ? String(initialData.amount) : '');
    setCurrency(initialData?.currency || profile.currency);
    setDate(initialData?.date || new Date().toISOString().slice(0, 10));
    setCategory(
      initialData?.category ||
        (!initialData?.id && activeTrip?.defaultCategory ? activeTrip.defaultCategory : fallbackCategory)
    );
    setPayer(initialData?.payer || 'user');
    setSplitType(initialData?.splitType || '50_50');
    setCustomRatio(
      initialData?.customSplitRatio != null
        ? Math.round(initialData.customSplitRatio * 100)
        : 50
    );
    setNotes(initialData?.notes || '');
    setTripId(initialData?.id ? (initialData.tripId ?? '') : (activeTrip?.id ?? ''));
    setCreditGoalOnSave(true);
    setConfirmDeleteOpen(false);
  }, [isOpen, initialData, profile.currency, fallbackCategory, activeTrip]);

  const allListedCategories = useMemo(
    () =>
      new Set([
        ...categoryGroups.base,
        ...categoryGroups.custom,
        ...categoryGroups.goals,
      ]),
    [categoryGroups]
  );

  const matchedGoal = useMemo(
    () =>
      goals.find(
        (g) => g.title.trim().toLowerCase() === category.trim().toLowerCase()
      ) ?? null,
    [goals, category]
  );

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
      ...(initialData?.receiptUrl ? { receiptUrl: initialData.receiptUrl } : {}),
      ...(tripId ? { tripId } : {}),
      ...(initialData?.recurringRuleId ? { recurringRuleId: initialData.recurringRuleId } : {}),
      reconciliationStatus: parsedAmount > 0 ? 'confirmed' : initialData?.reconciliationStatus,
      ...(initialData?.linkedSources ? { linkedSources: initialData.linkedSources } : {}),
      ...(initialData?.linkedReferences ? { linkedReferences: initialData.linkedReferences } : {}),
    });

    if (!isEditing && matchedGoal && creditGoalOnSave && onCreditGoal) {
      onCreditGoal(matchedGoal.id, parsedAmount);
    }

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
    <div className="flex items-center justify-between gap-2">
      <div>
        {isEditing && onDelete && initialData?.id && (
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="min-h-10 px-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Elimina</span>
          </button>
        )}
      </div>

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
    </div>
  );

  return (
    <>
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
                className="ds-input w-full px-3 py-2 text-xs font-mono min-h-10"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="ds-input w-full px-3 py-2 text-xs min-h-10"
              >
                {category && !allListedCategories.has(category) && (
                  <option value={category}>{category}</option>
                )}
                <optgroup label="Categorie">
                  {categoryGroups.base.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </optgroup>
                {categoryGroups.custom.length > 0 && (
                  <optgroup label="Categorie Personalizzate">
                    {categoryGroups.custom.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </optgroup>
                )}
                {categoryGroups.goals.length > 0 && (
                  <optgroup label="Obiettivi di Coppia">
                    {categoryGroups.goals.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {trips.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Viaggio / Progetto Speciale (opzionale)
              </label>
              <select
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
                aria-label="Collega a viaggio o progetto"
                className="ds-input w-full px-3 py-2 text-sm"
              >
                <option value="">Nessun viaggio / progetto</option>
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.name} {trip.isActive ? '(Attivo)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Collegamento automatico all'obiettivo selezionato */}
          {!isEditing && matchedGoal && (
            <label className="ds-subcard p-3 flex items-start gap-2.5 text-xs cursor-pointer border border-orange-500/25">
              <input
                type="checkbox"
                checked={creditGoalOnSave}
                onChange={(e) => setCreditGoalOnSave(e.target.checked)}
                className="mt-0.5 accent-orange-600 rounded"
              />
              <div className="min-w-0 space-y-0.5">
                <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                  <span>
                    Aggiorna automaticamente i risparmi di «{matchedGoal.title}»
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 font-mono">
                  Attuale: {formatCurrency(matchedGoal.currentAmount, profile.currency)} /{' '}
                  {formatCurrency(matchedGoal.targetAmount, profile.currency)}
                </p>
              </div>
            </label>
          )}

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

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        variant="danger"
        title="Eliminare questa spesa?"
        description={
          initialData?.title
            ? `La spesa "${initialData.title}" sarà rimossa definitivamente dal registro di coppia e il saldo verrà ricalcolato.`
            : 'Questa spesa verrà rimossa definitivamente.'
        }
        confirmLabel="Elimina Spesa"
        cancelLabel="Annulla"
        onConfirm={() => {
          if (initialData?.id && onDelete) {
            onDelete(initialData.id);
          }
          setConfirmDeleteOpen(false);
          onClose();
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </>
  );
};
