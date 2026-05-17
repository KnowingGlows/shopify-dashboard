// Cohort scale-up roadmap engine.
//
// Model: each month you onboard a batch of winning products. A product launches
// at a starting ₹/day and ramps toward its ceiling with diminishing returns.
// Capital + credit gate how many products you can fund concurrently — working
// capital = the cash floated (ad spend + credit-funded cost) over the
// cash-conversion cycle before COD collection returns. Retained net profit
// compounds the capital base, unlocking more launches.
//
// The engine also segments the path into phases, identifies the binding
// constraint over time, and back-solves the cheapest single lever to hit the
// target by a chosen month.

import { compute3PL, type ThreePLInput } from '@/lib/3pl';

export interface RoadmapEconomics {
  sellingPrice: number;
  cogsPerUnit: number;
  deliveryRate: number;
  roas: number;
  unitsPerOrder: number;
  weightGrams: number;
  storageDays: number;
  financingFeePct: number;
  spGstInclusive: boolean;
  chargeOutputGst: boolean;
  revenueType: 'booked' | 'collected';
  cashCycleDays: number;
}

export interface RoadmapInput {
  econ: RoadmapEconomics;
  targetRevPerDay: number;
  baselineRevPerDay: number;
  winnersPerMonth: number;
  startPerDay: number;
  ceilingPerDay: number;
  monthsToCeiling: number;
  capital: number;
  creditLine: number;
  reinvestPct: number;
  capitalInjectionPerMonth: number;
  creditGrowthPctPerMonth: number;
  maxHorizonMonths: number;
}

export type Binding = 'capital' | 'cadence' | 'ramp' | 'target';

export interface RoadmapRow {
  month: number;
  label: string;
  launches: number;
  liveProducts: number;
  revPerDay: number;
  pctOfTarget: number;
  adPerDay: number;
  netPerDay: number;
  cumNet: number;
  workingCapital: number;
  available: number;
  binding: Binding;
  throttled: boolean;     // had to cut spend on the live book to fit cash
}

export interface RoadmapPhase {
  fromMonth: number;
  toMonth: number;
  binding: Binding;
  months: number;
  revStart: number;
  revEnd: number;
  cumNetDelta: number;
}

export interface RoadmapResult {
  rows: RoadmapRow[];
  etaMonth: number | null;
  reached: boolean;
  peakRevPerDay: number;
  monthsCapitalBound: number;
  phases: RoadmapPhase[];
}

export interface ProductSnapshot {
  shipped: number;
  net: number;
  ad: number;
  financed: number;
  wc: number;
  grossMarginPct: number;
}

const clampRate = (pct: number) => Math.min(1, Math.max(0, pct / 100));

export function productSnapshot(econ: RoadmapEconomics, revPerDay: number): ProductSnapshot {
  const sp = econ.sellingPrice;
  const dr = clampRate(econ.deliveryRate);
  if (!(sp > 0) || revPerDay <= 0) {
    return { shipped: 0, net: 0, ad: 0, financed: 0, wc: 0, grossMarginPct: 0 };
  }
  const shipped = econ.revenueType === 'booked'
    ? revPerDay / sp
    : (dr > 0 ? revPerDay / (sp * dr) : 0);
  const input: ThreePLInput = {
    sellingPrice: sp,
    cogsPerUnit: econ.cogsPerUnit,
    deliveryRate: econ.deliveryRate,
    roas: econ.roas,
    orders: shipped,
    unitsPerOrder: Math.max(1, econ.unitsPerOrder),
    weightGrams: econ.weightGrams,
    storageDays: econ.storageDays,
    financingFeePct: econ.financingFeePct,
    spGstInclusive: econ.spGstInclusive,
    chargeOutputGst: econ.chargeOutputGst,
  };
  const r = compute3PL(input);
  const cc = Math.max(0, econ.cashCycleDays);
  // Cash floated each day (ads + everything funded on credit) sits out for the
  // cash cycle before COD returns → that's the standing working capital.
  const wc = (r.outAds + r.financed) * cc;
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  return {
    shipped: safe(shipped),
    net: safe(r.netProfit),
    ad: safe(r.outAds),
    financed: safe(r.financed),
    wc: safe(wc),
    grossMarginPct: safe(r.grossMarginPct),
  };
}

export function workingCapitalFor(econ: RoadmapEconomics, revPerDay: number): number {
  return productSnapshot(econ, revPerDay).wc;
}

/** Portfolio metrics for a target ₹/day made of products capped at `ceiling`,
 *  with the last product only partially loaded (no over-count). */
export function portfolioAt(econ: RoadmapEconomics, targetRevDay: number, ceiling: number) {
  if (!(ceiling > 0) || targetRevDay <= 0) {
    return { products: 0, full: 0, remainder: 0, net: 0, ad: 0, wc: 0, gm: 0, orders: 0 };
  }
  const full = Math.floor(targetRevDay / ceiling);
  const remainder = targetRevDay - full * ceiling;
  const sFull = productSnapshot(econ, ceiling);
  const sRem = remainder > 1 ? productSnapshot(econ, remainder) : null;
  const products = full + (sRem ? 1 : 0);
  return {
    products,
    full,
    remainder,
    net: full * sFull.net + (sRem?.net ?? 0),
    ad: full * sFull.ad + (sRem?.ad ?? 0),
    wc: full * sFull.wc + (sRem?.wc ?? 0),
    orders: full * sFull.shipped + (sRem?.shipped ?? 0),
    gm: sFull.grossMarginPct,
  };
}

function monthLabel(offset: number): string {
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return new Intl.DateTimeFormat('en-US', { year: '2-digit', month: 'short' }).format(dt);
}

export function runRoadmap(inp: RoadmapInput): RoadmapResult {
  const { econ } = inp;
  const start = Math.max(0, Math.min(inp.startPerDay, inp.ceilingPerDay > 0 ? inp.ceilingPerDay : inp.startPerDay));
  const ceiling = Math.max(inp.ceilingPerDay, start, 1);
  const tau = Math.max(0.25, inp.monthsToCeiling / 3); // ~95% closed by monthsToCeiling
  const ramp = (age: number) => ceiling - (ceiling - start) * Math.exp(-Math.max(0, age) / tau);

  let capitalPart = Math.max(0, inp.capital);
  let creditPart = Math.max(0, inp.creditLine);
  const cohorts: Array<{ launch: number; count: number }> = [];
  const rows: RoadmapRow[] = [];
  let cumNet = 0;
  let etaMonth: number | null = null;
  let peak = 0;
  let capBound = 0;
  const horizon = Math.max(1, Math.min(120, Math.round(inp.maxHorizonMonths)));
  const wcNewProduct = productSnapshot(econ, start).wc;
  const baseSnap = inp.baselineRevPerDay > 0 ? productSnapshot(econ, inp.baselineRevPerDay) : null;

  for (let m = 0; m <= horizon; m++) {
    const available = capitalPart + creditPart;
    const liveCount = cohorts.reduce((s, c) => s + c.count, 0);

    let wcExisting = baseSnap?.wc ?? 0;
    for (const c of cohorts) wcExisting += c.count * productSnapshot(econ, ramp(m - c.launch)).wc;

    let scale = 1;
    let launches = 0;
    let throttled = false;

    if (wcExisting > available && wcExisting > 0) {
      scale = available / wcExisting;            // pull back spend on the live book
      throttled = true;
    } else {
      const headroom = available - wcExisting;
      launches = wcNewProduct > 0
        ? Math.max(0, Math.min(inp.winnersPerMonth, Math.floor(headroom / wcNewProduct)))
        : inp.winnersPerMonth;
      if (launches > 0) cohorts.push({ launch: m, count: launches });
    }

    let revPerDay = inp.baselineRevPerDay * scale;
    let adPerDay = baseSnap ? productSnapshot(econ, inp.baselineRevPerDay * scale).ad : 0;
    let netPerDay = baseSnap ? productSnapshot(econ, inp.baselineRevPerDay * scale).net : 0;
    let workingCapital = baseSnap ? productSnapshot(econ, inp.baselineRevPerDay * scale).wc : 0;
    for (const c of cohorts) {
      const rev = ramp(m - c.launch) * scale;
      const pp = productSnapshot(econ, rev);
      revPerDay += c.count * rev;
      adPerDay += c.count * pp.ad;
      netPerDay += c.count * pp.net;
      workingCapital += c.count * pp.wc;
    }

    cumNet += netPerDay * 30;
    peak = Math.max(peak, revPerDay);
    const reachedNow = inp.targetRevPerDay > 0 && revPerDay >= inp.targetRevPerDay;
    if (etaMonth === null && reachedNow) etaMonth = m;

    const capLimited = !throttled && launches < inp.winnersPerMonth && !reachedNow;
    if (throttled || capLimited) capBound++;
    const binding: Binding = reachedNow ? 'target'
      : throttled || capLimited ? 'capital'
      : launches >= inp.winnersPerMonth ? 'ramp'
      : 'cadence';

    rows.push({
      month: m,
      label: monthLabel(m),
      launches,
      liveProducts: liveCount + launches,
      revPerDay,
      pctOfTarget: inp.targetRevPerDay > 0 ? (revPerDay / inp.targetRevPerDay) * 100 : 0,
      adPerDay,
      netPerDay,
      cumNet,
      workingCapital,
      available,
      binding,
      throttled,
    });

    capitalPart += Math.max(0, netPerDay * 30 * (inp.reinvestPct / 100)) + inp.capitalInjectionPerMonth;
    creditPart *= 1 + inp.creditGrowthPctPerMonth / 100;

    if (etaMonth !== null && m >= etaMonth + 1) break;
  }

  // Segment consecutive rows sharing a binding into phases.
  const phases: RoadmapPhase[] = [];
  for (const row of rows) {
    const last = phases[phases.length - 1];
    if (last && last.binding === row.binding) {
      last.toMonth = row.month;
      last.months += 1;
      last.revEnd = row.revPerDay;
      last.cumNetDelta = row.cumNet - (rows[Math.max(0, last.fromMonth - 1)]?.cumNet ?? 0);
    } else {
      phases.push({
        fromMonth: row.month,
        toMonth: row.month,
        binding: row.binding,
        months: 1,
        revStart: row.revPerDay,
        revEnd: row.revPerDay,
        cumNetDelta: row.netPerDay * 30,
      });
    }
  }

  return {
    rows,
    etaMonth,
    reached: etaMonth !== null,
    peakRevPerDay: peak,
    monthsCapitalBound: capBound,
    phases,
  };
}

export type Lever = 'capital' | 'creditLine' | 'winnersPerMonth' | 'roas' | 'reinvestPct';

/** Smallest value of `lever` (others held) that hits the target by `byMonth`.
 *  Returns the new value + the delta vs current, or null if unreachable in range. */
export function solveLever(
  inp: RoadmapInput, lever: Lever, byMonth: number,
): { value: number; from: number; reachable: boolean } | null {
  const current =
    lever === 'capital' ? inp.capital :
    lever === 'creditLine' ? inp.creditLine :
    lever === 'winnersPerMonth' ? inp.winnersPerMonth :
    lever === 'roas' ? inp.econ.roas :
    inp.reinvestPct;

  const withVal = (x: number): RoadmapInput =>
    lever === 'roas'
      ? { ...inp, econ: { ...inp.econ, roas: x } }
      : { ...inp, [lever]: x } as RoadmapInput;

  const hits = (x: number) => {
    const e = runRoadmap(withVal(x)).etaMonth;
    return e !== null && e <= byMonth;
  };
  if (hits(current)) return { value: current, from: current, reachable: true };

  // Upper bound per lever, then bisect for the minimal value that hits.
  const hi =
    lever === 'reinvestPct' ? 100 :
    lever === 'winnersPerMonth' ? Math.max(current, 1) * 12 + 50 :
    lever === 'roas' ? Math.max(current, 0.1) * 8 + 4 :
    Math.max(current, 1) * 50; // capital / credit headroom

  if (!hits(hi)) return { value: hi, from: current, reachable: false };

  let lo = current;
  let h = hi;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + h) / 2;
    if (hits(mid)) h = mid; else lo = mid;
  }
  const val = lever === 'winnersPerMonth' ? Math.ceil(h) : h;
  return { value: val, from: current, reachable: true };
}
