import type { ExpenseCategory } from '../../types';

export interface GmailReviewCandidate {
  id: string;
  subject: string;
  sender: string;
  dateHeader: string;
  confidence: number;
  isExpense: boolean;
  reason: string;
  merchant?: string;
  total?: number;
  currency?: string;
  date?: string;
  category?: ExpenseCategory;
  itemsDescription?: string;
  recurringRuleMismatch?: boolean;
}

export interface DetectedGmailReceipt {
  id: string;
  merchant?: string;
  total?: number;
  currency?: string;
  date?: string;
  category?: ExpenseCategory;
  itemsDescription?: string;
  confidence?: number;
  reason?: string;
  sourceEmailSubject?: string;
  sourceEmailSender?: string;
  dateHeader?: string;
  recurringRuleApplied?: boolean;
  recurringRuleMismatch?: boolean;
  fallbackUsed?: boolean;
}

export interface GmailScanStats {
  candidateCount: number;
  messagesProcessed: number;
  batchesProcessed: number;
  messagesAnalyzed: number;
  failedMessageReads: number;
  recurringRuleMatchCount: number;
  skippedNonTransactionalCount: number;
  skippedImportedCount: number;
  skippedIgnoredCount: number;
  skippedScannedCount: number;
  suppressedLowConfidenceCount: number;
  hasMoreCandidates: boolean;
}

export const normalizeRuleValue = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

export const getDefaultMerchant = (sender: string) => {
  const displayName = sender.split('<')[0].trim();
  if (displayName && !displayName.includes('@')) return displayName;
  const email = sender.match(/<([^>]+)>/)?.[1] || sender;
  const domainName = email.includes('@') ? email.split('@')[1].split('.')[0] : '';
  return domainName ? domainName.charAt(0).toUpperCase() + domainName.slice(1) : sender;
};
