import React, { useEffect, useState } from 'react';
import { ArrowRight, Layers, Users } from 'lucide-react';
import { formatCurrency, getCategoryMeta } from '../../constants/categories';
import {
  formatAxisCurrency,
  formatCompactCurrency,
  type MonthlyTrendPoint,
} from '../../services/analytics-math';

interface MonthlyTrendBarChartProps {
  series: MonthlyTrendPoint[];
  monthlyBudget: number;
  currency: string;
  mode: 'partner' | 'category';
  onChangeMode: (mode: 'partner' | 'category') => void;
  userName: string;
  partnerName: string;
  topCategories: string[];
  onInspectMonth?: (point: MonthlyTrendPoint) => void;
}

export const MonthlyTrendBarChart: React.FC<MonthlyTrendBarChartProps> = ({
  series,
  monthlyBudget,
  currency,
  mode,
  onChangeMode,
  userName,
  partnerName,
  topCategories,
  onInspectMonth,
}) => {
  const defaultMonth =
    [...series].reverse().find((m) => m.inScope)?.ym ??
    series[series.length - 1]?.ym ??
    '';
  const [selectedYm, setSelectedYm] = useState<string>(defaultMonth);

  useEffect(() => {
    setSelectedYm(defaultMonth);
  }, [defaultMonth]);

  const activePoint =
    series.find((m) => m.ym === selectedYm) ?? series[series.length - 1] ?? null;

  const w = 370;
  const h = 225;
  const padL = 56;
  const padR = 14;
  const padT = 28;
  const padB = 30;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxTotal = Math.max(
    monthlyBudget > 0 ? monthlyBudget : 0,
    ...series.map((m) => m.total),
    100
  );
  const maxY = maxTotal * 1.15;
  const yForVal = (val: number) => padT + plotH - (val / maxY) * plotH;

  const slotW = plotW / Math.max(1, series.length);
  const barW = Math.min(34, slotW * 0.56);
  const yTicks = [0, 0.5, 1].map((ratio) => Math.round(maxY * ratio));

  const activeSegments = activePoint
    ? mode === 'partner'
      ? [
          {
            label: userName,
            value: activePoint.userPaid,
            color: 'var(--chart-color-1)',
          },
          {
            label: partnerName,
            value: activePoint.partnerPaid,
            color: 'var(--chart-color-2)',
          },
        ]
      : [
          ...topCategories.map((cat) => ({
            label: cat,
            value: activePoint.byCategory[cat] || 0,
            color: getCategoryMeta(cat).chartColor,
          })),
          ...(activePoint.otherTotal > 0
            ? [
                {
                  label: 'Altre',
                  value: activePoint.otherTotal,
                  color: 'var(--theme-text-subtle)',
                },
              ]
            : []),
        ].filter((seg) => seg.value > 0)
    : [];

  const budgetDelta =
    activePoint && monthlyBudget > 0
      ? Math.round((activePoint.total - monthlyBudget) * 100) / 100
      : null;

  return (
    <div className="ds-card p-4 sm:p-6 space-y-4 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-stone-900 font-display">
            Andamento Mensile vs Budget
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Budget {formatCompactCurrency(monthlyBudget, currency)} · Tocca un mese per i dettagli
          </p>
        </div>

        <div
          role="group"
          aria-label="Modalità suddivisione barre mensili"
          className="ds-nav-track grid grid-cols-2 gap-1 p-1 rounded-xl border border-stone-200/70 text-xs font-semibold w-full sm:w-auto sm:min-w-[220px] shrink-0"
        >
          <button
            type="button"
            onClick={() => onChangeMode('partner')}
            className={`min-h-9 px-3 py-1 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 ${
              mode === 'partner'
                ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-stone-200/70'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Users
              className={`w-3.5 h-3.5 shrink-0 ${
                mode === 'partner' ? 'text-orange-600' : 'text-stone-400'
              }`}
              aria-hidden="true"
            />
            <span>Partner</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeMode('category')}
            className={`min-h-9 px-3 py-1 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 ${
              mode === 'category'
                ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-stone-200/70'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Layers
              className={`w-3.5 h-3.5 shrink-0 ${
                mode === 'category' ? 'text-orange-600' : 'text-stone-400'
              }`}
              aria-hidden="true"
            />
            <span>Categorie</span>
          </button>
        </div>
      </div>

      <div className="w-full">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-auto select-none overflow-visible"
          role="img"
          aria-label="Grafico a barre andamento mensile"
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
                  strokeOpacity={0.55}
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

          {series.map((point, index) => {
            const cx = padL + index * slotW + slotW / 2;
            const x = cx - barW / 2;
            const isSelected = activePoint?.ym === point.ym;
            const opacity = point.inScope || isSelected ? 1 : 0.35;

            const segments =
              mode === 'partner'
                ? [
                    {
                      key: 'user',
                      value: point.userPaid,
                      color: 'var(--chart-color-1)',
                    },
                    {
                      key: 'partner',
                      value: point.partnerPaid,
                      color: 'var(--chart-color-2)',
                    },
                  ]
                : [
                    ...topCategories.map((cat) => ({
                      key: cat,
                      value: point.byCategory[cat] || 0,
                      color: getCategoryMeta(cat).chartColor,
                    })),
                    {
                      key: 'other',
                      value: point.otherTotal,
                      color: 'var(--theme-text-subtle)',
                    },
                  ];

            let cumulativeVal = 0;

            return (
              <g
                key={point.ym}
                opacity={opacity}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setSelectedYm(point.ym)}
                onClick={() => setSelectedYm(point.ym)}
              >
                <rect
                  x={padL + index * slotW}
                  y={padT}
                  width={slotW}
                  height={plotH}
                  fill="transparent"
                />

                {isSelected && (
                  <rect
                    x={x - 3}
                    y={padT}
                    width={barW + 6}
                    height={plotH}
                    rx={6}
                    fill="var(--theme-border)"
                    fillOpacity={0.18}
                  />
                )}

                {segments
                  .filter((seg) => seg.value > 0)
                  .map((seg) => {
                    const segH = Math.max(1.5, (seg.value / maxY) * plotH);
                    const rectY = yForVal(cumulativeVal + seg.value);
                    cumulativeVal += seg.value;
                    return (
                      <rect
                        key={seg.key}
                        x={x}
                        y={rectY}
                        width={barW}
                        height={segH}
                        rx={2}
                        fill={seg.color}
                      />
                    );
                  })}

                {point.total > 0 && (
                  <text
                    x={cx}
                    y={Math.max(15, yForVal(point.total) - 7)}
                    textAnchor="middle"
                    fill="var(--theme-text)"
                    fontSize={12.5}
                    fontFamily="monospace"
                    fontWeight={700}
                  >
                    {formatAxisCurrency(point.total, currency)}
                  </text>
                )}

                <text
                  x={cx}
                  y={h - 6}
                  textAnchor="middle"
                  fill={
                    isSelected
                      ? 'var(--theme-text)'
                      : 'var(--theme-text-muted)'
                  }
                  fontSize={13.5}
                  fontWeight={isSelected || point.inScope ? 700 : 600}
                >
                  {point.shortLabel}
                </text>
              </g>
            );
          })}

          {monthlyBudget > 0 && (() => {
            const budgetY = yForVal(monthlyBudget);
            const budgetLabel = `Budget ${formatAxisCurrency(monthlyBudget, currency)}`;
            const pillW = Math.max(88, budgetLabel.length * 7.6 + 10);
            const pillY = Math.max(2, budgetY - 21);
            return (
              <g pointerEvents="none">
                <line
                  x1={padL}
                  y1={budgetY}
                  x2={w - padR}
                  y2={budgetY}
                  stroke="var(--theme-progress-danger)"
                  strokeWidth={1.8}
                  strokeDasharray="5 4"
                />
                <rect
                  x={w - padR - pillW}
                  y={pillY}
                  width={pillW}
                  height={17}
                  rx={4}
                  fill="var(--theme-surface)"
                  opacity={0.92}
                />
                <text
                  x={w - padR - 4}
                  y={pillY + 12.5}
                  textAnchor="end"
                  fill="var(--theme-progress-danger)"
                  fontSize={12.5}
                  fontWeight={700}
                  fontFamily="monospace"
                >
                  {budgetLabel}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Barra ispezione in-card per il mese attivo */}
      {activePoint && (
        <div className="ds-subcard p-3.5 space-y-2 text-xs sm:text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-stone-900">
              {activePoint.fullLabel}{' '}
              <span className="text-xs text-stone-500 font-normal">
                ({activePoint.count} spese)
              </span>
            </span>
            <div className="flex items-center gap-2 font-mono tabular-nums">
              <strong className="text-sm sm:text-base font-bold text-stone-900">
                {formatCurrency(activePoint.total, currency)}
              </strong>
              {budgetDelta !== null && (
                <span
                  className={`text-xs sm:text-sm font-bold ${
                    budgetDelta > 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  ({budgetDelta >= 0 ? '+' : ''}
                  {formatCompactCurrency(budgetDelta, currency)} vs budget)
                </span>
              )}
            </div>
          </div>

          {activeSegments.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-stone-200/70 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {activeSegments.map((seg) => (
                  <span key={seg.label} className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-stone-600">{seg.label}:</span>
                    <span className="font-mono text-sm font-bold text-stone-900 tabular-nums">
                      {formatCurrency(seg.value, currency)}
                    </span>
                  </span>
                ))}
              </div>

              {onInspectMonth && activePoint.count > 0 && (
                <button
                  type="button"
                  onClick={() => onInspectMonth(activePoint)}
                  className="ds-btn-secondary min-h-9 px-3 py-1 text-xs shrink-0 ml-auto"
                >
                  <span>
                    Vedi {activePoint.count}{' '}
                    {activePoint.count === 1 ? 'spesa' : 'spese'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
