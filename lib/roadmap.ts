// Cohort scale-up roadmap engine.
//
// Model: each month you onboard a batch of winning products. A product launches
// at a starting ₹/day and ramps toward its ceiling with diminishing returns.
//
// Working capital = the cash floated (ad spend + everything funded on credit)
// over the cash-conversion cycle before COD collection returns. A credit line
// funds a FIXED % of the procurement cost (revolving over that same cycle —
// that's how supplier/financier lines actually work), so the owner only has to
// fund the rest from real capital. Retained net profit compounds that capital
// base, unlocking more launches.
//
// The engine segments the path into phases, identifies the binding constraint
// over time, and back-solves the cheapest single lever to hit a target month.

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
  creditPctOfProcurement: number;   // 0–100: share of procurement the line funds
  reinvestPct: number;
  capitalInjectionPerMonth: number;
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
  workingCapital: number;   // gross float
  creditDrawn: number;      // covered by the credit line
  ownerCapital: number;     // owner cash that must cover the rest (= capital available this month)
  binding: Binding;
  throttled: boolean;
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
  procurement: number;   // per-day cash to get stock in (COGS+inward, GST-incl)
  wc: number;            // gross working capital floated over the cash cycle
  grossMarginPct: number;
}

const clampRate = (pct: number) => Math.min(1, Math.max(0, pct / 100));

export function productSnapshot(econ: RoadmapEconomics, revPerDay: number): ProductSnapshot {
  const sp = econ.sellingPrice;
  const dr = clampRate(econ.deliveryRate);
  if (!(sp > 0) || revPerDay <= 0) {
    return { shipped: 0, net: 0, ad: 0, financed: 0, procurement: 0, wc: 0, grossMarginPct: 0 };
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
  const wc = (r.outAds + r.financed) * cc;
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  return {
    shipped: safe(shipped),
    net: safe(r.netProfit),
    ad: safe(r.outAds),
    financed: safe(r.financed),
    procurement: safe(r.procurementCost),
    wc: safe(wc),
    grossMarginPct: safe(r.grossMarginPct),
  };
}

/** Credit the line covers for one product = creditPct% of its procurement
 *  float over the cash cycle (capped at the gross working capital). */
function creditCover(snap: ProductSnapshot, econ: RoadmapEconomics, creditPct: number): number {
  const cc = Math.max(0, econ.cashCycleDays);
  const cover = clampRate(creditPct) * snap.procurement * cc;
  return Math.min(snap.wc, Math.max(0, cover));
}

/** What the OWNER's own capital must fund for one product (gross WC − credit). */
export function ownerWcFor(econ: RoadmapEconomics, revPerDay: number, creditPct: number): number {
  const s = productSnapshot(econ, revPerDay);
  return Math.max(0, s.wc - creditCover(s, econ, creditPct));
}

/** Portfolio metrics for a target ₹/day made of products capped at `ceiling`,
 *  last product only partially loaded (no over-count). */
export function portfolioAt(econ: RoadmapEconomics, targetRevDay: number, ceiling: number, creditPct = 0) {
  if (!(ceiling > 0) || targetRevDay <= 0) {
    return { products: 0, full: 0, remainder: 0, net: 0, ad: 0, wc: 0, credit: 0, ownerWc: 0, gm: 0, orders: 0 };
  }
  const full = Math.floor(targetRevDay / ceiling);
  const remainder = targetRevDay - full * ceiling;
  const sFull = productSnapshot(econ, ceiling);
  const sRem = remainder > 1 ? productSnapshot(econ, remainder) : null;
  const cFull = creditCover(sFull, econ, creditPct);
  const cRem = sRem ? creditCover(sRem, econ, creditPct) : 0;
  const wc = full * sFull.wc + (sRem?.wc ?? 0);
  const credit = full * cFull + cRem;
  return {
    products: full + (sRem ? 1 : 0),
    full,
    remainder,
    net: full * sFull.net + (sRem?.net ?? 0),
    ad: full * sFull.ad + (sRem?.ad ?? 0),
    wc,
    credit,
    ownerWc: Math.max(0, wc - credit),
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
  const creditPct = inp.creditPctOfProcurement;
  const start = Math.max(0, Math.min(inp.startPerDay, inp.ceilingPerDay > 0 ? inp.ceilingPerDay : inp.startPerDay));
  const ceiling = Math.max(inp.ceilingPerDay, start, 1);
  const tau = Math.max(0.25, inp.monthsToCeiling / 3);
  const ramp = (age: number) => ceiling - (ceiling - start) * Math.exp(-Math.max(0, age) / tau);

  let capital = Math.max(0, inp.capital);  // owner cash; compounds with profit
  const cohorts: Array<{ launch: number; count: number }> = [];
  const rows: RoadmapRow[] = [];
  let cumNet = 0;
  let etaMonth: number | null = null;
  let peak = 0;
  let capBound = 0;
  const horizon = Math.max(1, Math.min(120, Math.round(inp.maxHorizonMonths)));
  const ownerWcNew = ownerWcFor(econ, start, creditPct);
  const baseSnap = inp.baselineRevPerDay > 0 ? productSnapshot(econ, inp.baselineRevPerDay) : null;

  for (let m = 0; m <= horizon; m++) {
    const liveCount = cohorts.reduce((s, c) => s + c.count, 0);

    // Owner-funded working capital of the live book (after credit cover).
    let ownerExisting = baseSnap ? Math.max(0, baseSnap.wc - creditCover(baseSnap, econ, creditPct)) : 0;
    for (const c of cohorts) {
      const s = productSnapshot(econ, ramp(m - c.launch));
      ownerExisting += c.count * Math.max(0, s.wc - creditCover(s, econ, creditPct));
    }

    let scale = 1;
    let launches = 0;
    let throttled = false;

    if (ownerExisting > capital && ownerExisting > 0) {
      scale = capital / ownerExisting;
      throttled = true;
    } else {
      const headroom = capital - ownerExisting;
      launches = ownerWcNew > 0
        ? Math.max(0, Math.min(inp.winnersPerMonth, Math.floor(headroom / ownerWcNew)))
        : inp.winnersPerMonth;
      if (launches > 0) cohorts.push({ launch: m, count: launches });
    }

    let revPerDay = inp.baselineRevPerDay * scale;
    let adPerDay = 0, netPerDay = 0, workingCapital = 0, creditDrawn = 0;
    const acc = (rev: number, count: number) => {
      const pp = productSnapshot(econ, rev);
      const cov = creditCover(pp, econ, creditPct);
      revPerDay += count * rev;
      adPerDay += count * pp.ad;
      netPerDay += count * pp.net;
      workingCapital += count * pp.wc;
      creditDrawn += count * cov;
    };
    if (baseSnap) acc(inp.baselineRevPerDay * scale, 1);
    for (const c of cohorts) acc(ramp(m - c.launch) * scale, c.count);

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
      creditDrawn,
      ownerCapital: capital,
      binding,
      throttled,
    });

    capital += Math.max(0, netPerDay * 30 * (inp.reinvestPct / 100)) + inp.capitalInjectionPerMonth;

    if (etaMonth !== null && m >= etaMonth + 1) break;
  }

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

export type Lever = 'capital' | 'creditPct' | 'winnersPerMonth' | 'roas' | 'reinvestPct';

/** Smallest value of `lever` (others held) that hits the target by `byMonth`. */
export function solveLever(
  inp: RoadmapInput, lever: Lever, byMonth: number,
): { value: number; from: number; reachable: boolean } | null {
  const current =
    lever === 'capital' ? inp.capital :
    lever === 'creditPct' ? inp.creditPctOfProcurement :
    lever === 'winnersPerMonth' ? inp.winnersPerMonth :
    lever === 'roas' ? inp.econ.roas :
    inp.reinvestPct;

  const withVal = (x: number): RoadmapInput =>
    lever === 'roas'
      ? { ...inp, econ: { ...inp.econ, roas: x } }
      : lever === 'creditPct'
        ? { ...inp, creditPctOfProcurement: x }
        : { ...inp, [lever]: x } as RoadmapInput;

  const hits = (x: number) => {
    const e = runRoadmap(withVal(x)).etaMonth;
    return e !== null && e <= byMonth;
  };
  if (hits(current)) return { value: current, from: current, reachable: true };

  const hi =
    lever === 'reinvestPct' || lever === 'creditPct' ? 100 :
    lever === 'winnersPerMonth' ? Math.max(current, 1) * 12 + 50 :
    lever === 'roas' ? Math.max(current, 0.1) * 8 + 4 :
    Math.max(current, 1) * 50;

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
