// Finance compute — validated delivery/COD analytics (TS port of the worker's compute.js).
// Pure function: takes tracked rows + NOW, returns a metrics object. Unit-tested against real data.
import type { TrackedRow } from './delhivery';

const DAY = 86400000;

export function pd(s?: string | null): Date | null {
  if (!s) return null;
  const t = String(s).split('.')[0].replace('Z', '').slice(0, 19);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +(hh || 0), +(mm || 0), +(ss || 0)));
}

const NDR_PH = [
  'consignee unavailable', 'bad/incomplete address', 'refused to accept', 'office/institute closed',
  'maximum attempts reached', 'destination unable to receive', 'not attempted',
  'no client instructions to reattempt',
];

function isNdr(r: TrackedRow): boolean {
  return (r.scans || []).some(sc => {
    const instr = (sc[1] || '').toLowerCase();
    return NDR_PH.some(p => instr.includes(p));
  });
}

// Delhivery occasionally returns stype='DL' for packages that were actually
// returned to origin (RTO-delivered to the seller, not the buyer). The
// human-readable status string 'RTO' and the ReturnedDate field are the
// reliable disambiguators. Treat any of these signals as RTO regardless of
// the StatusType code.
export function isRto(r: TrackedRow): boolean {
  if (r.stype === 'RT') return true;
  const rd = r.returnedDate;
  if (rd) {
    const t = Date.parse(rd);
    if (!Number.isNaN(t) && new Date(t).getUTCFullYear() > 2000) return true;
  }
  const s = (r.status || '').toUpperCase();
  if (s === 'RTO' || s === 'RTO DELIVERED' || s.startsWith('RTO ')) return true;
  return false;
}

export function isDelivered(r: TrackedRow): boolean {
  // Strict customer-delivery: stype=DL and none of the RTO signals fire.
  return r.stype === 'DL' && !isRto(r);
}

function val(r: TrackedRow): number {
  const c = parseFloat(String(r.cod_amt ?? 0)) || 0;
  const t = parseFloat(String(r.total ?? 0)) || 0;
  return c > 0 ? c : t;
}

// COD cash-in-bank rule (confirmed by Sovansh). delivered weekday -> deposit lands.
// No deposits Sat/Sun; Thu/Fri and weekend collections roll into Mon/Tue.
// getUTCDay(): Sun=0..Sat=6. Offsets in calendar days:
//   Mon(1)->Wed(+2) Tue(2)->Thu(+2) Wed(3)->Fri(+2) Thu(4)->Mon(+4) Fri(5)->Mon(+3) Sat(6)->Tue(+3) Sun(0)->Tue(+2)
const DEPOSIT_OFFSET: Record<number, number> = { 1: 2, 2: 2, 3: 2, 4: 4, 5: 3, 6: 3, 0: 2 };
export function depositDate(deliv: Date): Date {
  return new Date(deliv.getTime() + DEPOSIT_OFFSET[deliv.getUTCDay()] * DAY);
}

const dayLabel = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const wdLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const keyOf = (d: Date) => d.toISOString().slice(0, 10);

export interface DepositRow { date: string; label: string; weekday: string; orders: number; amount: number; confirmed: number; estimated: number; cumulative: number; }
export interface InflowBucket { label: string; amount: number; confirmed: number; estimated: number; orders: number; }
export interface InflowSummary { total: number; confirmed: number; estimated: number; next7: number; next14: number; alreadyDeposited: number; buckets: InflowBucket[]; }
export interface RiskRow { order?: string; waybill: string; dest: string; promised: string; last: string; failed: boolean; }

export interface FinanceMetrics {
  shipped: number; nfin: number;
  delivered: number; rto: number; transit: number;
  dr: number; rr: number; avgTt: number; avgTtRound: number;
  cod: number; pre: number;
  codRr: number; preRr: number; codRtCount: number; codFinCount: number; preRtCount: number; preFinCount: number;
  ndrFlagged: number; ndrComp: number; ndrDl: number; ndrTr: number; ndrRecovery: number; noreatt: number;
  p1: number; pndr: number; P: number; Praw: number;
  codCollected: number; codTransitVal: number; codRtVal: number; codExpTransit: number; codExpOrders: number;
  codExpTotal: number; codShippedVal: number; codAvgVal: number; codDl: number; codTransit: number;
  deposits: DepositRow[];
  inflow: InflowSummary;
  statusCt: [string, number][]; stateCt: [string, number][]; rtoState: [string, number][];
  riskRows: RiskRow[]; atrisk: number;
}

export function compute(R: TrackedRow[], NOW: Date = new Date()): FinanceMetrics {
  // dl = strictly delivered-to-customer (stype=DL AND no RTO signal)
  // rt = RTO via any signal (stype=RT OR returnedDate OR status='RTO')
  // transit = everything else
  const dl = R.filter(isDelivered);
  const rt = R.filter(isRto);
  const transit = R.filter(r => !isDelivered(r) && !isRto(r));
  const nfin = dl.length + rt.length;
  const shipped = R.length;

  const cod = R.filter(r => r.ordertype === 'COD');
  const pre = R.filter(r => r.ordertype === 'Pre-paid');
  const codFin = cod.filter(r => isDelivered(r) || isRto(r));
  const codRt = cod.filter(isRto);
  const preFin = pre.filter(r => isDelivered(r) || isRto(r));
  const preRt = pre.filter(isRto);

  const tts: number[] = [];
  for (const r of dl) {
    const a = pd(r.pickup), b = pd(r.delivered);
    if (a && b) tts.push((b.getTime() - a.getTime()) / DAY);
  }
  const avgTt = tts.length ? tts.reduce((x, y) => x + y, 0) / tts.length : 0;
  const avgTtRound = avgTt ? Math.ceil(avgTt) : 4;

  const ndr = R.filter(isNdr);
  const ndrDl = ndr.filter(isDelivered);
  const ndrRt = ndr.filter(isRto);
  const ndrTr = ndr.filter(r => !isDelivered(r) && !isRto(r));
  const ndrComp = ndrDl.length + ndrRt.length;
  const ndrRecovery = ndrComp ? (ndrDl.length / ndrComp) * 100 : 0;
  const noreatt = ndrRt.filter(r => (r.scans || []).some(sc => (sc[1] || '').toLowerCase().includes('no client instructions to reattempt')));

  const atrisk = transit.filter(r => { const p = pd(r.promised); return p && p < NOW; });

  const faDeliv = dl.filter(r => !isNdr(r));
  const p1 = nfin ? faDeliv.length / nfin : 0;
  const pndr = ndrComp ? ndrDl.length / ndrComp : 0;
  const P = p1 + (1 - p1) * pndr;
  const codTransit = transit.filter(r => r.ordertype === 'COD');
  const codDl = dl.filter(r => r.ordertype === 'COD');
  const codCollected = codDl.reduce((s, r) => s + val(r), 0);
  const codRtVal = codRt.reduce((s, r) => s + val(r), 0);
  const codTransitVal = codTransit.reduce((s, r) => s + val(r), 0);
  const codExpTransit = codTransitVal * P;
  const codExpOrders = codTransit.length * P;
  const codExpTotal = codCollected + codExpTransit;
  const codShippedVal = codCollected + codRtVal + codTransitVal;   // all COD shipped (incl. RTO) — honest AOV
  const codAvgVal = cod.length ? codShippedVal / cod.length : 0;

  const depAmt: Record<string, number> = {}, depCnt: Record<string, number> = {}, depConf: Record<string, number> = {}, depEst: Record<string, number> = {};
  const add = (d: Date, amt: number, cnt: number, kind: 'confirmed' | 'estimated') => {
    const k = keyOf(d);
    depAmt[k] = (depAmt[k] || 0) + amt; depCnt[k] = (depCnt[k] || 0) + cnt;
    if (kind === 'confirmed') depConf[k] = (depConf[k] || 0) + amt; else depEst[k] = (depEst[k] || 0) + amt;
  };
  // Confirmed: COD already delivered to the customer — cash is real, only the D+2 remittance is pending.
  for (const r of codDl) { const dv = pd(r.delivered); if (dv) add(depositDate(dv), val(r), 1, 'confirmed'); }
  // Estimated: still in transit — risk-adjusted by delivery probability P, dated by best available ETA.
  for (const r of codTransit) {
    const prom = pd(r.promised);                                   // courier's promised delivery date (most accurate)
    const pk = pd(r.pickup);
    let est = prom || (pk ? new Date(pk.getTime() + avgTtRound * DAY) : new Date(NOW.getTime() + avgTtRound * DAY));
    // Overdue but still moving: don't pretend it lands tomorrow — give it a fresh transit cycle from today.
    if (est.getTime() < NOW.getTime()) est = new Date(NOW.getTime() + avgTtRound * DAY);
    add(depositDate(est), val(r) * P, P, 'estimated');
  }
  let cum = 0;
  const deposits: DepositRow[] = Object.keys(depAmt).sort().map(k => {
    cum += depAmt[k];
    const d = pd(k)!;
    return { date: k, label: dayLabel(d), weekday: wdLabel(d), orders: depCnt[k], amount: depAmt[k], confirmed: depConf[k] || 0, estimated: depEst[k] || 0, cumulative: cum };
  });

  // ---- inflow: "how much is about to come, and when" — future deposits bucketed by timeframe ----
  const nowDay = Math.floor(NOW.getTime() / DAY);
  const bucketDefs = [
    { label: 'Next 7 days', lo: 0, hi: 7 },
    { label: '8–14 days', lo: 8, hi: 14 },
    { label: '15–30 days', lo: 15, hi: 30 },
    { label: '30+ days', lo: 31, hi: Infinity },
  ];
  const buckets: InflowBucket[] = bucketDefs.map(b => ({ label: b.label, amount: 0, confirmed: 0, estimated: 0, orders: 0 }));
  let alreadyDeposited = 0;
  for (const dep of deposits) {
    const dDay = Math.floor(pd(dep.date)!.getTime() / DAY) - nowDay;
    if (dDay < 0) { alreadyDeposited += dep.amount; continue; }      // remittance date already passed → in the bank
    const bi = bucketDefs.findIndex(b => dDay >= b.lo && dDay <= b.hi);
    if (bi < 0) continue;
    buckets[bi].amount += dep.amount; buckets[bi].confirmed += dep.confirmed; buckets[bi].estimated += dep.estimated; buckets[bi].orders += dep.orders;
  }
  const inflow: InflowSummary = {
    total: buckets.reduce((s, b) => s + b.amount, 0),
    confirmed: buckets.reduce((s, b) => s + b.confirmed, 0),
    estimated: buckets.reduce((s, b) => s + b.estimated, 0),
    next7: buckets[0].amount,
    next14: buckets[0].amount + buckets[1].amount,
    alreadyDeposited,
    buckets,
  };

  const count = (arr: TrackedRow[], key: keyof TrackedRow) =>
    arr.reduce<Record<string, number>>((m, r) => { const k = String(r[key] ?? '—'); m[k] = (m[k] || 0) + 1; return m; }, {});
  const sortDesc = (obj: Record<string, number>): [string, number][] => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const statusCt = sortDesc(count(R, 'status'));
  const stateCt = sortDesc(count(R, 'state')).slice(0, 10);
  const rtoState = sortDesc(count(rt, 'state'));

  const riskRows: RiskRow[] = atrisk.map(r => {
    const failed = ['cancel', 'maximum', 'refus'].some(k => (r.instructions || '').toLowerCase().includes(k));
    return { order: r.order, waybill: r.waybill, dest: `${r.city || ''}, ${r.state || ''}`, promised: (r.promised || '').slice(0, 10), last: r.instructions || '', failed };
  });

  return {
    shipped, nfin, delivered: dl.length, rto: rt.length, transit: transit.length,
    dr: nfin ? (dl.length / nfin) * 100 : 0, rr: nfin ? (rt.length / nfin) * 100 : 0,
    avgTt, avgTtRound,
    cod: cod.length, pre: pre.length,
    codRr: codFin.length ? (codRt.length / codFin.length) * 100 : 0,
    preRr: preFin.length ? (preRt.length / preFin.length) * 100 : 0,
    codRtCount: codRt.length, codFinCount: codFin.length, preRtCount: preRt.length, preFinCount: preFin.length,
    ndrFlagged: ndr.length, ndrComp, ndrDl: ndrDl.length, ndrTr: ndrTr.length, ndrRecovery, noreatt: noreatt.length,
    p1: p1 * 100, pndr: pndr * 100, P: P * 100, Praw: P,
    codCollected, codTransitVal, codRtVal, codExpTransit, codExpOrders, codExpTotal,
    codShippedVal, codAvgVal, codDl: codDl.length, codTransit: codTransit.length,
    deposits, inflow, statusCt, stateCt, rtoState, riskRows, atrisk: atrisk.length,
  };
}

/** Merge several stores' tracked rows into one combined metrics object. */
export function computeCombined(perStore: TrackedRow[][], NOW: Date = new Date()): FinanceMetrics {
  return compute(perStore.flat(), NOW);
}
