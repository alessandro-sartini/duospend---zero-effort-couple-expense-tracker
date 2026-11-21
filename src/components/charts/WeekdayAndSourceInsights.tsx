import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { formatCurrency, SOURCE_META } from '../../constants/categories';
import {
  formatAxisCurrency,
  type SourceStat,
  type WeekdayStat,
} from '../../services/analytics-math';

interface WeekdayAndSourceInsightsProps {
  weekdays: WeekdayStat[];
  sources: SourceStat[];
  currency: string;
  totalTransactions: number;
  onInspectWeekday?: (weekday: WeekdayStat) => void;
  onInspectSource?: (source: SourceStat) => void;
}

const SOURCE_COLORS: Record<SourceStat['source'], string> = {
  gmail: 'var(--chart-color-3)',
  camera: 'var(--chart-color-1)',
  notification: 'var(--chart-color-4)',
  manual: 'var(--chart-color-2)',
  recurring: 'var(--chart-color-5, #10b981)',
};

export const WeekdayAndSourceInsights: React.FC<WeekdayAndSourceInsightsProps> = ({
  weekdays,
  sources,
  currency,
  totalTransactions,
  onInspectWeekday,
  onInspectSource,
}) => {
  const defaultDayIndex =
    weekdays.find((d) => d.isPeak)?.index ?? weekdays[0]?.index ?? 0;
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(defaultDayIndex);

  useEffect(() => {
    setSelectedDayIdx(defaultDayIndex);
  }, [defaultDayIndex]);

  const activeDay = weekdays[selectedDayIdx] ?? weekdays[0];
  const maxWeekday = Math.max(...weekdays.map((d) => d.total), 1);

  const w = 350;
  const h = 185;
  const padL = 10;
  const padR = 10;
  const padT = 28;
  const padB = 30;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const slotW = plotW / 7;
  const barW = Math.min(30, slotW * 0.58);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      {/* 1. Abitudini per Giorno della Settimana */}
      <div className="ds-card p-4 sm:p-6 space-y-4 min-w-0">
        <div>
          <h3 className="text-base font-bold text-stone-900 font-display">
            Abitudini per Giorno
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            {totalTransactions > 0 && activeDay
              ? `Tocca un giorno per i dettagli · Picco: ${
                  weekdays.find((d) => d.isPeak)?.fullLabel ?? activeDay.fullLabel
                }`
              : 'Distribuzione delle spese dal lunedì alla domenica'}
          </p>
        </div>

        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-auto select-none overflow-visible"
          role="img"
          aria-label="Spese per giorno della settimana"
        >
          {weekdays.map((day) => {
            const cx = padL + day.index * slotW + slotW / 2;
            const x = cx - barW / 2;
            const barH =
              day.total > 0 ? Math.max(4, (day.total / maxWeekday) * plotH) : 3;
            const y = padT + plotH - barH;
            const isSelected = selectedDayIdx === day.index;

            return (
              <g
                key={day.index}
                className="cursor-pointer"
                onMouseEnter={() => setSelectedDayIdx(day.index)}
                onClick={() => setSelectedDayIdx(day.index)}
              >
                <rect
                  x={padL + day.index * slotW}
                  y={padT}
                  width={slotW}
                  height={plotH}
                  fill="transparent"
                />

                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={6}
                  fill={
                    day.isPeak ? 'var(--chart-color-1)' : 'var(--chart-color-3)'
                  }
                  opacity={day.total === 0 ? 0.25 : isSelected || day.isPeak ? 1 : 0.65}
                />

                {day.total > 0 && (
                  <text
                    x={cx}
                    y={Math.max(15, y - 6)}
                    textAnchor="middle"
                    fill="var(--theme-text)"
                    fontSize={12.5}
                    fontFamily="monospace"
                    fontWeight={700}
                  >
                    {formatAxisCurrency(day.total, currency)}
                  </text>
                )}

                <text
                  x={cx}
                  y={h - 6}
                  textAnchor="middle"
                  fill={
                    isSelected || day.isPeak
                      ? 'var(--theme-text)'
                      : 'var(--theme-text-muted)'
                  }
                  fontSize={13.5}
                  fontWeight={700}
                >
                  {day.shortLabel}
                </text>
              </g>
            );
          })}
        </svg>

        {activeDay && (
          <div className="ds-subcard p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
            <div>
              <span className="font-bold text-stone-900 mr-2">
                {activeDay.fullLabel}
              </span>
              <span className="font-mono tabular-nums text-stone-700">
                <strong className="text-sm sm:text-base font-bold text-stone-900">
                  {formatCurrency(activeDay.total, currency)}
                </strong>{' '}
                <span className="text-xs text-stone-500">
                  ({activeDay.count === 1 ? '1 spesa' : `${activeDay.count} spese`})
                </span>
              </span>
            </div>

            {onInspectWeekday && activeDay.count > 0 && (
              <button
                type="button"
                onClick={() => onInspectWeekday(activeDay)}
                className="ds-btn-secondary min-h-9 px-3 py-1 text-xs shrink-0"
              >
                <span>
                  Vedi {activeDay.count}{' '}
                  {activeDay.count === 1 ? 'spesa' : 'spese'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. Fonti di Acquisizione */}
      <div className="ds-card p-4 sm:p-6 space-y-4 min-w-0 flex flex-col justify-between">
        <div>
          <h3 className="text-base font-bold text-stone-900 font-display">
            Fonti di Acquisizione
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Quota di spese catturate automaticamente rispetto all&apos;inserimento manuale
          </p>
        </div>

        <div className="space-y-4">
          <div className="progress-track flex h-3.5 w-full overflow-hidden rounded-full">
            {totalTransactions > 0 &&
              sources.map((stat) => {
                const width = (stat.count / totalTransactions) * 100;
                if (width <= 0) return null;
                return (
                  <div
                    key={stat.source}
                    style={{
                      width: `${width}%`,
                      backgroundColor: SOURCE_COLORS[stat.source],
                    }}
                    title={`${SOURCE_META[stat.source].label}: ${stat.count} spese (${stat.sharePercent}%)`}
                    className="h-full transition-all"
                  />
                );
              })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {sources.map((stat) => {
              const meta = SOURCE_META[stat.source];
              const Icon = meta.icon;
              const isInteractive = Boolean(onInspectSource && stat.count > 0);
              const content = (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border shrink-0 ${meta.badgeClass}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-900 truncate">
                        {meta.shortLabel}
                      </div>
                      <div className="text-xs text-stone-500 font-mono tabular-nums">
                        {stat.count} {stat.count === 1 ? 'spesa' : 'spese'} ·{' '}
                        {stat.sharePercent}%
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm font-bold font-mono text-stone-900 tabular-nums">
                      {formatCurrency(stat.total, currency)}
                    </span>
                    {isInteractive && (
                      <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                    )}
                  </div>
                </>
              );

              return isInteractive ? (
                <button
                  key={stat.source}
                  type="button"
                  onClick={() => onInspectSource?.(stat)}
                  className="ds-subcard p-3 flex items-center justify-between gap-3 text-xs text-left hover:border-orange-500/40 transition-colors cursor-pointer"
                >
                  {content}
                </button>
              ) : (
                <div
                  key={stat.source}
                  className="ds-subcard p-3 flex items-center justify-between gap-3 text-xs"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
