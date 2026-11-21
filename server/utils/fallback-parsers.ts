import type { ExpenseCategory, Payer } from '../../src/types';
import { sanitizeIsoDate, sanitizePlainText } from './sanitizers';

const CATEGORY_KEYWORD_RULES: Array<[ExpenseCategory, RegExp]> = [
  ['Spesa', /\b(esselunga|coop|conad|carrefour|lidl|eurospin|pam|penny|bennet|supermercat|alimentar|grocer)/i],
  ['Ristoranti e Bar', /\b(ristorante|trattoria|pizzeria|bar|caffe|caffè|bistro|mcdonald|burger|sushi|deliveroo|glovo|just\s*eat|uber\s*eats|cena|pranzo)\b/i],
  ['Bollette e Utenze', /\b(enel|eni\s*(?:plenitude|gas)|a2a|edison|iren|iliad|tim|vodafone|wind|fastweb|energia\s*elettrica|luce|gas|acqua|bolletta|fibra|canone)\b/i],
  ['Casa e Affitto', /\b(affitto|condominio|ikea|leroy\s*merlin|brico|mutuo)\b/i],
  ['Trasporti', /\b(trenitalia|trenord|italo|atm|metro|taxi|uber|benzina|q8|autostrade|telepass|parcheggio|carburante)\b/i],
  ['Viaggi', /\b(airbnb|booking|ryanair|easyjet|ita\s*airways|wizz|hotel|volo|albergo|traghetto|soggiorno)\b/i],
  ['Salute e Benessere', /\b(farmacia|parafarmacia|medico|ospedale|dentista|decathlon|palestra|visita)\b/i],
  ['Svago e Intrattenimento', /\b(netflix|spotify|disney|prime\s*video|cinema|teatro|concerto|playstation|nintendo|steam)\b/i],
  ['Shopping', /\b(amazon|zalando|zara|ebay|apple|mediaworld|unieuro|acquisto|ordine)\b/i],
];

export function inferCategoryFromText(text: string): ExpenseCategory {
  for (const [category, pattern] of CATEGORY_KEYWORD_RULES) {
    if (pattern.test(text)) return category;
  }
  return 'Altro';
}

function normalizeDecimalNumber(rawNumber: string): number {
  const cleaned = rawNumber.trim().replace(/\s+/g, '');
  if (!cleaned) return 0;
  let normalized = cleaned;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(cleaned)) {
    normalized = cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    normalized = cleaned.replace(',', '.');
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 && value <= 1_000_000
    ? Math.round(value * 100) / 100
    : 0;
}

function mapCurrencyToken(token?: string): string {
  const upper = (token || '').trim().toUpperCase();
  if (!upper || upper === '€' || upper === 'EUR') return 'EUR';
  if (upper === '$' || upper === 'USD') return 'USD';
  if (upper === '£' || upper === 'GBP') return 'GBP';
  return /^[A-Z]{3}$/.test(upper) ? upper : 'EUR';
}

export function extractAmountAndCurrency(
  text: string,
  defaultCurrency = 'EUR'
): { amount: number; currency: string } {
  const patterns: RegExp[] = [
    /(?:totale|total|importo|addebit[oa]|pagat[oa]|spes[oa]|amount|paid|charged)\s*[:=\-]?\s*(€|\$|£|EUR|USD|GBP)?\s*(\d[\d.,]{0,12})\s*(€|\$|£|EUR|USD|GBP)?/i,
    /(€|\$|£|EUR|USD|GBP)\s*(\d[\d.,]{0,12})/i,
    /(\d[\d.,]{0,12})\s*(€|\$|£|EUR|USD|GBP)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const rawNum = pattern === patterns[2] ? match[1] : match[2];
    const currencyRaw =
      pattern === patterns[2]
        ? match[2]
        : pattern === patterns[1]
          ? match[1]
          : match[1] || match[3];
    const amount = normalizeDecimalNumber(rawNum);
    if (amount > 0) {
      return {
        amount,
        currency: currencyRaw ? mapCurrencyToken(currencyRaw) : defaultCurrency,
      };
    }
  }

  return { amount: 0, currency: defaultCurrency };
}

export function extractDateFromText(text: string): string {
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) return sanitizeIsoDate(isoMatch[1]);

  const itMatch = text.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](20\d{2}))?\b/);
  if (itMatch) {
    const day = Number(itMatch[1]);
    const month = Number(itMatch[2]);
    const year = itMatch[3] ? Number(itMatch[3]) : new Date().getFullYear();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return sanitizeIsoDate(candidate);
    }
  }

  return new Date().toISOString().slice(0, 10);
}

export function inferMerchantFromSender(sender: string): string {
  const displayName = sender.split('<')[0].replace(/["']/g, '').trim();
  if (displayName && !displayName.includes('@')) {
    return sanitizePlainText(displayName, 80, 'Esercente');
  }
  const email = sender.match(/<([^>]+)>/)?.[1] || sender;
  const domain = email.includes('@') ? email.split('@')[1]?.split('.')[0] : '';
  if (domain) {
    return sanitizePlainText(
      domain.charAt(0).toUpperCase() + domain.slice(1),
      80,
      'Esercente'
    );
  }
  return 'Esercente';
}

const MAX_HEURISTIC_RECEIPT_AMOUNT = 2500;

const PROMO_OR_NON_EXPENSE_SENDER_PATTERN =
  /(?:\b(?:newsletter|promo|promotions|promotion-it|marketing|announcements?|loyalty|news\.paypal|m1\.email\.samsung|e\.udemymail|smailer\d*\.binance|conio\.com|linkedin\.com|twitch\.tv|crmbancobpm|communications\.inter\.it|mail\.sovendus|nedm\.asus|updates\.billoo|serv\.smartbox|comunicazioni\.poste|shipment-tracking)\b|(?:^|[<\s"'])(?:newsletter|news|promo|promotions|promotion-it|marketing|announcements?|offers|offerte|deals|digest|discover|gaming|educazionedigitale)@)/i;

const PROMO_OR_NON_EXPENSE_SUBJECT_PATTERN =
  /(?:\b(?:newsletter|weekly\s+digest|daily\s+digest|weekly\s+update|daily\s+update|new\s+arrivals|nuovi\s+arrivi|offerta|offerte|sconto|sconti|coupon|promo|promozione|promozionale|black\s*friday|flash\s*sales|early\s*access|accesso\s*anticipato|codici\s*sconto|buono\s+da|buono\s+sconto|buono\s+del|regalo\s+per\s+oggi|fino\s+a\s+\d+|bitcoin|crypto|criptovalut\w*|midterm|soglia\s+degli|rompicapo|webinar|privacy\s+policy|incidente\s+di\s+sicurezza|sicurezza\s+dei\s+tuoi\s+dati|aggiorna\s+l['’]?app|aggiorna\s+billoo|pagella|prestito|mutuo|preventivo|gioco\s+continua|montepremi|courses\s+for|collezione\s+supertech|ora\s+disponibili|abbinamento\s+perfetto|nuovo\s+libro|prenota\s+il\s+prossimo|credito\s+promozionale|ti\s+[èe]\s+piaciuto|modifica\s+al\s+tuo\s+pagamento\s+automatico|changes\s+to\s+purchase|payment\s+method\s+expired|hai\s+nuovi?\s+document[oi]|promemoria\s+della\s+prenotazione|modifica\s+della\s+prenotazione|codice\s*otp|one[- ]time\s*password|unsubscribe|disiscriviti|nuove\s*commissioni|settimana\s*di\s*lancio|stai\s+per\s+perdere|scegli\s+i\s+nuovi|scegli\s+la\s+convenienza|approfitta\s+della\s+praticit|ticket\s+news|updating\s+our.*t&cs|invito\s+speciale|c['’][èe]\s+un\s+invito|canta\.\s*gusta\.\s*vivi)\b|\b(?:delivered|out\s+for\s+delivery|in\s+consegna|consegnato)\s*:|^\s*re:\s*(?:prenotazione|booking)\b|(?:^|\s)[èe]\s+live\b|\bvale\s+di\s+pi[ùu](?:\s|$|[.!]))/i;

const EXPLICIT_TRANSACTIONAL_SUBJECT_PATTERN =
  /(?:\b(?:ricevuta|fattura|scontrino|bolletta|pagamento\s+(?:effettuato|confermato|ricevuto|autorizzato)|hai\s+inviato\s+un\s+pagamento|hai\s+pagato|addebito|conferma\s+(?:d['’]\s*)?ordine|conferma\s+ricevuta|ordine\s*(?:#|n\.?)|receipt|invoice|payment\s+confirmation|order\s+confirmation|your\s+order)\b|\bordered\s*:)/i;

const NON_EXPENSE_BODY_OR_SNIPPET_PATTERN =
  /(?:\b(?:montepremi|concorso\s+a\s+premi|estrazione\s+finale|quotazione\s+bitcoin|prezzo\s+del\s+bitcoin|disiscriviti\s+dalla\s+newsletter|unsubscribe\s+from\s+this\s+list)\b)/i;

export interface EmailFilterCandidate {
  subject?: string;
  sender?: string;
  snippet?: string;
  body?: string;
  listUnsubscribe?: string;
  precedence?: string;
}

/**
 * Determina localmente se un'email appartiene a newsletter, promo, crypto/trading,
 * concorsi o avvisi informativi privi di spesa reale.
 */
export function isLikelyPromotionalOrNonExpenseEmail(input: EmailFilterCandidate): boolean {
  const subject = (input.subject || '').trim();
  const sender = (input.sender || '').trim();
  const snippet = (input.snippet || '').trim();
  const bodyHead = (input.body || '').slice(0, 1500);
  const listUnsubscribe = (input.listUnsubscribe || '').trim();
  const precedence = (input.precedence || '').trim().toLowerCase();

  if (PROMO_OR_NON_EXPENSE_SENDER_PATTERN.test(sender)) {
    return true;
  }

  if (PROMO_OR_NON_EXPENSE_SUBJECT_PATTERN.test(subject)) {
    return true;
  }

  const hasExplicitReceiptSubject = EXPLICIT_TRANSACTIONAL_SUBJECT_PATTERN.test(subject);

  if (
    (listUnsubscribe.length > 0 || precedence === 'bulk' || precedence === 'list') &&
    !hasExplicitReceiptSubject
  ) {
    return true;
  }

  if (!hasExplicitReceiptSubject && NON_EXPENSE_BODY_OR_SNIPPET_PATTERN.test(`${snippet}\n${bodyHead}`)) {
    return true;
  }

  return false;
}

function extractPaidAmountForEmail(
  message: HeuristicGmailCandidateInput,
  defaultCurrency: string
): { amount: number; currency: string } {
  const fullText = `${message.subject}\n${message.snippet}\n${message.body}`;
  const labeledPatterns: RegExp[] = [
    /(?:totale\s+pagato|totale\s+ordine|totale\s+addebitato|importo\s+pagato|importo\s+addebitato|importo\s+totale|totale|total\s+paid|order\s+total|amount\s+paid|amount\s+charged|total|addebit[oa]|pagat[oa]|hai\s+pagato|hai\s+inviato)\s*[:=\-]?\s*(€|\$|£|EUR|USD|GBP)\s*(\d[\d.,]{0,12})/i,
    /(?:totale\s+pagato|totale\s+ordine|totale\s+addebitato|importo\s+pagato|importo\s+addebitato|importo\s+totale|totale|total\s+paid|order\s+total|amount\s+paid|amount\s+charged|total|addebit[oa]|pagat[oa]|hai\s+pagato|hai\s+inviato)\s*[:=\-]?\s*(\d[\d.,]{0,12})\s*(€|\$|£|EUR|USD|GBP)\b/i,
  ];

  for (const pattern of labeledPatterns) {
    const match = fullText.match(pattern);
    if (!match) continue;
    const isSymbolFirst = pattern === labeledPatterns[0];
    const rawNum = isSymbolFirst ? match[2] : match[1];
    const currencyRaw = isSymbolFirst ? match[1] : match[2];
    const amount = normalizeDecimalNumber(rawNum);
    if (amount > 0) {
      return {
        amount,
        currency: currencyRaw ? mapCurrencyToken(currencyRaw) : defaultCurrency,
      };
    }
  }

  // Fallback solo su oggetto/snippet (mai su numeri sparsi in 6.000 caratteri di corpo email)
  const headerText = `${message.subject}\n${message.snippet}`;
  const headerPatterns: RegExp[] = [
    /(€|\$|£|EUR|USD|GBP)\s*(\d[\d.,]{0,12})/i,
    /(\d[\d.,]{0,12})\s*(€|\$|£|EUR|USD|GBP)\b/i,
  ];
  for (const pattern of headerPatterns) {
    const match = headerText.match(pattern);
    if (!match) continue;
    const isSymbolFirst = pattern === headerPatterns[0];
    const rawNum = isSymbolFirst ? match[2] : match[1];
    const currencyRaw = isSymbolFirst ? match[1] : match[2];
    const amount = normalizeDecimalNumber(rawNum);
    if (amount > 0) {
      return {
        amount,
        currency: currencyRaw ? mapCurrencyToken(currencyRaw) : defaultCurrency,
      };
    }
  }

  return { amount: 0, currency: defaultCurrency };
}

export interface HeuristicGmailCandidateInput {
  id: string;
  subject: string;
  sender: string;
  dateHeader: string;
  snippet: string;
  body: string;
  listUnsubscribe?: string;
  precedence?: string;
}

export function extractReceiptsHeuristically(
  messages: HeuristicGmailCandidateInput[],
  defaultCurrency = 'EUR'
) {
  const transactionalKeyword =
    /\b(receipt|invoice|order|ordered|purchase|payment|paid|charged|bill|booking|ticket|fattura|ricevuta|scontrino|ordine|acquisto|pagamento|addebito|bolletta|prenotazione|biglietto|conferma)\b/i;

  const receipts: Array<Record<string, unknown>> = [];
  const reviewCandidates: Array<Record<string, unknown>> = [];
  let suppressedLowConfidenceCount = 0;

  for (const message of messages) {
    if (isLikelyPromotionalOrNonExpenseEmail(message)) {
      suppressedLowConfidenceCount += 1;
      continue;
    }

    const headerText = `${message.subject}\n${message.snippet}`;
    const hasHeaderTransactionSignal = transactionalKeyword.test(headerText);
    const { amount, currency } = extractPaidAmountForEmail(message, defaultCurrency);

    if (!hasHeaderTransactionSignal || amount <= 0 || amount > MAX_HEURISTIC_RECEIPT_AMOUNT) {
      suppressedLowConfidenceCount += 1;
      continue;
    }

    const combinedText = `${headerText}\n${message.body}`;
    const parsedHeaderDate = message.dateHeader ? new Date(message.dateHeader) : null;
    const date =
      parsedHeaderDate && !Number.isNaN(parsedHeaderDate.getTime())
        ? parsedHeaderDate.toISOString().slice(0, 10)
        : extractDateFromText(combinedText);
    const merchant = inferMerchantFromSender(message.sender);
    const category = inferCategoryFromText(`${merchant} ${combinedText}`);

    receipts.push({
      id: message.id,
      isExpense: true,
      confidence: 78,
      reason: 'Estratto tramite motore euristico locale (fallback offline AI).',
      merchant,
      total: amount,
      currency,
      date,
      category,
      itemsDescription: sanitizePlainText(message.subject, 160),
      sourceEmailSubject: message.subject,
      sourceEmailSender: message.sender,
    });
  }

  return { receipts, reviewCandidates, suppressedLowConfidenceCount };
}

function extractNotificationMerchant(text: string, fallback: string): string {
  const patternMatch = text.match(
    /(?:presso|da|a|su|per)\s+([A-Z0-9][A-Za-zÀ-ÿ0-9 &'._-]{1,40}?)(?=\s+(?:il|alle|con|per|autorizzat|del|\d{1,2}[/:])|[.,;\n]|$)/i
  );
  if (patternMatch?.[1]) {
    return sanitizePlainText(patternMatch[1], 80, fallback);
  }
  const providerPrefix = text.match(/^([A-Za-zÀ-ÿ0-9 /._-]{2,25}):/);
  if (providerPrefix?.[1]) {
    return sanitizePlainText(providerPrefix[1], 60, fallback);
  }
  return fallback;
}

const OTP_OR_SECURITY_NOTIFICATION_PATTERN =
  /\b(?:otp|one[- ]time\s*password|codice\s*(?:di\s*)?(?:sicurezza|verifica|accesso|conferma|autorizzazione|segreto|pin)|password\s*temporanea|non\s+condividere\s+questo\s+codice|verifica\s+in\s+due\s+passaggi|2fa|nuovo\s+accesso|accesso\s+rilevato|tentativo\s+di\s+accesso|login\s+(?:rilevato|effettuato)|hai\s+effettuato\s+l['’]?accesso)\b/i;

const PROMO_OR_DISCOUNT_NOTIFICATION_PATTERN =
  /\b(?:sconto|sconti|coupon|promo|promozione|promozionale|buono\s+(?:sconto|regalo|da|del)|codice\s+sconto|offerta\s+speciale|voucher|spesa\s+minima|risparmi(?:a|o)\s+fino|cashback\s+disponibile|regalo\s+per\s+te|fino\s+al?\s+\d+\s*%\s+di)\b/i;

const INCOMING_CREDIT_OR_REFUND_NOTIFICATION_PATTERN =
  /\b(?:accredito\s+(?:di|bonifico|stipendio|ricevuto|sul\s+conto)|bonifico\s+(?:ricevuto|in\s+entrata|a\s+tuo\s+favore|accreditato)|hai\s+ricevuto\s+(?:un\s+bonifico|un\s+accredito|un\s+rimborso|€|\$|£|eur\b|usd\b|gbp\b|\d)|ti\s+ha\s+inviato\s+(?:€|\$|£|eur\b|usd\b|gbp\b|\d)|rimborso\s+(?:di|ricevuto|accreditato|effettuato)|storno\s+(?:di|operazione|pagamento))\b/i;

const BALANCE_INFO_ONLY_NOTIFICATION_PATTERN =
  /\bsaldo\s+(?:disponibile|contabile|attuale)\b/i;

const EXPLICIT_OUTGOING_PAYMENT_NOTIFICATION_PATTERN =
  /\b(?:pagamento\s+(?:di|pos|effettuato|autorizzato|con\s+carta)|hai\s+(?:pagato|speso|inviato)|addebit(?:o|ati|ato)\b|operazione\s+di\s+\d|transazione\s+(?:di|autorizzata)|acquisto\s+(?:di|presso|autorizzato))\b/i;

export function classifyNonExpenseNotification(text: string): {
  isNonExpense: boolean;
  reason?: string;
} {
  const clean = (text || '').trim();
  if (!clean) {
    return { isNonExpense: true, reason: 'Testo notifica vuoto.' };
  }
  if (OTP_OR_SECURITY_NOTIFICATION_PATTERN.test(clean)) {
    return { isNonExpense: true, reason: 'Codice OTP o avviso di sicurezza.' };
  }
  if (PROMO_OR_DISCOUNT_NOTIFICATION_PATTERN.test(clean)) {
    return { isNonExpense: true, reason: 'Messaggio promozionale, coupon o sconto.' };
  }
  if (INCOMING_CREDIT_OR_REFUND_NOTIFICATION_PATTERN.test(clean)) {
    return { isNonExpense: true, reason: 'Accredito in entrata o rimborso.' };
  }
  if (
    BALANCE_INFO_ONLY_NOTIFICATION_PATTERN.test(clean) &&
    !EXPLICIT_OUTGOING_PAYMENT_NOTIFICATION_PATTERN.test(clean)
  ) {
    return { isNonExpense: true, reason: 'Comunicazione informativa di saldo.' };
  }
  return { isNonExpense: false };
}

export function parseNotificationHeuristically(
  text: string,
  appName = 'App Bancaria / SMS',
  payer: Payer = 'user'
) {
  const nonExpenseCheck = classifyNonExpenseNotification(text);
  const { amount: rawAmount, currency } = extractAmountAndCurrency(text, 'EUR');
  const amount = nonExpenseCheck.isNonExpense ? 0 : rawAmount;
  const merchant = extractNotificationMerchant(text, sanitizePlainText(appName, 60, 'Pagamento'));
  const date = extractDateFromText(text);
  const category = inferCategoryFromText(`${merchant} ${text}`);

  return {
    title: merchant,
    amount,
    currency,
    date,
    category,
    payer,
    splitType: '50_50' as const,
    source: 'notification' as const,
    notes: sanitizePlainText(`Fallback locale da ${appName}: ${text}`, 220),
    ...(nonExpenseCheck.isNonExpense
      ? { isExpense: false, ignoreReason: nonExpenseCheck.reason }
      : {}),
  };
}

export function parseNotificationHistoryHeuristically(
  historyText: string,
  payer: Payer = 'user'
) {
  const lines = historyText
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 6 && !classifyNonExpenseNotification(line).isNonExpense);

  return lines
    .map((line, idx) => {
      const parsed = parseNotificationHeuristically(line, 'Cronologia Android / SMS', payer);
      if (!(parsed.amount > 0)) return null;
      return {
        id: `exp-notif-fallback-${Date.now()}-${idx}`,
        ...parsed,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export function buildLocalAdvisorFallbackReply(
  prompt: string,
  financialContext?: string
): string {
  const ctx = financialContext || '';
  const monthSpent = ctx.match(/Totale Speso questo Mese:\s*([^\n]+)/i)?.[1] || 'n.d.';
  const budget = ctx.match(/Budget Obiettivo Mensile:\s*([^\n]+)/i)?.[1] || 'n.d.';
  const shared = ctx.match(/Totale Fondo Comune Condiviso:\s*([^\n]+)/i)?.[1] || 'n.d.';
  const settlement = ctx.match(/Stato Attuale del Pareggio:\s*([^\n]+)/i)?.[1] || 'n.d.';

  return [
    'Gemini AI è momentaneamente occupato o offline: ho attivato l’analisi locale automatica dei vostri dati.',
    '',
    '• **Situazione del mese**: spesi ' + monthSpent + ' rispetto a un budget obiettivo di ' + budget + '.',
    '• **Fondo comune condiviso**: ' + shared + '.',
    '• **Pareggio tra i partner**: ' + settlement + '.',
    '',
    prompt.toLowerCase().includes('saldo') || prompt.toLowerCase().includes('pareggi')
      ? 'Suggerimento operativo: tutte le spese 50/50 vengono divise equamente; le spese "100% Personale" anticipate dall’altro partner vengono compensate direttamente nel saldo netto.'
      : 'Suggerimento operativo: controllate nella sezione "Categorie e Trend" le voci oltre soglia mensile e usate regole ricorrenti su Gmail per tenere monitorate le bollette fisse.',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildFallbackVisionSvgDataUrl(prompt: string, size: string): string {
  const safeTitle = sanitizePlainText(prompt, 68, 'Obiettivo DuoSpend');
  const words = safeTitle.split(' ');
  const line1Words: string[] = [];
  const line2Words: string[] = [];
  for (const word of words) {
    if ([...line1Words, word].join(' ').length <= 34) {
      line1Words.push(word);
    } else if ([...line2Words, word].join(' ').length <= 34) {
      line2Words.push(word);
    }
  }
  const line1 = escapeXml(line1Words.join(' ') || safeTitle.slice(0, 34));
  const line2 = escapeXml(line2Words.join(' '));
  const safeSize = escapeXml(size);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f5e3d3"/>
      <stop offset="55%" stop-color="#ea580c"/>
      <stop offset="100%" stop-color="#7c2d12"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" rx="48" fill="url(#bg)"/>
  <circle cx="640" cy="180" r="140" fill="#fff7ed" fill-opacity="0.16"/>
  <circle cx="170" cy="640" r="180" fill="#1c1917" fill-opacity="0.18"/>
  <rect x="64" y="520" width="672" height="216" rx="28" fill="#1c1917" fill-opacity="0.72"/>
  <text x="96" y="576" fill="#fdba74" font-family="sans-serif" font-size="22" font-weight="700">DUOSPEND VISION BOARD · FALLBACK ${safeSize}</text>
  <text x="96" y="632" fill="#fff7ed" font-family="sans-serif" font-size="30" font-weight="700">${line1}</text>
  ${line2 ? `<text x="96" y="676" fill="#fed7aa" font-family="sans-serif" font-size="26" font-weight="600">${line2}</text>` : ''}
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
