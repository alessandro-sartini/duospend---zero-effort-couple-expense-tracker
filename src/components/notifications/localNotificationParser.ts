import type { ExpenseCategory } from '../../types';

export interface ParsedNotificationItem {
  title: string;
  merchant?: string;
  amount: number;
  currency: string;
  date: string;
  category: ExpenseCategory;
  notes: string;
}

export const SAMPLE_NOTIFICATIONS = [
  {
    mobileLabel: 'Google Pay',
    label: 'Google Pay / Wallet',
    text: 'Google Pay: €9,20 addebitati per ATM Milano Metro.',
  },
  {
    mobileLabel: 'PostePay',
    label: 'PostePay SMS',
    text: 'PostePay: Pagamento di 18,50 EUR presso FARMACIA CENTRALE autorizzato alle ore 10:45 del 11/11/2026.',
  },
  {
    mobileLabel: 'Nexi / Intesa',
    label: 'Nexi / Intesa SMS',
    text: 'Nexi: operazione di 42,30 EUR autorizzata da ESSELUNGA SUPERSTORE il 11/11 ore 11:20.',
  },
  {
    mobileLabel: 'Satispay / Revolut',
    label: 'Satispay / Revolut Push',
    text: 'Satispay: Hai pagato €14,00 a Bar Trattoria Da Michele.',
  },
  {
    mobileLabel: 'Cronologia Android',
    label: 'Cronologia Notifiche Android (Multi-Banca)',
    text: `11:42 - Revolut: Hai speso €28,50 da Pizzeria Da Michele.
10:15 - Intesa Sanpaolo: Pagamento POS di €15,00 presso Farmacia.
Ieri - Satispay: Hai inviato €35,00 a Decathlon Sports.
Ieri - Google Pay: €9,20 addebitati per ATM Milano Metro.`,
  },
] as const;

const LOCAL_CATEGORY_RULES: Array<{ category: ExpenseCategory; pattern: RegExp }> = [
  { category: 'Spesa', pattern: /\b(esselunga|conad|coop|carrefour|lidl|supermercato|alimentari)\b/i },
  { category: 'Ristoranti e Bar', pattern: /\b(pizzeria|ristorante|bar|trattoria|caffe|caffè|glovo|deliveroo|just eat)\b/i },
  { category: 'Casa e Affitto', pattern: /\b(affitto|condominio|mutuo|ikea|leroy merlin)\b/i },
  { category: 'Bollette e Utenze', pattern: /\b(enel|eni|tim|vodafone|fastweb|iliad|bolletta|luce|gas|acqua)\b/i },
  { category: 'Trasporti', pattern: /\b(trenitalia|italo|atm|metro|bus|benzina|eni station|q8|telepass|uber|taxi)\b/i },
  { category: 'Salute e Benessere', pattern: /\b(farmacia|medico|dentista|analisi|salute|ottica)\b/i },
  { category: 'Svago e Intrattenimento', pattern: /\b(cinema|netflix|spotify|teatro|concerto|biglietti)\b/i },
  { category: 'Viaggi', pattern: /\b(hotel|booking|airbnb|ryanair|easyjet|ita airways|viaggio)\b/i },
  { category: 'Shopping', pattern: /\b(amazon|zalando|decathlon|mediaworld|unieuro|apple|negozio)\b/i },
];

function inferLocalCategory(text: string): ExpenseCategory {
  for (const rule of LOCAL_CATEGORY_RULES) {
    if (rule.pattern.test(text)) {
      return rule.category;
    }
  }
  return 'Shopping';
}

export function parseNotificationLineLocally(
  line: string,
  defaultCurrency: string
): ParsedNotificationItem | null {
  const clean = line.trim();
  if (!clean) return null;

  const amountMatch =
    clean.match(/(?:€|eur)\s*([0-9]{1,6}(?:[.,][0-9]{1,2})?)/i) ||
    clean.match(/([0-9]{1,6}(?:[.,][0-9]{1,2})?)\s*(?:€|eur)\b/i) ||
    clean.match(/([$£])\s*([0-9]{1,6}(?:[.,][0-9]{1,2})?)/i) ||
    clean.match(/\b(usd|gbp)\s*([0-9]{1,6}(?:[.,][0-9]{1,2})?)/i);

  let amount = 0;
  let currency = defaultCurrency || 'EUR';
  if (amountMatch) {
    const rawNumber = (amountMatch[2] || amountMatch[1] || '0').replace(',', '.');
    const parsedNum = Number(rawNumber);
    amount = Number.isFinite(parsedNum) && parsedNum > 0 ? Math.round(parsedNum * 100) / 100 : 0;
    if (/\$|usd/i.test(amountMatch[0])) currency = 'USD';
    else if (/£|gbp/i.test(amountMatch[0])) currency = 'GBP';
    else currency = 'EUR';
  }

  const merchantMatch =
    clean.match(/\b(?:presso|da|su|a|per)\s+([A-Za-z0-9À-ÖØ-öø-ÿ&'.\-\s]{2,42}?)(?:\s+(?:il|del|alle|di|con|€|\d{1,2}[/-]\d{1,2})|[.,;]|$)/i) ||
    clean.match(/^([^:]{2,32}):/);
  const title = merchantMatch?.[1]?.trim() || clean.slice(0, 40) || 'Pagamento da Notifica';

  let date = new Date().toISOString().slice(0, 10);
  const slashDate = clean.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (slashDate) {
    const day = slashDate[1].padStart(2, '0');
    const month = slashDate[2].padStart(2, '0');
    const year = slashDate[3]
      ? slashDate[3].length === 2
        ? `20${slashDate[3]}`
        : slashDate[3]
      : String(new Date().getFullYear());
    const isoCandidate = `${year}-${month}-${day}`;
    if (!Number.isNaN(Date.parse(`${isoCandidate}T00:00:00Z`))) {
      date = isoCandidate;
    }
  } else if (/\bieri\b/i.test(clean)) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    date = yesterday.toISOString().slice(0, 10);
  }

  const category = inferLocalCategory(`${title} ${clean}`);
  return {
    title,
    amount,
    currency,
    date,
    category,
    notes: `Fallback locale offline: ${clean.slice(0, 120)}`,
  };
}

export function parseNotificationsLocally(
  inputText: string,
  defaultCurrency: string,
  isMultiLine: boolean
): ParsedNotificationItem[] {
  const otpOrPromo = /\b(otp|codice\s*(?:sicurezza|verifica)|password\s*temporanea|sconto|promo)\b/i;
  if (!isMultiLine) {
    const single = parseNotificationLineLocally(inputText, defaultCurrency);
    return single ? [single] : [];
  }
  return inputText
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 6 && !otpOrPromo.test(line))
    .map((line) => parseNotificationLineLocally(line, defaultCurrency))
    .filter((item): item is ParsedNotificationItem => Boolean(item && item.amount > 0));
}
