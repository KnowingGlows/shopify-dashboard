// HDFC Bank SMS Parser
// Parses transaction SMS from HDFC Bank into structured data

export type TransactionType = 'debit' | 'credit';
export type TransactionMode = 'upi' | 'neft' | 'imps' | 'card' | 'atm' | 'emi' | 'auto_debit' | 'cheque' | 'other';

export interface ParsedTransaction {
  type: TransactionType;
  amount: number;
  account: string; // last 4 digits
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM if available
  mode: TransactionMode;
  merchant?: string; // merchant/payee name
  reference?: string; // UPI ref / txn ID
  balance?: number; // available balance after txn
  rawMessage: string;
  bank: 'hdfc';
  confidence: number; // 0-1 how confident the parse is
}

// ── HDFC Patterns ────────────────────────────────────────────────────

// Common HDFC debit patterns:
// "Rs.1500.00 debited from a/c **1234 on 15-03-26 to VPA merchant@upi (UPI Ref No 123456789)"
// "INR 1,500.00 debited from A/c XX1234 on 15-Mar-26"
// "Rs 2500.00 has been debited from account **1234 for UPI txn"
// "Money Sent! Rs.500.00 debited from a/c **1234 on 15-03-26 to VPA merchant@upi."
// "Purchase of Rs 3200.00 on HDFC Bank Credit Card xx1234 at AMAZON on 2026-03-15"

// Common HDFC credit patterns:
// "Rs.25000.00 credited to a/c **1234 on 15-03-26 by NEFT"
// "INR 5,000.00 credited to A/c XX1234 on 15-Mar-26"
// "Rs 15000 deposited in your A/c **1234"

const AMOUNT_PATTERNS = [
  /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:amount|of)\s*(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
];

const ACCOUNT_PATTERNS = [
  /(?:a\/c|ac|account|card)\s*(?:\*{2}|xx|XX|[Xx]{2})\s*(\d{4})/i,
  /(?:\*{2}|xx|XX)\s*(\d{4})/,
];

const DATE_PATTERNS = [
  // 15-03-26 or 15/03/26
  /(\d{2})[-\/](\d{2})[-\/](\d{2,4})/,
  // 2026-03-15
  /(\d{4})[-\/](\d{2})[-\/](\d{2})/,
  // 15-Mar-26 or 15 Mar 2026
  /(\d{1,2})[-\s]?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]?(\d{2,4})/i,
];

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const BALANCE_PATTERN = /(?:avl?\s*bal|balance|avail)[:\s]*(?:Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i;

const UPI_REF_PATTERN = /(?:UPI\s*(?:Ref|ref)\s*(?:No|no)?\.?\s*|ref\s*(?:no|id)?\.?\s*)(\d+)/i;

const VPA_PATTERN = /(?:VPA|vpa|to)\s+([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+)/;

const MODE_INDICATORS: { pattern: RegExp; mode: TransactionMode }[] = [
  { pattern: /\bUPI\b/i, mode: 'upi' },
  { pattern: /\bNEFT\b/i, mode: 'neft' },
  { pattern: /\bIMPS\b/i, mode: 'imps' },
  { pattern: /\b(?:credit\s*card|debit\s*card|card)\b/i, mode: 'card' },
  { pattern: /\bATM\b/i, mode: 'atm' },
  { pattern: /\bEMI\b/i, mode: 'emi' },
  { pattern: /\b(?:auto[- ]?debit|standing\s*instruction|SI|mandate|nach)\b/i, mode: 'auto_debit' },
  { pattern: /\bcheque\b/i, mode: 'cheque' },
  { pattern: /\bVPA\b/i, mode: 'upi' },
];

// ── Parser ───────────────────────────────────────────────────────────

function parseAmount(msg: string): number | null {
  for (const pat of AMOUNT_PATTERNS) {
    const m = msg.match(pat);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
  }
  return null;
}

function parseAccount(msg: string): string {
  for (const pat of ACCOUNT_PATTERNS) {
    const m = msg.match(pat);
    if (m) return m[1];
  }
  return '????';
}

function parseDate(msg: string): string {
  // Try named month format first: 15-Mar-26
  const namedMatch = msg.match(DATE_PATTERNS[2]);
  if (namedMatch) {
    const day = namedMatch[1].padStart(2, '0');
    const month = MONTH_MAP[namedMatch[2].toLowerCase().slice(0, 3)];
    let year = namedMatch[3];
    if (year.length === 2) year = (year >= '50' ? '19' : '20') + year;
    return `${year}-${month}-${day}`;
  }

  // YYYY-MM-DD
  const isoMatch = msg.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // DD-MM-YY or DD/MM/YY
  const ddMatch = msg.match(/(\d{2})[-\/](\d{2})[-\/](\d{2,4})/);
  if (ddMatch) {
    const day = ddMatch[1];
    const month = ddMatch[2];
    let year = ddMatch[3];
    if (year.length === 2) year = (year >= '50' ? '19' : '20') + year;
    return `${year}-${month}-${day}`;
  }

  // Fallback: today IST
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function parseMode(msg: string): TransactionMode {
  for (const { pattern, mode } of MODE_INDICATORS) {
    if (pattern.test(msg)) return mode;
  }
  return 'other';
}

function parseMerchant(msg: string, mode: TransactionMode): string | undefined {
  // UPI VPA
  const vpa = msg.match(VPA_PATTERN);
  if (vpa) {
    // Extract readable name from VPA like "merchant@upi" → "merchant"
    const name = vpa[1].split('@')[0];
    return name.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // "at MERCHANT" pattern (card purchases)
  const atMatch = msg.match(/\bat\s+([A-Z][A-Za-z0-9\s&.'/-]{2,30})/);
  if (atMatch) return atMatch[1].trim();

  // "to MERCHANT" pattern (NEFT/IMPS)
  const toMatch = msg.match(/\bto\s+([A-Z][A-Za-z0-9\s&.'/-]{2,40})(?:\s*(?:on|via|ref|\.|$))/);
  if (toMatch && mode !== 'upi') return toMatch[1].trim();

  // "from MERCHANT" for credits
  const fromMatch = msg.match(/\bfrom\s+([A-Z][A-Za-z0-9\s&.'/-]{2,40})(?:\s*(?:on|via|ref|\.|$))/);
  if (fromMatch) return fromMatch[1].trim();

  return undefined;
}

function parseBalance(msg: string): number | undefined {
  const m = msg.match(BALANCE_PATTERN);
  return m ? parseFloat(m[1].replace(/,/g, '')) : undefined;
}

function parseReference(msg: string): string | undefined {
  const m = msg.match(UPI_REF_PATTERN);
  return m ? m[1] : undefined;
}

function isHDFCMessage(msg: string, sender?: string): boolean {
  if (sender) {
    const s = sender.toLowerCase();
    if (s.includes('hdfc') || s.includes('hdfcbk') || s.includes('hdfcbank')) return true;
  }
  return /hdfc/i.test(msg) && AMOUNT_PATTERNS.some((p) => p.test(msg));
}

function isTransactionMessage(msg: string): boolean {
  return /(?:debited|credited|spent|purchase|withdrawn|deposited|received|sent|transferred)/i.test(msg);
}

function getTransactionType(msg: string): TransactionType | null {
  if (/(?:debited|spent|purchase|withdrawn|sent|paid|payment\s+of)/i.test(msg)) return 'debit';
  if (/(?:credited|deposited|received)/i.test(msg)) return 'credit';
  return null;
}

export function parseHDFCSMS(message: string, sender?: string): ParsedTransaction | null {
  if (!isHDFCMessage(message, sender) || !isTransactionMessage(message)) return null;

  const type = getTransactionType(message);
  if (!type) return null;

  const amount = parseAmount(message);
  if (!amount || amount <= 0) return null;

  const mode = parseMode(message);

  const parsed: ParsedTransaction = {
    type,
    amount,
    account: parseAccount(message),
    date: parseDate(message),
    mode,
    merchant: parseMerchant(message, mode),
    reference: parseReference(message),
    balance: parseBalance(message),
    rawMessage: message,
    bank: 'hdfc',
    confidence: 0.8,
  };

  // Boost confidence if we got more fields
  if (parsed.merchant) parsed.confidence += 0.05;
  if (parsed.reference) parsed.confidence += 0.05;
  if (parsed.balance !== undefined) parsed.confidence += 0.05;
  if (parsed.account !== '????') parsed.confidence += 0.05;

  return parsed;
}

// ── Auto-categorization ──────────────────────────────────────────────

export type ExpenseCategory =
  | 'advertising' | 'inventory' | 'tools' | 'salary' | 'logistics'
  | 'food' | 'travel' | 'subscription' | 'rent' | 'transfer'
  | 'refund' | 'income' | 'other';

const CATEGORY_RULES: { pattern: RegExp; category: ExpenseCategory }[] = [
  // Advertising
  { pattern: /\b(?:meta|facebook|google\s*ads|instagram|fb\s*ads|ad\s*spend)\b/i, category: 'advertising' },
  // Inventory / sourcing
  { pattern: /\b(?:alibaba|aliexpress|indiamart|supplier|sourcing|inventory|stock)\b/i, category: 'inventory' },
  // Tools / software
  { pattern: /\b(?:shopify|canva|notion|figma|slack|zoom|github|vercel|openai|chatgpt|adobe|aws|gcloud|razorpay|cashfree)\b/i, category: 'tools' },
  // Logistics / shipping
  { pattern: /\b(?:shiprocket|delhivery|dtdc|bluedart|ecom\s*express|xpressbees|courier|shipping|logistic)\b/i, category: 'logistics' },
  // Subscriptions
  { pattern: /\b(?:netflix|spotify|youtube|apple|icloud|subscription|recurring)\b/i, category: 'subscription' },
  // Food
  { pattern: /\b(?:swiggy|zomato|dominos|mcdonalds|starbucks|cafe|restaurant|food)\b/i, category: 'food' },
  // Travel
  { pattern: /\b(?:uber|ola|rapido|irctc|makemytrip|goibibo|flight|hotel|travel)\b/i, category: 'travel' },
  // Rent
  { pattern: /\b(?:rent|lease|landlord|property)\b/i, category: 'rent' },
  // Salary
  { pattern: /\b(?:salary|payroll|wages|compensation)\b/i, category: 'salary' },
  // Transfer (between own accounts)
  { pattern: /\b(?:self\s*transfer|own\s*a\/c|saving|fd|fixed\s*deposit)\b/i, category: 'transfer' },
];

export function categorizeTransaction(txn: ParsedTransaction): ExpenseCategory {
  if (txn.type === 'credit') return 'income';

  const searchText = `${txn.rawMessage} ${txn.merchant ?? ''}`;
  for (const { pattern, category } of CATEGORY_RULES) {
    if (pattern.test(searchText)) return category;
  }
  return 'other';
}

export const EXPENSE_CATEGORY_META: Record<ExpenseCategory, { label: string; color: string }> = {
  advertising:  { label: 'Advertising',  color: '#f59e0b' },
  inventory:    { label: 'Inventory',    color: '#8b5cf6' },
  tools:        { label: 'Tools',        color: '#3b82f6' },
  salary:       { label: 'Salary',       color: '#ec4899' },
  logistics:    { label: 'Logistics',    color: '#06b6d4' },
  food:         { label: 'Food',         color: '#f97316' },
  travel:       { label: 'Travel',       color: '#14b8a6' },
  subscription: { label: 'Subscription', color: '#a78bfa' },
  rent:         { label: 'Rent',         color: '#64748b' },
  transfer:     { label: 'Transfer',     color: '#6b7280' },
  refund:       { label: 'Refund',       color: '#22c55e' },
  income:       { label: 'Income',       color: '#34d399' },
  other:        { label: 'Other',        color: '#71717a' },
};
