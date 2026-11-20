import React, { useEffect, useId, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import {
  formatAxisCurrency,
  formatCompactCurrency,
  type MonthlyPartnerPoint,
  type NetBalanceTimelinePoint,
  type SettlementChartRange,
} from '../../services/analytics-math';
import type { CoupleProfile } from '../../types';

interface NetBalanceTimelineChartProps {
  timeline: NetBalanceTimelinePoint[];
  monthlyPartner: MonthlyPartnerPoint[];
  profile: Pick<CoupleProfile, 'userName' | 'partnerName' | 'currency'>;
  range: SettlementChartRange;
  onChangeRange: (range: SettlementChartRange) => void;
  onInspectTimelinePoint?: (point: NetBalanceTimelinePoint) => void;
  onInspectMonth?: (point: MonthlyPartnerPoint) => void;
}

const RANGE_OPTIONS: Array<{ id: SettlementChartRange; label: string }> = [
  { id: '3m', label: '3 mesi' },
  { id: '6m', label: '6 mesi' },
  { id: 'all', label: 'Tutto' },
];

export const NetBalanceTimelineChart: React.FC<NetBalanceTimelineChartProps> = ({
  timeline,
  monthlyPartner,
  profile,
  range,
  onChangeRange,
  onInspectTimelinePoint,
  onInspectMonth,
}) => {
  const uid = useId().replace(/:/g, '');
  const clipPosId = `nb-pos-${uid}`;
  const clipNegId = `nb-neg-${uid}`;

  const [selectedPointIdx, setSelectedPointIdx] = useState<number>(
    Math.max(0, timeline.length - 1)
  );
  const [selectedMonthYm, setSelectedMonthYm] = useState<string>(
    monthlyPartner[monthlyPartner.length - 1]?.ym ?? ''
  );

  useEffect(() => {
    setSelectedPointIdx(Math.max(0, timeline.length - 1));
  }, [timeline.length, range]);

  useEffect(() => {
    setSelectedMonthYm(monthlyPartner[monthlyPartner.length - 1]?.ym ?? '');
  }, [monthlyPartner]);

  const activePoint =
    timeline[selectedPointIdx] ?? timeline[timeline.length - 1] ?? null;
  const activeMonth =
    monthlyPartner.find((m) => m.ym === selectedMonthYm) ??
    monthlyPartner[monthlyPartner.length - 1] ??
    null;

  // Timeline SVG geometry
  const tw = 370;
  const th = 220;
  const tPadL = 58;
  const tPadR = 14;
  const tPadT = 22;
  const tPadB = 30;
  const tPlotW = tw - tPadL - tPadR;
  const tPlotH = th - tPadT - tPadB;

  const maxAbsBalance =
    Math.max(50, ...timeline.map((p) => Math.abs(p.balance))) * 1.18;
  const yZero = tPadT + tPlotH / 2;
  const yForBal = (bal: number) => yZero - (bal / maxAbsBalance) * (tPlotH / 2);
  const xForIdx = (idx: number) =>
    timeline.length <= 1
      ? tPadL + tPlotW / 2
      : tPadL + (idx / (timeline.length - 1)) * tPlotW;

  const polyPoints = timeline
    .map((pt, i) => `${xForIdx(i).toFixed(1)},${yForBal(pt.balance).toFixed(1)}`)
    .join(' ');
  const areaPoints =
    timeline.length > 0
      ? [
          `${xForIdx(0).toFixed(1)},${yZero.toFixed(1)}`,
          ...timeline.map(
            (pt, i) => `${xForIdx(i).toFixed(1)},${yForBal(pt.balance).toFixed(1)}`
          ),
          `${xForIdx(timeline.length - 1).toFixed(1)},${yZero.toFixed(1)}`,
        ].join(' ')
      : '';

  const hitWidth = timeline.length > 1 ? tPlotW / timeline.length : tPlotW;

  // Paired bars SVG geometry
  const pw = 370;
  const ph = 215;
  const pPadL = 56;
  const pPadR = 14;
  const pPadT = 20;
  const pPadB = 30;
  const pPlotW = pw - pPadL - pPadR;
  const pPlotH = ph - pPadT - pPadB;

  const maxPaired =
    Math.max(
      100,
      ...monthlyPartner.flatMap((m) => [m.userPaid, m.partnerPaid])
    ) * 1.15;
  const yPaired = (val: number) => pPadT + pPlotH - (val / maxPaired) * pPlotH;
  const pSlotW = pPlotW / Math.max(1, monthlyPartner.length);
  const pairBarW = Math.min(18, pSlotW * 0.28);

  return (
    <div className="space-y-6">
      {/* Filtro Periodo per i Grafici Pareggio */}
      <div className="ds-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-stone-900 font-display">
            Analisi Storica del Saldo e Contributi
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Visualizza come evolve il saldo nel tempo e chi anticipa di più mese per mese
          </p>
        </div>

        <div
          role="group"
          aria-label="Periodo grafici pareggio"
          className="ds-nav-track grid grid-cols-3 gap-1 p-1 rounded-xl border border-stone-200/70 text-xs font-semibold w-full sm:w-auto shrink-0"
        >
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChangeRange(opt.id)}
              className={`min-h-9 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                range === opt.id
                  ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-stone-200/70'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grafico 3A: Area Divergente Saldo Netto */}
      <div className="ds-card p-4 sm:p-6 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-stone-900 font-display">
              Evoluzione Saldo Netto nel Tempo
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Sopra €0: {profile.partnerName} ti deve · Sotto €0: devi a{' '}
              {profile.partnerName} · Anelli verdi = rimborsi
            </p>
          </div>
        </div>

        {timeline.length === 0 ? (
          <div className="ds-subcard p-6 text-center text-xs text-stone-500">
            Registra almeno una spesa o un rimborso per vedere la curva del saldo.
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${tw} ${th}`}
              className="w-full h-auto select-none overflow-visible"
              role="img"
              aria-label="Evoluzione del saldo netto tra partner nel tempo"
            >
              <defs>
                <clipPath id={clipPosId}>
                  <rect x={tPadL} y={tPadT} width={tPlotW} height={tPlotH / 2} />
                </clipPath>
                <clipPath id={clipNegId}>
                  <rect x={tPadL} y={yZero} width={tPlotW} height={tPlotH / 2} />
                </clipPath>
              </defs>

              {[-1, 0, 1].map((mult) => {
                const val = maxAbsBalance * mult;
                const y = yForBal(val);
                return (
                  <g key={mult}>
                    <line
                      x1={tPadL}
                      y1={y}
                      x2={tw - tPadR}
                      y2={y}
                      stroke="var(--theme-border)"
                      strokeOpacity={mult === 0 ? 0.95 : 0.45}
                      strokeDasharray={mult === 0 ? undefined : '3 3'}
                      strokeWidth={mult === 0 ? 1.5 : 1}
                    />
                    <text
                      x={tPadL - 8}
                      y={y + 4.5}
                      textAnchor="end"
                      fill={
                        mult === 0
                          ? 'var(--theme-text)'
                          : 'var(--theme-text-muted)'
                      }
                      fontSize={13}
                      fontFamily="monospace"
                      fontWeight={mult === 0 ? 700 : 600}
                    >
                      {mult === 0
                        ? '€0 Pari'
                        : formatAxisCurrency(val, profile.currency)}
                    </text>
                  </g>
                );
              })}

              <polygon
                points={areaPoints}
                fill="var(--chart-color-2)"
                fillOpacity={0.22}
                clipPath={`url(#${clipPosId})`}
              />
              <polygon
                points={areaPoints}
                fill="var(--chart-color-1)"
                fillOpacity={0.22}
                clipPath={`url(#${clipNegId})`}
              />
              <polyline
                points={polyPoints}
                fill="none"
                stroke="var(--theme-text)"
                strokeWidth={2}
                strokeLinejoin="round"
              />

              {/* Etichette data estreme */}
              <text
                x={tPadL}
                y={th - 6}
                textAnchor="start"
                fill="var(--theme-text-muted)"
                fontSize={12.5}
                fontWeight={600}
                fontFamily="monospace"
              >
                {timeline[0].date}
              </text>
              {timeline.length > 1 && (
                <text
                  x={tw - tPadR}
                  y={th - 6}
                  textAnchor="end"
                  fill="var(--theme-text-muted)"
                  fontSize={12.5}
                  fontWeight={600}
                  fontFamily="monospace"
                >
                  {timeline[timeline.length - 1].date}
                </text>
              )}

              {/* Crosshair punto selezionato */}
              {activePoint && (
                <>
                  <line
                    x1={xForIdx(selectedPointIdx)}
                    y1={tPadT}
                    x2={xForIdx(selectedPointIdx)}
                    y2={tPadT + tPlotH}
                    stroke="var(--theme-text-muted)"
                    strokeOpacity={0.45}
                    strokeDasharray="2 2"
                    pointerEvents="none"
                  />
                  <circle
                    cx={xForIdx(selectedPointIdx)}
                    cy={yForBal(activePoint.balance)}
                    r={4.5}
                    fill={
                      activePoint.balance >= 0
                        ? 'var(--chart-color-2)'
                        : 'var(--chart-color-1)'
                    }
                    stroke="var(--theme-surface)"
                    strokeWidth={2}
                    pointerEvents="none"
                  />
                </>
              )}

              {/* Indicatori pareggi */}
              {timeline.map((pt, idx) =>
                pt.isSettlement ? (
                  <g key={pt.id} pointerEvents="none">
                    <circle
                      cx={xForIdx(idx)}
                      cy={yForBal(pt.balance)}
                      r={5.5}
                      fill="var(--theme-surface)"
                      stroke="var(--chart-color-2)"
                      strokeWidth={2.2}
                    />
                    <circle
                      cx={xForIdx(idx)}
                      cy={yForBal(pt.balance)}
                      r={2}
                      fill="var(--chart-color-2)"
                    />
                  </g>
                ) : null
              )}

              {/* Zone touch / hover */}
              {timeline.map((pt, idx) => (
                <rect
                  key={`${pt.id}-hit`}
                  x={xForIdx(idx) - hitWidth / 2}
                  y={tPadT}
                  width={Math.max(hitWidth, 8)}
                  height={tPlotH}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setSelectedPointIdx(idx)}
                  onClick={() => setSelectedPointIdx(idx)}
                />
              ))}
            </svg>

            {activePoint && (
              <div className="ds-subcard p-3.5 space-y-2 text-xs sm:text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-stone-500 mr-2">
                      {activePoint.date}
                    </span>
                    <strong className="text-stone-900">{activePoint.title}</strong>
                    {activePoint.note && (
                      <span className="text-xs text-stone-500 ml-2 hidden sm:inline">
                        · {activePoint.note}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-sm sm:text-base font-mono font-bold tabular-nums shrink-0 ${
                      activePoint.balance > 0.01
                        ? 'text-emerald-600'
                        : activePoint.balance < -0.01
                          ? 'text-orange-600'
                          : 'text-stone-700'
                    }`}
                  >
                    Saldo: {activePoint.balance > 0 ? '+' : ''}
                    {formatCurrency(activePoint.balance, profile.currency)}
                  </span>
                </div>

                {onInspectTimelinePoint &&
                  activePoint.id !== 'start' &&
                  activePoint.id !== 'window-carry' &&
                  activePoint.id !== 'window-end' && (
                    <div className="flex justify-end pt-1.5 border-t border-stone-200/70">
                      <button
                        type="button"
                        onClick={() => onInspectTimelinePoint(activePoint)}
                        className="ds-btn-secondary min-h-9 px-3 py-1 text-xs"
                      >
                        <span>Dettaglio giorno</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Grafico 3B: Confronto Anticipi Mensili */}
      <div className="ds-card p-4 sm:p-6 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-stone-900 font-display">
              Confronto Anticipi Mensili
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Totale anticipato direttamente da ciascun partner mese per mese
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs shrink-0">
            <span className="inline-flex items-center gap-1.5 text-stone-700 font-medium">
              <span
                className="w-2.5 h-2.5 rounded-xs"
                style={{ backgroundColor: 'var(--chart-color-1)' }}
              />
              {profile.userName}
            </span>
            <span className="inline-flex items-center gap-1.5 text-stone-700 font-medium">
              <span
                className="w-2.5 h-2.5 rounded-xs"
                style={{ backgroundColor: 'var(--chart-color-2)' }}
              />
              {profile.partnerName}
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${pw} ${ph}`}
          className="w-full h-auto select-none overflow-visible"
          role="img"
          aria-label="Confronto anticipi mensili tra partner"
        >
          {[0, 0.5, 1].map((ratio) => {
            const val = Math.round(maxPaired * ratio);
            const y = yPaired(val);
            return (
              <g key={ratio}>
                <line
                  x1={pPadL}
                  y1={y}
                  x2={pw - pPadR}
                  y2={y}
                  stroke="var(--theme-border)"
                  strokeOpacity={0.55}
                  strokeDasharray="3 3"
                />
                <text
                  x={pPadL - 8}
                  y={y + 4.5}
                  textAnchor="end"
                  fill="var(--theme-text-muted)"
                  fontSize={13.5}
                  fontWeight={600}
                  fontFamily="monospace"
                >
                  {formatAxisCurrency(val, profile.currency)}
                </text>
              </g>
            );
          })}

          {monthlyPartner.map((m, idx) => {
            const cx = pPadL + idx * pSlotW + pSlotW / 2;
            const userH =
              m.userPaid > 0 ? Math.max(3, (m.userPaid / maxPaired) * pPlotH) : 2;
            const partnerH =
              m.partnerPaid > 0
                ? Math.max(3, (m.partnerPaid / maxPaired) * pPlotH)
                : 2;
            const isSelected = activeMonth?.ym === m.ym;

            return (
              <g
                key={m.ym}
                className="cursor-pointer"
                onMouseEnter={() => setSelectedMonthYm(m.ym)}
                onClick={() => setSelectedMonthYm(m.ym)}
              >
                <rect
                  x={pPadL + idx * pSlotW}
                  y={pPadT}
                  width={pSlotW}
                  height={pPlotH}
                  fill={isSelected ? 'var(--theme-border)' : 'transparent'}
                  fillOpacity={isSelected ? 0.16 : 0}
                  rx={6}
                />

                <rect
                  x={cx - pairBarW - 2}
                  y={pPadT + pPlotH - userH}
                  width={pairBarW}
                  height={userH}
                  rx={3}
                  fill="var(--chart-color-1)"
                />
                <rect
                  x={cx + 2}
                  y={pPadT + pPlotH - partnerH}
                  width={pairBarW}
                  height={partnerH}
                  rx={3}
                  fill="var(--chart-color-2)"
                />

                <text
                  x={cx}
                  y={ph - 6}
                  textAnchor="middle"
                  fill={
                    isSelected
                      ? 'var(--theme-text)'
                      : 'var(--theme-text-muted)'
                  }
                  fontSize={13.5}
                  fontWeight={isSelected ? 700 : 600}
                >
                  {m.shortLabel}
                </text>
              </g>
            );
          })}
        </svg>

        {activeMonth && (
          <div className="ds-subcard p-3.5 space-y-2 text-xs sm:text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-stone-900">{activeMonth.fullLabel}</span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums">
                <span>
                  <span className="text-stone-500 font-sans text-xs">
                    {profile.userName}:{' '}
                  </span>
                  <strong className="text-sm sm:text-base font-bold text-stone-900">
                    {formatCurrency(activeMonth.userPaid, profile.currency)}
                  </strong>
                </span>
                <span>
                  <span className="text-stone-500 font-sans text-xs">
                    {profile.partnerName}:{' '}
                  </span>
                  <strong className="text-sm sm:text-base font-bold text-stone-900">
                    {formatCurrency(activeMonth.partnerPaid, profile.currency)}
                  </strong>
                </span>
                <span className="text-xs sm:text-sm font-semibold text-stone-600">
                  Diff: {activeMonth.difference >= 0 ? '+' : ''}
                  {formatCompactCurrency(activeMonth.difference, profile.currency)}
                </span>
              </div>
            </div>

            {onInspectMonth &&
              (activeMonth.userPaid > 0 || activeMonth.partnerPaid > 0) && (
                <div className="flex justify-end pt-1.5 border-t border-stone-200/70">
                  <button
                    type="button"
                    onClick={() => onInspectMonth(activeMonth)}
                    className="ds-btn-secondary min-h-9 px-3 py-1 text-xs"
                  >
                    <span>Vedi movimenti</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
};
