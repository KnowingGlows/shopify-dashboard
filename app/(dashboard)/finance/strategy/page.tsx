'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, TrendingUp, Bookmark, X, Plus, Pencil, Trash2, AlertTriangle, ShieldCheck, Wallet } from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { DatePicker } from '@/components/date-picker';
import { formatINR, formatUSD } from '@/lib/currency-converter';
import { compute3PL } from '@/lib/3pl';

// The Strategy planner runs on the same 3PL engine as the calculator. You set
// a revenue TARGET (per day or month) and it back-solves the orders, ad spend,
// procurement, credit and working capital needed — then ramps you there
// linearly by a date, flagging any step that would outrun your liquidity.

const DEFAULTS = {
  // Target
  targetRevenue: '0',
  basis: 'day' as 'day' | 'month',
  revenueType: 'booked' as 'booked' | 'collected', // booked = Shopify; collected = COD delivered
  // Per-order economics (prefill from a saved 3PL preset, then tweak)
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
  // Ramp
  currentRevenue: '0', // today's run-rate, same basis as the target
  targetDate: '',
  step: 'week' as 'day' | 'week' | 'month',
  // Liquidity
  availableCapital: '0',
  creditLine: '0',
  cashCycleDays: '21', // days cash is tied up before COD collection returns
};

type State = typeof DEFAULTS;

const STEP_DAYS: Record<State['step'], number> = { day: 1, week: 7, month: 30 };

function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function StrategyPage() {
  const [v, setV] = useState<State>(DEFAULTS);

  // Scenario presets (kind='strategy') — same store as the calculators.
  type Scenario = { id: string; name: string; kind: 'strategy'; data: State };
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [showScenarios, setShowScenarios] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // 3PL presets used to PREFILL the economics block.
  type ThreePLPreset = { id: string; name: string; data: Record<string, string | boolean> };
  const [threePLPresets, setThreePLPresets] = useState<ThreePLPreset[]>([]);

  // Display currency — computed in ₹, optionally shown in $ at the live rate.
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
      await fetch('/api/finance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-preset', id }),
      });
    } catch { /* ignore */ }
  };
  const renameScenario = async (id: string, name: string) => {
    if (!name.trim()) return;
    setScenarios((p) => p.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)));
    setEditingId(null);
    try {
      await fetch('/api/finance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename-preset', id, name: name.trim() }),
      });
    } catch { /* ignore */ }
  };

  // ── Solve a plan for a given revenue/day ──────────────────────────────────
  const sp = num(v.sellingPrice);
  const d = Math.min(1, Math.max(0, num(v.deliveryRate) / 100));
  const econReady = sp > 0 && d > 0;

  const planFor = (revenuePerDay: number) => {
    // Back-solve the SHIPPED order count/day from the revenue target.
    const shipped = v.revenueType === 'booked'
      ? (sp > 0 ? revenuePerDay / sp : 0)
      : (sp > 0 && d > 0 ? revenuePerDay / (sp * d) : 0);
    const r = compute3PL({
      sellingPrice: sp,
      cogsPerUnit: num(v.cogsPerUnit),
      deliveryRate: num(v.deliveryRate),
      roas: num(v.roas),
      orders: shipped,
      unitsPerOrder: Math.max(1, num(v.unitsPerOrder)),
      weightGrams: num(v.weightGrams),
      storageDays: num(v.storageDays),
      financingFeePct: num(v.financingFeePct),
      spGstInclusive: v.spGstInclusive,
      chargeOutputGst: v.chargeOutputGst,
    });
    // Working capital = the cash you must float per day (ads + everything
    // funded on credit) held over the cash-conversion cycle until COD returns.
    const cashCycle = Math.max(0, num(v.cashCycleDays));
    const workingCapital = (r.outAds + r.financed) * cashCycle;
    return { shipped, r, workingCapital };
  };

  // Target revenue normalised to a per-DAY figure.
  const perDay = (val: number) => (v.basis === 'month' ? val / 30 : val);
  const targetRevDay = perDay(num(v.targetRevenue));
  const currentRevDay = perDay(num(v.currentRevenue));

  const target = useMemo(() => planFor(targetRevDay), [v, targetRevDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const available = num(v.availableCapital) + num(v.creditLine);
  const headroom = available - target.workingCapital;
  const status: 'ok' | 'tight' | 'crunch' =
    !econReady || targetRevDay <= 0 ? 'ok'
      : target.workingCapital > available ? 'crunch'
      : target.workingCapital > 0.85 * available ? 'tight'
      : 'ok';

  // ── Linear ramp schedule ──────────────────────────────────────────────────
  const schedule = useMemo(() => {
    if (!econReady || targetRevDay <= 0) return [];
    const start = istToday();
    const end = v.targetDate;
    if (!end || end <= start) return [];
    const startMs = new Date(start + 'T00:00:00').getTime();
    const endMs = new Date(end + 'T00:00:00').getTime();
    const totalDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000));
    const stepDays = STEP_DAYS[v.step];
    let nSteps = Math.max(1, Math.ceil(totalDays / stepDays));
    nSteps = Math.min(nSteps, 36);
    const effDays = totalDays / nSteps;
    const from = Math.max(0, currentRevDay);
    const rows: Array<{
      date: string; days: number; revDay: number; orders: number;
      adDay: number; netDay: number; cum: number; wc: number; head: number;
      st: 'ok' | 'tight' | 'crunch';
    }> = [];
    let cum = 0;
    for (let i = 1; i <= nSteps; i++) {
      const frac = i / nSteps;
      const revDay = from + (targetRevDay - from) * frac;
      const p = planFor(revDay);
      const daysThis = Math.round(effDays);
      cum += p.r.netProfit * daysThis;
      const head = available - p.workingCapital;
      const st: 'ok' | 'tight' | 'crunch' =
        p.workingCapital > available ? 'crunch'
          : p.workingCapital > 0.85 * available ? 'tight' : 'ok';
      const dt = new Date(startMs + Math.round(i * effDays) * 86_400_000);
      rows.push({
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(dt),
        days: daysThis,
        revDay,
        orders: p.shipped,
        adDay: p.r.outAds,
        netDay: p.r.netProfit,
        cum,
        wc: p.workingCapital,
        head,
        st,
      });
    }
    return rows;
  }, [v, targetRevDay, currentRevDay, available, econReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const tr = target.r;
  const beroas = Number.isFinite(tr.beroas) ? tr.beroas : NaN;
  const reset = () => setV(DEFAULTS);

  const STATUS_UI = {
    ok:     { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Within liquidity' },
    tight:  { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   label: 'Tight — little buffer' },
    crunch: { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    label: 'Cash crunch — short' },
  }[status];

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header — matches the calculators */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Strategy</h1>
          <p className="text-[11px] text-muted-foreground">Plan the scale-up — targets, capital &amp; a liquidity-safe ramp</p>
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
        {/* ── Card 1: Targets & economics ───────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Target className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Target &amp; economics</h2>
              <p className="text-[10px] text-muted-foreground">Set the goal — prefill economics from a saved 3PL preset, then tweak</p>
            </div>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            {/* Prefill */}
            <Field label="Prefill economics from a 3PL preset">
              <select
                className="form-input"
                value=""
                onChange={(e) => { const p = threePLPresets.find((x) => x.id === e.target.value); if (p) applyThreePLPreset(p); }}
              >
                <option value="">{threePLPresets.length ? 'Select a saved 3PL preset…' : 'No 3PL presets saved yet'}</option>
                {threePLPresets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>

            <div className="h-px bg-border" />

            {/* Target */}
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Target revenue — ₹ / ${v.basis}`}>
                <input type="text" inputMode="decimal" value={v.targetRevenue} onChange={(e) => set('targetRevenue', e.target.value)} className="form-input" placeholder="e.g. 5000000" />
              </Field>
              <Field label="Basis">
                <Seg options={[['day', 'Per day'], ['month', 'Per month']]} value={v.basis} onChange={(x) => set('basis', x as State['basis'])} />
              </Field>
              <Field label="Revenue counted as" hint="booked = Shopify · collected = COD delivered">
                <Seg options={[['booked', 'Booked'], ['collected', 'Collected']]} value={v.revenueType} onChange={(x) => set('revenueType', x as State['revenueType'])} />
              </Field>
              <Field label="Current run-rate — ₹ / day" hint="today, for the ramp">
                <input type="text" inputMode="decimal" value={v.currentRevenue} onChange={(e) => set('currentRevenue', e.target.value)} className="form-input" />
              </Field>
            </div>

            <div className="h-px bg-border" />

            {/* Economics */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="AOV / Selling price — ₹"><input type="text" inputMode="decimal" value={v.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} className="form-input" /></Field>
              <Field label="Cost of product — ₹"><input type="text" inputMode="decimal" value={v.cogsPerUnit} onChange={(e) => set('cogsPerUnit', e.target.value)} className="form-input" /></Field>
              <Field label="ROAS" hint="ad spend = price ÷ ROAS"><input type="text" inputMode="decimal" value={v.roas} onChange={(e) => set('roas', e.target.value)} className="form-input" /></Field>
              <Field label="Delivery rate %" hint="rest is RTO"><input type="text" inputMode="decimal" value={v.deliveryRate} onChange={(e) => set('deliveryRate', e.target.value)} className="form-input" /></Field>
              <Field label="Units / order"><input type="text" inputMode="decimal" value={v.unitsPerOrder} onChange={(e) => set('unitsPerOrder', e.target.value)} className="form-input" /></Field>
              <Field label="Package weight — g"><input type="text" inputMode="decimal" value={v.weightGrams} onChange={(e) => set('weightGrams', e.target.value)} className="form-input" /></Field>
              <Field label="Avg storage days"><input type="text" inputMode="decimal" value={v.storageDays} onChange={(e) => set('storageDays', e.target.value)} className="form-input" /></Field>
              <Field label="Financing fee %"><input type="text" inputMode="decimal" value={v.financingFeePct} onChange={(e) => set('financingFeePct', e.target.value)} className="form-input" /></Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Toggle on={v.spGstInclusive} onClick={() => set('spGstInclusive', !v.spGstInclusive)} label="Selling price is GST-inclusive" />
              <Toggle on={v.chargeOutputGst} onClick={() => set('chargeOutputGst', !v.chargeOutputGst)} label="GST registered — pay output & claim input" />
            </div>

            <div className="h-px bg-border" />

            {/* Liquidity */}
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Liquidity guardrail</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Available capital — ₹"><input type="text" inputMode="decimal" value={v.availableCapital} onChange={(e) => set('availableCapital', e.target.value)} className="form-input" /></Field>
              <Field label="Credit line — ₹"><input type="text" inputMode="decimal" value={v.creditLine} onChange={(e) => set('creditLine', e.target.value)} className="form-input" /></Field>
              <Field label="Cash cycle — days" hint="cash tied up until COD returns"><input type="text" inputMode="decimal" value={v.cashCycleDays} onChange={(e) => set('cashCycleDays', e.target.value)} className="form-input" /></Field>
              <Field label="Target date" hint="ramp end">
                <DatePicker value={v.targetDate} onChange={(dd) => set('targetDate', dd)} placeholder="Pick a date" compact />
              </Field>
            </div>
          </div>
        </motion.div>

        {/* ── Card 2: Plan at target ────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Plan at target</h2>
              <p className="text-[10px] text-muted-foreground">What ₹{v.targetRevenue || '0'} / {v.basis} demands</p>
            </div>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            {!econReady ? (
              <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-10 text-center">
                <p className="text-[12px] text-muted-foreground">Set AOV &amp; delivery rate (prefill from a 3PL preset) to draft the plan.</p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <ResultRow label="Required orders / day (shipped)" value={Math.round(target.shipped).toLocaleString('en-IN')} />
                  <ResultRow label="Delivered / day" value={Math.round(target.shipped * d).toLocaleString('en-IN')} />
                  <ResultRow label="Shopify revenue / day (booked)" value={fmt(tr.shopifyRevenue)} />
                  <ResultRow label="Collected revenue / day (COD)" value={fmt(tr.moneyIn)} />
                  <ResultRow label="Ad spend / day" value={fmt(tr.outAds)} />
                  <ResultRow label="Procurement cash / day (incl. GST)" value={fmt(tr.procurementCost)} />
                  <ResultRow label="BEROAS vs ROAS" value={`${Number.isFinite(beroas) ? beroas.toFixed(2) : '—'}x · ${num(v.roas).toFixed(2)}x`} />
                  <ResultRow label="Gross margin" value={`${tr.grossMarginPct.toFixed(1)}%`} />
                  <ResultRow label="Net profit / day" value={fmt(tr.netProfit)} highlight="primary" />
                  <ResultRow label="Net profit / month (×30)" value={`${fmt(tr.netProfit * 30)} · ${tr.netMarginPct.toFixed(1)}%`} highlight="success" />
                </div>

                {/* Hero */}
                <div className="stat-shimmer glow-pulse rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center"
                  style={{ '--glow-color': 'rgba(16,185,129,0.12)' } as React.CSSProperties}>
                  <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Net profit / day at target</p>
                  <p className={`relative z-10 text-4xl font-bold font-mono ${tr.netProfit >= 0 ? 'gradient-text-emerald' : 'text-rose-400'}`}>{fmt(tr.netProfit)}</p>
                  <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">{tr.grossMarginPct.toFixed(1)}% gross margin · {tr.netMarginPct.toFixed(1)}% net</p>
                </div>

                {/* Liquidity verdict */}
                <div className={`rounded-xl border px-4 py-3.5 ${STATUS_UI.border} ${STATUS_UI.bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {status === 'crunch' ? <AlertTriangle className={`h-4 w-4 ${STATUS_UI.text}`} /> : status === 'tight' ? <Wallet className={`h-4 w-4 ${STATUS_UI.text}`} /> : <ShieldCheck className={`h-4 w-4 ${STATUS_UI.text}`} />}
                      <div>
                        <p className={`text-[12px] font-semibold ${STATUS_UI.text}`}>{STATUS_UI.label}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Working capital {fmt(target.workingCapital)} vs available {fmt(available)}
                        </p>
                      </div>
                    </div>
                    <p className={`font-mono text-[18px] font-bold tabular-nums ${headroom >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {headroom >= 0 ? '+' : '−'}{fmt(Math.abs(headroom))}
                    </p>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground/70">
                    Working capital = (ad spend + credit-funded costs) per day × {num(v.cashCycleDays)}-day cash cycle · Available = capital + credit line
                  </p>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Ramp schedule ────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Ramp to target</h2>
              <p className="text-[10px] text-muted-foreground">Linear from today&apos;s run-rate to the target by your date</p>
            </div>
          </div>
          <Seg options={[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']]} value={v.step} onChange={(x) => set('step', x as State['step'])} />
        </div>
        <div className="p-4">
          {schedule.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-10 text-center">
              <p className="text-[12px] text-muted-foreground">
                {!econReady ? 'Set the economics first.' : 'Pick a target date later than today to draw the ramp.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border bg-background/40 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">By</th>
                      <th className="px-3 py-2 text-right font-medium">Rev / day</th>
                      <th className="px-3 py-2 text-right font-medium">Orders / day</th>
                      <th className="px-3 py-2 text-right font-medium">Ad spend / day</th>
                      <th className="px-3 py-2 text-right font-medium">Net / day</th>
                      <th className="px-3 py-2 text-right font-medium">Cumulative net</th>
                      <th className="px-3 py-2 text-right font-medium">Working capital</th>
                      <th className="px-3 py-2 text-right font-medium">Headroom</th>
                      <th className="px-3 py-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((row, i) => {
                      const su = { ok: 'text-emerald-400', tight: 'text-amber-400', crunch: 'text-rose-400' }[row.st];
                      const sdot = { ok: 'bg-emerald-400', tight: 'bg-amber-400', crunch: 'bg-rose-400' }[row.st];
                      return (
                        <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
                          <td className="px-3 py-2 tabular-nums text-foreground">{row.date}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmt(row.revDay)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{Math.round(row.orders).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(row.adDay)}</td>
                          <td className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${row.netDay >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(row.netDay)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">{fmt(row.cum)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(row.wc)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${row.head >= 0 ? 'text-muted-foreground' : 'text-rose-400'}`}>{row.head >= 0 ? '+' : '−'}{fmt(Math.abs(row.head))}</td>
                          <td className="px-3 py-2">
                            <span className={`mx-auto flex w-fit items-center gap-1 ${su}`}><span className={`h-1.5 w-1.5 rounded-full ${sdot}`} />{row.st}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2.5 text-[11px] text-muted-foreground/70">
                Cumulative net by target date: <span className="font-semibold text-foreground">{fmt(schedule[schedule.length - 1]?.cum ?? 0)}</span>
                {schedule.some((r) => r.st === 'crunch') && (
                  <span className="ml-2 text-rose-400">· some steps outrun your liquidity — raise capital/credit, slow the ramp, or push the date</span>
                )}
              </p>
            </>
          )}
        </div>
      </motion.div>

      {/* Scenarios modal */}
      <AnimatePresence>
        {showScenarios && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowScenarios(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
                <div className="flex items-center gap-2"><Bookmark className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Saved scenarios</h2></div>
                <button onClick={() => setShowScenarios(false)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">Save current plan</p>
                  <div className="flex gap-2">
                    <input type="text" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="e.g. 50L/day by Aug"
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
                              <p className="text-[10px] text-muted-foreground/60">Target ₹{p.data?.targetRevenue} / {p.data?.basis} · AOV ₹{p.data?.sellingPrice} · ROAS {p.data?.roas}</p>
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
                    <p className="text-[10px] text-muted-foreground/30 mt-1">Draft a plan and save it to compare scale paths</p>
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {hint && <span className="ml-1 normal-case tracking-normal text-muted-foreground/50">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: 'primary' | 'success' }) {
  return (
    <div className={`result-row-glow flex items-center justify-between rounded-lg px-3 py-2.5 ${
      highlight === 'primary' ? 'bg-primary/5 border border-primary/15' :
      highlight === 'success' ? 'bg-emerald-500/5 border border-emerald-500/15' : ''
    }`}>
      <span className="relative z-10 text-[12px] text-muted-foreground">{label}</span>
      <span className={`relative z-10 text-[13px] font-semibold font-mono ${
        highlight === 'primary' ? 'text-primary' : highlight === 'success' ? 'text-emerald-400' : 'text-foreground'
      }`}>{value}</span>
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
      on ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-border bg-card text-muted-foreground hover:text-foreground'
    }`}>
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
