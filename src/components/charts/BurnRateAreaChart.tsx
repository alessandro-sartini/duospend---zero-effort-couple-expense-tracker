import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import {
  formatAxisCurrency,
  formatCompactCurrency,
  type MonthlyBurnRateSummary,
  type SplitFilter,
} from '../../services/analytics-math';
import { ProgressBar } from '../ProgressBar';

interface BurnRateAreaChartProps {
  burnRate: MonthlyBurnRateSummary;
  currency: string;
  splitFilter: SplitFilter;
  onChangeSplitFilter: (filter: SplitFilter) => void;
  onNavigateToAnalytics: () => void;
  onDoubleClickBudget?: () => void;
  onInspectDay?: (day: number, mode: 'day' | 'month') => void;
  dayExpenseCounts?: Record<number, number>;
}

const SPLIT_OPTIONS: Array<{ id: SplitFilter; label: string }> = [
  { id: 'all', label: 'Tutte' },
  { id: 'shared', label: 'Condivise' },
  { id: 'personal', label: 'Personali' },
];

export const BurnRateAreaChart: React.FC<BurnRateAreaChartProps> = ({
  burnRate,
  currency,
  splitFilter,
  onChangeSplitFilter,
  onNavigateToAnalytics,
  onDoubleClickBudget,
  onInspectDay,
  dayExpenseCounts,
}) => {
  const [selectedDay, setSelectedDay] = useState<number>(burnRate.currentDay);

  useEffect(() => {
    setSelectedDay(burnRate.currentDay);
  }, [burnRate.currentDay, splitFilter]);

  const activePoint =
    burnRate.points.find((p) => p.day === selectedDay) ??
    burnRate.points[burnRate.currentDay - 1] ??
    burnRate.points[0];

  const isProjectedDay = Boolean(activePoint && activePoint.day > burnRate.currentDay);
  const activeSpend = activePoint
    ? isProjectedDay
      ? activePoint.projected ?? 0
      : activePoint.cumulative ?? 0
    : 0;
  const activeDelta = Math.round((activeSpend - (activePoint?.ideal ?? 0)) * 100) / 100;

  const w = 370;
  const h = 205;
  const padL = 56;
  const padR = 14;
  const padT = 20;
  const padB = 30;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxY =
    Math.max(
      burnRate.budgetGoal,
      burnRate.projectedEndOfMonth,
      burnRate.currentTotal,
      100
    ) * 1.12;

  const xForDay = (day: number) => padL + (day / burnRate.daysInMonth) * plotW;
  const yForVal = (val: number) => padT + plotH - (val / maxY) * plotH;

  const actualCoords: string[] = [`${xForDay(0).toFixed(1)},${yForVal(0).toFixed(1)}`];
  for (const pt of burnRate.points) {
    if (pt.day <= burnRate.currentDay && pt.cumulative !== null) {
      actualCoords.push(`${xForDay(pt.day).toFixed(1)},${yForVal(pt.cumulative).toFixed(1)}`);
    }
  }

  const areaCoords = [
    `${xForDay(0).toFixed(1)},${yForVal(0).toFixed(1)}`,
    ...actualCoords.slice(1),
    `${xForDay(burnRate.currentDay).toFixed(1)},${yForVal(0).toFixed(1)}`,
  ].join(' ');

  const yTicks = [0, 0.5, 1].map((ratio) => Math.round(maxY * ratio));
  const xTicks = Array.from(
    new Set([1, 10, 20, burnRate.daysInMonth].filter((d) => d <= burnRate.daysInMonth))
  ).sort((a, b) => a - b);

  const isOverPace = burnRate.projectedDelta > 0;
  const projectionColor = isOverPace
    ? 'var(--theme-progress-danger)'
    : 'var(--chart-color-2)';

  const activeX = activePoint ? xForDay(activePoint.day) : xForDay(burnRate.currentDay);
  const activeY = yForVal(activeSpend);
  const colWidth = plotW / Math.max(1, burnRate.daysInMonth);

  return (
    <div className="ds-card p-4 sm:p-6 space-y-4 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-stone-900 font-display">
            Andamento Spese del Mese
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            {burnRate.monthLabel} · Obiettivo {formatCurrency(burnRate.budgetGoal, currency)}
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateToAnalytics}
          className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer shrink-0 self-start"
        >
          <span>Tutti i Trend</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Controlli rapidi mobile-first: Filtro natura spesa + badge proiezione */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div
          role="group"
          aria-label="Filtra spese mensili per tipo"
          className="ds-nav-track grid grid-cols-3 gap-1 p-1 rounded-xl border border-stone-200/70 text-xs font-semibold"
        >
          {SPLIT_OPTIONS.map((opt) => {
            const active = splitFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeSplitFilter(opt.id)}
                className={`min-h-9 px-2.5 py-1 rounded-lg transition-all text-center cursor-pointer ${
                  active
                    ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-orange-500/30'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <span
          className={`inline-flex items-center justify-center sm:justify-start rounded-xl px-2.5 py-1.5 text-xs font-mono font-semibold tabular-nums border ${
            isOverPace
              ? 'bg-rose-500/12 text-rose-700 border-rose-500/25'
              : 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25'
          }`}
        >
          Stima fine mese: {formatCompactCurrency(burnRate.projectedEndOfMonth, currency)} (
          {burnRate.projectedDelta >= 0 ? '+' : ''}
          {formatCompactCurrency(burnRate.projectedDelta, currency)})
        </span>
      </div>

      {/* Grafico SVG Cumulata + Proiezione */}
      <div className="w-full">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-auto select-none overflow-visible"
          role="img"
          aria-label={`Andamento cumulato spese di ${burnRate.monthLabel}`}
          onMouseLeave={() => setSelectedDay(burnRate.currentDay)}
        >
          {yTicks.map((tick) => {
            const y = yForVal(tick);
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={w - padR}
                  y2={y}
                  stroke="var(--theme-border)"
                  strokeOpacity={0.6}
                  strokeDasharray="3 3"
                />
                <text
                  x={padL - 8}
                  y={y + 4.5}
                  textAnchor="end"
                  fill="var(--theme-text-muted)"
                  fontSize={13.5}
                  fontWeight={600}
                  fontFamily="monospace"
                >
                  {formatAxisCurrency(tick, currency)}
                </text>
              </g>
            );
          })}

          {xTicks.map((day) => (
            <text
              key={day}
              x={xForDay(day)}
              y={h - 6}
              textAnchor="middle"
              fill="var(--theme-text-muted)"
              fontSize={13.5}
              fontWeight={600}
              fontFamily="monospace"
            >
              {day}
            </text>
          ))}

          {/* Linea ritmo ideale lineare */}
          <line
            x1={xForDay(0)}
            y1={yForVal(0)}
            x2={xForDay(burnRate.daysInMonth)}
            y2={yForVal(burnRate.budgetGoal)}
            stroke="var(--theme-text-subtle)"
            strokeWidth={1.75}
            strokeDasharray="5 4"
            opacity={0.8}
          />

          {/* Proiezione da oggi a fine mese */}
          {burnRate.currentDay < burnRate.daysInMonth && (
            <>
              <line
                x1={xForDay(burnRate.currentDay)}
                y1={yForVal(burnRate.currentTotal)}
                x2={xForDay(burnRate.daysInMonth)}
                y2={yForVal(burnRate.projectedEndOfMonth)}
                stroke={projectionColor}
                strokeWidth={2.2}
                strokeDasharray="4 4"
              />
              <circle
                cx={xForDay(burnRate.daysInMonth)}
                cy={yForVal(burnRate.projectedEndOfMonth)}
                r={4}
                fill={projectionColor}
              />
            </>
          )}

          {/* Area + Curva reale */}
          <polygon
            points={areaCoords}
            fill="var(--chart-color-1)"
            fillOpacity={0.18}
          />
          <polyline
            points={actualCoords.join(' ')}
            fill="none"
            stroke="var(--chart-color-1)"
            strokeWidth={2.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Crosshair giorno selezionato */}
          <line
            x1={activeX}
            y1={padT}
            x2={activeX}
            y2={padT + plotH}
            stroke="var(--theme-text-muted)"
            strokeOpacity={0.45}
            strokeDasharray="2 2"
            pointerEvents="none"
          />
          <circle
            cx={activeX}
            cy={activeY}
            r={4.5}
            fill={isProjectedDay ? projectionColor : 'var(--chart-color-1)'}
            stroke="var(--theme-surface)"
            strokeWidth={2}
            pointerEvents="none"
          />

          {/* Colonne interattive touch/hover */}
          {burnRate.points.map((pt) => (
            <rect
              key={pt.day}
              x={xForDay(pt.day) - colWidth / 2}
              y={padT}
              width={Math.max(colWidth, 6)}
              height={plotH}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setSelectedDay(pt.day)}
              onClick={() => setSelectedDay(pt.day)}
            />
          ))}
        </svg>
      </div>

      {/* Barra ispezione in-card (touch-safe su smartphone) */}
      {activePoint && (() => {
        const dayCount = dayExpenseCounts?.[activePoint.day] ?? 0;
        const canInspectDay = !isProjectedDay && activePoint.dailyAdded > 0;
        const canInspectMonth = burnRate.currentTotal > 0;

        return (
          <div className="ds-subcard p-3.5 space-y-2.5 text-xs sm:text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-stone-800">
                Giorno {activePoint.day}
                {activePoint.day === burnRate.currentDay
                  ? ' (Oggi)'
                  : isProjectedDay
                    ? ' (Stima)'
                    : ''}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums">
                <span>
                  <span className="text-stone-500 font-sans text-xs">
                    {isProjectedDay ? 'Stima: ' : 'Speso: '}
                  </span>
                  <strong className="text-sm sm:text-base font-bold text-stone-900">
                    {formatCurrency(activeSpend, currency)}
                  </strong>
                </span>
                <span className="text-xs sm:text-sm text-stone-500">
                  Ideale {formatCompactCurrency(activePoint.ideal, currency)}
                </span>
                <span
                  className={`text-sm font-bold ${
                    activeDelta > 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {activeDelta >= 0 ? '+' : ''}
                  {formatCurrency(activeDelta, currency)}
                </span>
              </div>
            </div>

            {onInspectDay && (canInspectDay || canInspectMonth) && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-200/70">
                <span className="text-xs text-stone-500">
                  {canInspectDay
                    ? `${formatCurrency(activePoint.dailyAdded, currency)} spesi in questo giorno`
                    : 'Nessuna spesa registrata in questo giorno'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onInspectDay(
                      activePoint.day,
                      canInspectDay ? 'day' : 'month'
                    )
                  }
                  className="ds-btn-secondary min-h-9 px-3 py-1 text-xs shrink-0"
                >
                  <span>
                    {canInspectDay
                      ? `Vedi spese giorno ${activePoint.day}${dayCount > 0 ? ` (${dayCount})` : ''}`
                      : 'Vedi spese del mese'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Barra riepilogo budget mensile con scorciatoia doppio clic */}
      <div
        onDoubleClick={onDoubleClickBudget}
        title="Doppio clic per modificare budget mensile e profilo"
        className="ds-subcard p-3.5 space-y-2 cursor-pointer"
      >
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-bold text-lg font-mono text-stone-900 tabular-nums">
            {formatCurrency(burnRate.currentTotal, currency)}{' '}
            <span className="text-xs font-sans font-normal text-stone-500">
              su {formatCompactCurrency(burnRate.budgetGoal, currency)}
            </span>
          </span>
          <span
            className={`font-bold font-mono text-sm px-2.5 py-0.5 rounded-md ${
              burnRate.budgetPercentage > 90
                ? 'bg-rose-500/12 text-rose-600'
                : 'bg-orange-500/12 text-orange-700'
            }`}
          >
            {burnRate.budgetPercentage}%
          </span>
        </div>
        <ProgressBar
          value={Math.min(100, burnRate.budgetPercentage)}
          size="md"
          variant={burnRate.budgetPercentage > 90 ? 'danger' : 'default'}
          label="Obiettivo mensile utilizzato"
        />
      </div>
    </div>
  );
};
