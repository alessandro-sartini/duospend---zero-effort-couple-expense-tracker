import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Compass, Plane, Plus, Trash2 } from 'lucide-react';
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
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Modalità Vacanza & Progetti Speciali"
        subtitle="Etichetta automaticamente le spese del periodo con mini-saldo 50/50 isolato"
        icon={Plane}
        maxWidth="2xl"
        closeOnBackdrop
      >
        <div className="space-y-6">
          {/* Elenco Viaggi / Progetti con mini-saldo isolato */}
          {tripSummaries.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Viaggi e Progetti Registrati
              </h4>
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
                      className={`ds-subcard p-4 space-y-3 border ${
                        trip.isActive ? 'border-orange-500/50 bg-orange-50/30' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-stone-900">{trip.name}</span>
                            {trip.isActive && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                                <CheckCircle2 className="h-3 w-3" />
                                Modalità Attiva
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-stone-500 font-mono">
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
                            } min-h-9 px-3 py-1.5 text-xs`}
                          >
                            {trip.isActive ? 'Metti in pausa' : 'Attiva ora'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTripPendingDelete(trip)}
                            aria-label={`Elimina viaggio ${trip.name}`}
                            className="ds-icon-btn h-9 w-9 text-stone-500 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="rounded-xl border border-stone-200/70 bg-white/60 p-2.5">
                          <div className="text-[10px] uppercase text-stone-500">Totale Speso</div>
                          <div className="font-mono text-sm font-bold text-stone-900">
                            {formatCurrency(totalSpend, profile.currency)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-stone-200/70 bg-white/60 p-2.5">
                          <div className="text-[10px] uppercase text-stone-500">Saldo Isolato 50/50</div>
                          <div className="text-xs font-semibold text-stone-900">{balanceText}</div>
                        </div>
                        <div className="rounded-xl border border-stone-200/70 bg-white/60 p-2.5">
                          <div className="text-[10px] uppercase text-stone-500">Budget Viaggio</div>
                          <div className="font-mono text-xs font-bold text-stone-900">
                            {budgetRemaining !== null
                              ? `Residuo ${formatCurrency(budgetRemaining, profile.currency)}`
                              : 'Nessun tetto'}
                          </div>
                        </div>
                      </div>

                      {categoryTotals.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 text-[11px] text-stone-600">
                          {categoryTotals.slice(0, 4).map((cat) => (
                            <span
                              key={cat.category}
                              className="rounded-lg border border-stone-200/70 px-2 py-0.5"
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

          {/* Nuovo Viaggio / Progetto */}
          <form onSubmit={handleCreateTrip} className="ds-subcard p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-orange-600" />
              Nuovo Viaggio o Progetto Speciale
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Nome Viaggio / Evento
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="es. Weekend a Barcellona, Ristrutturazione Bagno..."
                  className="ds-input w-full px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Data Inizio
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="ds-input w-full px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Data Fine (opzionale)
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="ds-input w-full px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Budget Stimato ({profile.currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="es. 800"
                  className="ds-input w-full px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Categoria Predefinita Spese
                </label>
                <select
                  value={defaultCategory}
                  onChange={(e) => setDefaultCategory(e.target.value)}
                  className="ds-input w-full px-3 py-2 text-xs"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={activateImmediately}
                onChange={(e) => setActivateImmediately(e.target.checked)}
                className="accent-orange-600 rounded"
              />
              <span>
                Attiva subito: tutte le nuove spese (OCR, notifiche, Gmail) in queste date verranno associate al viaggio
              </span>
            </label>

            <div className="flex justify-end pt-1">
              <button type="submit" className="ds-btn-primary px-4 py-2 text-xs">
                <Plus className="h-3.5 w-3.5" />
                <span>Crea Viaggio / Progetto</span>
              </button>
            </div>
          </form>
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
