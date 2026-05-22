'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Wallet, Package, Receipt, Plus, Trash2, Download, ChevronDown, X, TrendingUp } from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { DatePicker } from '@/components/date-picker';
import { formatINR, formatUSD } from '@/lib/currency-converter';
import { compute3PL, type FulfilmentMode } from '@/lib/3pl';

// ── Plan model ─────────────────────────────────────────────────────────────
interface PProduct {
  id: string;
  name: string;
  mode: FulfilmentMode;
  sellingPrice: string;
  cogs: string;
  deliveryRate: string;
  ownPackingCost: string;   // own dispatch: packing / order
  ownShipping: string;      // own dispatch: shipping / order
  dailySpend: string;       // fixed
  roas: string;             // expected / working ROAS
  dailyRoas: string[];      // per-day overrides; '' = use expected
}
type ExpenseBasis = 'once' | 'day' | 'month';
interface PExpense { id: string; label: string; amount: string; basis: ExpenseBasis }
interface Gst { inclusive: boolean; enabled: boolean }

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const n = (s: string) => { const x = parseFloat(s); return Number.isFinite(x) ? x : 0; };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// Date helpers — ISO YYYY-MM-DD, IST-aligned, no drift.
const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const addDaysISO = (iso: string, days: number) => { const d = new Date(iso); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const diffDaysInclusive = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
const labelISO = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(iso));

function blankProduct(): PProduct {
  return { id: uid(), name: '', mode: '3pl', sellingPrice: '0', cogs: '0', deliveryRate: '0', ownPackingCost: '0', ownShipping: '0', dailySpend: '0', roas: '0', dailyRoas: [] };
}

// ── Per-day money flow for one product at a given spend + ROAS ──────────────
interface CostLine { label: string; amount: number }
interface Flow {
  orders: number; delivered: number;
  revBooked: number; revColl: number;
  ads: number; cogs: number; gst: number; net: number;
  costs: CostLine[];   // mode-specific fulfilment / fee lines
}
const feesOf = (f: Flow) => f.costs.reduce((s, c) => s + c.amount, 0);

function dailyFlow(p: PProduct, spend: number, roas: number, gst: Gst): Flow {
  const sp = n(p.sellingPrice), cogs = n(p.cogs), dr = n(p.deliveryRate);
  const booked = spend * roas;
  const orders = sp > 0 ? booked / sp : 0;
  const d = clamp01(dr / 100);
  const delivered = orders * d;
  const rto = orders - delivered;
  const gstRate = 0.18;

  if (p.mode === 'own') {
    const packing = n(p.ownPackingCost);
    const shipping = n(p.ownShipping);
    const payment = sp * 0.03;
    // GST off → no GST anywhere. On → registered: output owed on sales − input claimed.
    let gstAmt = 0;
    if (gst.enabled) {
      const outputGstPerDel = gst.inclusive ? sp * gstRate / (1 + gstRate) : sp * gstRate;
      const inputGstPerOrder = (cogs + packing + shipping) * gstRate;
      gstAmt = delivered * (outputGstPerDel - inputGstPerOrder) + rto * (-inputGstPerOrder);
    }
    const revColl = delivered * sp;
    const cogsNet = delivered * cogs;            // RTO units recovered to stock
    const costs: CostLine[] = [
      { label: 'Packing', amount: orders * packing },
      { label: 'Shipping', amount: orders * shipping },
      { label: 'Payment (3%)', amount: orders * payment },
    ];
    const net = revColl - cogsNet - costs.reduce((s, c) => s + c.amount, 0) - gstAmt - spend;
    return { orders, delivered, revBooked: booked, revColl, ads: spend, cogs: cogsNet, gst: gstAmt, net, costs };
  }

  const r = compute3PL({
    sellingPrice: sp, cogsPerUnit: cogs, deliveryRate: dr, roas, orders,
    unitsPerOrder: 1, weightGrams: 500, storageDays: 20, financingFeePct: 0,
    spGstInclusive: gst.inclusive, chargeOutputGst: gst.enabled,
  });
  const costs: CostLine[] = [
    { label: 'Shipping (fwd + RTO)', amount: r.outForward + r.outRTO },
    { label: 'Fulfilment & storage', amount: r.outFulfilment + r.outStorage },
    { label: 'COD & platform', amount: r.outCOD + r.outPlatform },
    { label: 'Payment (3%)', amount: r.outPayment },
  ];
  // GST off → strip GST entirely (add back the sunk input the engine charges).
  const gstAmt = gst.enabled ? r.outGst : 0;
  const net = gst.enabled ? r.netProfit : r.netProfit + r.outGst;
  return {
    orders: r.shipped, delivered: r.delivered,
    revBooked: r.shopifyRevenue, revColl: r.moneyIn,
    ads: r.outAds, cogs: r.outCOGS - r.stockRecovered, gst: gstAmt,
    net, costs,
  };
}

/** Breakeven ROAS (ROAS-independent) for a product under the GST settings. */
function beroasOf(p: PProduct, gst: Gst): number {
  const sp = n(p.sellingPrice), cogs = n(p.cogs), dr = n(p.deliveryRate);
  const d = clamp01(dr / 100), rto = 1 - d, gstRate = 0.18;
  if (sp <= 0) return 0;
  if (p.mode === 'own') {
    const packing = n(p.ownPackingCost), shipping = n(p.ownShipping), payment = sp * 0.03;
    const blendedPre = d * (sp - cogs - packing - shipping - payment) + rto * (-packing - shipping - payment);
    let netGstBlended = 0;
    if (gst.enabled) {
      const outputGstPerDel = gst.inclusive ? sp * gstRate / (1 + gstRate) : sp * gstRate;
      const inputGstPerOrder = (cogs + packing + shipping) * gstRate;
      netGstBlended = d * (outputGstPerDel - inputGstPerOrder) + rto * (-inputGstPerOrder);
    }
    const profitBeforeAd = blendedPre - netGstBlended;
    return profitBeforeAd > 0 ? sp / profitBeforeAd : 0;
  }
  const r = compute3PL({ sellingPrice: sp, cogsPerUnit: cogs, deliveryRate: dr, roas: 0, orders: 1, unitsPerOrder: 1, weightGrams: 500, storageDays: 20, financingFeePct: 0, spGstInclusive: gst.inclusive, chargeOutputGst: gst.enabled });
  // GST off → breakeven excludes GST entirely (use pre-GST blended profit).
  const profitBeforeAd = gst.enabled ? r.blendedPre - r.netGstBlended : r.blendedPre;
  return profitBeforeAd > 0 ? sp / profitBeforeAd : 0;
}

const ZERO: Flow = { orders: 0, delivered: 0, revBooked: 0, revColl: 0, ads: 0, cogs: 0, gst: 0, net: 0, costs: [] };
function addFlow(a: Flow, b: Flow): Flow {
  return {
    orders: a.orders + b.orders, delivered: a.delivered + b.delivered,
    revBooked: a.revBooked + b.revBooked, revColl: a.revColl + b.revColl,
    ads: a.ads + b.ads, cogs: a.cogs + b.cogs, gst: a.gst + b.gst, net: a.net + b.net,
    costs: [],
  };
}

/** Sum a product's flows across the horizon, using each day's logged ROAS (or expected). */
function projectProduct(p: PProduct, horizon: number, gst: Gst): Flow {
  const spend = n(p.dailySpend);
  const expected = n(p.roas);
  let acc = ZERO;
  for (let day = 0; day < horizon; day++) {
    const cell = p.dailyRoas?.[day];
    const roas = cell != null && cell !== '' ? n(cell) : expected;
    const f = dailyFlow(p, spend, roas, gst);
    acc = addFlow(acc, f);
    acc.costs = []; // fees aggregated separately at portfolio level
  }
  return acc;
}

const HORIZONS = [7, 30, 90];
const EXP_BASIS_MULT = (basis: ExpenseBasis, horizon: number) => basis === 'day' ? horizon : basis === 'month' ? horizon / 30 : 1;

// chart / segment colors
const C = { ads: '#a78bfa', cogs: '#38bdf8', fees: '#fbbf24', gst: '#f472b6', expenses: '#f87171', cash: '#34d399' };

export default function PlannerPage() {
  const [products, setProducts] = useState<PProduct[]>([]);
  const [expenses, setExpenses] = useState<PExpense[]>([]);
  const [horizon, setHorizon] = useState(30);
  const [startDate, setStartDate] = useState(todayISO());
  const [gst, setGst] = useState<Gst>({ inclusive: true, enabled: true });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showImport, setShowImport] = useState(false);
  const [importList, setImportList] = useState<Array<{ id: string; productName: string; sellingPrice: number; cogs: number; deliveryRate: number; fulfilmentMode: FulfilmentMode; ownPackingCost: number }>>([]);

  // Currency — values computed in ₹, optionally shown in $ at the live FX rate.
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [rateStr, setRateStr] = useState('95');
  useEffect(() => { fetch('/api/fx').then((r) => r.json()).then((d) => { if (d?.rates?.INR) setRateStr(String(Number(d.rates.INR).toFixed(2))); }).catch(() => {}); }, []);
  const inrPerUsd = parseFloat(rateStr) || 95;

  // Load the saved plan.
  useEffect(() => {
    fetch('/api/planner').then((r) => r.json()).then((d) => {
      const plan = d?.plan ?? {};
      if (Array.isArray(plan.products)) setProducts(plan.products.map((p: Partial<PProduct>) => ({ ...blankProduct(), ...p, dailyRoas: Array.isArray(p.dailyRoas) ? p.dailyRoas : [] })));
      if (Array.isArray(plan.expenses)) setExpenses(plan.expenses);
      if (plan.horizonDays) setHorizon(Number(plan.horizonDays));
      if (typeof plan.startDate === 'string' && plan.startDate) setStartDate(plan.startDate);
      setGst({ inclusive: plan.gstInclusive !== false, enabled: plan.gstRegistered !== false });
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  // Debounced auto-save once loaded.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      fetch('/api/planner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ products, expenses, horizonDays: horizon, startDate, gstInclusive: gst.inclusive, gstRegistered: gst.enabled }) })
        .catch(() => {}).finally(() => setSaving(false));
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [products, expenses, horizon, startDate, gst, loaded]);

  const fmt = (a: number) => {
    if (currency === 'USD') return formatUSD(inrPerUsd > 0 ? a / inrPerUsd : 0);
    const x = Math.abs(a); const sg = a < 0 ? '−' : '';
    if (x >= 1e7) return `${sg}₹${(x / 1e7).toFixed(2)}Cr`;
    if (x >= 1e5) return `${sg}₹${(x / 1e5).toFixed(2)}L`;
    if (x >= 1e3) return `${sg}₹${(x / 1e3).toFixed(1)}k`;
    return formatINR(a);
  };

  // ── Mutators ──────────────────────────────────────────────────────────
  const setP = (id: string, patch: Partial<PProduct>) => setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removeP = (id: string) => setProducts((ps) => ps.filter((p) => p.id !== id));
  const addP = () => { const p = blankProduct(); setProducts((ps) => [...ps, p]); setExpanded((e) => ({ ...e, [p.id]: true })); };
  const setDayRoas = (id: string, day: number, val: string) => setProducts((ps) => ps.map((p) => {
    if (p.id !== id) return p;
    const arr = [...(p.dailyRoas ?? [])];
    while (arr.length <= day) arr.push('');
    arr[day] = val;
    return { ...p, dailyRoas: arr };
  }));

  const addExpense = () => setExpenses((e) => [...e, { id: uid(), label: '', amount: '0', basis: 'month' }]);
  const setExp = (id: string, patch: Partial<PExpense>) => setExpenses((e) => e.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeExp = (id: string) => setExpenses((e) => e.filter((x) => x.id !== id));

  const openImport = async () => {
    setShowImport(true);
    try { const d = await (await fetch('/api/product-tracker')).json(); setImportList(d.entries ?? []); } catch { setImportList([]); }
  };
  const importProduct = (e: typeof importList[number]) => {
    const p: PProduct = {
      ...blankProduct(),
      name: e.productName || 'Untitled',
      mode: e.fulfilmentMode === 'own' ? 'own' : '3pl',
      sellingPrice: String(e.sellingPrice || 0),
      cogs: String(e.cogs || 0),
      deliveryRate: String(e.deliveryRate || 0),
      ownPackingCost: String(e.ownPackingCost || 0),
    };
    setProducts((ps) => [...ps, p]);
    setExpanded((ex) => ({ ...ex, [p.id]: true }));
  };
  const addBlank = () => { addP(); setShowImport(false); };

  // ── Derived ───────────────────────────────────────────────────────────
  const horizonFlows = useMemo(() => products.map((p) => ({ p, day: dailyFlow(p, n(p.dailySpend), n(p.roas), gst), horizon: projectProduct(p, horizon, gst) })), [products, horizon, gst]);
  const portfolio = useMemo(() => horizonFlows.reduce((acc, f) => addFlow(acc, f.horizon), ZERO), [horizonFlows]);
  const portfolioFees = useMemo(() => horizonFlows.reduce((s, f) => s + feesAcc(f.p, horizon, gst), 0), [horizonFlows, horizon, gst]);
  const expensesOverHorizon = useMemo(() => expenses.reduce((s, e) => s + n(e.amount) * EXP_BASIS_MULT(e.basis, horizon), 0), [expenses, horizon]);
  const productNet = portfolio.net;
  const cashflow = productNet - expensesOverHorizon;
  const blendedRoas = portfolio.ads > 0 ? portfolio.revBooked / portfolio.ads : 0;
  const moneyOut = portfolio.ads + portfolio.cogs + portfolioFees + Math.max(0, portfolio.gst) + expensesOverHorizon;

  // Cumulative cashflow series over the horizon (for the area chart).
  const series = useMemo(() => {
    const out: { label: string; cum: number; day: number }[] = [];
    let cum = 0;
    for (let day = 0; day < horizon; day++) {
      let dayNet = 0;
      for (const p of products) {
        const cell = p.dailyRoas?.[day];
        const roas = cell != null && cell !== '' ? n(cell) : n(p.roas);
        dayNet += dailyFlow(p, n(p.dailySpend), roas, gst).net;
      }
      // expenses spread across the horizon; one-time lands on day 0
      let expDay = 0;
      for (const e of expenses) {
        if (e.basis === 'day') expDay += n(e.amount);
        else if (e.basis === 'month') expDay += n(e.amount) / 30;
        else if (day === 0) expDay += n(e.amount);
      }
      dayNet -= expDay;
      cum += dayNet;
      out.push({ label: labelISO(addDaysISO(startDate, day)), cum, day });
    }
    return out;
  }, [products, expenses, horizon, startDate, gst]);

  // Money-out composition segments (for the stacked bar).
  const segments = [
    { label: 'Ad spend', amount: portfolio.ads, color: C.ads },
    { label: 'COGS', amount: portfolio.cogs, color: C.cogs },
    { label: 'Fulfilment & fees', amount: portfolioFees, color: C.fees },
    { label: 'GST', amount: Math.max(0, portfolio.gst), color: C.gst },
    { label: 'Expenses', amount: expensesOverHorizon, color: C.expenses },
  ].filter((s) => s.amount > 0.5);
  const barMax = Math.max(portfolio.revColl, moneyOut, 1);

  const endDate = addDaysISO(startDate, Math.max(0, horizon - 1));
  const dayLabel = (offset: number) => labelISO(addDaysISO(startDate, offset));
  const setTo = (d: string) => { if (d) setHorizon(Math.min(365, Math.max(1, diffDaysInclusive(startDate, d)))); };
  const setQuick = (h: number) => { setStartDate(todayISO()); setHorizon(h); };

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Planner</h1>
          <p className="text-[11px] text-muted-foreground">Per-product money in &amp; out, rolled into one {horizon}-day cashflow</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">{saving ? 'saving…' : loaded ? 'saved ✓' : ''}</span>
          <div className="flex items-center gap-1.5">
            <DatePicker value={startDate} onChange={(d) => d && setStartDate(d)} compact placeholder="From" />
            <span className="text-[10px] text-muted-foreground">→</span>
            <DatePicker value={endDate} min={startDate} onChange={setTo} compact placeholder="To" />
          </div>
          <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
            {HORIZONS.map((h) => (
              <button key={h} onClick={() => setQuick(h)} className={`px-2.5 py-1.5 text-[11px] font-semibold transition ${horizon === h && startDate === todayISO() ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>{h}d</button>
            ))}
          </div>
          <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
            <button onClick={() => setCurrency('INR')} className={`px-3 py-1.5 text-[11px] font-semibold transition ${currency === 'INR' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>₹ INR</button>
            <button onClick={() => setCurrency('USD')} className={`px-3 py-1.5 text-[11px] font-semibold transition ${currency === 'USD' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>$ USD</button>
          </div>
          {currency === 'USD' && (
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5" title="₹ per $1">
              <span className="text-[11px] text-muted-foreground">₹</span>
              <input type="text" inputMode="decimal" value={rateStr} onChange={(e) => setRateStr(e.target.value)} className="w-12 bg-transparent text-[11px] font-semibold tabular-nums text-foreground outline-none" />
              <span className="text-[11px] text-muted-foreground">/ $</span>
            </div>
          )}
          <button onClick={openImport} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/25"><Plus className="h-3.5 w-3.5" /> Product</button>
        </div>
      </div>

      {/* GST controls — apply to every product */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">GST</span>
        <Toggle on={gst.enabled} onClick={() => setGst((g) => ({ ...g, enabled: !g.enabled }))} label={gst.enabled ? 'GST on — pay output, claim input' : 'GST off — not modelled'} />
        {gst.enabled && <Toggle on={gst.inclusive} onClick={() => setGst((g) => ({ ...g, inclusive: !g.inclusive }))} label="Selling price is GST-inclusive" />}
      </div>

      {/* ── Overarching total — every product's projection summed ────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Wallet className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Total cashflow — {labelISO(startDate)} → {labelISO(endDate)}</h2>
            <p className="text-[10px] text-muted-foreground">{horizon} days · {products.length} product{products.length === 1 ? '' : 's'} rolled up · where the money comes from &amp; goes</p>
          </div>
        </div>
        <div className="relative z-10 p-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Money in / out flow numbers */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">Money in</p>
            <ResultRow label="Revenue booked (all orders)" value={fmt(portfolio.revBooked)} />
            <ResultRow label="Revenue collected (delivered)" value={fmt(portfolio.revColl)} highlight="success" />
            <p className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-rose-400">Money out</p>
            <ResultRow label="Ad spend" value={fmt(portfolio.ads)} sub={`blended ROAS ${blendedRoas.toFixed(2)}x`} />
            <ResultRow label="Product cost (COGS, net of RTO)" value={fmt(portfolio.cogs)} />
            <ResultRow label="Fulfilment & fees" value={fmt(portfolioFees)} />
            {gst.enabled && <ResultRow label="GST (net of input credit)" value={fmt(portfolio.gst)} />}
            <ResultRow label="Operating expenses (incl. inventory)" value={fmt(expensesOverHorizon)} />
          </div>
          {/* Bottom line + hero */}
          <div className="space-y-1.5">
            <ResultRow label="Product net (before expenses)" value={fmt(productNet)} highlight="primary" />
            <ResultRow label="− Operating expenses" value={`− ${fmt(expensesOverHorizon)}`} />
            <ResultRow label="Orders booked" value={Math.round(portfolio.orders).toLocaleString('en-IN')} sub={`${Math.round(portfolio.delivered).toLocaleString('en-IN')} delivered`} />

            <div className="stat-shimmer glow-pulse rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center mt-2"
              style={{ '--glow-color': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}>
              <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Net cashflow · {horizon} days</p>
              <p className={`relative z-10 text-4xl font-bold font-mono ${cashflow >= 0 ? 'gradient-text-emerald' : 'text-rose-400'}`}>{fmt(cashflow)}</p>
              <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">{fmt(cashflow / Math.max(1, horizon))}/day · {portfolio.revColl > 0 ? ((cashflow / portfolio.revColl) * 100).toFixed(1) : '0'}% of collected</p>
            </div>
          </div>
        </div>

        {/* ── Visualization ──────────────────────────────────────────── */}
        <div className="border-t border-border p-4 space-y-4">
          {/* Money in vs out composition bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground/70">Where the money goes</span>
              <span className="text-muted-foreground">in {fmt(portfolio.revColl)} · out {fmt(moneyOut)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-10 text-[10px] text-emerald-400 text-right">In</span>
              <div className="relative h-5 flex-1 rounded-md bg-background/40 overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${(portfolio.revColl / barMax) * 100}%`, background: C.cash }} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-10 text-[10px] text-rose-400 text-right">Out</span>
              <div className="relative flex h-5 flex-1 rounded-md bg-background/40 overflow-hidden">
                {segments.map((s) => (
                  <div key={s.label} title={`${s.label}: ${fmt(s.amount)}`} style={{ width: `${(s.amount / barMax) * 100}%`, background: s.color }} className="h-full" />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pl-[52px]">
              {segments.map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} /> {s.label} · {fmt(s.amount)}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
                <span className="h-2 w-2 rounded-sm" style={{ background: C.cash }} /> Cashflow left · {fmt(cashflow)}
              </span>
            </div>
          </div>

          {/* Cumulative cashflow over the horizon */}
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              <TrendingUp className="h-3.5 w-3.5" /> Cumulative cashflow
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: -8 }}>
                  <defs>
                    <linearGradient id="plCash" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.cash} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.cash} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} width={56} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as { label: string; cum: number };
                      return (
                        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-xl">
                          <p className="text-[10px] text-muted-foreground">{pt.label}</p>
                          <p className="font-mono text-[12px] font-semibold text-foreground">{fmt(pt.cum)}</p>
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="cum" stroke={C.cash} fill="url(#plCash)" strokeWidth={2} dot={false} animationDuration={700} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Per-product cards ───────────────────────────────────────────── */}
      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <Package className="h-7 w-7 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-[13px] text-muted-foreground">No products yet.</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Import from your product tracker, or add one manually.</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button onClick={openImport} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"><Download className="h-3.5 w-3.5" /> Import from Products</button>
            <button onClick={addP} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/25"><Plus className="h-3.5 w-3.5" /> Add Product</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {horizonFlows.map(({ p, day, horizon: proj }, idx) => {
            const beroas = beroasOf(p, gst);
            const roasVal = n(p.roas);
            const tone = beroas <= 0 ? 'text-muted-foreground' : roasVal >= beroas + 1 ? 'text-emerald-400' : roasVal >= beroas ? 'text-amber-400' : 'text-rose-400';
            const verdict = beroas <= 0 ? 'set economics' : roasVal >= beroas + 1 ? 'winning' : roasVal >= beroas ? 'breakeven' : 'below BEROAS';
            const dayMoneyOut = day.ads + day.cogs + feesOf(day) + Math.max(0, day.gst);
            const isOpen = !!expanded[p.id];
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + idx * 0.03 }}
                className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
                {/* Card header — name + mode + per-day net */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  <Package className="h-4 w-4 text-primary shrink-0" />
                  <input value={p.name} onChange={(e) => setP(p.id, { name: e.target.value })} placeholder="Product name"
                    className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/40" />
                  <div className="flex items-center rounded-lg border border-border bg-background/40 overflow-hidden text-[10px]">
                    <button onClick={() => setP(p.id, { mode: '3pl' })} className={`px-2.5 py-1 font-semibold transition ${p.mode === '3pl' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>3PL</button>
                    <button onClick={() => setP(p.id, { mode: 'own' })} className={`px-2.5 py-1 font-semibold transition ${p.mode === 'own' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Own dispatch</button>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Net / day</p>
                    <p className={`font-mono text-sm font-bold tabular-nums ${day.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(day.net)}</p>
                  </div>
                  <button onClick={() => removeP(p.id)} className="rounded-md p-1.5 text-muted-foreground/40 transition hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>

                <div className="relative z-10 p-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Left — inputs */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <CalcField label="Selling price — ₹"><input type="text" inputMode="decimal" value={p.sellingPrice} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setP(p.id, { sellingPrice: e.target.value })} className="form-input" /></CalcField>
                      <CalcField label="COGS / unit — ₹"><input type="text" inputMode="decimal" value={p.cogs} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setP(p.id, { cogs: e.target.value })} className="form-input" /></CalcField>
                      <CalcField label="Delivery rate %" hint="rest is RTO"><input type="text" inputMode="decimal" value={p.deliveryRate} onChange={(e) => setP(p.id, { deliveryRate: e.target.value })} className="form-input" /></CalcField>
                      <CalcField label="BEROAS" hint="breakeven — fixed"><div className={`form-input flex items-center font-mono ${tone}`}>{beroas > 0 ? `${beroas.toFixed(2)}x` : '—'}</div></CalcField>
                      {p.mode === 'own' && <>
                        <CalcField label="Packing / order — ₹" hint="own warehouse"><input type="text" inputMode="decimal" value={p.ownPackingCost} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setP(p.id, { ownPackingCost: e.target.value })} className="form-input" /></CalcField>
                        <CalcField label="Shipping / order — ₹" hint="your courier cost"><input type="text" inputMode="decimal" value={p.ownShipping} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setP(p.id, { ownShipping: e.target.value })} className="form-input" /></CalcField>
                      </>}
                      <CalcField label="Daily ad spend — ₹" hint="fixed"><input type="text" inputMode="decimal" value={p.dailySpend} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setP(p.id, { dailySpend: e.target.value })} className="form-input" /></CalcField>
                      <CalcField label="Expected ROAS" hint="log actuals below"><input type="text" inputMode="decimal" value={p.roas} onChange={(e) => setP(p.id, { roas: e.target.value })} className="form-input" /></CalcField>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                      <span className="text-[11px] text-muted-foreground">ROAS {roasVal.toFixed(2)}x vs BEROAS {beroas > 0 ? beroas.toFixed(2) : '—'}x</span>
                      <span className={`text-[11px] font-semibold ${tone}`}>{verdict}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 leading-snug">
                      {p.mode === 'own'
                        ? `Own dispatch costs: COGS (recovered on RTO) + packing + shipping + 3% payment${gst.enabled ? ' + net GST' : ''}. No 3PL fees.`
                        : `3PL costs: COGS (recovered on RTO) + forward/RTO shipping + COD + platform + fulfilment + storage + 3% payment${gst.enabled ? ' + net GST' : ''} (fixed rates).`}
                    </p>
                  </div>

                  {/* Right — where the money goes (per day) */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">A typical day <span className="normal-case tracking-normal font-normal text-muted-foreground/60">(at expected ROAS)</span></p>
                    <ResultRow label="Orders booked / day" value={`${Math.round(day.orders).toLocaleString('en-IN')}`} sub={`${Math.round(day.delivered).toLocaleString('en-IN')} delivered`} />
                    <ResultRow label="Revenue collected / day" value={fmt(day.revColl)} highlight="success" />
                    <FlowRow label="Ad spend" amount={day.ads} total={dayMoneyOut} fmt={fmt} />
                    <FlowRow label="Product cost (COGS, net)" amount={day.cogs} total={dayMoneyOut} fmt={fmt} />
                    {day.costs.map((c) => <FlowRow key={c.label} label={c.label} amount={c.amount} total={dayMoneyOut} fmt={fmt} />)}
                    {gst.enabled && <FlowRow label="GST (net)" amount={day.gst} total={dayMoneyOut} fmt={fmt} />}
                    <ResultRow label="Net profit / day" value={fmt(day.net)} highlight="primary" />
                    <ResultRow label={`Net over ${horizon} days`} value={fmt(proj.net)} highlight={proj.net >= 0 ? 'success' : undefined} sub={`revenue ${fmt(proj.revColl)}`} />
                  </div>
                </div>

                {/* Daily ROAS log (expandable) */}
                <div className="border-t border-border">
                  <button onClick={() => setExpanded((e) => ({ ...e, [p.id]: !isOpen }))} className="flex w-full items-center gap-2 px-4 py-2.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground">
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    Daily ROAS log — {horizon} days <span className="text-muted-foreground/50">(blank = expected {roasVal.toFixed(2)}x)</span>
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-4">
                          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-1.5">
                            {Array.from({ length: horizon }).map((_, day) => {
                              const cell = p.dailyRoas?.[day] ?? '';
                              const eff = cell !== '' ? n(cell) : roasVal;
                              const cellTone = beroas <= 0 ? 'border-border' : eff >= beroas + 1 ? 'border-emerald-500/40' : eff >= beroas ? 'border-amber-500/40' : 'border-rose-500/40';
                              return (
                                <div key={day} className={`rounded-md border bg-background/40 px-1.5 py-1 ${cell !== '' ? cellTone : 'border-border'}`}>
                                  <p className="text-[8.5px] text-muted-foreground/60 tabular-nums">{dayLabel(day)}</p>
                                  <input value={cell} onChange={(e) => setDayRoas(p.id, day, e.target.value)} placeholder={roasVal ? roasVal.toFixed(1) : '—'}
                                    className="w-full bg-transparent text-[12px] font-mono font-semibold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30" inputMode="decimal" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Operating expenses ──────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Receipt className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Other expenses</h2>
            <p className="text-[10px] text-muted-foreground">Inventory, salaries, tools, rent — folded into the cashflow above</p>
          </div>
          <button onClick={addExpense} className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition hover:text-foreground"><Plus className="h-3 w-3" /> Expense</button>
        </div>
        <div className="relative z-10 p-4 space-y-2">
          {expenses.length === 0 && <p className="py-3 text-center text-[12px] text-muted-foreground/60">No expenses yet — add inventory buys, salaries, SaaS, rent…</p>}
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center gap-2 flex-wrap">
              <input value={e.label} onChange={(ev) => setExp(e.id, { label: ev.target.value })} placeholder="e.g. Inventory restock, Salaries, SaaS" className="flex-1 min-w-[160px] rounded-lg border border-border bg-background/40 px-3 py-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/40" />
              <div className="relative w-32">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">₹</span>
                <input value={e.amount} inputMode="decimal" onFocus={(ev) => ev.currentTarget.select()} onChange={(ev) => setExp(e.id, { amount: ev.target.value })} className="w-full rounded-lg border border-border bg-background/40 pl-6 pr-2 py-2 text-[12px] font-mono tabular-nums text-foreground outline-none focus:border-primary/40" />
              </div>
              <div className="flex items-center rounded-lg border border-border bg-background/40 overflow-hidden text-[10px]">
                <button onClick={() => setExp(e.id, { basis: 'once' })} className={`px-2.5 py-2 font-semibold transition ${e.basis === 'once' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>one-time</button>
                <button onClick={() => setExp(e.id, { basis: 'day' })} className={`px-2.5 py-2 font-semibold transition ${e.basis === 'day' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>/ day</button>
                <button onClick={() => setExp(e.id, { basis: 'month' })} className={`px-2.5 py-2 font-semibold transition ${e.basis === 'month' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>/ month</button>
              </div>
              <span className="w-24 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{fmt(n(e.amount) * EXP_BASIS_MULT(e.basis, horizon))}</span>
              <button onClick={() => removeExp(e.id)} className="rounded-md p-2 text-muted-foreground/40 transition hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {expenses.length > 0 && (
            <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
              <span className="text-[12px] font-medium text-muted-foreground">Total over {horizon} days</span>
              <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{fmt(expensesOverHorizon)}</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Import modal */}
      <AnimatePresence>
        {showImport && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowImport(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
                <div className="flex items-center gap-2"><Package className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Add a product</h2></div>
                <button onClick={() => setShowImport(false)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-4 space-y-1.5 max-h-[60vh] overflow-y-auto">
                <button onClick={addBlank} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] font-medium text-muted-foreground transition hover:text-foreground hover:border-primary/40"><Plus className="h-3.5 w-3.5" /> Add blank product</button>
                <p className="px-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Or pick from your tracker</p>
                {importList.length === 0 && <p className="py-6 text-center text-[12px] text-muted-foreground/50">No products found.</p>}
                {importList.map((e) => {
                  const already = products.some((p) => p.name.trim().toLowerCase() === (e.productName || '').trim().toLowerCase());
                  return (
                    <div key={e.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-foreground truncate">{e.productName || 'Untitled'}</p>
                        <p className="text-[10px] text-muted-foreground/60">SP ₹{e.sellingPrice} · CP ₹{e.cogs} · DR {e.deliveryRate}% · {e.fulfilmentMode === 'own' ? 'Own' : '3PL'}</p>
                      </div>
                      <button disabled={already} onClick={() => importProduct(e)} className="rounded-md bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-primary transition hover:bg-primary/25 disabled:opacity-40">{already ? 'added' : 'add'}</button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

/** Fees (mode-specific fulfilment lines) projected across the horizon. */
function feesAcc(p: PProduct, horizon: number, gst: Gst): number {
  const spend = n(p.dailySpend), expected = n(p.roas);
  let sum = 0;
  for (let day = 0; day < horizon; day++) {
    const cell = p.dailyRoas?.[day];
    const roas = cell != null && cell !== '' ? n(cell) : expected;
    sum += feesOf(dailyFlow(p, spend, roas, gst));
  }
  return sum;
}

function CalcField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}{hint && <span className="ml-1 normal-case tracking-normal text-muted-foreground/50">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function ResultRow({ label, value, highlight, sub }: { label: string; value: string; highlight?: 'primary' | 'success'; sub?: string }) {
  return (
    <div className={`result-row-glow rounded-lg px-3 py-2.5 ${
      highlight === 'primary' ? 'bg-primary/5 border border-primary/15' :
      highlight === 'success' ? 'bg-emerald-500/5 border border-emerald-500/15' : ''}`}>
      <div className="relative z-10 flex items-center justify-between gap-3">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        <span className={`text-[13px] font-semibold font-mono ${highlight === 'primary' ? 'text-primary' : highlight === 'success' ? 'text-emerald-400' : 'text-foreground'}`}>{value}</span>
      </div>
      {sub && <p className="relative z-10 mt-1 text-[10.5px] leading-snug text-muted-foreground/70">{sub}</p>}
    </div>
  );
}

/** A money-out row that shows its share of the day's outflow. */
function FlowRow({ label, amount, total, fmt }: { label: string; amount: number; total: number; fmt: (a: number) => string }) {
  const share = total > 0 ? (Math.abs(amount) / total) * 100 : 0;
  const credit = amount < 0;
  return (
    <div className="result-row-glow flex items-center justify-between rounded-lg px-3 py-2.5">
      <span className="relative z-10 text-[12px] text-muted-foreground">{label} · {share.toFixed(0)}%</span>
      <span className="relative z-10 text-[13px] font-semibold font-mono text-foreground">{credit ? '+ ' : ''}{fmt(Math.abs(amount))}</span>
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
      on ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-muted-foreground/40'}`} />
      {label}
    </button>
  );
}
