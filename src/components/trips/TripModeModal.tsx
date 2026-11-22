import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, ChevronDown, ChevronUp, Compass, Plane, Plus, Trash2 } from 'lucide-react';
import { formatCurrency, getActiveCategories } from '../../constants/categories';
import { computeTripSummary } from '../../services/reconciliation';
import type { CoupleProfile, Expense, SavingGoal, TripProject } from '../../types';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ModalShell } from '../ui/ModalShell';

interface TripModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  trips: TripProject[];
  expenses: Expense[];
  profile: CoupleProfile;
  goals?: SavingGoal[];
  onSaveTrip: (trip: TripProject) => void;
  onToggleTripActive: (tripId: string) => void;
  onDeleteTrip: (tripId: string) => void;
}

export const TripModeModal: React.FC<TripModeModalProps> = ({
  isOpen,
  onClose,
  trips,
  expenses,
  profile,
  goals = [],
  onSaveTrip,
  onToggleTripActive,
  onDeleteTrip,
}) => {
  const categories = useMemo(() => getActiveCategories(profile, goals), [profile, goals]);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('Viaggi');
  const [activateImmediately, setActivateImmediately] = useState(true);
  const [showNewTripForm, setShowNewTripForm] = useState(false);
  const [tripPendingDelete, setTripPendingDelete] = useState<TripProject | null>(null);

  const tripSummaries = useMemo(
    () => trips.map((trip) => computeTripSummary(trip, expenses)),
    [trips, expenses]
  );

  const handleCreateTrip = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !startDate) return;
    const parsedBudget = Number(budget.replace(',', '.'));
    const newTrip: TripProject = {
      id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName.slice(0, 120),
      startDate,
      ...(endDate && endDate >= startDate ? { endDate } : {}),
      ...(Number.isFinite(parsedBudget) && parsedBudget > 0
        ? { budget: Math.round(parsedBudget * 100) / 100 }
        : {}),
      defaultCategory: defaultCategory || 'Viaggi',
      isActive: activateImmediately,
    };
    onSaveTrip(newTrip);
    setName('');
    setEndDate('');
    setBudget('');
    setShowNewTripForm(false);
    // Torna subito alla Home con la modalità attiva pronta e visibile
    onClose();
  };

  const isFormVisible = tripSummaries.length === 0 || showNewTripForm;

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Modalità Vacanza & Progetti Speciali"
        subtitle="Etichetta automaticamente le spese del periodo con mini-saldo 50/50 isolato"
        icon={Plane}
        maxWidth="2xl"
        mobileBottomSheet
        closeOnBackdrop
      >
        <div className="p-4 sm:p-6 space-y-5">
          {/* Elenco Viaggi / Progetti con mini-saldo isolato */}
          {tripSummaries.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Viaggi e Progetti Registrati ({tripSummaries.length})
                </h4>
                {!showNewTripForm && (
                  <button
                    type="button"
                    onClick={() => setShowNewTripForm(true)}
                    className="ds-btn-secondary min-h-10 sm:min-h-9 px-3 py-1 text-xs inline-flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Nuovo Viaggio</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {tripSummaries.map(({ trip, totalSpend, expenseCount, netBalance, budgetRemaining, categoryTotals }) => {
                  const balanceText =
                    Math.abs(netBalance) < 0.01
                      ? 'In pari nel viaggio'
                      : netBalance > 0
                        ? `${profile.partnerName} deve a ${profile.userName} ${formatCurrency(netBalance, profile.currency)}`
                        : `${profile.userName} deve a ${profile.partnerName} ${formatCurrency(Math.abs(netBalance), profile.currency)}`;

                  return (
                    <div
                      key={trip.id}
                      className={`ds-subcard p-4 space-y-3 border transition-colors ${
                        trip.isActive
                          ? 'border-orange-500/60 bg-orange-50/50 dark:bg-orange-950/25 ring-1 ring-orange-500/25'
                          : 'border-stone-200/80 dark:border-stone-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-stone-900 dark:text-stone-100">{trip.name}</span>
                            {trip.isActive && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 text-orange-700 dark:text-orange-300 px-2 py-0.5 text-[10px] font-bold">
                                <CheckCircle2 className="h-3 w-3" />
                                Modalità Attiva
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 font-mono">
                            <Calendar className="inline h-3 w-3 mr-1" />
                            {trip.startDate}
                            {trip.endDate ? ` → ${trip.endDate}` : ' → In corso'} · {expenseCount} spese
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onToggleTripActive(trip.id)}
                            className={`${
                              trip.isActive ? 'ds-btn-secondary' : 'ds-btn-primary'
                            } min-h-10 sm:min-h-9 px-3 py-1.5 text-xs`}
                          >
                            {trip.isActive ? 'Metti in pausa' : 'Attiva ora'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTripPendingDelete(trip)}
                            aria-label={`Elimina viaggio ${trip.name}`}
                            className="ds-icon-btn h-10 w-10 sm:h-9 sm:w-9 text-stone-400 hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <div className="ds-subcard p-2.5 space-y-1">
                          <div className="text-[10px] uppercase font-bold tracking-wider text-stone-500 dark:text-stone-400">
                            Totale Speso
                          </div>
                          <div className="font-mono text-sm font-bold text-stone-900 dark:text-stone-100">
                            {formatCurrency(totalSpend, profile.currency)}
                          </div>
                        </div>
                        <div className="ds-subcard p-2.5 space-y-1">
                          <div className="text-[10px] uppercase font-bold tracking-wider text-stone-500 dark:text-stone-400">
                            Saldo Isolato 50/50
                          </div>
                          <div className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                            {balanceText}
                          </div>
                        </div>
                        <div className="ds-subcard p-2.5 space-y-1">
                          <div className="text-[10px] uppercase font-bold tracking-wider text-stone-500 dark:text-stone-400">
                            Budget Viaggio
                          </div>
                          <div className="font-mono text-xs font-bold text-stone-900 dark:text-stone-100">
                            {budgetRemaining !== null
                              ? `Residuo ${formatCurrency(budgetRemaining, profile.currency)}`
                              : 'Nessun tetto'}
                          </div>
                        </div>
                      </div>

                      {categoryTotals.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 text-[11px] text-stone-600 dark:text-stone-300 pt-1">
                          {categoryTotals.slice(0, 4).map((cat) => (
                            <span
                              key={cat.category}
                              className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-100/60 dark:bg-stone-800/60 px-2 py-0.5"
                            >
                              {cat.category}: <strong>{formatCurrency(cat.amount, profile.currency)}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Form Nuovo Viaggio / Progetto */}
          {isFormVisible && (
            <form onSubmit={handleCreateTrip} className="ds-subcard p-4 space-y-4 border border-orange-500/30">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <Compass className="h-4 w-4 text-orange-600" />
                  Nuovo Viaggio o Progetto Speciale
                </h4>
                {tripSummaries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowNewTripForm(false)}
                    className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                  >
                    Chiudi
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Nome Viaggio / Evento
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="es. Weekend a Barcellona, Ristrutturazione Bagno..."
                    className="ds-input w-full min-h-10 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Data Inizio
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="ds-input w-full min-h-10 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Data Fine (opzionale)
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="ds-input w-full min-h-10 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Budget Stimato ({profile.currency})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="es. 800"
                    className="ds-input w-full min-h-10 px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Categoria Predefinita Spese
                  </label>
                  <select
                    value={defaultCategory}
                    onChange={(e) => setDefaultCategory(e.target.value)}
                    className="ds-input w-full min-h-10 px-3 py-2 text-xs"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={activateImmediately}
                  onChange={(e) => setActivateImmediately(e.target.checked)}
                  className="accent-orange-600 rounded"
                />
                <span>
                  Attiva subito: tutte le nuove spese in queste date verranno associate a questo viaggio
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                {tripSummaries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowNewTripForm(false)}
                    className="ds-btn-secondary min-h-10 px-3 py-2 text-xs"
                  >
                    Annulla
                  </button>
                )}
                <button type="submit" className="ds-btn-primary min-h-10 px-4 py-2 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Crea e Attiva Viaggio</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </ModalShell>

      <ConfirmDialog
        isOpen={Boolean(tripPendingDelete)}
        variant="danger"
        title="Eliminare questo viaggio?"
        description={
          tripPendingDelete
            ? `“${tripPendingDelete.name}” verrà rimosso. Le spese già registrate resteranno nel registro generale.`
            : ''
        }
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        onConfirm={() => {
          if (tripPendingDelete) {
            onDeleteTrip(tripPendingDelete.id);
          }
          setTripPendingDelete(null);
        }}
        onCancel={() => setTripPendingDelete(null)}
      />
    </>
  );
};
