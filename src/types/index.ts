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
