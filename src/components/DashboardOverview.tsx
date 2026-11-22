import React, { useMemo, useState } from 'react';
import { ArrowRight, Calendar, ChevronLeft, ChevronRight, Edit3, Flag, Plane, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import {
  formatCompactSplitLabel,
  formatCurrency,
  formatShortExpenseDate,
  formatSplitLabel,
  getCategoryMeta,
} from '../constants/categories';
import {
  computeMonthlyBurnRate,
  filterExpensesByDay,
  filterExpensesByMonth,
  formatCompactCurrency,
  isSharedExpense,
  parseIsoDateParts,
  type SplitFilter,
} from '../services/analytics-math';
import type { TripSummary } from '../services/reconciliation';
import { CoupleProfile, Expense } from '../types';
import type { SwipeOpenSide } from '../utils/swipeGestures';
import { BurnRateAreaChart } from './charts/BurnRateAreaChart';
import {
  ExpenseDrilldownModal,
  type ExpenseDrilldownPayload,
} from './charts/ExpenseDrilldownModal';
import {
  InteractiveDonutChart,
  type DonutSlice,
} from './charts/InteractiveDonutChart';
import { BalanceHeroCard } from './dashboard/BalanceHeroCard';
import { CategoryBadge } from './ui/CategoryBadge';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { RowActionMenu } from './ui/RowActionMenu';
import { SourceBadge } from './ui/SourceBadge';
import { SwipeableActionRow } from './ui/SwipeableActionRow';

interface DashboardOverviewProps {
  expenses: Expense[];
  profile: CoupleProfile;
  netBalance: number;
  totalSharedSpend: number;
  userTotalPaid: number;
  partnerTotalPaid: number;
  excludedBeforeStartCount?: number;
  activeTripSummary?: TripSummary | null;
  recurringCount?: number;
  recurringMonthlyTotal?: number;
  onOpenTrips?: () => void;
  onOpenRecurring?: () => void;
  onOpenStartingPoint?: () => void;
  onOpenSettlement: () => void;
  onOpenSecurityModal?: () => void;
  onNavigateTab: (tab: string) => void;
  onSelectExpense: (expense: Expense) => void;
  onDeleteExpense?: (id: string) => void;
}

const DASHBOARD_MONTH_OPTIONS = [
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

function formatDateItShort(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  expenses,
  profile,
  netBalance,
  totalSharedSpend,
  userTotalPaid,
  partnerTotalPaid,
  excludedBeforeStartCount = 0,
  activeTripSummary = null,
  recurringCount = 0,
  recurringMonthlyTotal = 0,
  onOpenTrips,
  onOpenRecurring,
  onOpenStartingPoint,
  onOpenSettlement,
  onOpenSecurityModal,
  onNavigateTab,
  onSelectExpense,
  onDeleteExpense,
}) => {
  const realToday = new Date();
  const realYear = realToday.getFullYear();
  const realMonth = realToday.getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState<number>(realYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(realMonth);
  const [splitFilter, setSplitFilter] = useState<SplitFilter>('all');
  const [selectedMonthCategory, setSelectedMonthCategory] = useState<
    string | null
  >(null);
  const [drilldown, setDrilldown] = useState<ExpenseDrilldownPayload | null>(
    null
  );
  const [openSwipe, setOpenSwipe] = useState<{
    id: string;
    side: Exclude<SwipeOpenSide, null>;
  } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expensePendingDelete, setExpensePendingDelete] = useState<Expense | null>(null);
  const budgetGoal = profile.monthlyBudget || 2800;

  const availableYears = useMemo(() => {
    const years = new Set<number>([realYear, selectedYear]);
    for (const exp of expenses) {
      const parts = parseIsoDateParts(exp.date);
      if (parts) years.add(parts.year);
    }
    return [...years].sort((a, b) => b - a);
  }, [expenses, realYear, selectedYear]);

  const isViewingCurrentMonth = selectedYear === realYear && selectedMonth === realMonth;

  const burnReferenceDate = useMemo(() => {
    if (isViewingCurrentMonth) return new Date();
    const isPastMonth =
      selectedYear < realYear || (selectedYear === realYear && selectedMonth < realMonth);
    return isPastMonth
      ? new Date(selectedYear, selectedMonth, 0, 12, 0, 0)
      : new Date(selectedYear, selectedMonth - 1, 1, 12, 0, 0);
  }, [isViewingCurrentMonth, selectedYear, selectedMonth, realYear, realMonth]);

  const burnRate = useMemo(
    () => computeMonthlyBurnRate(expenses, budgetGoal, splitFilter, burnReferenceDate),
    [expenses, budgetGoal, splitFilter, burnReferenceDate]
  );

  const {
    donutSlices,
    monthDonutTotal,
    dayExpenseCounts,
    topFiveCategorySet,
    currentYear,
    currentMonth,
    currentYm,
  } = useMemo(() => {
    const year = selectedYear;
    const month = selectedMonth;
    const ym = `${year}-${String(month).padStart(2, '0')}`;

    const totals: Record<string, number> = {};
    const countsByDay: Record<number, number> = {};
    let total = 0;

    for (const exp of expenses) {
      if (splitFilter === 'shared' && !isSharedExpense(exp)) continue;
      if (splitFilter === 'personal' && isSharedExpense(exp)) continue;
      const parts = parseIsoDateParts(exp.date);
      if (!parts || parts.year !== year || parts.month !== month) continue;

      totals[exp.category] = (totals[exp.category] || 0) + exp.amount;
      countsByDay[parts.day] = (countsByDay[parts.day] || 0) + 1;
      total += exp.amount;
    }

    const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
    const topFive = sorted.slice(0, 5);
    const restSum = sorted.slice(5).reduce((acc, [, val]) => acc + val, 0);

    const slices: DonutSlice[] = topFive.map(([category, value]) => ({
      id: category,
      label: category,
      value: Math.round(value * 100) / 100,
      color: getCategoryMeta(category).chartColor,
    }));

    if (restSum > 0) {
      slices.push({
        id: '__other__',
        label: 'Altre categorie',
        value: Math.round(restSum * 100) / 100,
        color: 'var(--theme-text-subtle)',
      });
    }

    return {
      donutSlices: slices,
      monthDonutTotal: Math.round(total * 100) / 100,
      dayExpenseCounts: countsByDay,
      topFiveCategorySet: new Set(topFive.map(([cat]) => cat)),
      currentYear: year,
      currentMonth: month,
      currentYm: ym,
    };
  }, [expenses, splitFilter, selectedYear, selectedMonth]);

  const stepDashboardMonth = (delta: -1 | 1) => {
    const nextDate = new Date(selectedYear, selectedMonth - 1 + delta, 1);
    setSelectedYear(nextDate.getFullYear());
    setSelectedMonth(nextDate.getMonth() + 1);
    setSelectedMonthCategory(null);
  };

  const recentExpenses = useMemo(
    () =>
      [...expenses]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6),
    [expenses]
  );

  const monthBudgetPct =
    budgetGoal > 0 ? Math.round((monthDonutTotal / budgetGoal) * 100) : 0;

  const handleChangeSplitFilter = (next: SplitFilter) => {
    setSplitFilter(next);
    setSelectedMonthCategory(null);
  };

  const handleInspectBurnDay = (day: number, mode: 'day' | 'month') => {
    if (mode === 'day') {
      const dayItems = filterExpensesByDay(
        expenses,
        currentYear,
        currentMonth,
        day,
        splitFilter
      );
      const pt = burnRate.points.find((p) => p.day === day);
      setDrilldown({
        title: `Spese del ${day} ${burnRate.monthLabel}`,
        subtitle:
          splitFilter === 'shared'
            ? 'Solo spese condivise'
            : splitFilter === 'personal'
              ? 'Solo spese personali'
              : 'Tutte le spese del giorno',
        expenses: dayItems,
        highlightNote: pt
          ? `Cumulata al giorno ${day}: ${formatCurrency(
              pt.cumulative ?? burnRate.currentTotal,
              profile.currency
            )} (passo ideale ${formatCurrency(pt.ideal, profile.currency)})`
          : undefined,
      });
      return;
    }

    const monthItems = filterExpensesByMonth(expenses, currentYm, splitFilter);
    setDrilldown({
      title: `Spese di ${burnRate.monthLabel}`,
      subtitle: `${monthItems.length} ${
        monthItems.length === 1 ? 'spesa registrata' : 'spese registrate'
      }`,
      expenses: monthItems,
      highlightNote: `Proiezione fine mese: ${formatCurrency(
        burnRate.projectedEndOfMonth,
        profile.currency
      )} su budget di ${formatCurrency(burnRate.budgetGoal, profile.currency)}`,
    });
  };

  const handleInspectMonthSlice = (sliceId: string) => {
    const monthItems = filterExpensesByMonth(expenses, currentYm, splitFilter);
    const matching =
      sliceId === '__other__'
        ? monthItems.filter((e) => !topFiveCategorySet.has(e.category))
        : monthItems.filter((e) => e.category === sliceId);

    setDrilldown({
      title: sliceId === '__other__' ? 'Altre categorie del mese' : sliceId,
      subtitle: `${burnRate.monthLabel} · ${matching.length} ${
        matching.length === 1 ? 'spesa' : 'spese'
      }`,
      expenses: matching,
    });
  };

  return (
    <div className="ds-stagger space-y-5 sm:space-y-6">
      <BalanceHeroCard
        profile={profile}
        netBalance={netBalance}
        totalSharedSpend={totalSharedSpend}
        userTotalPaid={userTotalPaid}
        partnerTotalPaid={partnerTotalPaid}
        expensesCount={expenses.length}
        variant="dashboard"
        onOpenSettlement={onOpenSettlement}
        onNavigateToSettlement={() => onNavigateTab('settlement')}
      />

      {/* Indicatore Punto Zero (visibile solo se impostato dalle Impostazioni) */}
      {profile.trackingStartDate && (
        <div className="ds-card p-3.5 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-orange-500/12 border border-orange-500/25 text-orange-600 flex items-center justify-center shrink-0">
              <Flag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-stone-900">
                Punto Zero attivo dal{' '}
                <span className="font-mono text-orange-600">
                  {formatDateItShort(profile.trackingStartDate)}
                </span>
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {excludedBeforeStartCount > 0
                  ? `${excludedBeforeStartCount} spese antecedenti nascoste dai conteggi · Gmail cerca da questa data`
                  : 'Saldo, grafici e scansioni Gmail partono da questa data'}
              </p>
            </div>
          </div>

          {onOpenStartingPoint && (
            <button
              type="button"
              onClick={onOpenStartingPoint}
              className="ds-btn-secondary min-h-10 px-3.5 py-2 text-xs shrink-0 self-start sm:self-auto"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Modifica</span>
            </button>
          )}
        </div>
      )}

      {/* Modalità Vacanza / Progetti & Spese Ricorrenti */}
      {(onOpenTrips || onOpenRecurring) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {onOpenTrips && (
            <div
              className={`ds-card p-3.5 sm:px-5 sm:py-4 flex items-center justify-between gap-3 transition-colors ${
                activeTripSummary
                  ? 'border-orange-500/60 bg-orange-50/50 dark:bg-orange-950/25 ring-1 ring-orange-500/25'
                  : ''
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-orange-500/15 border border-orange-500/25 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                  <Plane className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  {activeTripSummary ? (
                    <>
                      <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                        Vacanza Attiva: {activeTripSummary.trip.name}
                      </div>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 font-mono">
                        Totale {formatCurrency(activeTripSummary.totalSpend, profile.currency)} ·{' '}
                        {activeTripSummary.expenseCount} spese · Saldo{' '}
                        {formatCurrency(Math.abs(activeTripSummary.netBalance), profile.currency)}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                        Modalità Vacanza & Progetti
                      </div>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                        Auto-etichetta viaggi o lavori con mini-saldo 50/50 isolato
                      </p>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenTrips}
                className="ds-btn-secondary min-h-10 px-3 py-1.5 text-xs shrink-0"
              >
                {activeTripSummary ? 'Riepilogo' : 'Gestisci'}
              </button>
            </div>
          )}

          {onOpenRecurring && (
            <div className="ds-card p-3.5 sm:px-5 sm:py-4 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                    Spese Ricorrenti & Abbonamenti
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                    {recurringCount > 0
                      ? `${recurringCount} attive · ~${formatCurrency(recurringMonthlyTotal, profile.currency)}/mese · Anti-doppione`
                      : 'Riconcilia affitto, bollette e abbonamenti con Banca e Gmail'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenRecurring}
                className="ds-btn-secondary min-h-10 px-3 py-1.5 text-xs shrink-0"
              >
                Apri
              </button>
            </div>
          )}
        </div>
      )}

      {/* Barra Selezione Mese & Anno per la Panoramica */}
      <div className="ds-card px-4 py-3 sm:px-5 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
          <Calendar className="w-4 h-4 text-orange-600 shrink-0" />
          <span>Periodo Panoramica:</span>
          <span className="text-stone-500 font-normal hidden sm:inline">
            {burnRate.monthLabel}
          </span>
        </div>

        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 w-full sm:w-auto sm:flex sm:flex-wrap sm:flex-initial sm:justify-end">
          <button
            type="button"
            onClick={() => stepDashboardMonth(-1)}
            aria-label="Mese precedente"
            className="ds-icon-btn h-10 w-11 sm:w-10 shrink-0 col-start-1 row-start-1 row-span-2 sm:row-span-1"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <select
            aria-label="Mese panoramica"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(Number(e.target.value));
              setSelectedMonthCategory(null);
            }}
            className="ds-input col-start-2 row-start-1 w-full px-2.5 py-1.5 text-xs font-semibold min-h-10 cursor-pointer"
          >
            {DASHBOARD_MONTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Anno panoramica"
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(Number(e.target.value));
              setSelectedMonthCategory(null);
            }}
            className="ds-input col-start-2 row-start-2 w-full px-2.5 py-1.5 text-xs font-semibold min-h-10 cursor-pointer"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => stepDashboardMonth(1)}
            aria-label="Mese successivo"
            className="ds-icon-btn h-10 w-11 sm:w-10 shrink-0 col-start-3 row-start-1 row-span-2 sm:row-span-1"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {!isViewingCurrentMonth && (
            <button
              type="button"
              onClick={() => {
                setSelectedYear(realYear);
                setSelectedMonth(realMonth);
                setSelectedMonthCategory(null);
              }}
                className="ds-btn-secondary col-span-3 min-h-10 px-2.5 py-1 text-xs justify-self-stretch sm:col-span-1 sm:justify-self-auto sm:w-auto"
            >
              <RotateCcw className="w-3 h-3 text-orange-600" />
              <span>Attuale</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Dashboard Mensile: Ritmo di Spesa & Top Categorie */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-7 min-w-0">
          <BurnRateAreaChart
            burnRate={burnRate}
            currency={profile.currency}
            splitFilter={splitFilter}
            onChangeSplitFilter={handleChangeSplitFilter}
            onNavigateToAnalytics={() => onNavigateTab('analytics')}
            onDoubleClickBudget={onOpenSecurityModal}
            onInspectDay={handleInspectBurnDay}
            dayExpenseCounts={dayExpenseCounts}
          />
        </div>

        <div className="lg:col-span-5 min-w-0">
          <InteractiveDonutChart
            title="Top Categorie del Mese"
            subtitle={`${burnRate.monthLabel} · Tocca una categoria per vedere le spese`}
            slices={donutSlices}
            currency={profile.currency}
            totalAmount={monthDonutTotal}
            centerTopDefault={burnRate.monthLabel}
            centerMainDefault={formatCompactCurrency(
              monthDonutTotal,
              profile.currency
            )}
            centerSubDefault={`${monthBudgetPct}% budget`}
            selectedId={selectedMonthCategory}
            onSelectSlice={setSelectedMonthCategory}
            onInspectSlice={handleInspectMonthSlice}
            emptyMessage="Nessuna spesa registrata nel mese corrente."
            className="h-full"
          />
        </div>
      </div>

      {/* 3. Ultime Transazioni Registrate */}
      <div className="ds-card overflow-hidden">
        <div className="flex items-start sm:items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-stone-900 font-display">
              Ultime Spese di Coppia
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Ultime spese divise tra {profile.userName} e {profile.partnerName} · Scorri per azioni rapide
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('expenses')}
            className="min-h-10 px-2 rounded-lg text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Vedi Tutte ({expenses.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-stone-100 border-t border-stone-100">
          {recentExpenses.map((exp) => {
            const payerName = exp.payer === 'user' ? profile.userName : profile.partnerName;
            return (
              <SwipeableActionRow
                key={exp.id}
                disabled={openMenuId === exp.id}
                openSide={openSwipe?.id === exp.id ? openSwipe.side : null}
                onOpenSideChange={(side) => {
                  setOpenSwipe((current) => {
                    if (side) return { id: exp.id, side };
                    return current?.id === exp.id ? null : current;
                  });
                }}
                leftAction={{
                  label: 'Modifica',
                  armedLabel: 'Modifica',
                  icon: <Edit3 className="w-5 h-5" />,
                  tone: 'primary',
                  onTrigger: () => onSelectExpense(exp),
                }}
                rightAction={
                  onDeleteExpense
                    ? {
                        label: 'Elimina',
                        armedLabel: 'Elimina',
                        icon: <Trash2 className="w-5 h-5" />,
                        tone: 'danger',
                        onTrigger: () => setExpensePendingDelete(exp),
                      }
                    : undefined
                }
                contentClassName="hover:bg-stone-50/70 transition-colors"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectExpense(exp)}
                  onDoubleClick={() => onSelectExpense(exp)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectExpense(exp);
                    }
                  }}
                  title="Tocca, trascina o fai doppio clic per modificare questa spesa"
                  className="flex cursor-pointer items-center gap-3 px-3.5 py-3 sm:px-6 sm:py-3.5"
                >
                  <CategoryBadge category={exp.category} size="lg" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate text-[14px] font-bold text-stone-900">
                        {exp.title}
                      </div>

                      <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
                        <span className="text-[14px] sm:text-base font-bold font-mono text-stone-900 tabular-nums">
                          {formatCurrency(exp.amount, exp.currency)}
                        </span>

                        <div className="sm:hidden shrink-0">
                          <RowActionMenu
                            label={`Azioni per ${exp.title}`}
                            onOpenChange={(open) => setOpenMenuId(open ? exp.id : null)}
                            triggerClassName="-mr-2 -my-1.5"
                            items={[
                              {
                                id: 'edit',
                                label: 'Modifica spesa',
                                icon: <Edit3 className="w-4 h-4 text-orange-600" />,
                                onSelect: () => onSelectExpense(exp),
                              },
                              ...(onDeleteExpense
                                ? [
                                    {
                                      id: 'delete',
                                      label: 'Elimina spesa',
                                      icon: <Trash2 className="w-4 h-4" />,
                                      tone: 'danger' as const,
                                      onSelect: () => {
                                        setOpenSwipe(null);
                                        setExpensePendingDelete(exp);
                                      },
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>

                        <div className="hidden sm:flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectExpense(exp);
                            }}
                            aria-label={`Modifica ${exp.title}`}
                            title="Modifica spesa"
                            className="h-9 w-9 rounded-xl text-stone-400 hover:text-stone-900 hover:bg-stone-100 inline-flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {onDeleteExpense && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenSwipe(null);
                                setExpensePendingDelete(exp);
                              }}
                              aria-label={`Elimina ${exp.title}`}
                              title="Elimina spesa"
                              className="h-9 w-9 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <ChevronRight
                          className="hidden sm:inline w-4 h-4 text-stone-400 shrink-0"
                          aria-hidden="true"
                        />
                      </div>
                    </div>

                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-stone-500">
                      <div className="min-w-0 truncate">
                        <span className="sm:hidden">
                          <time dateTime={exp.date}>{formatShortExpenseDate(exp.date)}</time>
                          {' · '}
                          <strong className="font-medium text-stone-700">{payerName}</strong>
                          {' · '}
                          <span>{formatCompactSplitLabel(exp)}</span>
                        </span>
                        <span className="hidden sm:inline">
                          <time dateTime={exp.date} className="font-mono">
                            {exp.date}
                          </time>
                          {' · '}
                          <strong className="text-stone-700">{payerName}</strong>
                          {' · '}
                          <span>{formatSplitLabel(exp)}</span>
                        </span>
                      </div>

                      {exp.source !== 'manual' && <SourceBadge source={exp.source} compact />}
                    </div>
                  </div>
                </div>
              </SwipeableActionRow>
            );
          })}
        </div>
      </div>

      <ExpenseDrilldownModal
        payload={drilldown}
        profile={profile}
        onClose={() => setDrilldown(null)}
        onSelectExpense={onSelectExpense}
      />

      <ConfirmDialog
        isOpen={Boolean(expensePendingDelete)}
        variant="danger"
        title="Eliminare questa spesa?"
        description={
          expensePendingDelete
            ? `“${expensePendingDelete.title}” (${formatCurrency(
                expensePendingDelete.amount,
                expensePendingDelete.currency
              )} · ${expensePendingDelete.date} · pagata da ${
                expensePendingDelete.payer === 'user' ? profile.userName : profile.partnerName
              }) verrà rimossa dal registro. Potrai ripristinarla subito dall’avviso in basso.`
            : ''
        }
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        onConfirm={() => {
          if (expensePendingDelete && onDeleteExpense) {
            onDeleteExpense(expensePendingDelete.id);
          }
          setExpensePendingDelete(null);
        }}
        onCancel={() => setExpensePendingDelete(null)}
      />
    </div>
  );
};
