import React from 'react';
import { ChevronDown, ChevronUp, Target } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import type { SavingsChallenge } from '../../types';
import { getChallengeHealthDisplay } from './challengeStatusMeta';

interface ChallengeCompactCardProps {
  challenge: SavingsChallenge;
  isExpanded?: boolean;
  isSelected?: boolean;
  panelId?: string;
  embeddedInAccordion?: boolean;
  onToggle?: (challengeId: string) => void;
  onSelect?: (challengeId: string) => void;
}

export const ChallengeCompactCard: React.FC<ChallengeCompactCardProps> = ({
  challenge,
  isExpanded,
  isSelected,
  panelId,
  embeddedInAccordion = false,
  onToggle,
  onSelect,
}) => {
  const expanded = isExpanded ?? isSelected ?? false;
  const handleClick = () => (onToggle ?? onSelect)?.(challenge.id);
  const health = getChallengeHealthDisplay(challenge.metrics.healthState);
  const StatusIcon = health.icon;
  const { metrics } = challenge;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-expanded={expanded}
      aria-pressed={expanded}
      aria-controls={panelId}
      aria-label={`${expanded ? 'Comprimi' : 'Espandi'} sfida ${challenge.title}, stato ${health.label}`}
      className={`w-full text-left pl-4 pr-3.5 py-2.5 sm:pl-5 sm:pr-4 sm:py-3 space-y-1.5 transition-colors cursor-pointer min-w-0 ${
        embeddedInAccordion
          ? 'hover:bg-stone-50'
          : `ds-subcard relative overflow-hidden ${
              expanded
                ? 'border-orange-500 ring-2 ring-orange-500/25'
                : 'hover:border-orange-400/80'
            }`
      }`}
    >
      {!embeddedInAccordion && (
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-1 ${health.accentStripClass}`}
        />
      )}

      {/* Riga 1: indicatore stato colorato, titolo, pill stato + chevron */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            aria-hidden="true"
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${health.dotClass}`}
          />
          <h4 className="text-sm font-bold text-stone-900 truncate leading-snug">
            {challenge.title}
          </h4>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ${health.badgeClass}`}
          >
            <StatusIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{health.label}</span>
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-stone-500 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-stone-500 shrink-0" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Riga 2: mini progress bar colorata, speso/limite, highlight risparmio, meta & giorni rimasti */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-stone-500 min-w-0">
        <div
          className="w-16 sm:w-24 h-1.5 rounded-full progress-track overflow-hidden shrink-0"
          role="progressbar"
          aria-valuenow={metrics.barPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Consumo budget sfida ${challenge.title}: ${metrics.consumedPercent}%`}
        >
          <div
            className={`h-full rounded-full motion-safe:transition-all ${health.barClass}`}
            style={{ width: `${metrics.barPercent}%` }}
          />
        </div>

        <span className="font-mono tabular-nums text-stone-600 shrink-0">
          <strong className="text-stone-900">
            {formatCurrency(metrics.validSpend, challenge.currency)}
          </strong>
          {' / '}
          {formatCurrency(metrics.totalLimit, challenge.currency)}
        </span>

        {metrics.exceededAmount > 0 ? (
          <span className="font-mono tabular-nums font-semibold text-rose-600 shrink-0">
            +{formatCurrency(metrics.exceededAmount, challenge.currency)} oltre
          </span>
        ) : metrics.virtualSavingsAvailable > 0 ? (
          <span className="font-mono tabular-nums font-bold text-emerald-600 shrink-0">
            +{formatCurrency(metrics.virtualSavingsAvailable, challenge.currency)} virt.
          </span>
        ) : metrics.virtualSavingsApplied > 0 ? (
          <span className="font-mono tabular-nums font-semibold text-orange-600 shrink-0">
            {formatCurrency(metrics.virtualSavingsApplied, challenge.currency)} applic.
          </span>
        ) : null}

        <span className="hidden sm:inline-flex items-center gap-1 truncate max-w-[160px] min-w-0">
          <Target className="w-3 h-3 text-orange-600 shrink-0" aria-hidden="true" />
          <span className="truncate">{challenge.goalTitleSnapshot}</span>
        </span>

        <span className="ml-auto font-mono text-[10px] font-semibold shrink-0">
          {metrics.isPeriodConcluded
            ? 'Periodo concluso'
            : `${metrics.daysRemaining} gg rimasti`}
        </span>
      </div>
    </button>
  );
};
