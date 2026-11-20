import type { GmailRecurringRule } from '../../types';
import { normalizeRuleValue, type DetectedGmailReceipt } from './types';

/**
 * Vero se esiste una regola ricorrente con lo stesso mittente OPPURE lo stesso
 * oggetto (confronto normalizzato). Usato per segnalare possibili cambi d'importo.
 */
export const hasSimilarRecurringRule = (
  rules: GmailRecurringRule[],
  sender: string,
  subject: string
): boolean => {
  const normalizedSender = normalizeRuleValue(sender);
  const normalizedSubject = normalizeRuleValue(subject);
  return rules.some(
    (rule) =>
      normalizeRuleValue(rule.sender) === normalizedSender ||
      normalizeRuleValue(rule.subject) === normalizedSubject
  );
};

/**
 * Applica a una ricevuta rilevata la regola ricorrente con mittente E oggetto
 * identici (sovrascrive esercente/importo/valuta/categoria), oppure la marca come
 * `recurringRuleMismatch` se esiste solo una regola simile.
 */
export const applyRecurringRulesToReceipt = (
  receipt: DetectedGmailReceipt,
  rules: GmailRecurringRule[],
  fallbackUsed: boolean
): DetectedGmailReceipt => {
  const sender = normalizeRuleValue(receipt.sourceEmailSender || '');
  const subject = normalizeRuleValue(receipt.sourceEmailSubject || '');
  const matchingRule = rules.find(
    (rule) =>
      normalizeRuleValue(rule.sender) === sender &&
      normalizeRuleValue(rule.subject) === subject
  );

  if (matchingRule) {
    return {
      ...receipt,
      merchant: matchingRule.merchant,
      total: matchingRule.amount,
      currency: matchingRule.currency,
      category: matchingRule.category,
      recurringRuleApplied: true,
      fallbackUsed,
    };
  }

  if (hasSimilarRecurringRule(rules, sender, subject)) {
    return { ...receipt, recurringRuleMismatch: true, fallbackUsed };
  }

  return { ...receipt, fallbackUsed };
};
