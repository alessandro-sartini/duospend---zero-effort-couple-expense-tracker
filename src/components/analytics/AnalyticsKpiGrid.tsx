import React from 'react';
import {
  Calculator,
  CalendarClock,
  ChevronRight,
  Flame,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import {
  formatCompactCurrency,
  type PeriodComparisonResult,
} from '../../services/analytics-math';

const CELL_BASE_CLASS =
  'bg-[var(--theme-surface)] p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0 text-left';
const CELL_INTERACTIVE_CLASS =
  'bg-[var(--theme-surface)] hover:bg-stone-50/70 p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0 text-left transition-colors cursor-pointer';
const AMOUNT_VALUE_CLASS =
  'text-lg sm:text-xl font-bold font-mono tabular-nums text-stone-900 leading-tight truncate';

interface KpiCellProps {
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  onClick?: () => void;
  children: React.ReactNode;
}

/** Cella KPI: se `onClick` è presente diventa un pulsante con freccia di dettaglio. */
const KpiCell: React.FC<KpiCellProps> = ({
  label,
  icon: Icon,
  iconClassName,
  onClick,
  children,
}) => {
  const body = (
    <>
      <div className="flex items-center justify-between gap-1.5">
        <span className="inline-flex items-center gap-1.5 min-w-0 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          <Icon className={`w-3.5 h-3.5 ${iconClassName} shrink-0`} aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        {onClick && (
          <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" aria-hidden="true" />
        )}
      </div>
      {children}
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={CELL_INTERACTIVE_CLASS}>
      {body}
    </button>
  ) : (
    <div className={CELL_BASE_CLASS}>{body}</div>
  );
};

interface AnalyticsKpiGridProps {
  currency: string;
  totalSpent: number;
  filteredCount: number;
  activeDays: number;
  comparison: PeriodComparisonResult;
  topCategoryName: string;
  topCategoryTotal: number;
  topCategoryPercent: number;
  topCategoryColor: string;
  /** Presente solo se ci sono spese nel periodo filtrato. */
  onInspectAllExpenses?: () => void;
  /** Presente solo se esiste una categoria top. */
  onInspectTopCategory?: () => void;
}

export const AnalyticsKpiGrid: React.FC<AnalyticsKpiGridProps> = ({
  currency,
  totalSpent,
  filteredCount,
  activeDays,
  comparison,
  topCategoryName,
  topCategoryTotal,
  topCategoryPercent,
  topCategoryColor,
  onInspectAllExpenses,
  onInspectTopCategory,
}) => (
  <div className="ds-card overflow-hidden">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--theme-border-subtle)]">
      {/* Cella 1: Totale Spese */}
      <KpiCell
        label="Totale Spese"
        icon={Wallet}
        iconClassName="text-orange-600"
        onClick={onInspectAllExpenses}
      >
        <div className={AMOUNT_VALUE_CLASS}>{formatCurrency(totalSpent, currency)}</div>

        <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-stone-500">
          {comparison.deltaPercent !== null ? (
            <>
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-mono font-semibold tabular-nums shrink-0 ${
                  comparison.deltaPercent > 0
                    ? 'bg-rose-500/12 text-rose-700 border-rose-500/25'
                    : 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25'
                }`}
              >
                {comparison.deltaPercent >= 0 ? '+' : ''}
                {comparison.deltaPercent}%
              </span>
              <span className="truncate">{comparison.comparisonLabel}</span>
            </>
          ) : (
            <span className="truncate">{filteredCount} transazioni</span>
          )}
        </div>
      </KpiCell>

      {/* Cella 2: Categoria Top */}
      <KpiCell
        label="Categoria Top"
        icon={Flame}
        iconClassName="text-rose-500"
        onClick={onInspectTopCategory}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: topCategoryColor }}
            aria-hidden="true"
          />
          <span className="font-display font-bold text-lg sm:text-xl text-stone-900 leading-tight truncate">
            {topCategoryName}
          </span>
        </div>

        <div className="text-[11px] text-stone-500 font-mono tabular-nums truncate">
          {formatCompactCurrency(topCategoryTotal, currency)} ·{' '}
          {topCategoryPercent}%
        </div>
      </KpiCell>

      {/* Cella 3: Media / Spesa */}
      <KpiCell label="Media / Spesa" icon={Calculator} iconClassName="text-emerald-600">
        <div className={AMOUNT_VALUE_CLASS}>
          {formatCurrency(filteredCount > 0 ? totalSpent / filteredCount : 0, currency)}
        </div>
        <div className="text-[11px] text-stone-500 truncate">Su {filteredCount} voci</div>
      </KpiCell>

      {/* Cella 4: Media / Giorno */}
      <KpiCell label="Media / Giorno" icon={CalendarClock} iconClassName="text-blue-500">
        <div className={AMOUNT_VALUE_CLASS}>
          {formatCurrency(totalSpent / activeDays, currency)}
        </div>
        <div className="text-[11px] text-stone-500 truncate">Su {activeDays} giorni</div>
      </KpiCell>
    </div>
  </div>
);
