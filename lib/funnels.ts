// Funnel math helpers — win check, daily-log aggregation, hit rate, BEROAS resolution.
// Spend/revenue/profit logging lives in Finance; here we only deal with
// per-funnel pricing config (SP + delivery rate) and product cost
// (cogs + shipping) — everything needed to compute BEROAS.

import type { Funnel, FunnelDailyLog } from '@/types/funnel';
import type { ProductTrackerEntry } from '@/types/shopify';

/**
 * Resolve the per-unit cost (cogs + shipping) for a product in a given market.
 * Looks up `product.costsByCountry[country]` first, falling back to the base
 * `product.cogs` / `product.shipping` for any field the country override leaves
 * unset. Returns 0 if the product is missing.
 */
export function resolveProductCost(product: ProductTrackerEntry | null | undefined, country?: string): {
  cogs: number;
  shipping: number;
  total: number;
  fromOverride: boolean;
} {
  if (!product) return { cogs: 0, shipping: 0, total: 0, fromOverride: false };
  const baseCogs = Number(product.cogs) || 0;
  const baseShip = Number(product.shipping) || 0;
  const override = country ? product.costsByCountry?.[country] : undefined;
  const cogs = override?.cogs != null ? Number(override.cogs) || 0 : baseCogs;
  const shipping = override?.shipping != null ? Number(override.shipping) || 0 : baseShip;
  const fromOverride = !!override && (override.cogs != null || override.shipping != null);
  return { cogs, shipping, total: cogs + shipping, fromOverride };
}

/**
 * Compute the effective BEROAS for a funnel.
 *
 *   margin = (SP − productCost) / SP × deliveryRate
 *   BEROAS = 1 / margin
 *
 * Auto-compute when the funnel has SP+deliveryRate AND the linked product
 * has cost (cogs + shipping). The product cost is resolved per funnel's
 * country, falling back to the product's base cost. Otherwise fall back to
 * the manual `funnel.beroas` field. Returns 0 if neither path yields a value.
 */
export function effectiveBeroas(funnel: Funnel, product?: ProductTrackerEntry | null): number {
  const sp = Number(funnel.sellingPrice) || 0;
  const dr = (Number(funnel.deliveryRate) || 0) / 100;
  const { total: cost } = resolveProductCost(product, funnel.country);

  if (sp > 0 && cost >= 0 && dr > 0 && sp > cost) {
    const margin = ((sp - cost) / sp) * dr;
    if (margin > 0) return 1 / margin;
  }
  // Fallback: manually-entered value (legacy / when pricing isn't set yet)
  return Math.max(0, Number(funnel.beroas) || 0);
}

/**
 * A funnel is "winning" when its ROAS is at least BEROAS + 1.
 * Returns false when either input is missing/non-positive.
 */
export function isWinning(roas: number, beroas: number): boolean {
  if (!Number.isFinite(beroas) || beroas <= 0) return false;
  if (!Number.isFinite(roas) || roas <= 0) return false;
  return roas >= beroas + 1;
}

export interface AggregatedLog {
  latestRoas: number;     // most recent log's ROAS
  totalOrders: number;
  daysLogged: number;
  lastLogDate: string;
}

export function aggregateLogs(logs: FunnelDailyLog[]): AggregatedLog {
  if (logs.length === 0) {
    return { latestRoas: 0, totalOrders: 0, daysLogged: 0, lastLogDate: '' };
  }
  let totalOrders = 0;
  let lastLogDate = '';
  for (const l of logs) {
    totalOrders += Number(l.orders) || 0;
    if (l.date > lastLogDate) lastLogDate = l.date;
  }
  // Latest ROAS = ROAS from the most recent date
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const latestRoas = Number(sorted[0]?.roas) || 0;
  return { latestRoas, totalOrders, daysLogged: logs.length, lastLogDate };
}

/**
 * Hit rate = % of funnels with latest ROAS ≥ BEROAS + 1.
 * Caller decides which funnels to include (typically only those with at least
 * one log entry — funnels with no data are excluded).
 */
export function hitRate(funnels: Array<{ roas: number; beroas: number }>): number {
  if (funnels.length === 0) return 0;
  const wins = funnels.filter((f) => isWinning(f.roas, f.beroas)).length;
  return (wins / funnels.length) * 100;
}
