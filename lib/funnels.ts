// LP math helpers — win check, daily-log aggregation, hit rate, BEROAS.
//
// Economics live on the PRODUCT now (selling price + COGS + delivery rate →
// BEROAS via the shared 3PL engine). An LP just inherits its product's BEROAS
// and is judged against it. Spend/revenue/profit logging lives in Finance.

import type { Funnel, FunnelDailyLog } from '@/types/funnel';
import type { ProductTrackerEntry } from '@/types/shopify';
import { productBeroasOf } from '@/lib/3pl';

/**
 * The effective BEROAS for an LP = its linked product's BEROAS, computed from
 * the product's selling price, COGS (₹) and delivery rate through the shared
 * 3PL engine. Returns 0 when the product (or its pricing) isn't set yet.
 *
 * The `_funnel` arg is kept so existing call sites don't all have to change;
 * BEROAS no longer varies per LP.
 */
export function effectiveBeroas(_funnel: Funnel, product?: ProductTrackerEntry | null): number {
  if (!product) return 0;
  const sp = Number(product.sellingPrice) || 0;
  const dr = Number(product.deliveryRate) || 0;
  if (sp <= 0 || dr <= 0) return 0;
  return productBeroasOf(product);
}

/**
 * Display label for an LP: its given name, else the LP link host, else the
 * product name. Use this everywhere an LP is shown so naming is consistent.
 */
export function lpLabel(f: { name?: string; funnelishUrl?: string; productName?: string }): string {
  if (f.name && f.name.trim()) return f.name.trim();
  if (f.funnelishUrl && f.funnelishUrl.trim()) {
    return f.funnelishUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
  return (f.productName && f.productName.trim()) || 'Unnamed LP';
}

/**
 * An LP is "winning" when its ROAS is at least BEROAS + 1.
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
 * Hit rate = % of LPs with latest ROAS ≥ BEROAS + 1.
 * Caller decides which LPs to include (typically only those with at least
 * one log entry — LPs with no data are excluded).
 */
export function hitRate(funnels: Array<{ roas: number; beroas: number }>): number {
  if (funnels.length === 0) return 0;
  const wins = funnels.filter((f) => isWinning(f.roas, f.beroas)).length;
  return (wins / funnels.length) * 100;
}
