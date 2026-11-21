import React from 'react';
import { Calendar, Sparkles, Target } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import type { SavingsChallenge } from '../../types';
import { formatYearMonthIt, getChallengeHealthDisplay } from './challengeStatusMeta';

interface ChallengeCompactCardProps {
  challenge: SavingsChallenge;
  isSelected: boolean;
  onSelect: (challengeId: string) => void;
}

export const ChallengeCompactCard: React.FC<ChallengeCompactCardProps> = ({
  challenge,
  isSelected,
  onSelect,
}) => {
  const health = getChallengeHealthDisplay(challenge.metrics.healthState);
  const StatusIcon = health.icon;
  const { metrics } = challenge;

  return (
    <button
      type="button"
      onClick={() => onSelect(challenge.id)}
      aria-pressed={isSelected}
      aria-label={`Seleziona sfida ${challenge.title}, stato ${health.label}`}
      className={`w-full text-left ds-subcard p-3.5 sm:p-4 space-y-2.5 transition-colors cursor-pointer min-w-0 ${
        isSelected
          ? 'border-orange-500 ring-2 ring-orange-500/25'
          : 'hover:border-orange-400/80'
      }`}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-stone-900 break-words line-clamp-2 leading-snug">
            {challenge.title}
          </h4>
          <p className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5 min-w-0">
            <Target className="w-3 h-3 text-orange-600 shrink-0" aria-hidden="true" />
            <span className="truncate">{challenge.goalTitleSnapshot}</span>
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ${health.badgeClass}`}
        >
          <StatusIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>{health.label}</span>
        </span>
      </div>

      {/* Barra progresso leggibile */}
      <div className="space-y-1">
        <div
          className="w-full h-2 rounded-full progress-track overflow-hidden"
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
      </div>

      {/* 3 metriche compatte anti-overflow */}
      <div className="grid grid-cols-3 gap-2 text-[11px] min-w-0">
        <div className="min-w-0">
          <span className="text-stone-500 block text-[10px]">Limite</span>
          <span className="font-mono tabular-nums font-semibold text-stone-900 block truncate">
            {formatCurrency(metrics.totalLimit, challenge.currency)}
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-stone-500 block text-[10px]">Speso</span>
          <span className="font-mono tabular-nums font-semibold text-stone-900 block truncate">
            {formatCurrency(metrics.validSpend, challenge.currency)}
          </span>
        </div>
        <div className="min-w-0 text-right">
          <span className="text-stone-500 block text-[10px]">Virt. disp.</span>
          <span className="font-mono tabular-nums font-bold text-emerald-600 block truncate">
            {formatCurrency(metrics.virtualSavingsAvailable, challenge.currency)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-200/70 text-[10px] text-stone-500">
        <span className="inline-flex items-center gap-1 min-w-0 truncate">
          <Calendar className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {formatYearMonthIt(challenge.startMonth)}
            {challenge.durationMonths > 1 ? ` · ${challenge.durationMonths} mesi` : ''}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 font-mono font-semibold shrink-0">
          {metrics.isPeriodConcluded ? (
            'Periodo concluso'
          ) : (
            <>
              <Sparkles className="w-3 h-3 text-orange-600" aria-hidden="true" />
              <span>{metrics.daysRemaining} gg rimasti</span>
            </>
          )}
        </span>
      </div>
    </button>
  );
};
