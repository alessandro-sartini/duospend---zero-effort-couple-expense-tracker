import React, { useMemo, useState } from 'react';
import { ArrowRight, Calendar, ChevronLeft, ChevronRight, Flag, RotateCcw } from 'lucide-react';
import {
  formatCurrency,
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
import { CoupleProfile, Expense } from '../types';
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
import { SourceBadge } from './ui/SourceBadge';

interface DashboardOverviewProps {
  expenses: Expense[];
  profile: CoupleProfile;
  netBalance: number;
  totalSharedSpend: number;
  userTotalPaid: number;
  partnerTotalPaid: number;
  excludedBeforeStartCount?: number;
  onOpenStartingPoint?: () => void;
  onOpenSettlement: () => void;
  onOpenSecurityModal?: () => void;
  onNavigateTab: (tab: string) => void;
  onSelectExpense: (expense: Expense) => void;
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
  onOpenStartingPoint,
  onOpenSettlement,
  onOpenSecurityModal,
  onNavigateTab,
  onSelectExpense,
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
    <div className="space-y-5 sm:space-y-6">
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

      {/* Modalità di Inizio / Punto Zero della Coppia */}
      {onOpenStartingPoint && (
        <div
          className={`ds-card p-3.5 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            !profile.trackingStartDate ? 'border-orange-300/70 bg-orange-50/40' : ''
          }`}
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-orange-500/12 border border-orange-500/25 text-orange-600 flex items-center justify-center shrink-0">
              <Flag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              {profile.trackingStartDate ? (
                <>
                  <div className="text-xs sm:text-sm font-bold text-stone-900">
                    Punto di Partenza attivo dal{' '}
                    <span className="font-mono text-orange-600">
                      {formatDateItShort(profile.trackingStartDate)}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {excludedBeforeStartCount > 0
                      ? `${excludedBeforeStartCount} spese antecedenti nascoste dai conteggi · Gmail cerca da questa data`
                      : 'Saldo, grafici e scansioni Gmail partono puliti da questa data'}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-xs sm:text-sm font-bold text-stone-900">
                    Modalità di Inizio · Prepara la data di partenza
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Scegli da quando far partire i conti (es. 1° del mese) così Gmail e grafici non mescolano mezzi periodi precedenti.
                  </p>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenStartingPoint}
            className={`${
              profile.trackingStartDate ? 'ds-btn-secondary' : 'ds-btn-primary'
            } min-h-9 px-3.5 py-2 text-xs shrink-0 self-start sm:self-auto`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>
              {profile.trackingStartDate ? 'Modifica data inizio' : 'Configura Punto Zero'}
            </span>
          </button>
        </div>
      )}

      {/* Barra Selezione Mese & Anno per la Panoramica */}
      <div className="ds-card px-4 py-3 sm:px-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
          <Calendar className="w-4 h-4 text-orange-600 shrink-0" />
          <span>Periodo Panoramica:</span>
          <span className="text-stone-500 font-normal hidden sm:inline">
            {burnRate.monthLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 flex-1 sm:flex-initial justify-end">
          <button
            type="button"
            onClick={() => stepDashboardMonth(-1)}
            aria-label="Mese precedente"
            className="ds-icon-btn h-9 w-9 shrink-0"
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
            className="ds-input px-2.5 py-1.5 text-xs font-semibold min-h-9 cursor-pointer"
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
            className="ds-input px-2.5 py-1.5 text-xs font-semibold min-h-9 cursor-pointer"
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
            className="ds-icon-btn h-9 w-9 shrink-0"
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
              className="ds-btn-secondary min-h-9 px-2.5 py-1 text-xs shrink-0"
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
      <div className="ds-card p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-stone-900 font-display">
              Ultime Spese di Coppia
            </h3>
            <p className="text-xs text-stone-500">
              Ultime spese divise tra {profile.userName} e {profile.partnerName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('expenses')}
            className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Vedi Tutte ({expenses.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-stone-100">
          {recentExpenses.map((exp) => (
            <div
              key={exp.id}
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
              title="Tocca o fai doppio clic per modificare questa spesa"
              className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-3.5 transition-colors hover:bg-stone-50/70"
            >
              <CategoryBadge category={exp.category} size="md" />

              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-sm font-bold text-stone-900 truncate">
                  {exp.title}
                </div>

                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-stone-500">
                  <span className="font-mono">{exp.date}</span>
                  <span aria-hidden="true">·</span>
                  <strong className="text-stone-700">
                    {exp.payer === 'user'
                      ? profile.userName
                      : profile.partnerName}
                  </strong>
                  <span aria-hidden="true">·</span>
                  <span>{formatSplitLabel(exp)}</span>
                  <SourceBadge source={exp.source} compact />
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-sm sm:text-base font-bold font-mono text-stone-900 tabular-nums">
                  {formatCurrency(exp.amount, exp.currency)}
                </span>
                <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <ExpenseDrilldownModal
        payload={drilldown}
        profile={profile}
        onClose={() => setDrilldown(null)}
        onSelectExpense={onSelectExpense}
      />
    </div>
  );
};
