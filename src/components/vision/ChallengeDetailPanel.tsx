import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Info,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import type {
  GoalVirtualSavingsSummary,
  SavingGoal,
  SavingsChallenge,
  SavingsChallengeContribution,
  SavingsChallengeHistoryEntry,
  SavingsChallengesCalculationPolicy,
} from '../../types';
import {
  formatDateTimeShort,
  formatYearMonthIt,
  getChallengeHealthDisplay,
} from './challengeStatusMeta';

interface ChallengeDetailPanelProps {
  challenge: SavingsChallenge;
  linkedGoal?: SavingGoal;
  goalSummary?: GoalVirtualSavingsSummary;
  history: SavingsChallengeHistoryEntry[];
  contributions: SavingsChallengeContribution[];
  policy?: SavingsChallengesCalculationPolicy;
  isLoadingHistory: boolean;
  isOffline: boolean;
  isBusy: boolean;
  embedded?: boolean;
  onPrepareContribution: (challenge: SavingsChallenge) => void;
  onEdit: (challenge: SavingsChallenge) => void;
  onPause: (challenge: SavingsChallenge) => void;
  onResume: (challenge: SavingsChallenge) => void;
  onComplete: (challenge: SavingsChallenge) => void;
  onRecalculate: (challenge: SavingsChallenge) => void;
  onRequestRevertContribution: (
    challenge: SavingsChallenge,
    contribution?: SavingsChallengeContribution
  ) => void;
  onRequestDelete: (challenge: SavingsChallenge) => void;
}

export const ChallengeDetailPanel: React.FC<ChallengeDetailPanelProps> = ({
  challenge,
  linkedGoal,
  goalSummary,
  history,
  contributions,
  policy,
  isLoadingHistory,
  isOffline,
  isBusy,
  embedded = false,
  onPrepareContribution,
  onEdit,
  onPause,
  onResume,
  onComplete,
  onRecalculate,
  onRequestRevertContribution,
  onRequestDelete,
}) => {
  const [showCalcDetails, setShowCalcDetails] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const health = getChallengeHealthDisplay(challenge.metrics.healthState);
  const StatusIcon = health.icon;
  const { metrics } = challenge;

  const r = 42;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - metrics.barPercent / 100);

  const canPrepareContribution =
    !isOffline &&
    metrics.goalLinked &&
    metrics.virtualSavingsAvailable > 0 &&
    challenge.status !== 'cancelled';

  const appliedContributions = contributions.filter((c) => c.status === 'applied');
  const hasAppliedContributions =
    appliedContributions.length > 0 || metrics.virtualSavingsApplied > 0;

  const goalPercent =
    linkedGoal && linkedGoal.targetAmount > 0
      ? Math.min(100, Math.round((linkedGoal.currentAmount / linkedGoal.targetAmount) * 100))
      : 0;

  return (
    <div className={embedded ? 'space-y-4 min-w-0' : 'ds-subcard p-4 sm:p-5 space-y-4 min-w-0'}>
      {/* Header sfida (compatto se embedded inline in accordion) */}
      {embedded ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0 text-[11px] text-stone-500">
          <div className="min-w-0 space-y-0.5">
            <div className="font-mono text-stone-600">
              {challenge.startDate} → {challenge.endDate}
            </div>
            <p className="truncate sm:whitespace-normal">
              Categorie: <strong className="text-stone-800">{challenge.categories.join(', ')}</strong>
              {' · '}
              {challenge.splitScope === 'shared_only'
                ? 'Solo spese condivise'
                : 'Tutte le spese della coppia'}
            </p>
          </div>
          <div className="text-[10px] font-mono text-stone-500 shrink-0 sm:text-right">
            <div>Timezone: {challenge.timezone}</div>
            <div>Ultimo agg.: {formatDateTimeShort(challenge.lastReconciledAt)}</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border ${health.badgeClass}`}
              >
                <StatusIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{health.label}</span>
              </span>
              <span className="text-[11px] font-mono text-stone-500">
                {challenge.startDate} → {challenge.endDate}
              </span>
            </div>
            <h4 className="text-base sm:text-lg font-bold text-stone-900 font-display break-words">
              {challenge.title}
            </h4>
            <p className="text-[11px] text-stone-500">
              Categorie: <strong className="text-stone-800">{challenge.categories.join(', ')}</strong>
              {' · '}
              {challenge.splitScope === 'shared_only'
                ? 'Solo spese condivise'
                : 'Tutte le spese della coppia'}
            </p>
          </div>

          <div className="text-[10px] font-mono text-stone-500 shrink-0 sm:text-right">
            <div>Timezone: {challenge.timezone}</div>
            <div>Ultimo agg.: {formatDateTimeShort(challenge.lastReconciledAt)}</div>
          </div>
        </div>
      )}

      {/* Layout 2 colonne desktop dentro il dettaglio espanso */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7 space-y-4 min-w-0">

      {/* Anello progresso + Messaggio motivante non competitivo */}
      <div className="ds-card p-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="shrink-0">
          <svg
            viewBox="0 0 112 112"
            className="w-24 h-24 sm:w-28 sm:h-28 select-none"
            role="img"
            aria-label={`Avanzamento spesa sfida ${challenge.title}: ${metrics.consumedPercent}% consumato`}
          >
            <circle
              cx={56}
              cy={56}
              r={r}
              fill="none"
              stroke="var(--theme-progress-track)"
              strokeWidth={10}
            />
            <circle
              cx={56}
              cy={56}
              r={r}
              fill="none"
              stroke={health.ringStroke}
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 56 56)"
            />
            <text
              x={56}
              y={54}
              textAnchor="middle"
              fill="var(--theme-text)"
              fontSize={18}
              fontWeight={800}
              fontFamily="monospace"
            >
              {Math.round(metrics.consumedPercent)}%
            </text>
            <text
              x={56}
              y={70}
              textAnchor="middle"
              fill="var(--theme-text-muted)"
              fontSize={10}
              fontWeight={600}
            >
              del limite
            </text>
          </svg>
        </div>

        <div className="flex-1 min-w-0 space-y-2 text-center sm:text-left">
          <p className="text-xs sm:text-sm font-semibold text-stone-900 leading-relaxed break-words">
            {metrics.statusMessage}
          </p>
          <p className="text-[11px] text-stone-500 flex items-center justify-center sm:justify-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>Nessun conto reale è stato modificato · Risparmio virtuale reversibile</span>
          </p>
        </div>
      </div>

      {/* Avvisi: obiettivo mancante / categorie orfane / sfide sovrapposte */}
      {!metrics.goalLinked && (
        <div
          role="alert"
          className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-900 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">
              Obiettivo collegato (&ldquo;{challenge.goalTitleSnapshot}&rdquo;) non trovato nella Vision Board.
            </p>
            <p className="text-[11px]">
              Modifica la sfida per collegarla a un obiettivo esistente prima di confermare nuovi contributi virtuali.
            </p>
          </div>
        </div>
      )}

      {metrics.orphanedCategories.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-900 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Categorie personalizzate non più attive nel profilo:{' '}
            <strong>{metrics.orphanedCategories.join(', ')}</strong>. Le spese già salvate con queste etichette restano incluse finché non modifichi la sfida.
          </p>
        </div>
      )}

      {metrics.overlappingChallengeIds.length > 0 && (
        <div className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-xs text-blue-900 flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Esiste un&apos;altra sfida attiva nello stesso periodo sulle categorie:{' '}
            <strong>{metrics.overlappingCategories.join(', ')}</strong>. Ogni spesa viene calcolata indipendentemente per ciascuna sfida senza doppi addebiti reali.
          </p>
        </div>
      )}

      {/* Griglia metriche principali */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
        <div className="ds-card p-3 min-w-0">
          <span className="text-stone-500 text-[11px] block">Limite ({challenge.durationMonths}m)</span>
          <strong className="font-mono tabular-nums text-sm text-stone-900 block break-all mt-0.5">
            {formatCurrency(metrics.totalLimit, challenge.currency)}
          </strong>
          <span className="text-[10px] text-stone-500 font-mono">
            {formatCurrency(challenge.monthlyLimit, challenge.currency)}/mese
          </span>
        </div>

        <div className="ds-card p-3 min-w-0">
          <span className="text-stone-500 text-[11px] block">Speso finora</span>
          <strong className="font-mono tabular-nums text-sm text-stone-900 block break-all mt-0.5">
            {formatCurrency(metrics.validSpend, challenge.currency)}
          </strong>
          <span className="text-[10px] text-stone-500">
            {metrics.matchedExpenseCount} spese valide
          </span>
        </div>

        <div className="ds-card p-3 min-w-0">
          <span className="text-stone-500 text-[11px] block">
            {metrics.exceededAmount > 0 ? 'Oltre il limite' : 'Residuo'}
          </span>
          <strong
            className={`font-mono tabular-nums text-sm block break-all mt-0.5 ${
              metrics.exceededAmount > 0 ? 'text-rose-600' : 'text-stone-900'
            }`}
          >
            {metrics.exceededAmount > 0
              ? `+${formatCurrency(metrics.exceededAmount, challenge.currency)}`
              : formatCurrency(metrics.remainingBudget, challenge.currency)}
          </strong>
          <span className="text-[10px] text-stone-500 font-mono">
            {metrics.consumedPercent}% consumato
          </span>
        </div>

        <div className="ds-card p-3 min-w-0">
          <span className="text-stone-500 text-[11px] block">Risparmio virtuale disp.</span>
          <strong className="font-mono tabular-nums text-sm text-emerald-600 block break-all mt-0.5">
            {formatCurrency(metrics.virtualSavingsAvailable, challenge.currency)}
          </strong>
          <span className="text-[10px] text-stone-500 font-mono">
            Potenziale: {formatCurrency(metrics.virtualSavingsPotential, challenge.currency)}
          </span>
        </div>

        <div className="ds-card p-3 min-w-0">
          <span className="text-stone-500 text-[11px] block">Già applicato</span>
          <strong className="font-mono tabular-nums text-sm text-orange-600 block break-all mt-0.5">
            {formatCurrency(metrics.virtualSavingsApplied, challenge.currency)}
          </strong>
          <span className="text-[10px] text-stone-500">su Vision Board</span>
        </div>

        <div className="ds-card p-3 min-w-0">
          <span className="text-stone-500 text-[11px] block">Tempo periodo</span>
          <strong className="font-mono tabular-nums text-sm text-stone-900 block mt-0.5">
            {metrics.daysRemaining} gg rimasti
          </strong>
          <span className="text-[10px] text-stone-500 font-mono">
            {metrics.daysElapsed} / {metrics.daysTotal} giorni trascorsi
          </span>
        </div>
      </div>

      {/* Obiettivo Vision Board collegato */}
      <div className="ds-card p-3.5 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
        {linkedGoal?.imageUrl ? (
          <img
            src={linkedGoal.imageUrl}
            alt={linkedGoal.title}
            className="w-16 h-16 rounded-xl object-cover shrink-0 border border-stone-200/80"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-orange-500/12 border border-orange-500/25 flex items-center justify-center text-orange-600 shrink-0">
            <Target className="w-6 h-6" aria-hidden="true" />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-900 truncate">
              Obiettivo: {linkedGoal?.title || challenge.goalTitleSnapshot}
            </span>
            {linkedGoal && (
              <span className="text-[11px] font-mono font-semibold text-stone-700">
                {formatCurrency(linkedGoal.currentAmount, challenge.currency)} /{' '}
                {formatCurrency(linkedGoal.targetAmount, challenge.currency)} ({goalPercent}%)
              </span>
            )}
          </div>
          {linkedGoal && (
            <div className="w-full h-1.5 rounded-full progress-track overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full"
                style={{ width: `${goalPercent}%` }}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
            <span>
              Contributo questa sfida:{' '}
              <strong className="font-mono text-stone-800">
                {formatCurrency(metrics.virtualSavingsApplied, challenge.currency)}
              </strong>
            </span>
            {goalSummary && (
              <span>
                Totale virtuale obiettivo:{' '}
                <strong className="font-mono text-emerald-700">
                  {formatCurrency(goalSummary.totalVirtualApplied, challenge.currency)}
                </strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Una sola azione primaria + azioni secondarie accessibili */}
      <div className="space-y-2.5 pt-1">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {canPrepareContribution ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onPrepareContribution(challenge)}
              className="ds-btn-primary min-h-11 px-4 py-2.5 text-xs sm:text-sm w-full sm:w-auto"
            >
              <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                Prepara contributo virtuale (
                {formatCurrency(metrics.virtualSavingsAvailable, challenge.currency)})
              </span>
            </button>
          ) : challenge.status === 'paused' ? (
            <button
              type="button"
              disabled={isBusy || isOffline}
              onClick={() => onResume(challenge)}
              className="ds-btn-primary min-h-11 px-4 py-2.5 text-xs sm:text-sm w-full sm:w-auto"
            >
              <Play className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Riattiva sfida</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isBusy || isOffline}
              onClick={() => onRecalculate(challenge)}
              className="ds-btn-primary min-h-11 px-4 py-2.5 text-xs sm:text-sm w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Ricalcola dal server</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isBusy || isOffline || challenge.status === 'cancelled'}
            onClick={() => onEdit(challenge)}
            className="ds-btn-secondary min-h-10 px-3 py-1.5 text-xs"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Modifica</span>
          </button>

          {challenge.status === 'active' && (
            <button
              type="button"
              disabled={isBusy || isOffline}
              onClick={() => onPause(challenge)}
              className="ds-btn-secondary min-h-10 px-3 py-1.5 text-xs"
            >
              <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Pausa</span>
            </button>
          )}

          {(challenge.status === 'paused' || challenge.status === 'completed') && (
            <button
              type="button"
              disabled={isBusy || isOffline}
              onClick={() => onResume(challenge)}
              className="ds-btn-secondary min-h-10 px-3 py-1.5 text-xs"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Riattiva</span>
            </button>
          )}

          {(challenge.status === 'active' || challenge.status === 'paused') && (
            <button
              type="button"
              disabled={isBusy || isOffline}
              onClick={() => onComplete(challenge)}
              className="ds-btn-secondary min-h-10 px-3 py-1.5 text-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Termina</span>
            </button>
          )}

          <button
            type="button"
            disabled={isBusy || isOffline}
            onClick={() => onRecalculate(challenge)}
            className="ds-btn-secondary min-h-10 px-3 py-1.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Ricalcola</span>
          </button>

          {hasAppliedContributions && (
            <button
              type="button"
              disabled={isBusy || isOffline}
              onClick={() => onRequestRevertContribution(challenge, appliedContributions[0])}
              className="ds-btn-secondary min-h-10 px-3 py-1.5 text-xs text-amber-700 border-amber-300"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Rimuovi ultimo contributo</span>
            </button>
          )}

          <button
            type="button"
            disabled={isBusy || isOffline}
            onClick={() => onRequestDelete(challenge)}
            className="ds-btn-secondary min-h-10 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Elimina</span>
          </button>
        </div>
      </div>
        </div>

        <div className="lg:col-span-5 space-y-3 min-w-0">
      {/* Periodi mensili (se multi-mese) */}
      {challenge.periods.length > 1 && (
        <div className="ds-card p-3.5 space-y-2">
          <h5 className="text-xs font-bold text-stone-900">Andamento per mese</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {challenge.periods.map((period) => (
              <div
                key={period.id}
                className="ds-subcard p-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-stone-900">
                    {formatYearMonthIt(period.periodYm)}
                  </div>
                  <div className="text-[11px] text-stone-500 font-mono">
                    Speso {formatCurrency(period.validSpend, challenge.currency)} /{' '}
                    {formatCurrency(period.monthlyLimit, challenge.currency)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-emerald-600">
                    +{formatCurrency(period.virtualSavingsPotential, challenge.currency)}
                  </div>
                  <div className="text-[10px] text-stone-500">{period.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trasparenza del calcolo & spese incluse/escluse */}
      <div className="ds-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCalcDetails((prev) => !prev)}
          aria-expanded={showCalcDetails}
          className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-semibold text-stone-900 hover:bg-stone-50 transition-colors cursor-pointer min-h-10"
        >
          <span>Spese considerate e regole di calcolo ({metrics.matchedExpenseCount})</span>
          {showCalcDetails ? (
            <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
        </button>

        {showCalcDetails && (
          <div className="px-3.5 pb-3.5 pt-2 border-t border-stone-200/70 space-y-3 text-xs">
            {policy && (
              <div className="space-y-1 text-[11px] text-stone-600 leading-relaxed">
                <p>
                  <strong>Formula:</strong> {policy.formula}
                </p>
                <p>
                  <strong>Valuta:</strong> {policy.currencyPolicy}
                </p>
                <p>
                  <strong>Divisione:</strong> {policy.splitPolicy}
                </p>
                <p>
                  <strong>Esclusioni:</strong> {policy.excludedItemsPolicy}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3 text-[11px] font-mono text-stone-600">
              <span>Condivise: {formatCurrency(metrics.sharedSpend, challenge.currency)}</span>
              <span>Personali: {formatCurrency(metrics.personalSpend, challenge.currency)}</span>
              {metrics.excludedBreakdown.foreignCurrencyCount > 0 && (
                <span className="text-amber-700">
                  Escluse altre valute: {metrics.excludedBreakdown.foreignCurrencyCount}
                </span>
              )}
              {metrics.excludedBreakdown.zeroOrQuarantineCount > 0 && (
                <span>
                  Quarantena 0 € escluse: {metrics.excludedBreakdown.zeroOrQuarantineCount}
                </span>
              )}
              {metrics.excludedBreakdown.futureExpenseCount > 0 && (
                <span>
                  Spese future escluse: {metrics.excludedBreakdown.futureExpenseCount}
                </span>
              )}
            </div>

            {metrics.matchedExpensesPreview.length === 0 ? (
              <p className="text-[11px] text-stone-500">
                Nessuna spesa valida registrata nel periodo per queste categorie.
              </p>
            ) : (
              <div className="max-h-52 overflow-y-auto divide-y divide-stone-200/70 rounded-xl border border-stone-200/70">
                {metrics.matchedExpensesPreview.map((exp) => (
                  <div
                    key={exp.id}
                    className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-900 truncate">{exp.title}</div>
                      <div className="text-stone-500 font-mono">
                        {exp.date} · {exp.category}
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-stone-900 shrink-0">
                      {formatCurrency(exp.amount, exp.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Storico contributi e modifiche */}
      <div className="ds-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHistory((prev) => !prev)}
          aria-expanded={showHistory}
          className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-semibold text-stone-900 hover:bg-stone-50 transition-colors cursor-pointer min-h-10"
        >
          <span className="inline-flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
            <span>Storico contributi e modifiche ({contributions.length + history.length})</span>
          </span>
          {showHistory ? (
            <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
        </button>

        {showHistory && (
          <div className="px-3.5 pb-3.5 pt-2 border-t border-stone-200/70 space-y-3 text-xs">
            {isLoadingHistory ? (
              <p className="text-[11px] text-stone-500">Caricamento storico...</p>
            ) : (
              <>
                {contributions.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-stone-700">
                      Contributi virtuali alla Vision Board
                    </div>
                    <div className="space-y-1.5">
                      {contributions.map((contrib) => (
                        <div
                          key={contrib.id}
                          className="ds-subcard p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-stone-900">
                              +{formatCurrency(contrib.amount, contrib.currency)} →{' '}
                              {contrib.goalTitleSnapshot}
                            </div>
                            <div className="text-stone-500 font-mono">
                              {formatDateTimeShort(contrib.createdAt)} · {contrib.createdBy}
                              {contrib.status === 'reverted' && ' · Annullato'}
                            </div>
                          </div>
                          {contrib.status === 'applied' ? (
                            <button
                              type="button"
                              disabled={isBusy || isOffline}
                              onClick={() => onRequestRevertContribution(challenge, contrib)}
                              className="ds-btn-secondary min-h-8 px-2.5 text-[11px] text-amber-700"
                            >
                              <RotateCcw className="w-3 h-3" aria-hidden="true" />
                              <span>Annulla</span>
                            </button>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-stone-500/10 text-stone-500 font-mono text-[10px]">
                              Stornato
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {history.length === 0 ? (
                  <p className="text-[11px] text-stone-500">Nessun evento registrato finora.</p>
                ) : (
                  <div className="max-h-52 overflow-y-auto space-y-1.5">
                    {history.map((item) => (
                      <div key={item.id} className="text-[11px] text-stone-600 border-l-2 border-orange-500/40 pl-2.5 py-0.5">
                        <div className="font-medium text-stone-900 break-words">{item.summary}</div>
                        <div className="text-[10px] font-mono text-stone-500">
                          {formatDateTimeShort(item.createdAt)} · {item.actor}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
        </div>
      </div>
    </div>
  );
};
