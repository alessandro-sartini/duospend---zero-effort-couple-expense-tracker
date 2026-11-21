import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import {
  completeSavingsChallenge,
  confirmChallengeContribution,
  createSavingsChallenge,
  deleteSavingsChallenge,
  fetchSavingsChallengeHistory,
  fetchSavingsChallenges,
  isOfflineNetworkError,
  loadCachedSavingsChallenges,
  pauseSavingsChallenge,
  recalculateSavingsChallenge,
  resumeSavingsChallenge,
  revertChallengeContribution,
  SavingsChallengeApiError,
  updateSavingsChallenge,
} from '../../services/savings-challenges';
import type {
  CoupleProfile,
  Expense,
  GoalVirtualSavingsSummary,
  SavingGoal,
  SavingsChallenge,
  SavingsChallengeContribution,
  SavingsChallengeHistoryEntry,
  SavingsChallengesCalculationPolicy,
} from '../../types';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ChallengeCompactCard } from './ChallengeCompactCard';
import { ChallengeDetailPanel } from './ChallengeDetailPanel';
import { ChallengeFormModal } from './ChallengeFormModal';
import { ContributionConfirmModal } from './ContributionConfirmModal';

type ChallengeFilterTab = 'active' | 'completed' | 'all';

interface SavingsChallengesSectionProps {
  goals: SavingGoal[];
  expenses: Expense[];
  profile: CoupleProfile;
  onGoalSummariesChange?: (summaries: GoalVirtualSavingsSummary[]) => void;
  onSyncGoalFromServer?: (goal: SavingGoal) => void;
  onSyncGoalsFromServer?: (goals: SavingGoal[]) => void;
  onRequestCreateGoal?: () => void;
  createForGoalRequest?: { goalId: string; nonce: number } | null;
  initialChallenges?: SavingsChallenge[];
  initialGoalSummaries?: GoalVirtualSavingsSummary[];
  initialLoading?: boolean;
  initialOffline?: boolean;
  initialError?: string | null;
}

export const SavingsChallengesSection: React.FC<SavingsChallengesSectionProps> = ({
  goals,
  expenses,
  profile,
  onGoalSummariesChange,
  onSyncGoalFromServer,
  onSyncGoalsFromServer,
  onRequestCreateGoal,
  createForGoalRequest,
  initialChallenges,
  initialGoalSummaries,
  initialLoading = false,
  initialOffline = false,
  initialError = null,
}) => {
  const [challenges, setChallenges] = useState<SavingsChallenge[]>(() => {
    if (initialChallenges) return initialChallenges;
    return loadCachedSavingsChallenges()?.challenges ?? [];
  });
  const [goalSummaries, setGoalSummaries] = useState<GoalVirtualSavingsSummary[]>(() => {
    if (initialGoalSummaries) return initialGoalSummaries;
    return loadCachedSavingsChallenges()?.goalSummaries ?? [];
  });
  const [policy, setPolicy] = useState<SavingsChallengesCalculationPolicy | undefined>(() => {
    return loadCachedSavingsChallenges()?.policy;
  });

  const [filterTab, setFilterTab] = useState<ChallengeFilterTab>('active');
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(
    () => initialChallenges?.[0]?.id ?? null
  );
  const [historyByChallenge, setHistoryByChallenge] = useState<
    Record<string, { history: SavingsChallengeHistoryEntry[]; contributions: SavingsChallengeContribution[] }>
  >({});

  const [isLoading, setIsLoading] = useState<boolean>(
    initialChallenges ? initialLoading : initialLoading || true
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isOffline, setIsOffline] = useState(initialOffline);
  const [errorText, setErrorText] = useState<string | null>(initialError);
  const [statusAnnouncement, setStatusAnnouncement] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
    celebrate?: boolean;
  } | null>(null);

  // Modali
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<SavingsChallenge | null>(null);
  const [preselectedGoalId, setPreselectedGoalId] = useState<string | undefined>(undefined);
  const [contributionTarget, setContributionTarget] = useState<SavingsChallenge | null>(null);

  const [challengePendingDelete, setChallengePendingDelete] = useState<{
    challenge: SavingsChallenge;
    requireRevertConfirm: boolean;
    appliedTotal: number;
  } | null>(null);

  const [revertPending, setRevertPending] = useState<{
    challenge: SavingsChallenge;
    contribution?: SavingsChallengeContribution;
  } | null>(null);

  const expenseFingerprint = useMemo(
    () => `${expenses.length}:${expenses.reduce((sum, e) => sum + (e.amount || 0), 0).toFixed(2)}`,
    [expenses]
  );
  const lastFingerprintRef = useRef<string>(expenseFingerprint);

  useEffect(() => {
    onGoalSummariesChange?.(goalSummaries);
  }, [goalSummaries, onGoalSummariesChange]);

  const loadChallengesFromServer = useCallback(async (recalculate = true) => {
    setErrorText(null);
    try {
      const data = await fetchSavingsChallenges({ recalculate });
      setChallenges(data.challenges);
      setGoalSummaries(data.goalSummaries);
      setPolicy(data.policy);
      setIsOffline(false);
      setSelectedChallengeId((current) => {
        if (current && data.challenges.some((c) => c.id === current)) return current;
        return data.challenges[0]?.id ?? null;
      });
    } catch (err) {
      if (isOfflineNetworkError(err)) {
        setIsOffline(true);
        const cached = loadCachedSavingsChallenges();
        if (cached) {
          setChallenges(cached.challenges);
          setGoalSummaries(cached.goalSummaries);
          if (cached.policy) setPolicy(cached.policy);
          setSelectedChallengeId((current) => current ?? cached.challenges[0]?.id ?? null);
        }
      } else {
        setErrorText(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le sfide di risparmio.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialChallenges) return;
    void loadChallengesFromServer(true);
  }, [initialChallenges, loadChallengesFromServer]);

  // Ricalcolo automatico quando cambiano le spese nella sessione o al rientro online/focus
  useEffect(() => {
    if (initialChallenges) return;
    if (lastFingerprintRef.current !== expenseFingerprint) {
      lastFingerprintRef.current = expenseFingerprint;
      const timer = window.setTimeout(() => {
        void loadChallengesFromServer(true);
      }, 350);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [expenseFingerprint, initialChallenges, loadChallengesFromServer]);

  useEffect(() => {
    if (initialChallenges) return;
    const handleReconnect = () => {
      setIsOffline(false);
      void loadChallengesFromServer(true);
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleReconnect);
    window.addEventListener('focus', handleReconnect);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleReconnect);
      window.removeEventListener('focus', handleReconnect);
      window.removeEventListener('offline', handleOffline);
    };
  }, [initialChallenges, loadChallengesFromServer]);

  useEffect(() => {
    if (!createForGoalRequest) return;
    setEditingChallenge(null);
    setPreselectedGoalId(createForGoalRequest.goalId);
    setIsFormOpen(true);
  }, [createForGoalRequest]);

  const loadHistoryForChallenge = useCallback(async (challengeId: string) => {
    setIsLoadingHistory(true);
    try {
      const data = await fetchSavingsChallengeHistory(challengeId);
      setHistoryByChallenge((prev) => ({
        ...prev,
        [challengeId]: {
          history: data.history,
          contributions: data.contributions,
        },
      }));
    } catch {
      // Mantiene storico in memoria se offline o temporaneamente non raggiungibile
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (initialChallenges || !selectedChallengeId || isOffline) return;
    void loadHistoryForChallenge(selectedChallengeId);
  }, [initialChallenges, selectedChallengeId, isOffline, loadHistoryForChallenge]);

  const activeChallengesList = useMemo(
    () => challenges.filter((c) => c.status === 'active' || c.status === 'paused'),
    [challenges]
  );
  const completedChallengesList = useMemo(
    () => challenges.filter((c) => c.status === 'completed' || c.status === 'cancelled'),
    [challenges]
  );

  const visibleChallenges = useMemo(() => {
    if (filterTab === 'active') return activeChallengesList;
    if (filterTab === 'completed') return completedChallengesList;
    return challenges;
  }, [filterTab, activeChallengesList, completedChallengesList, challenges]);

  const selectedChallenge = useMemo(() => {
    const inVisible = visibleChallenges.find((c) => c.id === selectedChallengeId);
    return inVisible ?? visibleChallenges[0] ?? null;
  }, [visibleChallenges, selectedChallengeId]);

  const mergeUpdatedChallenge = (
    updatedChallenge: SavingsChallenge,
    updatedSummaries: GoalVirtualSavingsSummary[]
  ) => {
    setChallenges((current) => {
      const exists = current.some((c) => c.id === updatedChallenge.id);
      const next = exists
        ? current.map((c) => (c.id === updatedChallenge.id ? updatedChallenge : c))
        : [updatedChallenge, ...current];
      return next;
    });
    setGoalSummaries(updatedSummaries);
    setSelectedChallengeId(updatedChallenge.id);
    void loadHistoryForChallenge(updatedChallenge.id);
  };

  const handleSaveChallengeForm = async (payload: {
    id?: string;
    title: string;
    goalId: string;
    categories: string[];
    monthlyLimit: number;
    startMonth: string;
    durationMonths: number;
    splitScope: 'all' | 'shared_only';
    timezone: string;
    expectedVersion?: number;
    confirmRetroactive?: boolean;
  }) => {
    if (payload.id) {
      const res = await updateSavingsChallenge(payload.id, {
        title: payload.title,
        goalId: payload.goalId,
        categories: payload.categories,
        monthlyLimit: payload.monthlyLimit,
        startMonth: payload.startMonth,
        durationMonths: payload.durationMonths,
        splitScope: payload.splitScope,
        timezone: payload.timezone,
        expectedVersion: payload.expectedVersion,
        confirmRetroactive: payload.confirmRetroactive,
      });
      mergeUpdatedChallenge(res.challenge, res.goalSummaries);
      setStatusAnnouncement({
        type: 'success',
        text: `Sfida "${res.challenge.title}" aggiornata e ricalcolata.`,
      });
      return;
    }

    const res = await createSavingsChallenge({
      title: payload.title,
      goalId: payload.goalId,
      categories: payload.categories,
      monthlyLimit: payload.monthlyLimit,
      startMonth: payload.startMonth,
      durationMonths: payload.durationMonths,
      splitScope: payload.splitScope,
      timezone: payload.timezone,
    });
    mergeUpdatedChallenge(res.challenge, res.goalSummaries);
    setFilterTab('active');
    setStatusAnnouncement({
      type: 'success',
      text: `Sfida "${res.challenge.title}" attivata! Nessun conto reale viene modificato.`,
    });
  };

  const runChallengeAction = async (
    action: () => Promise<{
      challenge: SavingsChallenge;
      goalSummaries: GoalVirtualSavingsSummary[];
    }>,
    successMessage: string,
    celebrate = false
  ) => {
    setIsBusy(true);
    setErrorText(null);
    try {
      const res = await action();
      mergeUpdatedChallenge(res.challenge, res.goalSummaries);
      setStatusAnnouncement({
        type: 'success',
        text: successMessage,
        celebrate,
      });
    } catch (err) {
      if (isOfflineNetworkError(err)) {
        setIsOffline(true);
      }
      setStatusAnnouncement({
        type: 'error',
        text: err instanceof Error ? err.message : 'Operazione non riuscita.',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmContribution = async (payload: {
    challengeId: string;
    amount: number;
    expectedVersion: number;
    idempotencyKey: string;
  }) => {
    const res = await confirmChallengeContribution(
      payload.challengeId,
      {
        amount: payload.amount,
        expectedVersion: payload.expectedVersion,
      },
      payload.idempotencyKey
    );
    mergeUpdatedChallenge(res.challenge, res.goalSummaries);
    onSyncGoalFromServer?.(res.updatedGoal);
    setStatusAnnouncement({
      type: 'success',
      text: `Avete creato ${formatCurrency(res.contribution.amount, res.contribution.currency)} virtuali per "${res.updatedGoal.title}". Nessun conto reale è stato modificato.`,
      celebrate: true,
    });
  };

  const handleConfirmRevert = async () => {
    if (!revertPending) return;
    const target = revertPending;
    setRevertPending(null);
    setIsBusy(true);
    try {
      const res = await revertChallengeContribution(target.challenge.id, {
        ...(target.contribution ? { contributionId: target.contribution.id } : {}),
        expectedVersion: target.challenge.version,
      });
      mergeUpdatedChallenge(res.challenge, res.goalSummaries);
      if (res.updatedGoal) {
        onSyncGoalFromServer?.(res.updatedGoal);
      }
      setStatusAnnouncement({
        type: 'info',
        text: `Contributo virtuale di ${formatCurrency(res.revertedContribution.amount, res.revertedContribution.currency)} annullato dalla Vision Board.`,
      });
    } catch (err) {
      setStatusAnnouncement({
        type: 'error',
        text: err instanceof Error ? err.message : 'Impossibile annullare il contributo.',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRequestDelete = (challenge: SavingsChallenge) => {
    const applied = challenge.metrics.virtualSavingsApplied;
    setChallengePendingDelete({
      challenge,
      requireRevertConfirm: applied > 0,
      appliedTotal: applied,
    });
  };

  const handleConfirmDelete = async () => {
    if (!challengePendingDelete) return;
    const { challenge, requireRevertConfirm } = challengePendingDelete;
    setIsBusy(true);
    try {
      const res = await deleteSavingsChallenge(challenge.id, {
        expectedVersion: challenge.version,
        revertAppliedContributions: requireRevertConfirm,
      });
      setChallenges((current) => current.filter((c) => c.id !== challenge.id));
      setGoalSummaries(res.goalSummaries);
      if (res.updatedGoals.length > 0) {
        onSyncGoalsFromServer?.(res.updatedGoals);
      }
      setChallengePendingDelete(null);
      setStatusAnnouncement({
        type: 'info',
        text:
          res.revertedAmount > 0
            ? `Sfida "${challenge.title}" eliminata e ${formatCurrency(res.revertedAmount, challenge.currency)} virtuali stornati dall’obiettivo.`
            : `Sfida "${challenge.title}" eliminata.`,
      });
    } catch (err) {
      if (
        err instanceof SavingsChallengeApiError &&
        err.code === 'APPLIED_CONTRIBUTIONS_EXIST'
      ) {
        setChallengePendingDelete({
          challenge,
          requireRevertConfirm: true,
          appliedTotal: Number(err.details?.appliedTotal ?? challenge.metrics.virtualSavingsApplied),
        });
      } else {
        setChallengePendingDelete(null);
        setStatusAnnouncement({
          type: 'error',
          text: err instanceof Error ? err.message : 'Eliminazione non riuscita.',
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const selectedHistory = selectedChallenge
    ? historyByChallenge[selectedChallenge.id]?.history ?? []
    : [];
  const selectedContributions = selectedChallenge
    ? historyByChallenge[selectedChallenge.id]?.contributions ?? []
    : [];
  const selectedGoal = selectedChallenge
    ? goals.find((g) => g.id === selectedChallenge.goalId)
    : undefined;
  const selectedGoalSummary = selectedChallenge
    ? goalSummaries.find((s) => s.goalId === selectedChallenge.goalId)
    : undefined;

  return (
    <section
      aria-labelledby="savings-challenges-heading"
      className="ds-card p-5 sm:p-6 space-y-5"
    >
      {/* Header sezione */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3
              id="savings-challenges-heading"
              className="text-base sm:text-lg font-bold text-stone-900 font-display"
            >
              Sfide di Risparmio
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/12 text-emerald-700 border border-emerald-500/25">
              <ShieldCheck className="w-3 h-3" aria-hidden="true" />
              <span>Virtuale</span>
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Trasforma i limiti di spesa mensili rispettati in contributi virtuali per i vostri obiettivi Vision Board, senza spostare denaro reale.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isLoading || isBusy}
            onClick={() => void loadChallengesFromServer(true)}
            aria-label="Aggiorna e ricalcola sfide di risparmio"
            className="ds-btn-secondary min-h-10 px-3 py-2 text-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'motion-safe:animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Aggiorna</span>
          </button>

          <button
            type="button"
            disabled={isOffline || isBusy}
            onClick={() => {
              setEditingChallenge(null);
              setPreselectedGoalId(goals[0]?.id);
              setIsFormOpen(true);
            }}
            className="ds-btn-primary min-h-10 px-4 py-2 text-xs"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Nuova sfida</span>
          </button>
        </div>
      </div>

      {/* Banner Offline */}
      {isOffline && (
        <div
          role="status"
          className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-900 flex items-start gap-2"
        >
          <WifiOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Connessione assente: stai vedendo l&apos;ultima istantanea salvata in sola lettura. I calcoli e i contributi virtuali riprenderanno automaticamente alla riconnessione.
          </span>
        </div>
      )}

      {/* Live region accessibile */}
      <div role="status" aria-live="polite">
        {statusAnnouncement && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              statusAnnouncement.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : statusAnnouncement.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-stone-100 border-stone-200 text-stone-800'
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              {statusAnnouncement.celebrate && (
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              )}
              <span>{statusAnnouncement.text}</span>
            </span>
            <button
              type="button"
              onClick={() => setStatusAnnouncement(null)}
              className="text-[11px] font-bold hover:underline shrink-0 cursor-pointer"
            >
              Chiudi
            </button>
          </div>
        )}
      </div>

      {/* Error state */}
      {errorText && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-800 flex flex-wrap items-center justify-between gap-3"
        >
          <span>{errorText}</span>
          <button
            type="button"
            onClick={() => void loadChallengesFromServer(true)}
            className="ds-btn-secondary min-h-9 px-3 text-xs"
          >
            Riprova
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading ? (
        <div
          aria-busy="true"
          aria-label="Caricamento sfide di risparmio"
          className="grid grid-cols-1 lg:grid-cols-12 gap-5"
        >
          <div className="lg:col-span-5 space-y-3">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="ds-subcard h-32 p-4 animate-pulse motion-reduce:animate-none"
              />
            ))}
          </div>
          <div className="lg:col-span-7">
            <div className="ds-subcard h-72 p-4 animate-pulse motion-reduce:animate-none" />
          </div>
        </div>
      ) : challenges.length === 0 ? (
        /* Empty state istruttivo */
        <div className="ds-subcard p-6 sm:p-8 text-center space-y-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-500/12 border border-orange-500/25 text-orange-600 flex items-center justify-center mx-auto">
            <Sparkles className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="max-w-lg mx-auto space-y-1.5">
            <h4 className="text-sm font-bold text-stone-900">
              Nessuna sfida di risparmio attiva
            </h4>
            <p className="text-xs text-stone-500 leading-relaxed">
              Esempio: fissate un limite mensile di <strong>€300</strong> su <em>Ristoranti e Bar</em>. Se a fine mese spendete <strong>€250</strong>, potete trasferire <strong>€50 virtuali</strong> verso un obiettivo della Vision Board — senza competizione e senza toccare alcun conto bancario.
            </p>
          </div>
          {goals.length === 0 ? (
            <button
              type="button"
              onClick={() => onRequestCreateGoal?.()}
              className="ds-btn-primary min-h-10 px-4 text-xs"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Crea prima un obiettivo Vision Board</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isOffline}
              onClick={() => {
                setEditingChallenge(null);
                setPreselectedGoalId(goals[0]?.id);
                setIsFormOpen(true);
              }}
              className="ds-btn-primary min-h-10 px-4 text-xs"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Crea la prima sfida</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Filtri Attive / Storico / Tutte */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtra sfide per stato">
            {(
              [
                { id: 'active', label: `Attive (${activeChallengesList.length})` },
                { id: 'completed', label: `Concluse (${completedChallengesList.length})` },
                { id: 'all', label: `Tutte (${challenges.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={filterTab === tab.id}
                onClick={() => setFilterTab(tab.id)}
                className={`min-h-9 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  filterTab === tab.id
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'ds-btn-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {visibleChallenges.length === 0 ? (
            <div className="ds-subcard p-6 text-center text-xs text-stone-500">
              Nessuna sfida presente in questa vista. Passa a &ldquo;Tutte&rdquo; o crea una nuova sfida.
            </div>
          ) : (
            /* Desktop: 2 colonne (sx compatte, dx dettaglio/storico) · Mobile: verticale */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-5 space-y-3 min-w-0">
                {visibleChallenges.map((challenge) => (
                  <ChallengeCompactCard
                    key={challenge.id}
                    challenge={challenge}
                    isSelected={selectedChallenge?.id === challenge.id}
                    onSelect={(id) => setSelectedChallengeId(id)}
                  />
                ))}
              </div>

              <div className="lg:col-span-7 min-w-0">
                {selectedChallenge && (
                  <ChallengeDetailPanel
                    challenge={selectedChallenge}
                    linkedGoal={selectedGoal}
                    goalSummary={selectedGoalSummary}
                    history={selectedHistory}
                    contributions={selectedContributions}
                    policy={policy}
                    isLoadingHistory={isLoadingHistory}
                    isOffline={isOffline}
                    isBusy={isBusy}
                    onPrepareContribution={(target) => setContributionTarget(target)}
                    onEdit={(target) => {
                      setEditingChallenge(target);
                      setPreselectedGoalId(target.goalId);
                      setIsFormOpen(true);
                    }}
                    onPause={(target) =>
                      void runChallengeAction(
                        () => pauseSavingsChallenge(target.id, target.version),
                        `Sfida "${target.title}" messa in pausa.`
                      )
                    }
                    onResume={(target) =>
                      void runChallengeAction(
                        () => resumeSavingsChallenge(target.id, target.version),
                        `Sfida "${target.title}" riattivata.`
                      )
                    }
                    onComplete={(target) =>
                      void runChallengeAction(
                        () => completeSavingsChallenge(target.id, target.version),
                        `Sfida "${target.title}" completata. Nessun conto reale è stato modificato.`,
                        true
                      )
                    }
                    onRecalculate={(target) =>
                      void runChallengeAction(
                        () => recalculateSavingsChallenge(target.id),
                        `Sfida "${target.title}" ricalcolata dai dati reali.`
                      )
                    }
                    onRequestRevertContribution={(target, contrib) =>
                      setRevertPending({ challenge: target, contribution: contrib })
                    }
                    onRequestDelete={handleRequestDelete}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modali Creazione/Modifica e Conferma Contributo Virtuale */}
      <ChallengeFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingChallenge(null);
        }}
        goals={goals}
        profile={profile}
        editingChallenge={editingChallenge}
        initialGoalId={preselectedGoalId}
        onSubmit={handleSaveChallengeForm}
      />

      <ContributionConfirmModal
        isOpen={Boolean(contributionTarget)}
        challenge={contributionTarget}
        onClose={() => setContributionTarget(null)}
        onConfirm={handleConfirmContribution}
      />

      {/* Conferma Annullamento Contributo */}
      <ConfirmDialog
        isOpen={Boolean(revertPending)}
        variant="warning"
        title="Annullare questo contributo virtuale?"
        description={
          revertPending
            ? `Il contributo virtuale${
                revertPending.contribution
                  ? ` di ${formatCurrency(
                      revertPending.contribution.amount,
                      revertPending.contribution.currency
                    )}`
                  : ''
              } verrà stornato da "${revertPending.challenge.goalTitleSnapshot}" e tornerà disponibile nella sfida. Nessun conto reale viene toccato.`
            : ''
        }
        confirmLabel="Annulla contributo"
        cancelLabel="Mantieni"
        onConfirm={() => void handleConfirmRevert()}
        onCancel={() => setRevertPending(null)}
      />

      {/* Conferma Eliminazione Sfida */}
      <ConfirmDialog
        isOpen={Boolean(challengePendingDelete)}
        variant="danger"
        title="Eliminare questa sfida?"
        description={
          challengePendingDelete
            ? challengePendingDelete.requireRevertConfirm
              ? `La sfida "${challengePendingDelete.challenge.title}" ha ${formatCurrency(
                  challengePendingDelete.appliedTotal,
                  challengePendingDelete.challenge.currency
                )} virtuali già applicati sull’obiettivo. Confermando, questi contributi virtuali verranno stornati dalla Vision Board e la sfida sarà eliminata.`
              : `La sfida "${challengePendingDelete.challenge.title}" verrà rimossa insieme al suo storico. Le spese reali del registro restano intatte.`
            : ''
        }
        confirmLabel={
          challengePendingDelete?.requireRevertConfirm
            ? 'Storna ed elimina'
            : 'Elimina sfida'
        }
        cancelLabel="Annulla"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setChallengePendingDelete(null)}
      />
    </section>
  );
};
