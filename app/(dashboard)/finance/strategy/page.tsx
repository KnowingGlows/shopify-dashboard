'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, TrendingUp, Bookmark, X, Plus, Pencil, Trash2, AlertTriangle,
  ShieldCheck, Wallet, Brain, Map, Layers,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { formatINR, formatUSD } from '@/lib/currency-converter';
import {
  runRoadmap, productSnapshot,
  type RoadmapEconomics, type RoadmapInput,
} from '@/lib/roadmap';

// Advanced scale strategiser. You set a revenue target; it back-solves the
// product portfolio (how many products × ₹/day each), then runs a cohort
// roadmap — launch N winners/month, ramp each toward its ceiling, gated by
// capital + credit — and tells you the realistic ETA, where capital throttles
// you, and which lever moves the date.

const DEFAULTS = {
  // Target
  targetRevenue: '0',
  basis: 'day' as 'day' | 'month',
  revenueType: 'booked' as 'booked' | 'collected',
  baselineRevenue: '0', // today's flat run-rate, ₹/day
  // Per-order economics (prefill from a saved 3PL preset)
  sellingPrice: '0',
  cogsPerUnit: '0',
  deliveryRate: '0',
  roas: '0',
  unitsPerOrder: '1',
  weightGrams: '500',
  storageDays: '20',
  financingFeePct: '0',
  spGstInclusive: true,
  chargeOutputGst: true,
  // Portfolio / roadmap
  winnersPerMonth: '10',
  startPerDay: '100000',     // a fresh winner's ₹/day at launch
  ceilingPerDay: '300000',   // a product's sustainable ₹/day ceiling (editable — it's dynamic)
  monthsToCeiling: '6',
  reinvestPct: '100',        // % of monthly net folded back into capital
  capitalInjection: '0',     // ₹ added to capital each month
  creditGrowthPct: '0',      // % credit line grows / month
  maxHorizon: '36',          // months cap
  // Liquidity
  availableCapital: '0',
  creditLine: '0',
  cashCycleDays: '21',
};

type State = typeof DEFAULTS;

function StrategyInner() {
  const [v, setV] = useState<State>(DEFAULTS);

  type Scenario = { id: string; name: string; kind: 'strategy'; data: State };
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [showScenarios, setShowScenarios] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  type ThreePLPreset = { id: string; name: string; data: Record<string, string | boolean> };
  const [threePLPresets, setThreePLPresets] = useState<ThreePLPreset[]>([]);

  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [rateStr, setRateStr] = useState('83.5');
  useEffect(() => {
    fetch('/api/fx').then((r) => r.json())
      .then((d) => { if (d?.rates?.INR) setRateStr(String(Number(d.rates.INR).toFixed(2))); })
      .catch(() => {});
  }, []);
  const inrPerUsd = parseFloat(rateStr) || 83.5;

  useEffect(() => {
    fetch('/api/finance?action=presets&kind=strategy').then((r) => r.json())
      .then((d) => setScenarios(d.presets ?? [])).catch(() => {});
    fetch('/api/finance?action=presets&kind=3pl').then((r) => r.json())
      .then((d) => setThreePLPresets(d.presets ?? [])).catch(() => {});
  }, []);

  const set = <K extends keyof State>(k: K, val: State[K]) => setV((s) => ({ ...s, [k]: val }));
  const num = (s: string) => parseFloat(s) || 0;
  const fmt = (a: number) => (currency === 'USD' ? formatUSD(inrPerUsd > 0 ? a / inrPerUsd : 0) : formatINR(a));
  const fmtC = (a: number) => { // compact ₹ for dense tables
    if (currency === 'USD') return formatUSD(inrPerUsd > 0 ? a / inrPerUsd : 0);
    const abs = Math.abs(a);
    if (abs >= 1e7) return `₹${(a / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `₹${(a / 1e5).toFixed(2)}L`;
    if (abs >= 1e3) return `₹${(a / 1e3).toFixed(1)}k`;
    return formatINR(a);
  };

  const applyThreePLPreset = (p: ThreePLPreset) => {
    const d = p.data || {};
    setV((s) => ({
      ...s,
      sellingPrice: String(d.sellingPrice ?? s.sellingPrice),
      cogsPerUnit: String(d.cogsPerUnit ?? s.cogsPerUnit),
      deliveryRate: String(d.deliveryRate ?? s.deliveryRate),
      roas: String(d.roas ?? s.roas),
      unitsPerOrder: String(d.unitsPerOrder ?? s.unitsPerOrder),
      weightGrams: String(d.weightGrams ?? s.weightGrams),
      storageDays: String(d.storageDays ?? s.storageDays),
      financingFeePct: String(d.financingFeePct ?? s.financingFeePct),
      spGstInclusive: typeof d.spGstInclusive === 'boolean' ? d.spGstInclusive : s.spGstInclusive,
      chargeOutputGst: typeof d.chargeOutputGst === 'boolean' ? d.chargeOutputGst : s.chargeOutputGst,
    }));
  };

  const saveScenario = async () => {
    if (!scenarioName.trim()) return;
    try {
      const res = await fetch('/api/finance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-preset', preset: { name: scenarioName.trim(), kind: 'strategy', data: v } }),
      });
      const data = await res.json();
      if (data.preset) setScenarios((p) => [...p, data.preset]);
      setScenarioName('');
    } catch { /* ignore */ }
  };
  const deleteScenario = async (id: string) => {
    setScenarios((p) => p.filter((x) => x.id !== id));
    try {
      await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-preset', id }) });
    } catch { /* ignore */ }
  };
  const renameScenario = async (id: string, name: string) => {
    if (!name.trim()) return;
    setScenarios((p) => p.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)));
    setEditingId(null);
    try {
      await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rename-preset', id, name: name.trim() }) });
    } catch { /* ignore */ }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const sp = num(v.sellingPrice);
  const d = Math.min(1, Math.max(0, num(v.deliveryRate) / 100));
  const perDay = (val: number) => (v.basis === 'month' ? val / 30 : val);
  const targetDay = perDay(num(v.targetRevenue));
  const ceiling = num(v.ceilingPerDay);
  const econReady = sp > 0 && d > 0 && targetDay > 0 && ceiling > 0;

  const econ: RoadmapEconomics = {
    sellingPrice: sp,
    cogsPerUnit: num(v.cogsPerUnit),
    deliveryRate: num(v.deliveryRate),
    roas: num(v.roas),
    unitsPerOrder: Math.max(1, num(v.unitsPerOrder)),
    weightGrams: num(v.weightGrams),
    storageDays: num(v.storageDays),
    financingFeePct: num(v.financingFeePct),
    spGstInclusive: v.spGstInclusive,
    chargeOutputGst: v.chargeOutputGst,
    revenueType: v.revenueType,
    cashCycleDays: num(v.cashCycleDays),
  };

  const available = num(v.availableCapital) + num(v.creditLine);

  const buildInput = (over: Partial<RoadmapInput> = {}): RoadmapInput => ({
    econ,
    targetRevPerDay: targetDay,
    baselineRevPerDay: perDay(num(v.baselineRevenue)),
    winnersPerMonth: Math.max(0, num(v.winnersPerMonth)),
    startPerDay: num(v.startPerDay),
    ceilingPerDay: ceiling,
    monthsToCeiling: Math.max(0.5, num(v.monthsToCeiling)),
    capital: num(v.availableCapital),
    creditLine: num(v.creditLine),
    reinvestPct: Math.max(0, num(v.reinvestPct)),
    capitalInjectionPerMonth: num(v.capitalInjection),
    creditGrowthPctPerMonth: num(v.creditGrowthPct),
    maxHorizonMonths: Math.max(1, num(v.maxHorizon)),
    ...over,
  });

  const roadmap = econReady ? runRoadmap(buildInput()) : null;

  // Portfolio decomposition at the target (concurrent, steady-state).
  const decomposition = ((): Array<{ pp: number; n: number; totalWC: number; totalAd: number; totalNet: number; ok: boolean; tight: boolean }> => {
    if (!econReady) return [];
    const pps = Array.from(new Set([
      ceiling, ceiling * 0.66, ceiling * 0.5, ceiling * 0.33, ceiling * 0.2,
    ].map((x) => Math.round(x)))).filter((x) => x > 0).sort((a, b) => b - a);
    return pps.map((pp) => {
      const n = Math.max(1, Math.ceil(targetDay / pp));
      const snap = productSnapshot(econ, pp);
      const totalWC = n * snap.wc;
      const totalAd = n * snap.ad;
      const totalNet = n * snap.net;
      const ok = totalWC <= available;
      const tight = !ok ? false : totalWC > 0.85 * available;
      return { pp, n, totalWC, totalAd, totalNet, ok, tight };
    });
  })();

  // At-target snapshot using the chosen ceiling as per-product ₹/day.
  const atTarget = (() => {
    if (!econReady) return null;
    const n = Math.max(1, Math.ceil(targetDay / ceiling));
    const snap = productSnapshot(econ, ceiling);
    const wc = n * snap.wc;
    return {
      n, snap, wc,
      ad: n * snap.ad, net: n * snap.net, rev: n * ceiling,
      status: (wc > available ? 'crunch' : wc > 0.85 * available ? 'tight' : 'ok') as 'ok' | 'tight' | 'crunch',
      headroom: available - wc,
    };
  })();

  // ── Second brain: sensitivities + insights ────────────────────────────────
  const brain = (() => {
    if (!econReady || !roadmap) return null;
    const baseEta = roadmap.etaMonth;
    const variant = (over: Partial<RoadmapInput>) => runRoadmap(buildInput(over)).etaMonth;
    const credit15 = variant({ creditLine: num(v.creditLine) * 1.5 + (num(v.creditLine) === 0 ? num(v.availableCapital) * 0.5 : 0) });
    const cap15 = variant({ capital: num(v.availableCapital) * 1.5 });
    const reinvestFull = num(v.reinvestPct) < 100 ? variant({ reinvestPct: 100 }) : null;

    const limited = roadmap.rows.filter((r) => r.flag !== 'ok').length;
    const firstWindow = Math.min(6, roadmap.rows.length);
    // Minimum extra upfront capital to clear early throttling (first 6 mo).
    let minExtra: number | null = null;
    const baseCap = num(v.availableCapital);
    for (let mult = 1.1; mult <= 4.01; mult += 0.1) {
      const r = runRoadmap(buildInput({ capital: baseCap * mult }));
      const earlyBad = r.rows.slice(0, firstWindow).some((x) => x.flag !== 'ok');
      if (!earlyBad) { minExtra = baseCap * (mult - 1); break; }
    }

    const etaRow = baseEta != null ? roadmap.rows.find((r) => r.month === baseEta) : null;
    const perProdAtEta = etaRow && etaRow.liveProducts > 0 ? etaRow.revPerDay / etaRow.liveProducts : 0;
    const dMonths = (a: number | null) => (a == null || baseEta == null ? null : baseEta - a);

    return { baseEta, credit15, cap15, reinvestFull, limited, minExtra, etaRow, perProdAtEta, dMonths };
  })();

  const reset = () => setV(DEFAULTS);

  const etaLabel = roadmap?.etaMonth != null
    ? `${roadmap.etaMonth} mo · ${roadmap.rows.find((r) => r.month === roadmap.etaMonth)?.label ?? ''}`
    : '—';

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Strategy</h1>
          <p className="text-[11px] text-muted-foreground">Second-brain scale planner — portfolio, roadmap &amp; the binding constraint</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
            <button onClick={() => setCurrency('INR')} className={`px-3 py-1.5 text-[11px] font-semibold transition ${currency === 'INR' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>₹ INR</button>
            <button onClick={() => setCurrency('USD')} className={`px-3 py-1.5 text-[11px] font-semibold transition ${currency === 'USD' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>$ USD</button>
          </div>
          {currency === 'USD' && (
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5" title="₹ per $1">
              <span className="text-[11px] text-muted-foreground">₹</span>
              <input type="text" inputMode="decimal" value={rateStr} onChange={(e) => setRateStr(e.target.value)} className="w-14 bg-transparent text-[11px] font-semibold tabular-nums text-foreground outline-none" />
              <span className="text-[11px] text-muted-foreground">/ $</span>
            </div>
          )}
          <button onClick={() => setShowScenarios(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground hover:bg-accent/30">
            <Bookmark className="h-3.5 w-3.5" /> Scenarios {scenarios.length > 0 && <span className="text-primary">({scenarios.length})</span>}
          </button>
          <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground hover:bg-accent/30">Reset</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Card 1: Target, economics, capital ─────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Target className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Target, economics &amp; capital</h2>
              <p className="text-[10px] text-muted-foreground">Prefill economics from a saved 3PL preset, then tune</p>
            </div>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            <Field label="Prefill economics from a 3PL preset">
              <select className="form-input" value="" onChange={(e) => { const p = threePLPresets.find((x) => x.id === e.target.value); if (p) applyThreePLPreset(p); }}>
                <option value="">{threePLPresets.length ? 'Select a saved 3PL preset…' : 'No 3PL presets saved yet'}</option>
                {threePLPresets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="h-px bg-border" />
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Target revenue — ₹ / ${v.basis}`}><input type="text" inputMode="decimal" value={v.targetRevenue} onChange={(e) => set('targetRevenue', e.target.value)} className="form-input" placeholder="e.g. 10000000" /></Field>
              <Field label="Basis"><Seg options={[['day', 'Per day'], ['month', 'Per month']]} value={v.basis} onChange={(x) => set('basis', x as State['basis'])} /></Field>
              <Field label="Revenue counted as" hint="booked = Shopify · collected = COD"><Seg options={[['booked', 'Booked'], ['collected', 'Collected']]} value={v.revenueType} onChange={(x) => set('revenueType', x as State['revenueType'])} /></Field>
              <Field label="Current run-rate — ₹ / day" hint="flat baseline"><input type="text" inputMode="decimal" value={v.baselineRevenue} onChange={(e) => set('baselineRevenue', e.target.value)} className="form-input" /></Field>
            </div>
            <div className="h-px bg-border" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="AOV / Selling price — ₹"><input type="text" inputMode="decimal" value={v.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} className="form-input" /></Field>
              <Field label="Cost of product — ₹"><input type="text" inputMode="decimal" value={v.cogsPerUnit} onChange={(e) => set('cogsPerUnit', e.target.value)} className="form-input" /></Field>
              <Field label="ROAS" hint="ad = price ÷ ROAS"><input type="text" inputMode="decimal" value={v.roas} onChange={(e) => set('roas', e.target.value)} className="form-input" /></Field>
              <Field label="Delivery rate %" hint="rest is RTO"><input type="text" inputMode="decimal" value={v.deliveryRate} onChange={(e) => set('deliveryRate', e.target.value)} className="form-input" /></Field>
              <Field label="Units / order"><input type="text" inputMode="decimal" value={v.unitsPerOrder} onChange={(e) => set('unitsPerOrder', e.target.value)} className="form-input" /></Field>
              <Field label="Avg storage days"><input type="text" inputMode="decimal" value={v.storageDays} onChange={(e) => set('storageDays', e.target.value)} className="form-input" /></Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Toggle on={v.spGstInclusive} onClick={() => set('spGstInclusive', !v.spGstInclusive)} label="Price is GST-inclusive" />
              <Toggle on={v.chargeOutputGst} onClick={() => set('chargeOutputGst', !v.chargeOutputGst)} label="GST registered" />
            </div>
            <div className="h-px bg-border" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Capital &amp; liquidity</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Available capital — ₹"><input type="text" inputMode="decimal" value={v.availableCapital} onChange={(e) => set('availableCapital', e.target.value)} className="form-input" /></Field>
              <Field label="Credit line — ₹"><input type="text" inputMode="decimal" value={v.creditLine} onChange={(e) => set('creditLine', e.target.value)} className="form-input" /></Field>
              <Field label="Cash cycle — days" hint="until COD returns"><input type="text" inputMode="decimal" value={v.cashCycleDays} onChange={(e) => set('cashCycleDays', e.target.value)} className="form-input" /></Field>
              <Field label="Financing fee %"><input type="text" inputMode="decimal" value={v.financingFeePct} onChange={(e) => set('financingFeePct', e.target.value)} className="form-input" /></Field>
            </div>
          </div>
        </motion.div>

        {/* ── Card 2: At the target ──────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">At the target</h2>
              <p className="text-[10px] text-muted-foreground">{v.targetRevenue ? `₹${v.targetRevenue}/${v.basis}` : 'set a target'} at ₹{Number(num(v.ceilingPerDay)).toLocaleString('en-IN')}/day per product</p>
            </div>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            {!econReady || !atTarget ? (
              <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-10 text-center">
                <p className="text-[12px] text-muted-foreground">Set target, AOV, delivery rate &amp; per-product ceiling to draft the plan.</p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <ResultRow label="Winning products needed (concurrent)" value={`${atTarget.n}`} highlight="primary" />
                  <ResultRow label="Per product" value={`${fmt(ceiling)}/day · ${atTarget.snap.grossMarginPct.toFixed(1)}% GM`} />
                  <ResultRow label="Orders / day (portfolio)" value={Math.round(atTarget.snap.shipped * atTarget.n).toLocaleString('en-IN')} />
                  <ResultRow label="Ad spend / day" value={fmt(atTarget.ad)} />
                  <ResultRow label="Net profit / day" value={fmt(atTarget.net)} highlight="primary" />
                  <ResultRow label="Net profit / month (×30)" value={fmt(atTarget.net * 30)} highlight="success" />
                </div>
                <div className="stat-shimmer glow-pulse rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center"
                  style={{ '--glow-color': 'rgba(16,185,129,0.12)' } as React.CSSProperties}>
                  <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Net profit / month at target</p>
                  <p className={`relative z-10 text-4xl font-bold font-mono ${atTarget.net >= 0 ? 'gradient-text-emerald' : 'text-rose-400'}`}>{fmt(atTarget.net * 30)}</p>
                  <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">{atTarget.n} products · {atTarget.snap.grossMarginPct.toFixed(1)}% gross margin</p>
                </div>
                <LiquidityVerdict status={atTarget.status} wc={atTarget.wc} available={available} headroom={atTarget.headroom} fmt={fmt} cashCycle={num(v.cashCycleDays)} />
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Roadmap engine ──────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Map className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Roadmap to the target</h2>
            <p className="text-[10px] text-muted-foreground">Launch winners monthly, ramp each to its ceiling, gated by capital — compounding as profit reinvests</p>
          </div>
          {roadmap && (
            <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${roadmap.reached ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}>
              {roadmap.reached ? `Target in ${etaLabel}` : `Plateaus at ${fmtC(roadmap.peakRevPerDay)}/day`}
            </span>
          )}
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="New winners / month"><input type="text" inputMode="decimal" value={v.winnersPerMonth} onChange={(e) => set('winnersPerMonth', e.target.value)} className="form-input" /></Field>
            <Field label="Launch ₹/day per winner" hint="starting run-rate"><input type="text" inputMode="decimal" value={v.startPerDay} onChange={(e) => set('startPerDay', e.target.value)} className="form-input" /></Field>
            <Field label="Ceiling ₹/day per product" hint="editable — it's dynamic"><input type="text" inputMode="decimal" value={v.ceilingPerDay} onChange={(e) => set('ceilingPerDay', e.target.value)} className="form-input" /></Field>
            <Field label="Months to ~ceiling" hint="ramp speed"><input type="text" inputMode="decimal" value={v.monthsToCeiling} onChange={(e) => set('monthsToCeiling', e.target.value)} className="form-input" /></Field>
            <Field label="Reinvest net %" hint="profit → capital"><input type="text" inputMode="decimal" value={v.reinvestPct} onChange={(e) => set('reinvestPct', e.target.value)} className="form-input" /></Field>
            <Field label="Capital injection / mo — ₹"><input type="text" inputMode="decimal" value={v.capitalInjection} onChange={(e) => set('capitalInjection', e.target.value)} className="form-input" /></Field>
            <Field label="Credit growth % / mo"><input type="text" inputMode="decimal" value={v.creditGrowthPct} onChange={(e) => set('creditGrowthPct', e.target.value)} className="form-input" /></Field>
            <Field label="Max horizon — months"><input type="text" inputMode="decimal" value={v.maxHorizon} onChange={(e) => set('maxHorizon', e.target.value)} className="form-input" /></Field>
          </div>

          {!roadmap ? (
            <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-10 text-center">
              <p className="text-[12px] text-muted-foreground">Fill target + economics + ceiling to compute the roadmap.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-background/40 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 text-right font-medium">Launch</th>
                    <th className="px-3 py-2 text-right font-medium">Live</th>
                    <th className="px-3 py-2 text-right font-medium">Rev / day</th>
                    <th className="px-3 py-2 text-right font-medium">% target</th>
                    <th className="px-3 py-2 text-right font-medium">Ad / day</th>
                    <th className="px-3 py-2 text-right font-medium">Net / day</th>
                    <th className="px-3 py-2 text-right font-medium">Cum. net</th>
                    <th className="px-3 py-2 text-right font-medium">Work. cap</th>
                    <th className="px-3 py-2 text-right font-medium">Available</th>
                    <th className="px-3 py-2 text-center font-medium">State</th>
                  </tr>
                </thead>
                <tbody>
                  {roadmap.rows.map((r) => {
                    const isEta = r.month === roadmap.etaMonth;
                    const fc = { ok: 'text-emerald-400', 'capital-limited': 'text-amber-400', throttled: 'text-rose-400' }[r.flag];
                    const fd = { ok: 'bg-emerald-400', 'capital-limited': 'bg-amber-400', throttled: 'bg-rose-400' }[r.flag];
                    return (
                      <tr key={r.month} className={`border-b border-border/40 last:border-0 hover:bg-white/[0.02] ${isEta ? 'bg-emerald-500/[0.06]' : ''}`}>
                        <td className="px-3 py-2 tabular-nums text-foreground">{r.label}{isEta && <span className="ml-1 text-[9px] text-emerald-400">◀ target</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.launches > 0 ? `+${r.launches}` : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">{r.liveProducts}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-foreground">{fmtC(r.revPerDay)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.pctOfTarget.toFixed(0)}%</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtC(r.adPerDay)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${r.netPerDay >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtC(r.netPerDay)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">{fmtC(r.cumNet)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtC(r.workingCapital)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtC(r.available)}</td>
                        <td className="px-3 py-2"><span className={`mx-auto flex w-fit items-center gap-1 ${fc}`}><span className={`h-1.5 w-1.5 rounded-full ${fd}`} />{r.flag === 'ok' ? 'on plan' : r.flag === 'capital-limited' ? 'cap-limited' : 'throttled'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Ways to hit the target ──────────────────────────────────────── */}
      {econReady && decomposition.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Layers className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Ways to hit {fmtC(targetDay)}/day</h2>
              <p className="text-[10px] text-muted-foreground">Fewer products pushed hard vs more products run modest — same target, different risk &amp; capital</p>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {decomposition.map((o) => {
              const tone = o.ok ? (o.tight ? 'amber' : 'emerald') : 'rose';
              const ring = { emerald: 'border-emerald-500/30', amber: 'border-amber-500/30', rose: 'border-rose-500/30' }[tone];
              const txt = { emerald: 'text-emerald-400', amber: 'text-amber-400', rose: 'text-rose-400' }[tone];
              return (
                <div key={o.pp} className={`rounded-xl border ${ring} bg-background/40 p-4`}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[15px] font-semibold text-foreground">{o.n} products</p>
                    <p className="text-[12px] tabular-nums text-muted-foreground">{fmtC(o.pp)}/day ea</p>
                  </div>
                  <div className="mt-3 space-y-1.5 text-[11px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Ad spend / day</span><span className="tabular-nums text-foreground">{fmtC(o.totalAd)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Net / month</span><span className="tabular-nums text-emerald-400">{fmtC(o.totalNet * 30)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Working capital</span><span className="tabular-nums text-foreground">{fmtC(o.totalWC)}</span></div>
                  </div>
                  <p className={`mt-3 inline-flex items-center gap-1 text-[10px] font-medium ${txt}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${o.ok ? (o.tight ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-rose-400'}`} />
                    {o.ok ? (o.tight ? 'Fundable — tight' : 'Comfortably fundable') : `Short ${fmtC(o.totalWC - available)} of capital`}
                  </p>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── Second brain ─────────────────────────────────────────────────── */}
      {brain && roadmap && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="rounded-xl border border-primary/25 bg-primary/[0.04] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/15">
            <Brain className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Read of the situation</h2>
          </div>
          <div className="p-4 space-y-2.5 text-[12px]">
            <Insight tone={roadmap.reached ? 'good' : 'warn'}>
              {roadmap.reached
                ? <>You hit <b>{fmtC(targetDay)}/day</b> in <b>~{roadmap.etaMonth} months</b> ({brain.etaRow?.label}), running <b>{brain.etaRow?.liveProducts} products</b> at <b>~{fmtC(brain.perProdAtEta)}/day</b> each. Cumulative net by then ≈ <b>{fmtC(brain.etaRow?.cumNet ?? 0)}</b>.</>
                : <>Within {v.maxHorizon} months you plateau at <b>{fmtC(roadmap.peakRevPerDay)}/day</b> ({((roadmap.peakRevPerDay / targetDay) * 100).toFixed(0)}% of target) — the ramp can&apos;t outrun the capital gate. Raise capital/credit, reinvest more, or extend the horizon.</>}
            </Insight>
            <Insight tone={brain.limited > 0 ? 'warn' : 'good'}>
              {brain.limited > 0
                ? <><b>Capital is the binding constraint</b> (your flagged #1): <b>{brain.limited}</b> of {roadmap.rows.length} months were capital-limited or throttled — you funded fewer launches than your {v.winnersPerMonth}/mo plan. {brain.minExtra != null ? <>≈ <b>{fmtC(brain.minExtra)}</b> more upfront capital clears the early throttle.</> : <>Even large capital bumps don&apos;t fully clear it within the first 6 months — the per-product working capital is too heavy; cut COGS, raise ROAS, or shorten the cash cycle.</>}</>
                : <>Capital comfortably funds the plan every month — you are <b>not</b> capital-constrained at these settings. The lever is launch cadence / ramp speed, not cash.</>}
            </Insight>
            <Insight tone="info">
              Levers to pull the date in:&nbsp;
              {brain.dMonths(brain.credit15) ? <>+50% credit line → <b>−{brain.dMonths(brain.credit15)} mo</b>.&nbsp;</> : null}
              {brain.dMonths(brain.cap15) ? <>+50% capital → <b>−{brain.dMonths(brain.cap15)} mo</b>.&nbsp;</> : null}
              {brain.reinvestFull != null && brain.dMonths(brain.reinvestFull) ? <>100% reinvest → <b>−{brain.dMonths(brain.reinvestFull)} mo</b>.&nbsp;</> : null}
              {!brain.dMonths(brain.credit15) && !brain.dMonths(brain.cap15) && (brain.reinvestFull == null || !brain.dMonths(brain.reinvestFull)) ? 'more capital/credit barely moves the date here — you are launch-cadence limited, so increase winners/month or ramp speed.' : null}
            </Insight>
            <Insight tone={brain.perProdAtEta > ceiling * 0.9 ? 'warn' : 'info'}>
              {brain.perProdAtEta > ceiling * 0.9
                ? <>At target, products run at <b>{((brain.perProdAtEta / ceiling) * 100).toFixed(0)}% of their ceiling</b> — concentrated and fragile; one product fading dents the whole number. A lower ceiling assumption (more products) is safer.</>
                : <>Per-product load at target is <b>{((brain.perProdAtEta / Math.max(1, ceiling)) * 100).toFixed(0)}% of ceiling</b> — healthy headroom; the portfolio isn&apos;t over-pushed.</>}
            </Insight>
          </div>
        </motion.div>
      )}

      {/* Scenarios modal */}
      <AnimatePresence>
        {showScenarios && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowScenarios(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
                <div className="flex items-center gap-2"><Bookmark className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Saved scenarios</h2></div>
                <button onClick={() => setShowScenarios(false)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">Save current plan</p>
                  <div className="flex gap-2">
                    <input type="text" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="e.g. 1cr/day — aggressive"
                      onKeyDown={(e) => e.key === 'Enter' && saveScenario()}
                      className="flex-1 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none transition" />
                    <button onClick={saveScenario} disabled={!scenarioName.trim()} className="rounded-lg bg-primary/15 px-3 py-2 text-[11px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                {scenarios.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">Saved</p>
                    <div className="space-y-1.5">
                      {scenarios.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2.5 group">
                          {editingId === p.id ? (
                            <input autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') renameScenario(p.id, editingName); if (e.key === 'Escape') setEditingId(null); }}
                              onBlur={() => renameScenario(p.id, editingName)}
                              className="flex-1 rounded border border-primary/30 bg-transparent px-2 py-0.5 text-[12px] text-foreground focus:outline-none" />
                          ) : (
                            <button onClick={() => { setV({ ...DEFAULTS, ...p.data }); setShowScenarios(false); }} className="flex-1 text-left min-w-0">
                              <p className="text-[12px] font-medium text-foreground truncate">{p.name}</p>
                              <p className="text-[10px] text-muted-foreground/60">Target ₹{p.data?.targetRevenue}/{p.data?.basis} · {p.data?.winnersPerMonth}/mo · ceiling ₹{p.data?.ceilingPerDay}</p>
                            </button>
                          )}
                          {editingId !== p.id && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); setEditingId(p.id); setEditingName(p.name); }} className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:text-primary transition"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deleteScenario(p.id)} className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:text-red-400 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Bookmark className="h-6 w-6 mx-auto text-muted-foreground/20 mb-2" />
                    <p className="text-[12px] text-muted-foreground/50">No saved scenarios yet</p>
                    <p className="text-[10px] text-muted-foreground/30 mt-1">Save scale paths to compare aggressive vs safe</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

export default function StrategyPage() {
  return <StrategyInner />;
}

function LiquidityVerdict({ status, wc, available, headroom, fmt, cashCycle }: {
  status: 'ok' | 'tight' | 'crunch'; wc: number; available: number; headroom: number; fmt: (n: number) => string; cashCycle: number;
}) {
  const ui = {
    ok:     { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Within liquidity', Icon: ShieldCheck },
    tight:  { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   label: 'Tight — little buffer', Icon: Wallet },
    crunch: { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    label: 'Cash crunch — short', Icon: AlertTriangle },
  }[status];
  const I = ui.Icon;
  return (
    <div className={`rounded-xl border px-4 py-3.5 ${ui.border} ${ui.bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <I className={`h-4 w-4 ${ui.text}`} />
          <div>
            <p className={`text-[12px] font-semibold ${ui.text}`}>{ui.label}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Concurrent working capital {fmt(wc)} vs available {fmt(available)}</p>
          </div>
        </div>
        <p className={`font-mono text-[18px] font-bold tabular-nums ${headroom >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{headroom >= 0 ? '+' : '−'}{fmt(Math.abs(headroom))}</p>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/70">Working capital = (ad spend + credit-funded cost) per day × {cashCycle}-day cash cycle, summed across all live products</p>
    </div>
  );
}

function Insight({ tone, children }: { tone: 'good' | 'warn' | 'info'; children: React.ReactNode }) {
  const c = {
    good: { dot: 'bg-emerald-400', br: 'border-emerald-500/20' },
    warn: { dot: 'bg-amber-400', br: 'border-amber-500/20' },
    info: { dot: 'bg-sky-400', br: 'border-sky-500/20' },
  }[tone];
  return (
    <div className={`flex gap-2.5 rounded-lg border ${c.br} bg-background/40 px-3 py-2.5`}>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
      <p className="text-[12px] leading-relaxed text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">{children}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}{hint && <span className="ml-1 normal-case tracking-normal text-muted-foreground/50">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: 'primary' | 'success' }) {
  return (
    <div className={`result-row-glow flex items-center justify-between rounded-lg px-3 py-2.5 ${
      highlight === 'primary' ? 'bg-primary/5 border border-primary/15' :
      highlight === 'success' ? 'bg-emerald-500/5 border border-emerald-500/15' : ''}`}>
      <span className="relative z-10 text-[12px] text-muted-foreground">{label}</span>
      <span className={`relative z-10 text-[13px] font-semibold font-mono ${
        highlight === 'primary' ? 'text-primary' : highlight === 'success' ? 'text-emerald-400' : 'text-foreground'}`}>{value}</span>
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

function Seg({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
      {options.map(([val, lbl]) => (
        <button key={val} type="button" onClick={() => onChange(val)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${value === val ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
          {lbl}
        </button>
      ))}
    </div>
  );
}
