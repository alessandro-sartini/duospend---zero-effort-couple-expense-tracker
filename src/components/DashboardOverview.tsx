import React from 'react';
import { ArrowRight } from 'lucide-react';
import { formatCurrency, formatSplitLabel } from '../constants/categories';
import { CoupleProfile, Expense } from '../types';
import { BalanceHeroCard } from './dashboard/BalanceHeroCard';
import { ProgressBar } from './ProgressBar';
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
  const currentMonthPrefix = new Date().toISOString().slice(0, 7);
  const currentMonthExpenses = expenses.filter((e) =>
    e.date.startsWith(currentMonthPrefix)
  );
  const currentMonthTotal = currentMonthExpenses.reduce(
    (acc, curr) => acc + curr.amount,
    0
  );

  const budgetGoal = profile.monthlyBudget || 2800;
  const budgetPercentage = Math.min(
    Math.round((currentMonthTotal / budgetGoal) * 100),
    100
  );

  const categoryTotals: Record<string, number> = {};
  currentMonthExpenses.forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const recentExpenses = [...expenses]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-6">
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

      {/* 2. Andamento Budget Mensile */}
      <div className="ds-card p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-stone-900 font-display">
                Andamento Spese del Mese
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Novembre 2026 · Obiettivo mensile {formatCurrency(budgetGoal, profile.currency)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('analytics')}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>Tutti i Trend</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div
            onDoubleClick={onOpenSecurityModal}
            title="Doppio clic per modificare budget mensile e profilo"
            className="ds-subcard p-4 space-y-2.5 cursor-pointer"
          >
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-bold text-lg font-mono text-stone-900 tabular-nums">
                {formatCurrency(currentMonthTotal, profile.currency)}{' '}
                <span className="text-xs font-sans font-normal text-stone-500">
                  spesi su €{budgetGoal.toLocaleString()}
                </span>
              </span>
              <span
                className={`font-semibold font-mono text-xs px-2 py-0.5 rounded-md ${
                  budgetPercentage > 90
                    ? 'bg-rose-500/12 text-rose-600'
                    : 'bg-orange-500/12 text-orange-700'
                }`}
              >
                {budgetPercentage}%
              </span>
            </div>
            <ProgressBar
              value={budgetPercentage}
              size="md"
              variant={budgetPercentage > 90 ? 'danger' : 'default'}
              label="Obiettivo mensile utilizzato"
            />
          </div>

          <div className="pt-1 space-y-3">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
              Categorie Principali del Mese
            </span>
            {sortedCategories.length === 0 ? (
              <p className="text-xs text-stone-500">Nessuna spesa registrata nel mese corrente.</p>
            ) : (
              <div className="space-y-3">
                {sortedCategories.map(([category, amount]) => {
                  const percent = Math.round((amount / (currentMonthTotal || 1)) * 100);
                  return (
                    <div key={category} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-stone-700">
                        <div className="flex items-center gap-2 min-w-0">
                          <CategoryBadge category={category} size="sm" />
                          <span className="font-medium truncate">{category}</span>
                        </div>
                        <span className="font-mono font-semibold tabular-nums shrink-0">
                          {formatCurrency(amount, profile.currency)}{' '}
                          <span className="text-stone-400">({percent}%)</span>
                        </span>
                      </div>
                      <ProgressBar value={percent} label={`Spese ${category}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </div>

      {/* 3. Ultime Transazioni Registrate */}
      <div className="ds-card p-5 sm:p-6 space-y-4">
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
                    {exp.payer === 'user' ? profile.userName : profile.partnerName}
                  </span>
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatSplitLabel(exp)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
