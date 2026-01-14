import { ExchangeRates } from '@/types/shopify';

// Since all stores are in INR, we can use simple conversion
// This can be extended later if needed for stores in different currencies

export function convertToINR(
  amount: number,
  currency: string
): number {
  // All stores are in INR, so just return the amount
  return amount;
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
