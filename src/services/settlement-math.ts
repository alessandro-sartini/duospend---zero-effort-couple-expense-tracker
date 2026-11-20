import type { Expense, Settlement } from '../types';

/**
 * Calculates net balance between Partner 1 (user) and Partner 2 (partner).
 * Positive balance: Partner 2 owes Partner 1.
 * Negative balance: Partner 1 owes Partner 2.
 */
export const computeSettlementBalance = (
  expenses: Expense[],
  settlements: Settlement[]
): {
  netBalance: number; // positive: partner owes user, negative: user owes partner
  userTotalPaid: number;
  partnerTotalPaid: number;
  totalSharedSpend: number;
  userSharedShare: number;
  partnerSharedShare: number;
} => {
  let userTotalPaid = 0;
  let partnerTotalPaid = 0;
  let totalSharedSpend = 0;
  let netBalance = 0; // relative to user (+ means user is owed, - means user owes)

  for (const exp of expenses) {
    if (exp.payer === 'user') {
      userTotalPaid += exp.amount;
    } else {
      partnerTotalPaid += exp.amount;
    }

    if (exp.splitType === '50_50') {
      totalSharedSpend += exp.amount;
      const half = exp.amount / 2;
      if (exp.payer === 'user') {
        netBalance += half; // partner owes user their half
      } else {
        netBalance -= half; // user owes partner their half
      }
    } else if (exp.splitType === '100_user') {
      // 100% user personal
      if (exp.payer === 'partner') {
        netBalance -= exp.amount; // partner paid for user's personal item
      }
    } else if (exp.splitType === '100_partner') {
      // 100% partner personal
      if (exp.payer === 'user') {
        netBalance += exp.amount; // user paid for partner's personal item
      }
    } else if (exp.splitType === 'custom') {
      totalSharedSpend += exp.amount;
      const userRatio = exp.customSplitRatio ?? 0.5;
      const partnerRatio = 1 - userRatio;
      if (exp.payer === 'user') {
        netBalance += exp.amount * partnerRatio;
      } else {
        netBalance -= exp.amount * userRatio;
      }
    }
  }

  // Adjust for settlements logged
  for (const stl of settlements) {
    if (stl.from === 'partner' && stl.to === 'user') {
      // Partner paid user: reduces user's credit
      netBalance -= stl.amount;
    } else if (stl.from === 'user' && stl.to === 'partner') {
      // User paid partner: increases user's credit (clearing debt)
      netBalance += stl.amount;
    }
  }

  const userSharedShare = totalSharedSpend / 2;
  const partnerSharedShare = totalSharedSpend / 2;

  return {
    netBalance: Math.round(netBalance * 100) / 100,
    userTotalPaid: Math.round(userTotalPaid * 100) / 100,
    partnerTotalPaid: Math.round(partnerTotalPaid * 100) / 100,
    totalSharedSpend: Math.round(totalSharedSpend * 100) / 100,
    userSharedShare: Math.round(userSharedShare * 100) / 100,
    partnerSharedShare: Math.round(partnerSharedShare * 100) / 100,
  };
};
