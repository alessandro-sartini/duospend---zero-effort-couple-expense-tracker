import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
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
  onOpenSettlement: () => void;
  onOpenSecurityModal?: () => void;
  onNavigateTab: (tab: string) => void;
  onSelectExpense: (expense: Expense) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  expenses,
  profile,
  netBalance,
  totalSharedSpend,
  userTotalPaid,
  partnerTotalPaid,
  onOpenSettlement,
  onOpenSecurityModal,
  onNavigateTab,
  onSelectExpense,
}) => {
  const [splitFilter, setSplitFilter] = useState<SplitFilter>('all');
  const [selectedMonthCategory, setSelectedMonthCategory] = useState<
    string | null
  >(null);
  const [drilldown, setDrilldown] = useState<ExpenseDrilldownPayload | null>(
    null
  );
  const budgetGoal = profile.monthlyBudget || 2800;

  const burnRate = useMemo(
    () => computeMonthlyBurnRate(expenses, budgetGoal, splitFilter),
    [expenses, budgetGoal, splitFilter]
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
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
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
  }, [expenses, splitFilter]);

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
              className="grid cursor-pointer grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-2.5 py-3.5 transition-colors hover:bg-stone-50/70"
            >
              <div className="row-span-2 flex items-center justify-center">
                <CategoryBadge category={exp.category} size="md" />
              </div>

              <span className="min-w-0 break-words text-sm font-bold text-stone-900 sm:truncate">
                {exp.title}
              </span>

              <div className="shrink-0 text-right space-y-1">
                <div className="text-sm font-bold font-mono text-stone-900 tabular-nums">
                  {formatCurrency(exp.amount, exp.currency)}
                </div>
                <div className="flex justify-end">
                  <SourceBadge source={exp.source} compact />
                </div>
              </div>

              <div className="col-span-2 col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500">
                <span className="font-mono">{exp.date}</span>
                <span aria-hidden="true">·</span>
                <span>
                  Pagato da{' '}
                  <span className="font-semibold text-stone-700">
                    {exp.payer === 'user'
                      ? profile.userName
                      : profile.partnerName}
                  </span>
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatSplitLabel(exp)}</span>
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
