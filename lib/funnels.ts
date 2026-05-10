// Funnel math helpers — win check, daily-log aggregation, hit rate.
// Money math (margin, BEROAS-from-pricing, spend/revenue) lives elsewhere
// (the future Finance page). Here BEROAS is a stored number on the funnel.

import type { FunnelDailyLog } from '@/types/funnel';

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
