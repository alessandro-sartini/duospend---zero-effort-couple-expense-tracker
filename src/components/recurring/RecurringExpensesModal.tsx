import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { formatCurrency, getActiveCategories } from '../../constants/categories';
import type {
  CoupleProfile,
  Payer,
  RecurringExpenseItem,
  SavingGoal,
  SplitType,
} from '../../types';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ModalShell } from '../ui/ModalShell';
import { PayerSelector } from '../ui/PayerSelector';

interface RecurringExpensesModalProps {
  isOpen: boolean;
  onClose: () => void;
  recurringExpenses: RecurringExpenseItem[];
  profile: CoupleProfile;
  goals?: SavingGoal[];
  onSaveRecurring: (item: RecurringExpenseItem) => void;
  onDeleteRecurring: (id: string) => void;
  onLogRecurringNow: (item: RecurringExpenseItem) => void;
}

export const RecurringExpensesModal: React.FC<RecurringExpensesModalProps> = ({
  isOpen,
  onClose,
  recurringExpenses,
  profile,
  goals = [],
  onSaveRecurring,
  onDeleteRecurring,
  onLogRecurringNow,
}) => {
  const categories = useMemo(() => getActiveCategories(profile, goals), [profile, goals]);
  const currentCycle = new Date().toISOString().slice(0, 7);

  const [title, setTitle] = useState('');
  const [aliasesInput, setAliasesInput] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [frequency, setFrequency] = useState<RecurringExpenseItem['frequency']>('monthly');
  const [category, setCategory] = useState('Bollette e Utenze');
  const [payer, setPayer] = useState<Payer>('user');
  const [splitType, setSplitType] = useState<SplitType>('50_50');
  const [autoMatch, setAutoMatch] = useState(true);
  const [rulePendingDelete, setRulePendingDelete] = useState<RecurringExpenseItem | null>(null);

  const monthlyCommitment = useMemo(() => {
    return recurringExpenses.reduce((sum, rule) => {
      if (!rule.active || rule.expectedAmount <= 0) return sum;
      if (rule.frequency === 'yearly') return sum + rule.expectedAmount / 12;
      if (rule.frequency === 'bimonthly') return sum + rule.expectedAmount / 2;
      return sum + rule.expectedAmount;
    }, 0);
  }, [recurringExpenses]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const parsedAmount = Number((expectedAmount || '0').replace(',', '.'));
    const safeAmount =
      Number.isFinite(parsedAmount) && parsedAmount >= 0
        ? Math.round(parsedAmount * 100) / 100
        : 0;
    const aliases = aliasesInput
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length >= 2);
    const parsedDay = Math.min(31, Math.max(1, Math.round(Number(dayOfMonth) || 1)));

    const rule: RecurringExpenseItem = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle.slice(0, 140),
      ...(aliases.length > 0 ? { merchantAliases: aliases } : {}),
      expectedAmount: safeAmount,
      amountTolerancePercent: safeAmount === 0 ? 100 : 5,
      currency: profile.currency,
      category: category || 'Altro',
      payer,
      splitType,
      frequency,
      dayOfMonth: parsedDay,
      autoMatchNotifications: autoMatch,
      active: true,
    };

    onSaveRecurring(rule);
    setTitle('');
    setAliasesInput('');
    setExpectedAmount('');
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Spese Ricorrenti & Abbonamenti"
        subtitle="Riconcilia in automatico notifiche bancarie e fatture Gmail evitando doppi inserimenti"
        icon={RefreshCw}
        maxWidth="2xl"
        closeOnBackdrop
      >
        <div className="space-y-6">
          <div className="ds-subcard p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Impegno Fisso Mensile Stimato
              </div>
              <div className="font-mono text-xl font-bold text-stone-900 dark:text-stone-100">
                {formatCurrency(monthlyCommitment, profile.currency)} / mese
              </div>
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-400">
              Ciclo attuale: <strong className="font-mono text-stone-800 dark:text-stone-200">{currentCycle}</strong>
            </div>
          </div>

          {recurringExpenses.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Abbonamenti & Bollette Monitorate ({recurringExpenses.length})
              </h4>
              {recurringExpenses.map((rule) => {
                const isMatchedCurrentCycle = rule.lastMatchedCycle === currentCycle;
                return (
                  <div
                    key={rule.id}
                    className="ds-subcard p-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-stone-900 dark:text-stone-100">{rule.title}</span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isMatchedCurrentCycle
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-stone-500/10 text-stone-600 dark:text-stone-300'
                          }`}
                        >
                          {isMatchedCurrentCycle ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" />
                              Già riscontrata ({currentCycle})
                            </>
                          ) : (
                            <>
                              <Calendar className="h-3 w-3" />
                              Giorno {rule.dayOfMonth} · In attesa
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400">
                        <span className="font-mono font-semibold text-stone-700 dark:text-stone-300">
                          {rule.expectedAmount > 0
                            ? formatCurrency(rule.expectedAmount, rule.currency)
                            : 'Importo variabile'}
                        </span>
                        <span>·</span>
                        <span>{rule.category}</span>
                        <span>·</span>
                        <span>{rule.payer === 'user' ? profile.userName : profile.partnerName}</span>
                        {rule.merchantAliases && rule.merchantAliases.length > 0 && (
                          <>
                            <span>·</span>
                            <span>Alias: {rule.merchantAliases.join(', ')}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onLogRecurringNow(rule)}
                        disabled={rule.expectedAmount <= 0}
                        title={
                          rule.expectedAmount > 0
                            ? 'Registra rata ora (con controllo anti-doppione)'
                            : 'Le utenze a importo variabile si riconciliano quando arriva notifica o email'
                        }
                        className="ds-btn-secondary min-h-9 px-3 py-1.5 text-xs disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>Registra rata</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRulePendingDelete(rule)}
                        aria-label={`Elimina regola ${rule.title}`}
                        className="ds-icon-btn h-9 w-9 text-stone-500 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Aggiungi Nuova Regola */}
          <form onSubmit={handleSubmit} className="ds-subcard p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900 dark:text-stone-100">
              Aggiungi Abbonamento o Spesa Fissa
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Nome Servizio / Utenza
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="es. Affitto Casa, Netflix, Enel Luce..."
                  className="ds-input w-full px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Alias Banca / Email (separati da virgola)
                </label>
                <input
                  type="text"
                  value={aliasesInput}
                  onChange={(e) => setAliasesInput(e.target.value)}
                  placeholder="es. netflix.com, enel energia, sdd"
                  className="ds-input w-full px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Importo Atteso ({profile.currency}) · 0 se variabile
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expectedAmount}
                  onChange={(e) => setExpectedAmount(e.target.value)}
                  placeholder="es. 17.99 o 0"
                  className="ds-input w-full px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Frequenza
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) =>
                      setFrequency(e.target.value as RecurringExpenseItem['frequency'])
                    }
                    className="ds-input w-full px-2.5 py-2 text-xs"
                  >
                    <option value="monthly">Mensile</option>
                    <option value="bimonthly">Bimestrale</option>
                    <option value="yearly">Annuale</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Giorno addebito
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                    className="ds-input w-full px-2.5 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Categoria
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="ds-input w-full px-3 py-2 text-xs"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Divisione
                </label>
                <select
                  value={splitType}
                  onChange={(e) => setSplitType(e.target.value as SplitType)}
                  className="ds-input w-full px-3 py-2 text-xs"
                >
                  <option value="50_50">Condivisa 50 / 50</option>
                  <option value="100_user">100% {profile.userName}</option>
                  <option value="100_partner">100% {profile.partnerName}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Chi sostiene l’addebito?
              </label>
              <PayerSelector value={payer} onChange={setPayer} profile={profile} />
            </div>

            <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={autoMatch}
                onChange={(e) => setAutoMatch(e.target.checked)}
                className="accent-orange-600 rounded"
              />
              <span>
                Aggancia automaticamente notifiche bancarie e ricevute Gmail (evita addebiti doppi nel mese)
              </span>
            </label>

            <div className="flex justify-end pt-1">
              <button type="submit" className="ds-btn-primary px-4 py-2 text-xs">
                <Plus className="h-3.5 w-3.5" />
                <span>Salva Spesa Ricorrente</span>
              </button>
            </div>
          </form>
        </div>
      </ModalShell>

      <ConfirmDialog
        isOpen={Boolean(rulePendingDelete)}
        variant="danger"
        title="Eliminare spesa ricorrente?"
        description={
          rulePendingDelete
            ? `“${rulePendingDelete.title}” non verrà più monitorata tra le spese fisse.`
            : ''
        }
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        onConfirm={() => {
          if (rulePendingDelete) {
            onDeleteRecurring(rulePendingDelete.id);
          }
          setRulePendingDelete(null);
        }}
        onCancel={() => setRulePendingDelete(null)}
      />
    </>
  );
};
