'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Map, Bookmark, X, Plus, Pencil, Trash2 } from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { formatINR, formatUSD } from '@/lib/currency-converter';
import {
  runRoadmap, portfolioAt, solveLever,
  type RoadmapEconomics, type RoadmapInput, type Lever,
} from '@/lib/roadmap';

const DEFAULTS = {
  targetRevenue: '0',
  basis: 'day' as 'day' | 'month',
  revenueType: 'booked' as 'booked' | 'collected',
  baselineRevenue: '0',
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
  winnersPerMonth: '10',
  startPerDay: '100000',
  ceilingPerDay: '300000',
  monthsToCeiling: '6',
  reinvestPct: '100',
  capitalInjection: '0',
  maxHorizon: '36',
  goalMonths: '12',
  availableCapital: '0',
  creditPctProcurement: '0',
  cashCycleDays: '21',
};
type State = typeof DEFAULTS;

const n = (s: string) => { const x = parseFloat(s); return Number.isFinite(x) ? x : 0; };

function analyze(v: State) {
  const sp = n(v.sellingPrice);
  const dr = Math.min(1, Math.max(0, n(v.deliveryRate) / 100));
  const perDay = (x: number) => (v.basis === 'month' ? x / 30 : x);
  const targetDay = perDay(n(v.targetRevenue));
  const ceiling = n(v.ceilingPerDay);
  const econReady = sp > 0 && dr > 0 && targetDay > 0 && ceiling > 0;
  const capital = n(v.availableCapital);
  const creditPct = n(v.creditPctProcurement);

  const econ: RoadmapEconomics = {
    sellingPrice: sp,
    cogsPerUnit: n(v.cogsPerUnit),
    deliveryRate: n(v.deliveryRate),
    roas: n(v.roas),
    unitsPerOrder: Math.max(1, n(v.unitsPerOrder)),
    weightGrams: n(v.weightGrams),
    storageDays: n(v.storageDays),
    financingFeePct: n(v.financingFeePct),
    spGstInclusive: v.spGstInclusive,
    chargeOutputGst: v.chargeOutputGst,
    revenueType: v.revenueType,
    cashCycleDays: n(v.cashCycleDays),
  };
  const input: RoadmapInput = {
    econ,
    targetRevPerDay: targetDay,
    baselineRevPerDay: perDay(n(v.baselineRevenue)),
    winnersPerMonth: Math.max(0, n(v.winnersPerMonth)),
    startPerDay: n(v.startPerDay),
    ceilingPerDay: ceiling,
    monthsToCeiling: Math.max(0.5, n(v.monthsToCeiling)),
    capital,
    creditPctOfProcurement: creditPct,
    reinvestPct: Math.max(0, n(v.reinvestPct)),
    capitalInjectionPerMonth: n(v.capitalInjection),
    maxHorizonMonths: Math.max(1, n(v.maxHorizon)),
  };

  if (!econReady) return { econReady: false as const, targetDay, ceiling, capital, creditPct };

  const roadmap = runRoadmap(input);
  const at = portfolioAt(econ, targetDay, ceiling, creditPct);

  const fracs = [1, 0.66, 0.5, 0.33, 0.2];
  const seen = new Set<number>();
  const spectrum = fracs.map((fr) => Math.round(ceiling * fr)).filter((pp) => {
    if (pp <= 0 || seen.has(pp)) return false; seen.add(pp); return true;
  }).map((pp) => {
    const p = portfolioAt(econ, targetDay, pp, creditPct);
    return {
      pp, products: p.products, ad: p.ad, net: p.net, wc: p.wc, credit: p.credit, ownerWc: p.ownerWc,
      ok: p.ownerWc <= capital, tight: p.ownerWc <= capital && p.ownerWc > 0.85 * capital,
    };
  });

  const goal = Math.max(1, Math.round(n(v.goalMonths)));
  const levers: Lever[] = ['capital', 'creditPct', 'winnersPerMonth', 'roas', 'reinvestPct'];
  const gap = levers.map((lv) => ({ lever: lv, r: solveLever(input, lv, goal) }));

  const etaRow = roadmap.etaMonth != null ? roadmap.rows.find((r) => r.month === roadmap.etaMonth) ?? null : null;
  const perProdAtEta = etaRow && etaRow.liveProducts > 0 ? etaRow.revPerDay / etaRow.liveProducts : 0;
  const bindingNow = roadmap.rows[0]?.binding ?? 'cadence';

  return { econReady: true as const, targetDay, ceiling, capital, creditPct, roadmap, at, spectrum, gap, goal, etaRow, perProdAtEta, bindingNow };
}

const BIND_LABEL: Record<string, string> = { capital: 'Capital', cadence: 'Launch cadence', ramp: 'Product ramp', target: 'At target' };
const BIND_TONE: Record<string, string> = { capital: 'text-rose-400', cadence: 'text-sky-400', ramp: 'text-amber-400', target: 'text-emerald-400' };
const LEVER_LABEL: Record<Lever, string> = { capital: 'More capital', creditPct: 'Higher credit % of procurement', winnersPerMonth: 'Winners / month', roas: 'Better ROAS', reinvestPct: 'Reinvest %' };

export default function StrategyPage() {
  const [v, setV] = useState<State>(DEFAULTS);

  type Scenario = { id: string; name: string; kind: 'strategy'; data: State };
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  type Preset = { id: string; name: string; data: Record<string, string | boolean> };
  const [threePL, setThreePL] = useState<Preset[]>([]);

  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [rateStr, setRateStr] = useState('95');
  useEffect(() => {
    fetch('/api/fx').then((r) => r.json()).then((d) => { if (d?.rates?.INR) setRateStr(String(Number(d.rates.INR).toFixed(2))); }).catch(() => {});
  }, []);
  const inrPerUsd = parseFloat(rateStr) || 95;

  useEffect(() => {
    fetch('/api/finance?action=presets&kind=strategy').then((r) => r.json()).then((d) => setScenarios(d.presets ?? [])).catch(() => {});
    fetch('/api/finance?action=presets&kind=3pl').then((r) => r.json()).then((d) => setThreePL(d.presets ?? [])).catch(() => {});
  }, []);

  const set = <K extends keyof State>(k: K, val: State[K]) => setV((s) => ({ ...s, [k]: val }));
  const fmt = (a: number) => {
    if (currency === 'USD') return formatUSD(inrPerUsd > 0 ? a / inrPerUsd : 0);
    const x = Math.abs(a); const sg = a < 0 ? '−' : '';
    if (x >= 1e7) return `${sg}₹${(x / 1e7).toFixed(2)}Cr`;
    if (x >= 1e5) return `${sg}₹${(x / 1e5).toFixed(2)}L`;
    if (x >= 1e3) return `${sg}₹${(x / 1e3).toFixed(1)}k`;
    return formatINR(a);
  };

  const A = useMemo(() => analyze(v), [v]);

  const applyPreset = (p: Preset) => {
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
  const saveCurrentAsPreset = async () => {
    if (!presetName.trim()) return;
    try {
      const res = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-preset', preset: { name: presetName.trim(), kind: 'strategy', data: v } }) });
      const d = await res.json(); if (d.preset) setScenarios((p) => [...p, d.preset]); setPresetName('');
    } catch { /* ignore */ }
  };
  const deletePreset = async (id: string) => {
    setScenarios((p) => p.filter((x) => x.id !== id));
    try { await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-preset', id }) }); } catch { /* ignore */ }
  };
  const renamePreset = async (id: string, nm: string) => {
    if (!nm.trim()) return;
    setScenarios((p) => p.map((x) => (x.id === id ? { ...x, name: nm.trim() } : x))); setEditingId(null);
    try { await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rename-preset', id, name: nm.trim() }) }); } catch { /* ignore */ }
  };
  const reset = () => setV(DEFAULTS);

  const reached = A.econReady && A.roadmap.etaMonth != null;
  const etaText = A.econReady
    ? (reached ? `${A.roadmap.etaMonth} months` : `> ${v.maxHorizon} months`)
    : '—';

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header — same as the 3PL Calculator */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Strategy</h1>
          <p className="text-[11px] text-muted-foreground">Scale roadmap — what the target needs, when, &amp; the cheapest lever to get there</p>
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
          <button onClick={() => setShowPresets(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground hover:bg-accent/30">
            <Bookmark className="h-3.5 w-3.5" /> Scenarios {scenarios.length > 0 && <span className="text-primary">({scenarios.length})</span>}
          </button>
          <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground hover:bg-accent/30">Reset</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Card 1 — Strategy (inputs + plan + hero) ───────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Target className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Strategy</h2>
              <p className="text-[10px] text-muted-foreground">Set the goal — prefill economics from a saved 3PL preset</p>
            </div>
            <select className="ml-auto rounded-lg border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground" value="" onChange={(e) => { const p = threePL.find((x) => x.id === e.target.value); if (p) applyPreset(p); }}>
              <option value="">{threePL.length ? 'prefill 3PL…' : 'no 3PL presets'}</option>
              {threePL.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CalcField label={`Target — ₹ / ${v.basis}`} hint="your goal, e.g. 1cr/day" sub={inrWords(n(v.targetRevenue))}>
                <input type="text" inputMode="decimal" value={v.targetRevenue} onChange={(e) => set('targetRevenue', e.target.value)} onFocus={(e) => e.currentTarget.select()} className="form-input" />
              </CalcField>
              <CalcField label="Basis" hint="is the target per day or per month">
                <select value={v.basis} onChange={(e) => set('basis', e.target.value as State['basis'])} className="form-input">
                  <option value="day">Per day</option><option value="month">Per month</option>
                </select>
              </CalcField>
              <CalcField label="Revenue counts as" hint="booked = all Shopify orders · COD = only delivered cash">
                <select value={v.revenueType} onChange={(e) => set('revenueType', e.target.value as State['revenueType'])} className="form-input">
                  <option value="booked">Booked</option><option value="collected">Collected (COD)</option>
                </select>
              </CalcField>
              <CalcField label="Current run-rate — ₹ / day" hint="what you do today; 0 if starting fresh" sub={inrWords(n(v.baselineRevenue))}>
                <input type="text" inputMode="decimal" value={v.baselineRevenue} onChange={(e) => set('baselineRevenue', e.target.value)} onFocus={(e) => e.currentTarget.select()} className="form-input" />
              </CalcField>
              <CalcField label="AOV — ₹" hint="avg order value / selling price" sub={inrWords(n(v.sellingPrice))}><input type="text" inputMode="decimal" value={v.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} onFocus={(e) => e.currentTarget.select()} className="form-input" /></CalcField>
              <CalcField label="COGS — ₹" hint="product cost per unit" sub={inrWords(n(v.cogsPerUnit))}><input type="text" inputMode="decimal" value={v.cogsPerUnit} onChange={(e) => set('cogsPerUnit', e.target.value)} onFocus={(e) => e.currentTarget.select()} className="form-input" /></CalcField>
              <CalcField label="ROAS" hint="expected return on ad spend, e.g. 2.2"><input type="text" inputMode="decimal" value={v.roas} onChange={(e) => set('roas', e.target.value)} className="form-input" /></CalcField>
              <CalcField label="Delivery Rate %" hint="% of orders delivered; rest is RTO"><input type="text" inputMode="decimal" value={v.deliveryRate} onChange={(e) => set('deliveryRate', e.target.value)} className="form-input" /></CalcField>
              <CalcField label="New winners / month" hint="winning products you can onboard each month"><input type="text" inputMode="decimal" value={v.winnersPerMonth} onChange={(e) => set('winnersPerMonth', e.target.value)} className="form-input" /></CalcField>
              <CalcField label="Launch ₹/day per winner" hint="a fresh product's starting daily revenue" sub={inrWords(n(v.startPerDay))}><input type="text" inputMode="decimal" value={v.startPerDay} onChange={(e) => set('startPerDay', e.target.value)} onFocus={(e) => e.currentTarget.select()} className="form-input" /></CalcField>
              <CalcField label="Ceiling ₹/day per product" hint="max ₹/day one product can sustain" sub={inrWords(n(v.ceilingPerDay))}><input type="text" inputMode="decimal" value={v.ceilingPerDay} onChange={(e) => set('ceilingPerDay', e.target.value)} onFocus={(e) => e.currentTarget.select()} className="form-input" /></CalcField>
              <CalcField label="Months to ~ceiling" hint="how long a product takes to scale up"><input type="text" inputMode="decimal" value={v.monthsToCeiling} onChange={(e) => set('monthsToCeiling', e.target.value)} className="form-input" /></CalcField>
            </div>

            <div className="h-px bg-border" />

            {!A.econReady ? (
              <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">Set target, AOV, delivery rate &amp; per-product ceiling to draft the plan.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <ResultRow label="Winning products needed" value={`${A.at.products}`} highlight="primary" />
                  <ResultRow label="Orders / day (portfolio)" value={Math.round(A.at.orders).toLocaleString('en-IN')} />
                  <ResultRow label="Ad spend / day" value={fmt(A.at.ad)} />
                  <ResultRow label={`Gross margin · per product ${fmt(A.ceiling)}/day`} value={`${A.at.gm.toFixed(1)}%`} />
                  <ResultRow label="Net profit / day" value={fmt(A.at.net)} highlight="primary" />
                  <ResultRow label="Net profit / month (×30)" value={fmt(A.at.net * 30)} highlight="success" />
                  <ResultRow label="Working capital (gross)" value={fmt(A.at.wc)} />
                  <ResultRow label={`Credit covers (${A.creditPct.toFixed(0)}% of procurement)`} value={`− ${fmt(A.at.credit)}`} />
                  <ResultRow label="You fund vs your capital"
                    value={`${fmt(A.at.ownerWc)} / ${fmt(A.capital)}`}
                    highlight={A.at.ownerWc <= A.capital ? 'success' : undefined} />
                </div>

                <div className="stat-shimmer glow-pulse rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center"
                  style={{ '--glow-color': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}>
                  <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Reach the target in</p>
                  <p className={`relative z-10 text-4xl font-bold font-mono ${reached ? 'gradient-text-emerald' : 'text-rose-400'}`}>{etaText}</p>
                  <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">
                    {reached
                      ? `${A.etaRow?.label} · ${A.etaRow?.liveProducts} products live · cum net ${fmt(A.etaRow?.cumNet ?? 0)}`
                      : `plateaus at ${fmt(A.roadmap.peakRevPerDay)}/day (${((A.roadmap.peakRevPerDay / A.targetDay) * 100).toFixed(0)}% of target)`}
                  </p>
                </div>
              </>
            )}
          </div>
        </motion.div>

        {/* ── Card 2 — Diagnosis (verdict box + levers + secondary inputs) ─ */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Map className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Diagnosis</h2>
              <p className="text-[10px] text-muted-foreground">What&apos;s binding, and the cheapest way to go faster</p>
            </div>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            {!A.econReady ? (
              <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">Fill the strategy inputs to see the diagnosis.</p>
            ) : (
              <>
                <div className="rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Binding constraint</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {A.roadmap.monthsCapitalBound > 0
                          ? `${A.roadmap.monthsCapitalBound} of ${A.roadmap.rows.length} months capital-bound`
                          : 'capital funds every month — cadence/ramp limited'}
                      </p>
                    </div>
                    <p className={`font-mono text-[22px] font-bold tabular-nums ${BIND_TONE[A.bindingNow]}`}>{BIND_LABEL[A.bindingNow]}</p>
                  </div>
                </div>

                <div className="h-px bg-border" />

                <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                  Hit the target by month {A.goal} via <span className="normal-case tracking-normal font-normal text-muted-foreground/60">(one lever, others held)</span>
                </p>
                <div className="space-y-1.5">
                  {A.gap.map(({ lever, r }) => {
                    if (!r) return null;
                    const same = Math.abs(r.value - r.from) < 1e-6;
                    const vTxt = lever === 'winnersPerMonth' ? `${Math.round(r.value)}/mo`
                      : lever === 'roas' ? `${r.value.toFixed(2)}x`
                      : lever === 'reinvestPct' || lever === 'creditPct' ? `${r.value.toFixed(0)}%`
                      : fmt(r.value);
                    return (
                      <ResultRow key={lever} label={LEVER_LABEL[lever]}
                        value={!r.reachable ? `can't (≥ ${vTxt})` : same ? 'already ✓' : vTxt}
                        highlight={same ? 'success' : undefined} />
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  Concentration: products run at {((A.perProdAtEta / Math.max(1, A.ceiling)) * 100).toFixed(0)}% of ceiling at target{A.perProdAtEta > A.ceiling * 0.9 ? ' — fragile, assume a lower ceiling' : ''}.
                </p>

                <div className="h-px bg-border" />

                <div className="grid grid-cols-2 gap-3">
                  <CalcField label="Available capital — ₹" hint="your own cash to deploy" sub={inrWords(n(v.availableCapital))}><input type="text" inputMode="decimal" value={v.availableCapital} onChange={(e) => set('availableCapital', e.target.value)} onFocus={(e) => e.currentTarget.select()} className="form-input" /></CalcField>
                  <CalcField label="Credit line — % of procurement" hint="share of stock cost the line funds, revolving over the cash cycle, e.g. 70"><input type="text" inputMode="decimal" value={v.creditPctProcurement} onChange={(e) => set('creditPctProcurement', e.target.value)} className="form-input" /></CalcField>
                  <CalcField label="Cash cycle — days" hint="days from paying to COD back; also the credit term, ~21"><input type="text" inputMode="decimal" value={v.cashCycleDays} onChange={(e) => set('cashCycleDays', e.target.value)} className="form-input" /></CalcField>
                  <CalcField label="Reinvest net %" hint="% of profit put back as capital"><input type="text" inputMode="decimal" value={v.reinvestPct} onChange={(e) => set('reinvestPct', e.target.value)} className="form-input" /></CalcField>
                  <CalcField label="Capital + / month — ₹" hint="extra capital you add each month, if any" sub={inrWords(n(v.capitalInjection))}><input type="text" inputMode="decimal" value={v.capitalInjection} onChange={(e) => set('capitalInjection', e.target.value)} onFocus={(e) => e.currentTarget.select()} className="form-input" /></CalcField>
                  <CalcField label="Max horizon — months" hint="how far ahead to project, e.g. 36"><input type="text" inputMode="decimal" value={v.maxHorizon} onChange={(e) => set('maxHorizon', e.target.value)} className="form-input" /></CalcField>
                  <CalcField label="Want it by — month" hint="deadline for the 'levers' below"><input type="text" inputMode="decimal" value={v.goalMonths} onChange={(e) => set('goalMonths', e.target.value)} className="form-input" /></CalcField>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Toggle on={v.spGstInclusive} onClick={() => set('spGstInclusive', !v.spGstInclusive)} label="Price is GST-inclusive" />
                  <Toggle on={v.chargeOutputGst} onClick={() => set('chargeOutputGst', !v.chargeOutputGst)} label="GST registered" />
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Roadmap (full-width, same card style) ───────────────────────── */}
      {A.econReady && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Map className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Roadmap</h2>
              <p className="text-[10px] text-muted-foreground">Launch winners → ramp to ceiling → profit compounds capital</p>
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {A.roadmap.phases.map((ph, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md border border-border bg-background/40 px-2 py-0.5 text-[10px]">
                  <span className={`font-semibold ${BIND_TONE[ph.binding]}`}>{BIND_LABEL[ph.binding]}</span>
                  <span className="text-muted-foreground">mo {ph.fromMonth}–{ph.toMonth}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="p-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-background/40 text-left text-muted-foreground">
                    {['Month', 'Launch', 'Live', 'Rev / day', '% tgt', 'Ad / day', 'Net / day', 'Cum net', 'Work. cap', 'On credit', 'You fund', 'Binding'].map((h) => (
                      <th key={h} className="px-3 py-1.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {A.roadmap.rows.map((r) => {
                    const eta = r.month === A.roadmap.etaMonth;
                    return (
                      <tr key={r.month} className={`border-b border-border/40 last:border-0 ${eta ? 'bg-emerald-500/[0.06]' : ''}`}>
                        <td className="px-3 py-1.5 tabular-nums text-foreground">{r.label}{eta && <span className="ml-1 text-[9px] text-emerald-400">◀ target</span>}</td>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.launches > 0 ? `+${r.launches}` : '·'}</td>
                        <td className="px-3 py-1.5 tabular-nums text-foreground">{r.liveProducts}</td>
                        <td className="px-3 py-1.5 font-mono font-semibold tabular-nums text-foreground">{fmt(r.revPerDay)}</td>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.pctOfTarget.toFixed(0)}</td>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{fmt(r.adPerDay)}</td>
                        <td className={`px-3 py-1.5 font-mono tabular-nums ${r.netPerDay >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(r.netPerDay)}</td>
                        <td className="px-3 py-1.5 font-mono tabular-nums text-foreground">{fmt(r.cumNet)}</td>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{fmt(r.workingCapital)}</td>
                        <td className="px-3 py-1.5 tabular-nums text-sky-400">{fmt(r.creditDrawn)}</td>
                        <td className="px-3 py-1.5 tabular-nums text-foreground">{fmt(r.ownerCapital)}</td>
                        <td className={`px-3 py-1.5 text-[10px] font-medium ${BIND_TONE[r.binding]}`}>{r.throttled ? 'throttled' : BIND_LABEL[r.binding]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2.5 text-[11px] text-muted-foreground/70">Cumulative net by {reached ? A.etaRow?.label : 'horizon'}: <span className="font-medium text-foreground">{fmt(A.roadmap.rows[A.roadmap.rows.length - 1]?.cumNet ?? 0)}</span></p>
          </div>
        </motion.div>
      )}

      {/* ── Ways to hit (full-width, same card style) ───────────────────── */}
      {A.econReady && A.spectrum.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Target className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Ways to hit {fmt(A.targetDay)}/day</h2>
              <p className="text-[10px] text-muted-foreground">Few products pushed hard ↔ many run modest — same target, different risk</p>
            </div>
          </div>
          <div className="p-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-background/40 text-left text-muted-foreground">
                    {['Per product', 'Products', 'Ad / day', 'Net / month', 'Gross WC', 'On credit', 'You fund', 'Fundability', 'Trade-off'].map((h) => (
                      <th key={h} className="px-3 py-1.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {A.spectrum.map((o, i) => (
                    <tr key={o.pp} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-1.5 font-mono tabular-nums text-foreground">{fmt(o.pp)}/day</td>
                      <td className="px-3 py-1.5 tabular-nums text-foreground">{o.products}</td>
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{fmt(o.ad)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-emerald-400">{fmt(o.net * 30)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{fmt(o.wc)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-sky-400">{fmt(o.credit)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-foreground">{fmt(o.ownerWc)}</td>
                      <td className={`px-3 py-1.5 ${o.ok ? (o.tight ? 'text-amber-400' : 'text-emerald-400') : 'text-rose-400'}`}>{o.ok ? (o.tight ? 'tight' : 'fundable') : `short ${fmt(o.ownerWc - A.capital)}`}</td>
                      <td className="px-3 py-1.5 text-[10px] text-muted-foreground">{i === 0 ? 'max concentration / ad-fatigue' : i >= A.spectrum.length - 1 ? 'heavy testing & ops load' : 'balanced'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* Scenarios modal — same as the 3PL Calculator */}
      <AnimatePresence>
        {showPresets && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPresets(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
                <div className="flex items-center gap-2"><Bookmark className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Saved Scenarios</h2></div>
                <button onClick={() => setShowPresets(false)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">Save Current Plan</p>
                  <div className="flex gap-2">
                    <input type="text" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. 1cr/day — aggressive" onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsPreset()}
                      className="flex-1 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none transition" />
                    <button onClick={saveCurrentAsPreset} disabled={!presetName.trim()} className="rounded-lg bg-primary/15 px-3 py-2 text-[11px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                {scenarios.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">Saved</p>
                    <div className="space-y-1.5">
                      {scenarios.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2.5 group">
                          {editingId === p.id ? (
                            <input autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') renamePreset(p.id, editingName); if (e.key === 'Escape') setEditingId(null); }}
                              onBlur={() => renamePreset(p.id, editingName)}
                              className="flex-1 rounded border border-primary/30 bg-transparent px-2 py-0.5 text-[12px] text-foreground focus:outline-none" />
                          ) : (
                            <button onClick={() => { setV({ ...DEFAULTS, ...p.data }); setShowPresets(false); }} className="flex-1 text-left min-w-0">
                              <p className="text-[12px] font-medium text-foreground truncate">{p.name}</p>
                              <p className="text-[10px] text-muted-foreground/60">₹{p.data?.targetRevenue}/{p.data?.basis} · {p.data?.winnersPerMonth}/mo · ceil ₹{p.data?.ceilingPerDay}</p>
                            </button>
                          )}
                          {editingId !== p.id && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); setEditingId(p.id); setEditingName(p.name); }} className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:text-primary transition"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deletePreset(p.id)} className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:text-red-400 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {scenarios.length === 0 && (
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

function CalcField({ label, hint, children, sub }: { label: string; hint?: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}{hint && <span className="ml-1 normal-case tracking-normal text-muted-foreground/50">({hint})</span>}
      </label>
      {children}
      {sub && <p className="text-[10.5px] font-semibold tabular-nums text-primary/80">{sub}</p>}
    </div>
  );
}

/** Indian-words readout so you never count zeros — 200000 → "₹2,00,000 · 2 lakh". */
function inrWords(num: number): string {
  if (!Number.isFinite(num) || num === 0) return '';
  const a = Math.abs(num);
  const sgn = num < 0 ? '−' : '';
  const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(a);
  const t = (x: number) => x.toFixed(2).replace(/\.?0+$/, '');
  const word = a >= 1e7 ? `${t(a / 1e7)} crore`
    : a >= 1e5 ? `${t(a / 1e5)} lakh`
    : a >= 1e3 ? `${t(a / 1e3)} thousand`
    : `${a}`;
  return `${sgn}₹${grouped} · ${word}`;
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
