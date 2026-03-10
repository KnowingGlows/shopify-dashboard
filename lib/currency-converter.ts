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

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
