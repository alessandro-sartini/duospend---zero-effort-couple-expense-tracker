import React from 'react';
import { Pencil } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import type { GoalsSavingsOverviewData } from '../../services/analytics-math';
import type { SavingGoal } from '../../types';

interface GoalsSavingsOverviewProps {
  overview: GoalsSavingsOverviewData;
  currency: string;
  onQuickAddGoal?: (goal: SavingGoal, delta: number) => void;
  onEditGoal?: (goal: SavingGoal) => void;
}

export const GoalsSavingsOverview: React.FC<GoalsSavingsOverviewProps> = ({
  overview,
  currency,
  onQuickAddGoal,
  onEditGoal,
}) => {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - overview.overallPercent / 100);

  return (
    <div className="ds-card p-4 sm:p-6 space-y-5">
      <div className="flex flex-col md:flex-row items-center gap-5 sm:gap-6">
        <div className="shrink-0">
          <svg
            viewBox="0 0 144 144"
            className="w-36 h-36 sm:w-40 sm:h-40 select-none"
            role="img"
            aria-label={`Avanzamento complessivo obiettivi: ${overview.overallPercent}%`}
          >
            <circle
              cx={72}
              cy={72}
              r={r}
              fill="none"
              stroke="var(--theme-progress-track)"
              strokeWidth={12}
            />
            <circle
              cx={72}
              cy={72}
              r={r}
              fill="none"
              stroke="var(--chart-color-2)"
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 72 72)"
            />
            <text
              x={72}
              y={70}
              textAnchor="middle"
              fill="var(--theme-text)"
              fontSize={26}
              fontWeight={800}
              fontFamily="monospace"
            >
              {overview.overallPercent}%
            </text>
            <text
              x={72}
              y={90}
              textAnchor="middle"
              fill="var(--theme-text-muted)"
              fontSize={12.5}
              fontWeight={600}
            >
              Completato
            </text>
          </svg>
        </div>

        <div className="flex-1 w-full space-y-3 min-w-0">
          <div>
            <h3 className="text-base font-bold text-stone-900 font-display">
              Avanzamento Aggregato Risparmi di Coppia
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Riepilogo dei {overview.items.length} traguardi attivi e ritmo mensile consigliato
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="ds-subcard p-3.5">
              <div className="text-stone-500 font-medium">Risparmiati Finora</div>
              <div className="text-lg font-bold font-mono tabular-nums text-emerald-600 mt-0.5">
                {formatCurrency(overview.totalCurrent, currency)}
              </div>
              <div className="text-stone-500 mt-0.5 font-mono">
                su {formatCurrency(overview.totalTarget, currency)}
              </div>
            </div>

            <div className="ds-subcard p-3.5">
              <div className="text-stone-500 font-medium">Mancante ai Traguardi</div>
              <div className="text-lg font-bold font-mono tabular-nums text-stone-900 mt-0.5">
                {formatCurrency(overview.totalRemaining, currency)}
              </div>
              <div className="text-stone-500 mt-0.5">
                {overview.items.filter((item) => !item.isCompleted).length} da completare
              </div>
            </div>

            <div className="ds-subcard p-3.5">
              <div className="text-stone-500 font-medium">Sforzo Mensile Stimato</div>
              <div className="text-lg font-bold font-mono tabular-nums text-orange-600 mt-0.5">
                {formatCurrency(overview.totalMonthlyPace, currency)}/mese
              </div>
              <div className="text-stone-500 mt-0.5 font-mono">
                {formatCurrency(overview.totalMonthlyPace / 2, currency)}/mese a testa
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Runway sintetico per ciascun obiettivo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-stone-100">
        {overview.items.map((item) => {
          let badgeText = `${item.monthsLeft} mesi`;
          let badgeClass = 'bg-stone-500/10 text-stone-600 border-stone-500/20';

          if (item.isCompleted) {
            badgeText = 'Raggiunto';
            badgeClass = 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25';
          } else if (item.isOverdue) {
            badgeText = 'Scaduto';
            badgeClass = 'bg-rose-500/12 text-rose-700 border-rose-500/25';
          } else if (item.isUrgent) {
            badgeText = `Urgente · ${item.monthsLeft}m`;
            badgeClass = 'bg-amber-500/12 text-amber-700 border-amber-500/25';
          } else if (item.monthsLeft === null) {
            badgeText = 'Senza data';
          }

          return (
            <div
              key={item.goal.id}
              className="ds-subcard p-3 space-y-1.5 text-xs min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-stone-900 truncate">
                  {item.goal.title}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md font-mono font-semibold border shrink-0 ${badgeClass}`}
                >
                  {badgeText}
                </span>
              </div>

              <div className="flex items-center justify-between text-stone-500 font-mono tabular-nums">
                <span className="text-xs font-semibold">{item.percent}% completato</span>
                {item.monthlyPace !== null ? (
                  <span className="text-sm font-bold text-stone-900">
                    {formatCurrency(item.monthlyPace, currency)}/mese
                  </span>
                ) : (
                  <span>Imposta una scadenza</span>
                )}
              </div>

              {item.monthlyPace !== null && item.monthlyPace > 0 && (
                <div className="text-[11px] text-stone-500 font-mono">
                  {formatCurrency(item.monthlyPace / 2, currency)}/mese a testa · restano{' '}
                  {formatCurrency(item.remaining, currency)}
                </div>
              )}

              {(onQuickAddGoal || onEditGoal) && (
                <div className="flex items-center gap-1.5 pt-2 border-t border-stone-200/70">
                  {onQuickAddGoal && (
                    <>
                      <button
                        type="button"
                        onClick={() => onQuickAddGoal(item.goal, 50)}
                        className="ds-btn-secondary min-h-8 px-2 py-1 text-[11px] font-mono"
                      >
                        +€50
                      </button>
                      <button
                        type="button"
                        onClick={() => onQuickAddGoal(item.goal, 100)}
                        className="ds-btn-secondary min-h-8 px-2 py-1 text-[11px] font-mono"
                      >
                        +€100
                      </button>
                    </>
                  )}
                  {onEditGoal && (
                    <button
                      type="button"
                      onClick={() => onEditGoal(item.goal)}
                      className="ds-btn-secondary min-h-8 px-2.5 py-1 text-[11px] ml-auto"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Modifica</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
