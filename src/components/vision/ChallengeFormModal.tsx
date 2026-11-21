import React, { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Check, Info, ShieldCheck, Sparkles, Target } from 'lucide-react';
import {
  formatCurrency,
  getSelectableCategoryGroups,
} from '../../constants/categories';
import {
  estimateSavingsChallenge,
  SavingsChallengeApiError,
} from '../../services/savings-challenges';
import type {
  CoupleProfile,
  SavingGoal,
  SavingsChallenge,
  SavingsChallengeEstimate,
  SavingsChallengeSplitScope,
} from '../../types';
import { ModalShell } from '../ui/ModalShell';

interface ChallengeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  goals: SavingGoal[];
  profile: CoupleProfile;
  editingChallenge?: SavingsChallenge | null;
  initialGoalId?: string;
  onSubmit: (payload: {
    id?: string;
    title: string;
    goalId: string;
    categories: string[];
    monthlyLimit: number;
    startMonth: string;
    durationMonths: number;
    splitScope: SavingsChallengeSplitScope;
    timezone: string;
    expectedVersion?: number;
    confirmRetroactive?: boolean;
  }) => Promise<void>;
}

const TIMEZONE_OPTIONS = [
  'Europe/Rome',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'UTC',
];

function getDefaultMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function getBrowserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length <= 64 ? tz : 'Europe/Rome';
  } catch {
    return 'Europe/Rome';
  }
}

export const ChallengeFormModal: React.FC<ChallengeFormModalProps> = ({
  isOpen,
  onClose,
  goals,
  profile,
  editingChallenge,
  initialGoalId,
  onSubmit,
}) => {
  const formErrorId = useId();
  const isEditing = Boolean(editingChallenge);

  const categoryGroups = useMemo(
    () => getSelectableCategoryGroups(profile, goals),
    [profile, goals]
  );
  const allSelectableCategories = useMemo(
    () => [...categoryGroups.base, ...categoryGroups.custom, ...categoryGroups.goals],
    [categoryGroups]
  );

  const [title, setTitle] = useState('');
  const [goalId, setGoalId] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Ristoranti e Bar']);
  const [monthlyLimit, setMonthlyLimit] = useState('300');
  const [startMonth, setStartMonth] = useState(getDefaultMonth);
  const [durationMonths, setDurationMonths] = useState(1);
  const [splitScope, setSplitScope] = useState<SavingsChallengeSplitScope>('all');
  const [timezone, setTimezone] = useState<string>(getBrowserTimeZone);

  const [estimate, setEstimate] = useState<SavingsChallengeEstimate | null>(null);
  const [isLoadingEstimate, setIsLoadingEstimate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [retroactivePrompt, setRetroactivePrompt] = useState<{
    message: string;
    impact?: {
      previousValidSpend?: number;
      nextValidSpend?: number;
      previousVirtualSavingsPotential?: number;
      nextVirtualSavingsPotential?: number;
      goalChanged?: boolean;
    };
  } | null>(null);
  const [retroactiveConfirmed, setRetroactiveConfirmed] = useState(false);

  const timezoneChoices = useMemo(() => {
    const set = new Set<string>(TIMEZONE_OPTIONS);
    if (timezone) set.add(timezone);
    return Array.from(set);
  }, [timezone]);

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setRetroactivePrompt(null);
    setRetroactiveConfirmed(false);

    if (editingChallenge) {
      setTitle(editingChallenge.title);
      setGoalId(editingChallenge.goalId || goals[0]?.id || '');
      setSelectedCategories(
        editingChallenge.categories.length > 0
          ? editingChallenge.categories
          : [allSelectableCategories[0] || 'Altro']
      );
      setMonthlyLimit(String(editingChallenge.monthlyLimit));
      setStartMonth(editingChallenge.startMonth);
      setDurationMonths(editingChallenge.durationMonths);
      setSplitScope(editingChallenge.splitScope);
      setTimezone(editingChallenge.timezone || getBrowserTimeZone());
    } else {
      const defaultGoal =
        (initialGoalId && goals.find((g) => g.id === initialGoalId)?.id) ||
        goals[0]?.id ||
        '';
      setTitle('');
      setGoalId(defaultGoal);
      setSelectedCategories([
        allSelectableCategories.includes('Ristoranti e Bar')
          ? 'Ristoranti e Bar'
          : allSelectableCategories[0] || 'Spesa',
      ]);
      setMonthlyLimit('300');
      setStartMonth(getDefaultMonth());
      setDurationMonths(1);
      setSplitScope('all');
      setTimezone(getBrowserTimeZone());
    }
  }, [isOpen, editingChallenge, initialGoalId, goals, allSelectableCategories]);

  useEffect(() => {
    if (!isOpen || selectedCategories.length === 0) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoadingEstimate(true);
      const numericLimit = Number(monthlyLimit.replace(',', '.'));
      void estimateSavingsChallenge({
        categories: selectedCategories,
        startMonth,
        durationMonths,
        monthlyLimit: Number.isFinite(numericLimit) && numericLimit > 0 ? numericLimit : undefined,
        goalId: goalId || undefined,
        splitScope,
        timezone,
        currency: profile.currency,
      })
        .then((res) => {
          if (!cancelled) setEstimate(res.estimate);
        })
        .catch(() => {
          if (!cancelled) setEstimate(null);
        })
        .finally(() => {
          if (!cancelled) setIsLoadingEstimate(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    isOpen,
    selectedCategories,
    startMonth,
    durationMonths,
    monthlyLimit,
    goalId,
    splitScope,
    timezone,
    profile.currency,
  ]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((current) => {
      if (current.includes(cat)) {
        return current.length > 1 ? current.filter((item) => item !== cat) : current;
      }
      if (current.length >= 20) return current;
      return [...current, cat];
    });
  };

  const selectedGoal = goals.find((g) => g.id === goalId);
  const customCategoriesSelected = selectedCategories.filter((cat) =>
    categoryGroups.custom.includes(cat)
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setFormError(null);

    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) {
      setFormError('Inserisci un nome per la sfida (almeno 2 caratteri).');
      return;
    }
    if (!goalId || !goals.some((g) => g.id === goalId)) {
      setFormError('Seleziona un obiettivo Vision Board esistente.');
      return;
    }
    if (selectedCategories.length === 0) {
      setFormError('Seleziona almeno una categoria.');
      return;
    }
    const parsedLimit = Number(monthlyLimit.replace(',', '.'));
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0 || parsedLimit > 1_000_000) {
      setFormError('Inserisci un limite mensile maggiore di 0 e fino a 1.000.000.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(startMonth)) {
      setFormError('Seleziona un mese iniziale valido (YYYY-MM).');
      return;
    }
    if (retroactivePrompt && !retroactiveConfirmed) {
      setFormError('Spunta la conferma per applicare la modifica retroattiva.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        ...(editingChallenge ? { id: editingChallenge.id } : {}),
        title: cleanTitle,
        goalId,
        categories: selectedCategories,
        monthlyLimit: Math.round(parsedLimit * 100) / 100,
        startMonth,
        durationMonths,
        splitScope,
        timezone,
        ...(editingChallenge ? { expectedVersion: editingChallenge.version } : {}),
        ...(retroactiveConfirmed ? { confirmRetroactive: true } : {}),
      });
      onClose();
    } catch (error) {
      if (
        error instanceof SavingsChallengeApiError &&
        error.code === 'RETROACTIVE_CONFIRMATION_REQUIRED'
      ) {
        setRetroactivePrompt({
          message: error.message,
          impact: error.details?.impact as {
            previousValidSpend?: number;
            nextValidSpend?: number;
            previousVirtualSavingsPotential?: number;
            nextVirtualSavingsPotential?: number;
            goalChanged?: boolean;
          },
        });
        setRetroactiveConfirmed(false);
      } else {
        setFormError(
          error instanceof Error ? error.message : 'Impossibile salvare la sfida.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Modifica sfida di risparmio' : 'Nuova sfida di risparmio'}
      subtitle="Risparmio virtuale collegato alla Vision Board · Nessun movimento bancario"
      icon={Sparkles}
      maxWidth="lg"
      mobileBottomSheet
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="ds-btn-secondary min-h-10 px-4 text-xs"
          >
            Annulla
          </button>
          <button
            type="submit"
            form="challenge-form"
            disabled={isSubmitting || goals.length === 0}
            className="ds-btn-primary min-h-10 px-5 text-xs"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>
              {isSubmitting
                ? 'Salvataggio...'
                : isEditing
                  ? 'Salva modifiche'
                  : 'Attiva sfida'}
            </span>
          </button>
        </div>
      }
    >
      <form id="challenge-form" onSubmit={(e) => void handleSubmit(e)} className="p-4 sm:p-6 space-y-4 text-xs">
        {goals.length === 0 ? (
          <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900">
            Crea prima almeno un obiettivo nella Vision Board per poter collegare una sfida di risparmio.
          </div>
        ) : (
          <>
            {/* Obiettivo Vision Board */}
            <div className="space-y-2">
              <label htmlFor="challenge-goal" className="block font-semibold text-stone-700">
                Obiettivo Vision Board collegato
              </label>
              <select
                id="challenge-goal"
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="ds-input w-full px-3 py-2 text-xs min-h-10"
              >
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title} ({formatCurrency(g.currentAmount, profile.currency)} /{' '}
                    {formatCurrency(g.targetAmount, profile.currency)})
                  </option>
                ))}
              </select>

              {selectedGoal && (
                <div className="ds-subcard p-2.5 flex items-center gap-2.5">
                  {selectedGoal.imageUrl ? (
                    <img
                      src={selectedGoal.imageUrl}
                      alt={selectedGoal.title}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-orange-500/12 text-orange-600 flex items-center justify-center shrink-0">
                      <Target className="w-4 h-4" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-900 truncate">{selectedGoal.title}</div>
                    <div className="text-[11px] font-mono text-stone-500">
                      Attuale: {formatCurrency(selectedGoal.currentAmount, profile.currency)} · Traguardo:{' '}
                      {formatCurrency(selectedGoal.targetAmount, profile.currency)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Nome sfida */}
            <div>
              <label htmlFor="challenge-title" className="block font-semibold text-stone-700 mb-1">
                Nome della sfida
              </label>
              <input
                id="challenge-title"
                type="text"
                maxLength={100}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es. Sfida Ristoranti per Viaggio di Nozze"
                className="ds-input w-full px-3 py-2 text-xs min-h-10"
              />
            </div>

            {/* Multi-selezione categorie */}
            <div className="space-y-1.5">
              <span className="block font-semibold text-stone-700">
                Categorie monitorate ({selectedCategories.length} selezionate)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {allSelectableCategories.map((cat) => {
                  const active = selectedCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      aria-pressed={active}
                      className={`min-h-8 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                        active
                          ? 'bg-orange-600 text-white border-orange-600'
                          : 'ds-btn-secondary'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {customCategoriesSelected.length > 0 && (
                <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-900 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Categorie personalizzate selezionate ({customCategoriesSelected.join(', ')}): se verranno rimosse in futuro dalle impostazioni, la sfida segnalerà il ricalcolo necessario.
                  </span>
                </div>
              )}
            </div>

            {/* Limite, Mese, Durata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="challenge-limit" className="block font-semibold text-stone-700 mb-1">
                  Limite mensile ({profile.currency})
                </label>
                <input
                  id="challenge-limit"
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  required
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  className="ds-input w-full px-3 py-2 text-xs font-mono min-h-10"
                />
              </div>

              <div>
                <label htmlFor="challenge-month" className="block font-semibold text-stone-700 mb-1">
                  Mese iniziale
                </label>
                <input
                  id="challenge-month"
                  type="month"
                  required
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  className="ds-input w-full px-3 py-2 text-xs font-mono min-h-10"
                />
              </div>

              <div>
                <label htmlFor="challenge-duration" className="block font-semibold text-stone-700 mb-1">
                  Durata
                </label>
                <select
                  id="challenge-duration"
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(Number(e.target.value))}
                  className="ds-input w-full px-3 py-2 text-xs min-h-10"
                >
                  {[1, 2, 3, 6, 12].map((m) => (
                    <option key={m} value={m}>
                      {m === 1 ? '1 mese' : `${m} mesi`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ambito spese & Timezone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="challenge-split-scope" className="block font-semibold text-stone-700 mb-1">
                  Spese incluse nel calcolo
                </label>
                <select
                  id="challenge-split-scope"
                  value={splitScope}
                  onChange={(e) => setSplitScope(e.target.value as SavingsChallengeSplitScope)}
                  className="ds-input w-full px-3 py-2 text-xs min-h-10"
                >
                  <option value="all">Tutte le spese nella categoria (condivise + personali)</option>
                  <option value="shared_only">Solo spese condivise (50/50 o %)</option>
                </select>
              </div>

              <div>
                <label htmlFor="challenge-timezone" className="block font-semibold text-stone-700 mb-1">
                  Fuso orario periodo
                </label>
                <select
                  id="challenge-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="ds-input w-full px-3 py-2 text-xs font-mono min-h-10"
                >
                  {timezoneChoices.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stima iniziale live dal server */}
            <div className="ds-subcard p-3.5 space-y-2 border border-orange-500/25">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-stone-900">Stima iniziale dal registro reale</span>
                {estimate && (
                  <button
                    type="button"
                    onClick={() => setMonthlyLimit(String(estimate.suggestedMonthlyLimit))}
                    className="ds-btn-secondary min-h-8 px-2.5 text-[11px] font-mono"
                  >
                    Usa limite proposto: {formatCurrency(estimate.suggestedMonthlyLimit, estimate.currency)}
                  </button>
                )}
              </div>

              {isLoadingEstimate ? (
                <p className="text-[11px] text-stone-500">Calcolo stima sul periodo precedente...</p>
              ) : estimate ? (
                <div className="space-y-1.5 text-[11px] text-stone-600">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono">
                    <div>
                      Media 3 mesi prec.:{' '}
                      <strong className="text-stone-900">
                        {formatCurrency(estimate.previousPeriodAverageSpend, estimate.currency)}
                      </strong>
                    </div>
                    <div>
                      Speso periodo attuale:{' '}
                      <strong className="text-stone-900">
                        {formatCurrency(estimate.currentPeriodSpend, estimate.currency)}
                      </strong>
                    </div>
                    <div>
                      Risparmio stimato:{' '}
                      <strong className="text-emerald-600">
                        {formatCurrency(estimate.estimatedVirtualSavings, estimate.currency)}
                      </strong>
                    </div>
                  </div>
                  <p>{estimate.calculationSummary}</p>
                  {estimate.excludedForeignCurrencyCount > 0 && (
                    <p className="text-amber-700">
                      Nota: {estimate.excludedForeignCurrencyCount} spese in valuta estera non saranno convertite né conteggiate.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-stone-500">
                  La stima verrà calcolata automaticamente sul server in base alle categorie scelte.
                </p>
              )}

              <p className="text-[11px] text-stone-500 flex items-start gap-1.5 pt-1 border-t border-stone-200/70">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Avviso: il risparmio generato è virtuale fino alla vostra conferma esplicita. Nessun conto bancario viene modificato.
                </span>
              </p>
            </div>

            {/* Conferma modifica retroattiva */}
            {retroactivePrompt && (
              <div
                role="alert"
                className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-950 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="font-bold">Conferma modifica retroattiva</p>
                    <p>{retroactivePrompt.message}</p>
                    {retroactivePrompt.impact && (
                      <p className="font-mono text-[11px]">
                        Risparmio potenziale:{' '}
                        {formatCurrency(
                          retroactivePrompt.impact.previousVirtualSavingsPotential ?? 0,
                          profile.currency
                        )}{' '}
                        →{' '}
                        {formatCurrency(
                          retroactivePrompt.impact.nextVirtualSavingsPotential ?? 0,
                          profile.currency
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={retroactiveConfirmed}
                    onChange={(e) => setRetroactiveConfirmed(e.target.checked)}
                    className="h-4 w-4 accent-orange-600"
                  />
                  <span>Confermo la modifica retroattiva e il ricalcolo della sfida</span>
                </label>
              </div>
            )}

            {formError && (
              <p id={formErrorId} role="alert" className="text-xs font-semibold text-rose-600">
                {formError}
              </p>
            )}
          </>
        )}
      </form>
    </ModalShell>
  );
};
