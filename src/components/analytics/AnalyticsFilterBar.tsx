import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import type {
  AnalyticsTimeframe,
  PayerFilter,
  SplitFilter,
} from '../../services/analytics-math';

export interface AnalyticsTimeframeOption {
  id: AnalyticsTimeframe;
  shortLabel: string;
  fullLabel: string;
}

const SPLIT_FILTERS: Array<{ id: SplitFilter; label: string }> = [
  { id: 'all', label: 'Tutte' },
  { id: 'shared', label: 'Condivise' },
  { id: 'personal', label: 'Personali' },
];

const MONTH_OPTIONS = [
  { value: 1, label: 'Gennaio' },
  { value: 2, label: 'Febbraio' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Aprile' },
  { value: 5, label: 'Maggio' },
  { value: 6, label: 'Giugno' },
  { value: 7, label: 'Luglio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Settembre' },
  { value: 10, label: 'Ottobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Dicembre' },
];

const SEGMENT_LABEL_CLASS =
  'text-[11px] font-semibold uppercase tracking-wider text-stone-500 block';

interface SegmentOption<T extends string> {
  id: T;
  content: React.ReactNode;
}

interface FilterSegmentProps<T extends string> {
  title: string;
  ariaLabel: string;
  options: SegmentOption<T>[];
  value: T;
  onSelect: (next: T) => void;
  gridColsClass: string;
  buttonPaddingClass: string;
}

function FilterSegment<T extends string>({
  title,
  ariaLabel,
  options,
  value,
  onSelect,
  gridColsClass,
  buttonPaddingClass,
}: FilterSegmentProps<T>) {
  return (
    <div className="space-y-1">
      <span className={SEGMENT_LABEL_CLASS}>{title}</span>
      <div
        role="group"
        aria-label={ariaLabel}
        className={`ds-nav-track grid ${gridColsClass} gap-1 p-1 rounded-xl border border-stone-200/70 text-xs font-semibold`}
      >
        {options.map((option) => {
          const isActive = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              className={`min-h-10 ${buttonPaddingClass} py-1.5 rounded-lg transition-all text-center cursor-pointer truncate ${
                isActive
                  ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-stone-200/70'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {option.content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface AnalyticsFilterBarProps {
  timeframes: AnalyticsTimeframeOption[];
  timeframe: AnalyticsTimeframe;
  onSelectTimeframe: (next: AnalyticsTimeframe) => void;
  availableYears: number[];
  selectedYear: number;
  selectedMonth: number | null;
  onSelectYear: (year: number) => void;
  onSelectMonth: (month: number | null) => void;
  onStepMonth: (delta: -1 | 1) => void;
  splitFilter: SplitFilter;
  onSelectSplitFilter: (next: SplitFilter) => void;
  payerFilters: Array<{ id: PayerFilter; label: string }>;
  payerFilter: PayerFilter;
  onSelectPayerFilter: (next: PayerFilter) => void;
  hasSecondaryFilters: boolean;
  filteredCount: number;
  selectedCategory: string | null;
  onResetAllFilters: () => void;
}

export const AnalyticsFilterBar: React.FC<AnalyticsFilterBarProps> = ({
  timeframes,
  timeframe,
  onSelectTimeframe,
  availableYears,
  selectedYear,
  selectedMonth,
  onSelectYear,
  onSelectMonth,
  onStepMonth,
  splitFilter,
  onSelectSplitFilter,
  payerFilters,
  payerFilter,
  onSelectPayerFilter,
  hasSecondaryFilters,
  filteredCount,
  selectedCategory,
  onResetAllFilters,
}) => (
  <div className="ds-card p-4 sm:p-6 space-y-4">
    <div>
      <h2 className="text-lg sm:text-xl font-bold text-stone-900 font-display">
        Statistiche e Trend per Categoria
      </h2>
      <p className="text-xs text-stone-500 mt-0.5">
        Analisi delle uscite di coppia divisa per anno e mese, categorie personalizzate e soglie
      </p>
    </div>

    <div className="space-y-3 pt-2 border-t border-stone-100">
      {/* Riga 1: Periodo allineato a tutta larghezza */}
      <FilterSegment
        title="Periodo"
        ariaLabel="Filtra per periodo"
        gridColsClass="grid-cols-4"
        buttonPaddingClass="px-2 sm:px-3"
        value={timeframe}
        onSelect={onSelectTimeframe}
        options={timeframes.map((tf) => ({
          id: tf.id,
          content: (
            <>
              <span className="sm:hidden">{tf.shortLabel}</span>
              <span className="hidden sm:inline">{tf.fullLabel}</span>
            </>
          ),
        }))}
      />

      {/* Riga 2: Divisione puntuale per Anno e Mese */}
      <div className="space-y-1">
        <span className={SEGMENT_LABEL_CLASS}>Anno e Mese</span>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <button
            type="button"
            onClick={() => onStepMonth(-1)}
            disabled={timeframe === 'all'}
            aria-label={selectedMonth === null ? 'Anno precedente' : 'Mese precedente'}
            className="ds-icon-btn h-10 w-10 shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="relative flex-1 min-w-[110px]">
            <Calendar className="w-3.5 h-3.5 text-orange-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              aria-label="Seleziona anno"
              value={selectedYear}
              onChange={(e) => onSelectYear(Number(e.target.value))}
              className="ds-input w-full pl-8 pr-2.5 py-2 text-xs font-semibold min-h-10 cursor-pointer"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  Anno {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[150px]">
            <select
              aria-label="Seleziona mese"
              value={selectedMonth ?? ''}
              onChange={(e) =>
                onSelectMonth(e.target.value === '' ? null : Number(e.target.value))
              }
              className="ds-input w-full px-3 py-2 text-xs font-semibold min-h-10 cursor-pointer"
            >
              <option value="">Tutti i mesi ({selectedYear})</option>
              {MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => onStepMonth(1)}
            disabled={timeframe === 'all'}
            aria-label={selectedMonth === null ? 'Anno successivo' : 'Mese successivo'}
            className="ds-icon-btn h-10 w-10 shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Riga 3: Natura Spesa + Pagato da allineati su 2 colonne */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FilterSegment
          title="Natura Spesa"
          ariaLabel="Filtra per natura della spesa"
          gridColsClass="grid-cols-3"
          buttonPaddingClass="px-2"
          value={splitFilter}
          onSelect={onSelectSplitFilter}
          options={SPLIT_FILTERS.map((sf) => ({ id: sf.id, content: sf.label }))}
        />

        <FilterSegment
          title="Pagato da"
          ariaLabel="Filtra per chi ha pagato"
          gridColsClass="grid-cols-3"
          buttonPaddingClass="px-2"
          value={payerFilter}
          onSelect={onSelectPayerFilter}
          options={payerFilters.map((pf) => ({ id: pf.id, content: pf.label }))}
        />
      </div>

      {hasSecondaryFilters && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <span className="text-stone-500">
            Filtri attivi:{' '}
            <strong className="text-stone-800">
              {filteredCount} spese corrispondenti
            </strong>
            {selectedCategory ? ` · ${selectedCategory}` : ''}
          </span>
          <button
            type="button"
            onClick={onResetAllFilters}
            className="ds-btn-secondary min-h-8 px-2.5 py-1 text-xs"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Azzera filtri</span>
          </button>
        </div>
      )}
    </div>
  </div>
);
