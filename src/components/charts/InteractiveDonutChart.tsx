import React, { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';

export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

interface InteractiveDonutChartProps {
  title: string;
  subtitle?: string;
  slices: DonutSlice[];
  currency: string;
  totalAmount: number;
  centerTopDefault: string;
  centerMainDefault: string;
  centerSubDefault: string;
  selectedId?: string | null;
  onSelectSlice?: (id: string | null) => void;
  onInspectSlice?: (sliceId: string) => void;
  inspectLabel?: string;
  emptyMessage?: string;
  className?: string;
}

export const InteractiveDonutChart: React.FC<InteractiveDonutChartProps> = ({
  title,
  subtitle,
  slices,
  currency,
  totalAmount,
  centerTopDefault,
  centerMainDefault,
  centerSubDefault,
  selectedId = null,
  onSelectSlice,
  onInspectSlice,
  inspectLabel,
  emptyMessage = 'Nessuna spesa disponibile per il periodo selezionato.',
  className = '',
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const activeSliceId = hoveredId ?? selectedId ?? null;
  const activeSlice = activeSliceId
    ? slices.find((slice) => slice.id === activeSliceId) ?? null
    : null;

  const size = 210;
  const cx = size / 2;
  const cy = size / 2;
  const r = 76;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * r;
  const safeTotal = totalAmount > 0 ? totalAmount : 1;

  const activePercent = activeSlice
    ? Math.round((activeSlice.value / safeTotal) * 100)
    : 0;

  const centerTop = activeSlice
    ? activeSlice.label.length > 15
      ? `${activeSlice.label.slice(0, 14)}…`
      : activeSlice.label
    : centerTopDefault;
  const centerMain = activeSlice
    ? formatCurrency(activeSlice.value, currency)
    : centerMainDefault;
  const centerSub = activeSlice ? `${activePercent}% del totale` : centerSubDefault;

  let accumulatedOffset = 0;

  const handleToggle = (id: string) => {
    if (!onSelectSlice) return;
    onSelectSlice(selectedId === id ? null : id);
  };

  return (
    <div className={`ds-card p-4 sm:p-6 space-y-4 min-w-0 flex flex-col justify-between ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-stone-900 font-display">{title}</h3>
          {subtitle && (
            <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
          )}
        </div>

        {onSelectSlice && selectedId && (
          <button
            type="button"
            onClick={() => onSelectSlice(null)}
            className="ds-btn-secondary min-h-8 px-2.5 py-1 text-xs shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>Mostra tutte</span>
          </button>
        )}
      </div>

      {slices.length === 0 || totalAmount <= 0 ? (
        <div className="ds-subcard p-6 text-center text-xs text-stone-500 my-auto">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center">
            <svg
              viewBox={`0 0 ${size} ${size}`}
              className="w-52 h-52 sm:w-56 sm:h-56 select-none"
              role="img"
              aria-label={title}
              onMouseLeave={() => setHoveredId(null)}
            >
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="var(--theme-border)"
                strokeWidth={strokeWidth}
                opacity={0.45}
              />

              {slices.map((slice) => {
                const ratio = slice.value / safeTotal;
                const gap = slices.length > 1 ? 2.2 : 0;
                const arcLen = Math.max(0, ratio * circumference - gap);
                const dashArray = `${arcLen} ${circumference}`;
                const dashOffset = -accumulatedOffset;
                accumulatedOffset += ratio * circumference;

                const isHighlighted = activeSliceId === slice.id;
                const isDimmed = Boolean(activeSliceId && activeSliceId !== slice.id);

                return (
                  <circle
                    key={slice.id}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={isHighlighted ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                    transform={`rotate(-90 ${cx} ${cy})`}
                    opacity={isDimmed ? 0.28 : 1}
                    className={onSelectSlice ? 'cursor-pointer transition-all duration-150' : 'transition-all duration-150'}
                    onMouseEnter={() => setHoveredId(slice.id)}
                    onClick={() =>
                      onSelectSlice ? handleToggle(slice.id) : setHoveredId(slice.id)
                    }
                  />
                );
              })}

              <text
                x={cx}
                y={cy - 18}
                textAnchor="middle"
                fill="var(--theme-text-muted)"
                fontSize={12.5}
                fontWeight={600}
              >
                {centerTop}
              </text>
              <text
                x={cx}
                y={cy + 8}
                textAnchor="middle"
                fill="var(--theme-text)"
                fontSize={22}
                fontWeight={800}
                fontFamily="monospace"
              >
                {centerMain}
              </text>
              <text
                x={cx}
                y={cy + 28}
                textAnchor="middle"
                fill="var(--theme-text-muted)"
                fontSize={13}
                fontWeight={600}
                fontFamily="monospace"
              >
                {centerSub}
              </text>
            </svg>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-stone-100 max-h-60 overflow-y-auto">
            {slices.map((slice) => {
              const pct = Math.round((slice.value / safeTotal) * 100);
              const isSelected = selectedId === slice.id;
              const isDimmed = Boolean(selectedId && !isSelected);

              return (
                <button
                  key={slice.id}
                  type="button"
                  onMouseEnter={() => setHoveredId(slice.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() =>
                    onSelectSlice
                      ? handleToggle(slice.id)
                      : setHoveredId((prev) => (prev === slice.id ? null : slice.id))
                  }
                  className={`w-full min-h-10 flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer border ${
                    isSelected
                      ? 'ds-subcard border-orange-500/45 font-semibold'
                      : 'border-transparent hover:bg-stone-50/70'
                  } ${isDimmed ? 'opacity-50' : 'opacity-100'}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-xs shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="truncate text-xs sm:text-sm text-stone-800 font-medium">
                      {slice.label}
                    </span>
                  </span>
                  <span className="text-sm font-mono tabular-nums shrink-0 text-stone-900 font-bold">
                    {formatCurrency(slice.value, currency)}{' '}
                    <span className="text-xs text-stone-500 font-semibold">({pct}%)</span>
                  </span>
                </button>
              );
            })}
          </div>

          {onInspectSlice && selectedId && (() => {
            const selectedSlice = slices.find((s) => s.id === selectedId);
            if (!selectedSlice) return null;
            return (
              <button
                type="button"
                onClick={() => onInspectSlice(selectedSlice.id)}
                className="ds-btn-primary w-full min-h-10 px-4 py-2 text-xs"
              >
                <span>{inspectLabel ?? `Vedi spese di ${selectedSlice.label}`}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            );
          })()}
        </div>
      )}
    </div>
  );
};
