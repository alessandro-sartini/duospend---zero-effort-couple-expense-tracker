import { computeSettlementBalance } from './settlement-math';
import type {
  Expense,
  ExpenseSource,
  RecurringExpenseItem,
  TripProject,
} from '../types';

const MS_PER_DAY = 86_400_000;
export const RECONCILIATION_WINDOW_DAYS = 14;

const BOILERPLATE_TOKENS = new Set([
  'pagamento',
  'pagamenti',
  'pos',
  'carta',
  'card',
  'contactless',
  'addebito',
  'diretto',
  'sdd',
  'sepa',
  'bonifico',
  'google',
  'pay',
  'wallet',
  'apple',
  'paypal',
  'pp',
  'sumup',
  'sq',
  'iz',
  'nexi',
  'satispay',
  'revolut',
  'mktp',
  'marketplace',
  'srl',
  'srls',
  'spa',
  'snc',
  'sas',
  'gmbh',
  'ltd',
  'inc',
  'ab',
  'italia',
  'italy',
  'ordine',
  'order',
  'fattura',
  'invoice',
  'ricevuta',
  'receipt',
  'notifica',
  'sms',
  'acquisto',
  'spesa',
  'mensile',
  'abbonamento',
  'rinnovo',
  'rinnova',
  'rata',
  'com',
  'it',
  'eu',
  'net',
  'org',
  'www',
  'https',
  'http',
  'di',
  'da',
  'per',
  'con',
  'del',
  'della',
  'delle',
  'dei',
  'degli',
  'al',
  'alla',
  'allo',
  'sul',
  'sulla',
  'il',
  'lo',
  'la',
  'i',
  'gli',
  'le',
  'un',
  'una',
]);

const MERCHANT_CANONICAL_ALIASES: Array<[RegExp, string]> = [
  [/\b(amzn|amazon|amazonprime)\b/i, 'amazon'],
  [/\bnetflix\b/i, 'netflix'],
  [/\bspotify\b/i, 'spotify'],
  [/\b(enel|enelenergia)\b/i, 'enel'],
  [/\beni(?:\s+plenitude)?\b/i, 'eni'],
  [/\besselunga\b/i, 'esselunga'],
  [/\bdeliveroo\b/i, 'deliveroo'],
  [/\bglovo\b/i, 'glovo'],
  [/\btrenord\b/i, 'trenord'],
  [/\btrenitalia\b/i, 'trenitalia'],
  [/\bitalo\b/i, 'italo'],
  [/\biliad\b/i, 'iliad'],
  [/\bvodafone\b/i, 'vodafone'],
  [/\bfastweb\b/i, 'fastweb'],
  [/\bwindtre\b/i, 'windtre'],
  [/\bdazn\b/i, 'dazn'],
  [/\btelepass\b/i, 'telepass'],
  [/\bikea\b/i, 'ikea'],
  [/\bcarrefour\b/i, 'carrefour'],
  [/\bconad\b/i, 'conad'],
  [/\blidl\b/i, 'lidl'],
  [/\bcoop\b/i, 'coop'],
  [/\bdecathlon\b/i, 'decathlon'],
  [/\buber\b/i, 'uber'],
  [/\bairbnb\b/i, 'airbnb'],
  [/\bbooking\b/i, 'booking'],
];

const GENERIC_MERCHANT_TOKENS = new Set([
  'spesa',
  'acquisto',
  'pagamento',
  'transazione',
  'operazione',
  'movimento',
  'autorizzazione',
  'altro',
  'esercente',
]);

const KNOWN_APP_OR_BANK_LABELS = new Set([
  'app bancaria',
  'app bancaria sms',
  'banca sms',
  'banca',
  'sms',
  'messages',
  'messaggi',
  'nexi',
  'nexipay',
  'youapp',
  'banca imola',
  'intesa',
  'intesa sanpaolo',
  'unicredit',
  'postepay',
  'revolut',
  'satispay',
  'google pay',
  'google wallet',
  'apple pay',
  'paypal',
  'macrodroid',
  'cronologia android sms',
]);

const WEAK_MERCHANT_PREFIX_PATTERN =
  /^(?:un['’]?autorizzazione\b|autorizzazione\b|richiesta\b|pagamento\b|operazione\b|movimento\b|addebito\b|fallback locale\b|notifica\b|tramite\b|via\b|mediante\b)/i;

export function isWeakOrGenericMerchant(rawTitle: string, appName?: string): boolean {
  const clean = (rawTitle || '').trim();
  if (!clean || clean.length < 2) return true;
  if (/^[\d.,€$£\s:/-]+$/.test(clean)) return true;
  if (WEAK_MERCHANT_PREFIX_PATTERN.test(clean)) return true;

  const normalizedPlain = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalizedPlain || normalizedPlain.length < 2) return true;
  if (GENERIC_MERCHANT_TOKENS.has(normalizedPlain) || KNOWN_APP_OR_BANK_LABELS.has(normalizedPlain)) {
    return true;
  }

  if (appName) {
    const normalizedApp = appName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalizedApp && normalizedPlain === normalizedApp) {
      return true;
    }
  }

  const key = normalizeMerchantKey(clean);
  if (!key || GENERIC_MERCHANT_TOKENS.has(key)) return true;

  return false;
}

export function extractMerchantTokens(rawTitle: string): string[] {
  const normalized = (rawTitle || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[*#:/\\._-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ');

  const rawTokens = normalized.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];

  for (const token of rawTokens) {
    if (BOILERPLATE_TOKENS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    if (/^[a-z]{1,2}\d{3,}$/.test(token) || /^\d{2,}[a-z]+$/.test(token)) continue;
    if (token.length < 2) continue;
    if (!tokens.includes(token)) {
      tokens.push(token);
    }
  }

  return tokens;
}

export function normalizeMerchantKey(rawTitle: string): string {
  const tokens = extractMerchantTokens(rawTitle);
  const joined = tokens.join(' ');
  for (const [pattern, canonical] of MERCHANT_CANONICAL_ALIASES) {
    if (pattern.test(joined) || pattern.test(rawTitle || '')) {
      return canonical;
    }
  }
  return joined;
}

export function daysBetweenIsoDates(dateA: string, dateB: string): number {
  const matchA = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateA || '').trim().slice(0, 10));
  const matchB = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateB || '').trim().slice(0, 10));
  if (!matchA || !matchB) return Infinity;
  const msA = Date.UTC(Number(matchA[1]), Number(matchA[2]) - 1, Number(matchA[3]));
  const msB = Date.UTC(Number(matchB[1]), Number(matchB[2]) - 1, Number(matchB[3]));
  return Math.round(Math.abs(msA - msB) / MS_PER_DAY);
}

export function extractGmailIdsFromExpense(
  expense: Pick<Expense, 'source' | 'sourceReference' | 'linkedReferences'>
): string[] {
  const ids = new Set<string>();
  if (expense.source === 'gmail' && expense.sourceReference) {
    ids.add(expense.sourceReference);
  }
  for (const ref of expense.linkedReferences ?? []) {
    if (!ref) continue;
    if (ref.startsWith('gmail:')) {
      const clean = ref.slice('gmail:'.length).trim();
      if (clean) ids.add(clean);
    } else if (!/^(notification|camera|manual|recurring):/i.test(ref)) {
      ids.add(ref.trim());
    }
  }
  return Array.from(ids);
}

export type ExpenseMatchKind =
  | 'exact_duplicate'
  | 'delayed_channel_match'
  | 'zero_amount_complement'
  | 'possible_duplicate'
  | 'none';

export interface ExpenseMatchResult {
  score: number;
  kind: ExpenseMatchKind;
  reason: string;
}

function collectRuleKeys(rule: RecurringExpenseItem): string[] {
  const keys = [normalizeMerchantKey(rule.title)];
  for (const alias of rule.merchantAliases ?? []) {
    const clean = normalizeMerchantKey(alias);
    if (clean) keys.push(clean);
  }
  return Array.from(new Set(keys.filter(Boolean)));
}

export function matchesRecurringRule(
  expense: Pick<Expense, 'title' | 'amount'>,
  rule: RecurringExpenseItem
): boolean {
  if (!rule.active) return false;
  const expKey = normalizeMerchantKey(expense.title);
  const expTokens = extractMerchantTokens(expense.title);
  const ruleKeys = collectRuleKeys(rule);

  const merchantMatches = ruleKeys.some((ruleKey) => {
    if (!expKey || !ruleKey) return false;
    if (expKey === ruleKey) return true;
    if (expKey.length >= 4 && ruleKey.length >= 4) {
      if (expKey.includes(ruleKey) || ruleKey.includes(expKey)) return true;
    }
    const ruleTokens = extractMerchantTokens(ruleKey);
    return ruleTokens.length > 0 && ruleTokens.every((t) => expTokens.includes(t));
  });

  if (!merchantMatches) return false;

  if (expense.amount <= 0 || rule.expectedAmount <= 0) {
    return true;
  }

  const tolerancePct =
    typeof rule.amountTolerancePercent === 'number' && Number.isFinite(rule.amountTolerancePercent)
      ? Math.max(0, Math.min(200, rule.amountTolerancePercent))
      : 5;
  const maxAllowedDiff = Math.max(0.5, (rule.expectedAmount * tolerancePct) / 100);
  return Math.abs(expense.amount - rule.expectedAmount) <= maxAllowedDiff;
}

function computeMerchantSimilarityScore(
  incoming: Pick<Expense, 'title' | 'category' | 'recurringRuleId'>,
  existing: Pick<Expense, 'title' | 'category' | 'recurringRuleId'>,
  recurringExpenses?: RecurringExpenseItem[]
): number {
  if (
    incoming.recurringRuleId &&
    existing.recurringRuleId &&
    incoming.recurringRuleId === existing.recurringRuleId
  ) {
    return 35;
  }

  const keyA = normalizeMerchantKey(incoming.title);
  const keyB = normalizeMerchantKey(existing.title);

  if (keyA && keyB && keyA === keyB) {
    return 35;
  }

  if (recurringExpenses && recurringExpenses.length > 0) {
    const sharedRule = recurringExpenses.find(
      (rule) =>
        rule.active &&
        matchesRecurringRule({ title: incoming.title, amount: 0 }, rule) &&
        matchesRecurringRule({ title: existing.title, amount: 0 }, rule)
    );
    if (sharedRule) {
      return 35;
    }
  }

  if (keyA.length >= 4 && keyB.length >= 4 && (keyA.includes(keyB) || keyB.includes(keyA))) {
    return 26;
  }

  const tokensA = extractMerchantTokens(incoming.title);
  const tokensB = extractMerchantTokens(existing.title);
  if (tokensA.length > 0 && tokensB.length > 0) {
    const setB = new Set(tokensB);
    const intersection = tokensA.filter((t) => setB.has(t)).length;
    const union = new Set([...tokensA, ...tokensB]).size;
    const jaccard = union > 0 ? intersection / union : 0;
    if (jaccard >= 0.5 || (intersection >= 1 && Math.min(tokensA.length, tokensB.length) === 1)) {
      return 24;
    }
  }

  const aIsGeneric = !keyA || GENERIC_MERCHANT_TOKENS.has(keyA);
  const bIsGeneric = !keyB || GENERIC_MERCHANT_TOKENS.has(keyB);
  if ((aIsGeneric || bIsGeneric) && incoming.category === existing.category) {
    return 12;
  }

  return 0;
}

function buildExpenseRefs(expense: Pick<Expense, 'source' | 'sourceReference' | 'linkedReferences'>): Set<string> {
  const refs = new Set<string>();
  if (expense.sourceReference) {
    refs.add(expense.sourceReference);
    refs.add(`${expense.source}:${expense.sourceReference}`);
  }
  for (const ref of expense.linkedReferences ?? []) {
    if (ref) refs.add(ref);
  }
  return refs;
}

export function computeExpenseMatchScore(
  incoming: Omit<Expense, 'id'> & { id?: string },
  existing: Expense,
  recurringExpenses?: RecurringExpenseItem[]
): ExpenseMatchResult {
  if (incoming.id && incoming.id === existing.id) {
    return { score: 100, kind: 'exact_duplicate', reason: 'ID spesa identico' };
  }

  if (incoming.sourceReference) {
    const existingRefs = buildExpenseRefs(existing);
    if (
      existingRefs.has(incoming.sourceReference) ||
      existingRefs.has(`${incoming.source}:${incoming.sourceReference}`)
    ) {
      return { score: 100, kind: 'exact_duplicate', reason: 'Riferimento sorgente già acquisito' };
    }
  }

  const deltaDays = daysBetweenIsoDates(incoming.date, existing.date);
  if (!Number.isFinite(deltaDays) || deltaDays > RECONCILIATION_WINDOW_DAYS) {
    return {
      score: 0,
      kind: 'none',
      reason: 'Oltre la finestra elastica di 14 giorni',
    };
  }

  const dateScore = deltaDays <= 2 ? 15 : deltaDays <= 5 ? 10 : 5;
  const merchantScore = computeMerchantSimilarityScore(incoming, existing, recurringExpenses);

  const isZeroPair =
    (incoming.amount <= 0 && existing.amount > 0) ||
    (incoming.amount > 0 && existing.amount <= 0);

  if (isZeroPair) {
    if (merchantScore >= 24) {
      return {
        score: 55 + merchantScore + dateScore,
        kind: 'zero_amount_complement',
        reason: `Spesa a 0 € riconciliata con addebito reale (${deltaDays} gg di scarto)`,
      };
    }
    return {
      score: 0,
      kind: 'none',
      reason: 'Esercente insufficiente per completare ricevuta a 0 €',
    };
  }

  if (incoming.amount <= 0 && existing.amount <= 0) {
    if (merchantScore >= 24 && deltaDays <= 5) {
      return {
        score: 75,
        kind: 'possible_duplicate',
        reason: 'Due ricevute a 0 € simili in attesa di verifica',
      };
    }
    return { score: 0, kind: 'none', reason: 'Ricevute a 0 € distinte' };
  }

  const amountDiff = Math.abs(incoming.amount - existing.amount);
  const maxAmount = Math.max(incoming.amount, existing.amount);
  const amountScore =
    amountDiff < 0.01 ? 50 : amountDiff <= 0.5 && amountDiff <= maxAmount * 0.02 ? 30 : 0;

  if (amountScore === 0) {
    return { score: 0, kind: 'none', reason: 'Importi positivi differenti' };
  }

  const totalScore = amountScore + merchantScore + dateScore;
  const isCrossChannel =
    incoming.source !== existing.source || existing.reconciliationStatus === 'pending_recurring';

  if (totalScore >= 80 && isCrossChannel) {
    return {
      score: totalScore,
      kind: 'delayed_channel_match',
      reason: `Stesso importo ed esercente su canali diversi (${existing.source} ↔ ${incoming.source}, Δ ${deltaDays} gg)`,
    };
  }

  if (totalScore >= 60) {
    return {
      score: isCrossChannel ? totalScore : Math.min(totalScore, 75),
      kind: 'possible_duplicate',
      reason: 'Possibile doppione sullo stesso canale/importo',
    };
  }

  return { score: totalScore, kind: 'none', reason: 'Corrispondenza insufficiente' };
}

function chooseRicherTitle(titleA: string, titleB: string): string {
  const cleanA = (titleA || '').trim();
  const cleanB = (titleB || '').trim();
  if (!cleanA) return cleanB || 'Spesa';
  if (!cleanB) return cleanA;
  const weakA = isWeakOrGenericMerchant(cleanA);
  const weakB = isWeakOrGenericMerchant(cleanB);
  if (weakA && !weakB) return cleanB;
  if (weakB && !weakA) return cleanA;
  return cleanB.length > cleanA.length && cleanB.length <= 80 ? cleanB : cleanA;
}

export function mergeReconciledExpenses(
  existing: Expense,
  incoming: Omit<Expense, 'id'> & { id?: string }
): Expense {
  const mergedSources = Array.from(
    new Set<ExpenseSource>([
      existing.source,
      ...(existing.linkedSources ?? []),
      incoming.source,
      ...(incoming.linkedSources ?? []),
    ])
  );

  const refs = new Set<string>([...(existing.linkedReferences ?? []), ...(incoming.linkedReferences ?? [])]);
  if (existing.sourceReference) {
    refs.add(`${existing.source}:${existing.sourceReference}`);
    if (existing.source === 'gmail') refs.add(existing.sourceReference);
  }
  if (incoming.sourceReference) {
    refs.add(`${incoming.source}:${incoming.sourceReference}`);
    if (incoming.source === 'gmail') refs.add(incoming.sourceReference);
  }

  const incomingBringsRealAmount = existing.amount <= 0 && incoming.amount > 0;
  const finalAmount = incomingBringsRealAmount
    ? incoming.amount
    : existing.amount > 0
      ? existing.amount
      : incoming.amount;
  const finalDate = incomingBringsRealAmount ? incoming.date : existing.date;
  const finalSource: ExpenseSource =
    incomingBringsRealAmount || existing.reconciliationStatus === 'pending_recurring'
      ? incoming.source
      : existing.source;

  const combinedNotes = [existing.notes?.trim(), incoming.notes?.trim()]
    .filter((note, idx, arr): note is string => Boolean(note) && arr.indexOf(note) === idx)
    .join(' · ')
    .slice(0, 1000);

  const { duplicateCandidateId: _ignoredCandidateId, ...existingWithoutDupCandidate } = existing;

  return {
    ...existingWithoutDupCandidate,
    title: chooseRicherTitle(existing.title, incoming.title),
    amount: Math.round(finalAmount * 100) / 100,
    date: finalDate,
    source: finalSource,
    sourceReference: existing.sourceReference || incoming.sourceReference,
    reconciliationStatus: finalAmount > 0 ? 'confirmed' : 'zero_quarantine',
    linkedSources: mergedSources,
    ...(refs.size > 0 ? { linkedReferences: Array.from(refs) } : {}),
    ...(combinedNotes ? { notes: combinedNotes } : {}),
    ...(existing.items && existing.items.length > 0
      ? { items: existing.items }
      : incoming.items && incoming.items.length > 0
        ? { items: incoming.items }
        : {}),
    ...(existing.receiptUrl || incoming.receiptUrl
      ? { receiptUrl: existing.receiptUrl || incoming.receiptUrl }
      : {}),
    ...(existing.tax != null || incoming.tax != null
      ? { tax: existing.tax ?? incoming.tax }
      : {}),
    ...(existing.tripId || incoming.tripId ? { tripId: existing.tripId || incoming.tripId } : {}),
    ...(existing.recurringRuleId || incoming.recurringRuleId
      ? { recurringRuleId: existing.recurringRuleId || incoming.recurringRuleId }
      : {}),
  };
}

export interface PossibleDuplicateWarning {
  incomingTitle: string;
  matchedExpenseId: string;
  matchedTitle: string;
  score: number;
  reason: string;
}

export interface ReconcileBatchResult {
  expenses: Expense[];
  addedCount: number;
  mergedCount: number;
  quarantinedZeroCount: number;
  matchedRecurringCycles: Array<{ ruleId: string; cycle: string; expenseId: string }>;
  possibleDuplicates: PossibleDuplicateWarning[];
}

export function isDateInsideTrip(date: string, trip: TripProject): boolean {
  if (!trip.isActive) return false;
  if (!date || date < trip.startDate) return false;
  if (trip.endDate && date > trip.endDate) return false;
  return true;
}

export function reconcileIncomingExpenses(
  existingExpenses: Expense[],
  incomingList: Array<Omit<Expense, 'id'> & { id?: string }>,
  options?: {
    activeTrip?: TripProject | null;
    recurringExpenses?: RecurringExpenseItem[];
    idPrefix?: string;
  }
): ReconcileBatchResult {
  const working = [...existingExpenses];
  let addedCount = 0;
  let mergedCount = 0;
  let quarantinedZeroCount = 0;
  const matchedRecurringCycles: Array<{ ruleId: string; cycle: string; expenseId: string }> = [];
  const possibleDuplicates: PossibleDuplicateWarning[] = [];

  incomingList.forEach((rawIncoming, idx) => {
    let prepared: Omit<Expense, 'id'> & { id?: string } = { ...rawIncoming };

    if (!prepared.tripId && options?.activeTrip && isDateInsideTrip(prepared.date, options.activeTrip)) {
      prepared = { ...prepared, tripId: options.activeTrip.id };
    }

    if (!prepared.recurringRuleId && options?.recurringExpenses?.length) {
      const matchedRule = options.recurringExpenses.find(
        (rule) => rule.active && rule.autoMatchNotifications && matchesRecurringRule(prepared, rule)
      );
      if (matchedRule) {
        prepared = { ...prepared, recurringRuleId: matchedRule.id };
      }
    }

    let bestIdx = -1;
    let bestResult: ExpenseMatchResult = { score: 0, kind: 'none', reason: '' };

    for (let i = 0; i < working.length; i += 1) {
      const candidate = computeExpenseMatchScore(
        prepared,
        working[i],
        options?.recurringExpenses
      );
      if (candidate.score > bestResult.score) {
        bestResult = candidate;
        bestIdx = i;
      }
    }

    if (
      bestIdx >= 0 &&
      bestResult.score >= 80 &&
      (bestResult.kind === 'exact_duplicate' ||
        bestResult.kind === 'delayed_channel_match' ||
        bestResult.kind === 'zero_amount_complement')
    ) {
      const merged = mergeReconciledExpenses(working[bestIdx], prepared);
      working[bestIdx] = merged;
      mergedCount += 1;
      if (merged.recurringRuleId) {
        matchedRecurringCycles.push({
          ruleId: merged.recurringRuleId,
          cycle: merged.date.slice(0, 7),
          expenseId: merged.id,
        });
      }
      return;
    }

    if (bestIdx >= 0 && bestResult.kind === 'possible_duplicate') {
      possibleDuplicates.push({
        incomingTitle: prepared.title,
        matchedExpenseId: working[bestIdx].id,
        matchedTitle: working[bestIdx].title,
        score: bestResult.score,
        reason: bestResult.reason,
      });
    }

    const prefix =
      options?.idPrefix ||
      (prepared.source === 'gmail'
        ? 'exp-gmail'
        : prepared.source === 'notification'
          ? 'exp-notif'
          : prepared.source === 'recurring'
            ? 'exp-rec'
            : 'exp');
    const newId =
      prepared.id || `${prefix}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
    const status =
      prepared.amount <= 0
        ? 'zero_quarantine'
        : (prepared.reconciliationStatus ?? 'confirmed');

    const created: Expense = {
      ...prepared,
      id: newId,
      reconciliationStatus: status,
      linkedSources: prepared.linkedSources?.length ? prepared.linkedSources : [prepared.source],
    };

    working.unshift(created);
    addedCount += 1;
    if (status === 'zero_quarantine') {
      quarantinedZeroCount += 1;
    }
    if (created.recurringRuleId) {
      matchedRecurringCycles.push({
        ruleId: created.recurringRuleId,
        cycle: created.date.slice(0, 7),
        expenseId: created.id,
      });
    }
  });

  return {
    expenses: working,
    addedCount,
    mergedCount,
    quarantinedZeroCount,
    matchedRecurringCycles,
    possibleDuplicates,
  };
}

export interface ZeroQuarantineCandidateMatch {
  zeroExpense: Expense;
  candidateExpense: Expense;
  score: number;
  reason: string;
}

export function findZeroQuarantineMatches(
  expenses: Expense[],
  recurringExpenses?: RecurringExpenseItem[]
): ZeroQuarantineCandidateMatch[] {
  const zeroItems = expenses.filter(
    (exp) => exp.amount <= 0 || exp.reconciliationStatus === 'zero_quarantine'
  );
  const positiveItems = expenses.filter((exp) => exp.amount > 0);
  const matches: ZeroQuarantineCandidateMatch[] = [];

  for (const zeroExp of zeroItems) {
    let bestCandidate: Expense | null = null;
    let bestScore = 0;
    let bestReason = '';

    for (const candidate of positiveItems) {
      if (candidate.id === zeroExp.id) continue;
      const deltaDays = daysBetweenIsoDates(zeroExp.date, candidate.date);
      if (!Number.isFinite(deltaDays) || deltaDays > RECONCILIATION_WINDOW_DAYS) continue;

      const merchantScore = computeMerchantSimilarityScore(zeroExp, candidate, recurringExpenses);
      if (merchantScore < 24) continue;

      const dateScore = deltaDays <= 2 ? 15 : deltaDays <= 5 ? 10 : 5;
      const total = 55 + merchantScore + dateScore;
      if (total > bestScore) {
        bestScore = total;
        bestCandidate = candidate;
        bestReason = `Corrispondenza esercente (${deltaDays} gg di differenza)`;
      }
    }

    if (bestCandidate) {
      matches.push({
        zeroExpense: zeroExp,
        candidateExpense: bestCandidate,
        score: bestScore,
        reason: bestReason,
      });
    }
  }

  return matches;
}

export function applyMatchedCyclesToRecurring(
  recurringExpenses: RecurringExpenseItem[],
  matchedCycles: Array<{ ruleId: string; cycle: string }>
): RecurringExpenseItem[] {
  if (matchedCycles.length === 0) return recurringExpenses;
  const latestByRule = new Map<string, string>();
  for (const entry of matchedCycles) {
    const prev = latestByRule.get(entry.ruleId);
    if (!prev || entry.cycle > prev) {
      latestByRule.set(entry.ruleId, entry.cycle);
    }
  }
  return recurringExpenses.map((rule) => {
    const matchedCycle = latestByRule.get(rule.id);
    if (!matchedCycle) return rule;
    if (rule.lastMatchedCycle && rule.lastMatchedCycle >= matchedCycle) return rule;
    return { ...rule, lastMatchedCycle: matchedCycle };
  });
}

export interface TripSummary {
  trip: TripProject;
  expenses: Expense[];
  totalSpend: number;
  expenseCount: number;
  userTotalPaid: number;
  partnerTotalPaid: number;
  netBalance: number;
  budgetRemaining: number | null;
  categoryTotals: Array<{ category: string; amount: number }>;
}

export function computeTripSummary(trip: TripProject, allExpenses: Expense[]): TripSummary {
  const tripExpenses = allExpenses.filter(
    (exp) => exp.tripId === trip.id && exp.reconciliationStatus !== 'zero_quarantine'
  );
  const balance = computeSettlementBalance(tripExpenses, []);
  const byCat = new Map<string, number>();
  let totalSpend = 0;

  for (const exp of tripExpenses) {
    totalSpend += exp.amount;
    byCat.set(exp.category, (byCat.get(exp.category) ?? 0) + exp.amount);
  }

  const categoryTotals = Array.from(byCat.entries())
    .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);

  return {
    trip,
    expenses: tripExpenses,
    totalSpend: Math.round(totalSpend * 100) / 100,
    expenseCount: tripExpenses.length,
    userTotalPaid: balance.userTotalPaid,
    partnerTotalPaid: balance.partnerTotalPaid,
    netBalance: balance.netBalance,
    budgetRemaining:
      typeof trip.budget === 'number' && trip.budget > 0
        ? Math.round((trip.budget - totalSpend) * 100) / 100
        : null,
    categoryTotals,
  };
}
