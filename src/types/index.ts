export type Payer = 'user' | 'partner';

export type SplitType = '50_50' | '100_user' | '100_partner' | 'custom';

export type BuiltinExpenseCategory =
  | 'Spesa'
  | 'Ristoranti e Bar'
  | 'Casa e Affitto'
  | 'Bollette e Utenze'
  | 'Trasporti'
  | 'Shopping'
  | 'Svago e Intrattenimento'
  | 'Salute e Benessere'
  | 'Viaggi'
  | 'Matrimonio e Obiettivi'
  | 'Altro'
  | 'Groceries'
  | 'Dining Out'
  | 'Housing'
  | 'Utilities'
  | 'Transportation'
  | 'Entertainment'
  | 'Health & Wellness'
  | 'Travel'
  | 'Wedding & Goals'
  | 'Other';

export type ExpenseCategory = string;

export type ExpenseSource = 'gmail' | 'camera' | 'manual' | 'notification' | 'recurring';

export type ReconciliationStatus = 'confirmed' | 'zero_quarantine' | 'pending_recurring';

export interface ExpenseItem {
  name: string;
  price: number;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  payer: Payer;
  splitType: SplitType;
  customSplitRatio?: number; // e.g., 0.6 means user pays 60%, partner 40%
  source: ExpenseSource;
  sourceReference?: string;
  notes?: string;
  receiptUrl?: string;
  items?: ExpenseItem[];
  tax?: number;
  tripId?: string;
  recurringRuleId?: string;
  reconciliationStatus?: ReconciliationStatus;
  linkedSources?: ExpenseSource[];
  linkedReferences?: string[];
}

export interface TripProject {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  budget?: number;
  defaultCategory?: ExpenseCategory;
  isActive: boolean;
  aiSummary?: string;
}

export interface RecurringExpenseItem {
  id: string;
  title: string;
  merchantAliases?: string[];
  expectedAmount: number; // 0 per bollette/importi variabili
  amountTolerancePercent?: number; // default 5% fisso, 100% variabile
  currency: string;
  category: ExpenseCategory;
  payer: Payer;
  splitType: SplitType;
  customSplitRatio?: number;
  frequency: 'monthly' | 'bimonthly' | 'yearly';
  dayOfMonth: number; // 1..31
  autoMatchNotifications: boolean;
  active: boolean;
  lastMatchedCycle?: string; // YYYY-MM
}

export interface GmailRecurringRule {
  sender: string;
  subject: string;
  merchant: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
}

export type GmailSearchMode =
  | 'tracking_start'
  | 'month_start'
  | 'prev_month_start'
  | 'year_start'
  | 'custom_date'
  | 'days';

export interface GmailScanInterval {
  from: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

export interface GmailAccountScanHistory {
  lastCompletedScanAt: string; // ISO timestamp
  lastScanStartDate: string; // YYYY-MM-DD
  lastScanEndDate: string; // YYYY-MM-DD
  coverageIntervals: GmailScanInterval[];
}

export interface GmailScanState {
  searchMode: GmailSearchMode;
  lookbackDays: number;
  customStartDate?: string;
  accounts?: Record<string, GmailAccountScanHistory>;
}

export interface Settlement {
  id: string;
  date: string;
  amount: number;
  currency: string;
  from: Payer;
  to: Payer;
  note: string;
}

export interface CoupleProfile {
  userName: string;
  partnerName: string;
  monthlyBudget: number;
  currency: string;
  weddingBudgetGoal?: number;
  userEmail?: string;
  partnerEmail?: string;
  trackingStartDate?: string; // YYYY-MM-DD ("Punto Zero" globale spese/Gmail)
  gmailScanState?: GmailScanState;
  categoryBudgets?: Partial<Record<ExpenseCategory, number>>;
  customCategories?: string[];
  hiddenCategories?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  modelUsed?: string;
}

export interface SavingGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  imageUrl?: string;
  imageResolution?: string;
}

export type SavingsChallengeStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type SavingsChallengeHealthState =
  | 'positive'
  | 'warning'
  | 'exceeded'
  | 'completed'
  | 'neutral'
  | 'paused'
  | 'cancelled'
  | 'needs_recalculation';

export type SavingsChallengeSplitScope = 'all' | 'shared_only';

export type SavingsChallengePeriodStatus =
  | 'upcoming'
  | 'active'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'needs_recalculation';

export interface SavingsChallengeExcludedBreakdown {
  foreignCurrencyCount: number;
  foreignCurrencies: Array<{ currency: string; count: number; total: number }>;
  zeroOrQuarantineCount: number;
  negativeOrInvalidCount: number;
  futureExpenseCount: number;
  futureScheduledTotal: number;
  personalExcludedCount: number;
  settlementsAlwaysExcluded: true;
}

export interface SavingsChallengeMatchedExpensePreview {
  id: string;
  title: string;
  date: string;
  amount: number;
  currency: string;
  category: string;
  splitType: SplitType;
}

export interface SavingsChallengePeriodRecord {
  id: string;
  challengeId: string;
  periodYm: string;
  startDate: string;
  endDate: string;
  monthlyLimit: number;
  validSpend: number;
  virtualSavingsPotential: number;
  virtualSavingsApplied: number;
  matchedExpenseCount: number;
  excludedExpenseCount: number;
  status: SavingsChallengePeriodStatus;
  reconciledAt?: string;
  calculationError?: string;
}

export interface SavingsChallengeContribution {
  id: string;
  challengeId: string;
  periodYm?: string;
  goalId: string;
  goalTitleSnapshot: string;
  amount: number;
  currency: string;
  status: 'applied' | 'reverted';
  note?: string;
  createdBy: string;
  createdAt: string;
  revertedAt?: string;
  revertedBy?: string;
  revertReason?: string;
}

export interface SavingsChallengeHistoryEntry {
  id: string;
  challengeId: string;
  action: string;
  actor: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

export interface SavingsChallengeMetrics {
  totalLimit: number;
  validSpend: number;
  remainingBudget: number;
  exceededAmount: number;
  consumedPercent: number;
  barPercent: number;
  virtualSavingsPotential: number;
  virtualSavingsApplied: number;
  virtualSavingsAvailable: number;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
  isPeriodConcluded: boolean;
  matchedExpenseCount: number;
  matchedExpensesPreview: SavingsChallengeMatchedExpensePreview[];
  sharedSpend: number;
  personalSpend: number;
  excludedBreakdown: SavingsChallengeExcludedBreakdown;
  overlappingChallengeIds: string[];
  overlappingCategories: string[];
  orphanedCategories: string[];
  goalLinked: boolean;
  healthState: SavingsChallengeHealthState;
  statusMessage: string;
}

export interface SavingsChallenge {
  id: string;
  title: string;
  goalId: string;
  goalTitleSnapshot: string;
  categories: string[];
  monthlyLimit: number;
  currency: string;
  startMonth: string; // YYYY-MM
  durationMonths: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: SavingsChallengeStatus;
  splitScope: SavingsChallengeSplitScope;
  initialSpend: number;
  currentValidSpend: number;
  virtualSavingsAccumulated: number;
  virtualSavingsApplied: number;
  lastReconciledAt?: string;
  lastCalculationError?: string;
  timezone: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  periods: SavingsChallengePeriodRecord[];
  metrics: SavingsChallengeMetrics;
  latestContribution?: SavingsChallengeContribution;
}

export interface GoalVirtualSavingsSummary {
  goalId: string;
  totalVirtualApplied: number;
  activeChallengesCount: number;
  completedChallengesCount: number;
  lastCompletedChallengeTitle?: string;
  lastCompletedAt?: string;
  contributionsCount: number;
}

export interface SavingsChallengeEstimate {
  startMonth: string;
  durationMonths: number;
  startDate: string;
  endDate: string;
  currency: string;
  timezone: string;
  splitScope: SavingsChallengeSplitScope;
  categories: string[];
  previousPeriodAverageSpend: number;
  previousPeriodMonthsSampled: number;
  currentPeriodSpend: number;
  suggestedMonthlyLimit: number;
  estimatedVirtualSavings: number;
  customCategoriesSelected: string[];
  excludedForeignCurrencyCount: number;
  goalPreview?: {
    id: string;
    title: string;
    currentAmount: number;
    targetAmount: number;
    imageUrl?: string;
  };
  calculationSummary: string;
  virtualSavingsNotice: string;
}

export interface ContributionPreview {
  challengeId: string;
  goalId: string;
  goalTitle: string;
  goalImageUrl?: string;
  currentGoalAmount: number;
  targetGoalAmount: number;
  availableVirtualSavings: number;
  proposedAmount: number;
  projectedGoalAmount: number;
  projectedGoalPercent: number;
  currency: string;
  matchedExpenseCount: number;
  validSpend: number;
  totalLimit: number;
  previousContributions: SavingsChallengeContribution[];
  explanation: string;
  virtualDisclaimer: string;
  challengeVersion: number;
}

export interface SavingsChallengesCalculationPolicy {
  formula: string;
  currencyPolicy: string;
  splitPolicy: string;
  excludedItemsPolicy: string;
  virtualTransferPolicy: string;
}
