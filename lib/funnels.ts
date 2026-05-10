// Funnel math helpers — margin, BEROAS, win check, daily-log aggregation.
// All amounts are USD; conversion happens at the display layer.

import type { Funnel, FunnelDailyLog } from '@/types/funnel';

type PricingInputs = Pick<Funnel, 'sellingPrice' | 'costPrice' | 'deliveryRate'>;

/**
 * Margin = (SP − CP) / SP × (deliveryRate%).
 * Same formula as the calculator's Margin section. Returns 0 when SP ≤ 0.
 */
export function marginFor(p: PricingInputs): number {
  const sp = Number(p.sellingPrice) || 0;
  const cp = Number(p.costPrice) || 0;
  const dr = (Number(p.deliveryRate) || 0) / 100;
  if (sp <= 0) return 0;
  return ((sp - cp) / sp) * dr;
}

/**
 * Breakeven ROAS = 1 / margin. Returns Infinity when margin ≤ 0
 * (caller should treat as "not computable").
 */
export function beroasFor(p: PricingInputs): number {
  const m = marginFor(p);
  if (m <= 0) return Infinity;
  return 1 / m;
}

/**
 * Per the user's definition: a funnel is "winning" when ROAS ≥ BEROAS + 1.
 * Returns false if BEROAS isn't computable (e.g. zero margin).
 */
export function isWinning(roas: number, beroas: number): boolean {
  if (!Number.isFinite(beroas)) return false;
  if (!Number.isFinite(roas)) return false;
  return roas >= beroas + 1;
}

export interface AggregatedLog {
  totalSpend: number;
  totalRevenue: number;
  totalProfit: number;
  totalOrders: number;
  blendedRoas: number;
  daysLogged: number;
  lastLogDate: string;
}

export function aggregateLogs(logs: FunnelDailyLog[]): AggregatedLog {
  if (logs.length === 0) {
    return { totalSpend: 0, totalRevenue: 0, totalProfit: 0, totalOrders: 0, blendedRoas: 0, daysLogged: 0, lastLogDate: '' };
  }
  let totalSpend = 0, totalRevenue = 0, totalProfit = 0, totalOrders = 0;
  let lastLogDate = '';
  for (const l of logs) {
    totalSpend += Number(l.spend) || 0;
    totalRevenue += Number(l.revenue) || 0;
    totalProfit += Number(l.profit) || 0;
    totalOrders += Number(l.orders) || 0;
    if (l.date > lastLogDate) lastLogDate = l.date;
  }
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  return { totalSpend, totalRevenue, totalProfit, totalOrders, blendedRoas, daysLogged: logs.length, lastLogDate };
}

/**
 * Hit rate = % of funnels with ROAS ≥ BEROAS + 1. Caller passes pre-computed
 * { roas, beroas } pairs (typically blendedRoas from aggregateLogs and BEROAS
 * from the funnel's own pricing).
 */
export function hitRate(funnels: Array<{ roas: number; beroas: number }>): number {
  if (funnels.length === 0) return 0;
  const wins = funnels.filter((f) => isWinning(f.roas, f.beroas)).length;
  return (wins / funnels.length) * 100;
}
