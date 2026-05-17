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

export function formatCurrency(amount: number, currency: 'INR' | 'USD'): string {
  if (currency === 'USD') {
    return formatUSD(convertINRtoUSD(amount));
  }
  return formatINR(amount);
}

// ── USD/INR helpers ──────────────────────────────────────────────────────────
// India-only. The only conversion left is USD↔INR (for COGS often sourced in
// USD). Rates come from `lib/fx-rates.ts` and are USD-based (₹ per $1).

export type SupportedCurrency = 'USD' | 'INR';

export type UsdRates = { USD: number; INR: number };

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
  if (to === 'INR') return formatINR(converted);
  return formatUSD(converted);
}

/**
 * Format an INR-native amount in the chosen display currency.
 * All money in the app is stored in ₹. When USD is selected we divide by the
 * live ₹-per-$ rate. This is the ONLY money formatter UI pages should use for
 * the currency toggle — `formatFromUSD` is for legacy USD-stored data only.
 */
export function formatMoney(amountInr: number, currency: SupportedCurrency, inrPerUsd: number): string {
  if (!Number.isFinite(amountInr)) amountInr = 0;
  if (currency === 'USD') return formatUSD(inrPerUsd > 0 ? amountInr / inrPerUsd : 0);
  return formatINR(amountInr);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
