import type { SavingGoal } from '../../types';
import { MS_PER_DAY, parseIsoDateParts } from './shared';
import type { GoalRunwayItem, GoalsSavingsOverviewData } from './shared';

export function computeGoalsSavingsOverview(
  goals: SavingGoal[],
  now: Date = new Date()
): GoalsSavingsOverviewData {
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const totalCurrent = Math.round(
    goals.reduce((sum, g) => sum + Math.max(0, g.currentAmount), 0) * 100
  ) / 100;
  const totalTarget = Math.round(
    goals.reduce((sum, g) => sum + Math.max(0, g.targetAmount), 0) * 100
  ) / 100;
  const totalRemaining = Math.round(
    goals.reduce((sum, g) => sum + Math.max(0, g.targetAmount - g.currentAmount), 0) * 100
  ) / 100;

  const overallPercent =
    totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0;

  let totalMonthlyPace = 0;

  const items: GoalRunwayItem[] = goals.map((goal) => {
    const remaining = Math.round(Math.max(0, goal.targetAmount - goal.currentAmount) * 100) / 100;
    const percent =
      goal.targetAmount > 0
        ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
        : 0;
    const isCompleted = remaining <= 0;

    if (isCompleted) {
      return {
        goal,
        remaining: 0,
        percent: 100,
        monthsLeft: 0,
        monthlyPace: 0,
        isCompleted: true,
        isOverdue: false,
        isUrgent: false,
      };
    }

    const targetParts = goal.targetDate ? parseIsoDateParts(goal.targetDate) : null;
    if (!targetParts) {
      return {
        goal,
        remaining,
        percent,
        monthsLeft: null,
        monthlyPace: null,
        isCompleted: false,
        isOverdue: false,
        isUrgent: false,
      };
    }

    const targetTime = new Date(
      targetParts.year,
      targetParts.month - 1,
      targetParts.day
    ).getTime();
    const diffDays = (targetTime - todayLocal.getTime()) / MS_PER_DAY;

    if (diffDays <= 0) {
      totalMonthlyPace += remaining;
      return {
        goal,
        remaining,
        percent,
        monthsLeft: 1,
        monthlyPace: remaining,
        isCompleted: false,
        isOverdue: true,
        isUrgent: true,
      };
    }

    const monthsLeft = Math.max(1, Math.round((diffDays / 30.4375) * 10) / 10);
    const monthlyPace = Math.round((remaining / monthsLeft) * 100) / 100;
    totalMonthlyPace += monthlyPace;

    return {
      goal,
      remaining,
      percent,
      monthsLeft,
      monthlyPace,
      isCompleted: false,
      isOverdue: false,
      isUrgent: monthsLeft <= 2,
    };
  });

  return {
    totalCurrent,
    totalTarget,
    totalRemaining,
    overallPercent,
    totalMonthlyPace: Math.round(totalMonthlyPace * 100) / 100,
    items,
  };
}
