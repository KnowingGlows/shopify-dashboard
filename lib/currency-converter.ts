// 1 USD = 90.7 INR
const INR_TO_USD_RATE = 1 / 90.7;

export function convertToINR(amount: number, _currency: string): number {
  // All stores are in INR, so just return the amount
  return amount;
}

export function convertINRtoUSD(amount: number): number {
  return amount * INR_TO_USD_RATE;
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatEUR(amount: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrency(amount: number, currency: 'INR' | 'USD'): string {
  if (currency === 'USD') {
    return formatUSD(convertINRtoUSD(amount));
  }
  return formatINR(amount);
}

// ── International (USD-base) helpers ─────────────────────────────────────────
// New funnel/creative data is stored in USD. The rates passed here come from
// `lib/fx-rates.ts` and are USD-based.

export type SupportedCurrency = 'USD' | 'EUR' | 'INR';

export type UsdRates = { USD: number; EUR: number; INR: number };

/**
 * Convert an amount from USD to one of the supported display currencies
 * using a USD-base rate object.
 */
export function fromUSD(amount: number, to: SupportedCurrency, rates: UsdRates): number {
  if (!Number.isFinite(amount)) return 0;
  const rate = rates[to] ?? 1;
  return amount * rate;
}

/**
 * Format a USD amount in the chosen display currency.
 */
export function formatFromUSD(amount: number, to: SupportedCurrency, rates: UsdRates): string {
  const converted = fromUSD(amount, to, rates);
  if (to === 'EUR') return formatEUR(converted);
  if (to === 'INR') return formatINR(converted);
  return formatUSD(converted);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
