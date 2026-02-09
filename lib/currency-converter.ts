import { ExchangeRates } from '@/types/shopify';

// Approximate INR to USD rate (can be made dynamic later)
const INR_TO_USD_RATE = 0.012; // ~83 INR = 1 USD

export function convertToINR(
  amount: number,
  currency: string
): number {
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
