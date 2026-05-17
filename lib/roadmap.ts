// Cohort scale-up roadmap engine.
//
// Mental model: each month you onboard a batch of winning products. A product
// launches at a starting ₹/day and ramps toward its ceiling with diminishing
// returns (complexity rises as you push it). Capital + credit gate how many
// products you can fund at once (working capital = ad spend + credit-funded
// cost floated over the cash-conversion cycle). Net profit can be reinvested
// to grow the capital base, which unlocks more launches — a compounding
// roadmap. The engine reports when the portfolio's blended ₹/day crosses the
// target, and where capital throttles you.

import { compute3PL, type ThreePLInput } from '@/lib/3pl';

export interface RoadmapEconomics {
  sellingPrice: number;     // AOV ₹
  cogsPerUnit: number;      // ₹
  deliveryRate: number;     // %
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
  baselineRevPerDay: number;   // today's flat run-rate, assumed steady
  winnersPerMonth: number;     // new scalable winners onboarded / month
  startPerDay: number;         // a fresh winner's ₹/day at launch
  ceilingPerDay: number;       // a product's sustainable ₹/day ceiling
  monthsToCeiling: number;     // ~time to approach the ceiling (diminishing)
  capital: number;             // own cash
  creditLine: number;          // credit available
  reinvestPct: number;         // % of monthly net folded back into capital
  capitalInjectionPerMonth: number;
  creditGrowthPctPerMonth: number;
  maxHorizonMonths: number;
}

export interface RoadmapRow {
  month: number;               // 0-indexed months from now
  label: string;               // YYYY-MM
  launches: number;            // new winners actually funded this month
  liveProducts: number;
  revPerDay: number;           // blended portfolio ₹/day (incl. baseline)
  pctOfTarget: number;
  adPerDay: number;
  netPerDay: number;
  cumNet: number;              // cumulative net profit to date
  workingCapital: number;
  available: number;           // capital + credit at this month
  flag: 'ok' | 'capital-limited' | 'throttled';
}

export interface RoadmapResult {
  rows: RoadmapRow[];
  etaMonth: number | null;     // first month portfolio ≥ target
  peakRevPerDay: number;
  reached: boolean;
}

export interface ProductSnapshot {
  shipped: number;   // orders / day for one product at this ₹/day
  net: number;       // net profit / day
  ad: number;        // ad spend / day
  wc: number;        // working capital to carry it over the cash cycle
  grossMarginPct: number;
}

/** One product running steady-state at `revPerDay` ₹/day. */
export function productSnapshot(econ: RoadmapEconomics, revPerDay: number): ProductSnapshot {
  const sp = econ.sellingPrice;
  const d = Math.min(1, Math.max(0, econ.deliveryRate / 100));
  const shipped = revPerDay <= 0 ? 0
    : econ.revenueType === 'booked'
      ? (sp > 0 ? revPerDay / sp : 0)
      : (sp > 0 && d > 0 ? revPerDay / (sp * d) : 0);
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
  const wc = (r.outAds + r.financed) * Math.max(0, econ.cashCycleDays);
  return { shipped, net: r.netProfit, ad: r.outAds, wc, grossMarginPct: r.grossMarginPct };
}

const perProduct = productSnapshot;

/** Working-capital cost to carry one product steady-state at `rev` ₹/day. */
export function workingCapitalFor(econ: RoadmapEconomics, revPerDay: number): number {
  return perProduct(econ, revPerDay).wc;
}

function monthLabel(offset: number): string {
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit' }).format(dt);
}

export function runRoadmap(inp: RoadmapInput): RoadmapResult {
  const { econ } = inp;
  const start = Math.min(inp.startPerDay, inp.ceilingPerDay > 0 ? inp.ceilingPerDay : inp.startPerDay);
  const ceiling = Math.max(inp.ceilingPerDay, start);
  // Asymptotic ramp: ~95% of the gap closed by monthsToCeiling.
  const tau = Math.max(0.25, inp.monthsToCeiling / 3);
  const ramp = (ageMonths: number) =>
    ceiling - (ceiling - start) * Math.exp(-Math.max(0, ageMonths) / tau);

  let capitalPart = Math.max(0, inp.capital);
  let creditPart = Math.max(0, inp.creditLine);
  const cohorts: Array<{ launch: number; count: number }> = [];
  const rows: RoadmapRow[] = [];
  let cumNet = 0;
  let etaMonth: number | null = null;
  let peak = 0;
  const horizon = Math.max(1, Math.min(120, Math.round(inp.maxHorizonMonths)));

  for (let m = 0; m <= horizon; m++) {
    const available = capitalPart + creditPart;

    // Unthrottled per-product revenue for each existing cohort at this month.
    const live = cohorts.map((c) => ({ count: c.count, rev: ramp(m - c.launch) }));
    const liveCount = cohorts.reduce((s, c) => s + c.count, 0);

    // Working capital if everything ran unthrottled (existing only).
    const wcBaseline = inp.baselineRevPerDay > 0 ? perProduct(econ, inp.baselineRevPerDay).wc : 0;
    let wcExisting = wcBaseline;
    for (const l of live) wcExisting += l.count * perProduct(econ, l.rev).wc;

    let scale = 1;
    let launches = 0;
    let flag: RoadmapRow['flag'] = 'ok';

    if (wcExisting > available && wcExisting > 0) {
      // Can't even fund the live book — pause/throttle spend proportionally.
      scale = available / wcExisting;
      flag = 'throttled';
    } else {
      const headroom = available - wcExisting;
      const wcNew = perProduct(econ, start).wc;
      launches = wcNew > 0 ? Math.min(inp.winnersPerMonth, Math.floor(headroom / wcNew)) : inp.winnersPerMonth;
      launches = Math.max(0, launches);
      if (launches < inp.winnersPerMonth) flag = 'capital-limited';
      if (launches > 0) cohorts.push({ launch: m, count: launches });
    }

    // Totals with throttle scale applied (new launches enter at `start`).
    let revPerDay = inp.baselineRevPerDay * scale;
    let adPerDay = inp.baselineRevPerDay > 0 ? perProduct(econ, inp.baselineRevPerDay * scale).ad : 0;
    let netPerDay = inp.baselineRevPerDay > 0 ? perProduct(econ, inp.baselineRevPerDay * scale).net : 0;
    let workingCapital = inp.baselineRevPerDay > 0 ? perProduct(econ, inp.baselineRevPerDay * scale).wc : 0;
    for (const c of cohorts) {
      const rev = ramp(m - c.launch) * scale;
      const pp = perProduct(econ, rev);
      revPerDay += c.count * rev;
      adPerDay += c.count * pp.ad;
      netPerDay += c.count * pp.net;
      workingCapital += c.count * pp.wc;
    }

    cumNet += netPerDay * 30;
    peak = Math.max(peak, revPerDay);
    if (etaMonth === null && revPerDay >= inp.targetRevPerDay && inp.targetRevPerDay > 0) etaMonth = m;

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
      flag,
    });

    // Compound: reinvest retained profit, scheduled injection, credit growth.
    capitalPart += Math.max(0, netPerDay * 30 * (inp.reinvestPct / 100)) + inp.capitalInjectionPerMonth;
    creditPart *= 1 + inp.creditGrowthPctPerMonth / 100;

    if (etaMonth !== null && m >= etaMonth + 2) break; // a little past the goal
  }

  return { rows, etaMonth, peakRevPerDay: peak, reached: etaMonth !== null };
}
