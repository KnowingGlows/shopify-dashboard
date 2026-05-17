'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bookmark, X, Plus, Pencil, Trash2 } from 'lucide-react';
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
  creditGrowthPct: '0',
  maxHorizon: '36',
  goalMonths: '12',
  availableCapital: '0',
  creditLine: '0',
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
  const available = n(v.availableCapital) + n(v.creditLine);

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
    capital: n(v.availableCapital),
    creditLine: n(v.creditLine),
    reinvestPct: Math.max(0, n(v.reinvestPct)),
    capitalInjectionPerMonth: n(v.capitalInjection),
    creditGrowthPctPerMonth: n(v.creditGrowthPct),
    maxHorizonMonths: Math.max(1, n(v.maxHorizon)),
  };

  if (!econReady) return { econReady: false as const, targetDay, ceiling, available };

  const roadmap = runRoadmap(input);
  const at = portfolioAt(econ, targetDay, ceiling);

  // Decomposition: same target, different per-product load.
  const fracs = [1, 0.66, 0.5, 0.33, 0.2];
  const seen = new Set<number>();
  const spectrum = fracs.map((f) => Math.round(ceiling * f)).filter((pp) => {
    if (pp <= 0 || seen.has(pp)) return false; seen.add(pp); return true;
  }).map((pp) => {
    const p = portfolioAt(econ, targetDay, pp);
    return {
      pp,
      products: p.products,
      ad: p.ad,
      net: p.net,
      wc: p.wc,
      ok: p.wc <= available,
      tight: p.wc <= available && p.wc > 0.85 * available,
    };
  });

  // Gap analysis: cheapest single lever to hit target by goalMonths.
  const goal = Math.max(1, Math.round(n(v.goalMonths)));
  const levers: Lever[] = ['capital', 'creditLine', 'winnersPerMonth', 'roas', 'reinvestPct'];
  const gap = levers.map((lv) => ({ lever: lv, r: solveLever(input, lv, goal) }));

  const etaRow = roadmap.etaMonth != null ? roadmap.rows.find((r) => r.month === roadmap.etaMonth) ?? null : null;
  const perProdAtEta = etaRow && etaRow.liveProducts > 0 ? etaRow.revPerDay / etaRow.liveProducts : 0;
  const bindingNow = roadmap.rows[0]?.binding ?? 'cadence';

  return {
    econReady: true as const,
    targetDay, ceiling, available, roadmap, at, spectrum, gap, goal,
    etaRow, perProdAtEta, bindingNow,
  };
}

const BIND_LABEL: Record<string, string> = {
  capital: 'Capital', cadence: 'Launch cadence', ramp: 'Product ramp', target: 'At target',
};
const BIND_TONE: Record<string, string> = {
  capital: 'text-rose-400', cadence: 'text-sky-400', ramp: 'text-amber-400', target: 'text-emerald-400',
};

export default function StrategyPage() {
  const [v, setV] = useState<State>(DEFAULTS);
  type Scenario = { id: string; name: string; kind: 'strategy'; data: State };
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  type Preset = { id: string; name: string; data: Record<string, string | boolean> };
  const [presets, setPresets] = useState<Preset[]>([]);

  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [rateStr, setRateStr] = useState('83.5');
  useEffect(() => {
    fetch('/api/fx').then((r) => r.json()).then((d) => { if (d?.rates?.INR) setRateStr(String(Number(d.rates.INR).toFixed(2))); }).catch(() => {});
  }, []);
  const inrPerUsd = parseFloat(rateStr) || 83.5;

  useEffect(() => {
    fetch('/api/finance?action=presets&kind=strategy').then((r) => r.json()).then((d) => setScenarios(d.presets ?? [])).catch(() => {});
    fetch('/api/finance?action=presets&kind=3pl').then((r) => r.json()).then((d) => setPresets(d.presets ?? [])).catch(() => {});
  }, []);

  const set = <K extends keyof State>(k: K, val: State[K]) => setV((s) => ({ ...s, [k]: val }));
  const fc = (a: number) => {
    if (currency === 'USD') return formatUSD(inrPerUsd > 0 ? a / inrPerUsd : 0);
    const x = Math.abs(a); const sign = a < 0 ? '−' : '';
    if (x >= 1e7) return `${sign}₹${(x / 1e7).toFixed(2)}Cr`;
    if (x >= 1e5) return `${sign}₹${(x / 1e5).toFixed(2)}L`;
    if (x >= 1e3) return `${sign}₹${(x / 1e3).toFixed(1)}k`;
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
  const saveScenario = async () => {
    if (!name.trim()) return;
    try {
      const res = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-preset', preset: { name: name.trim(), kind: 'strategy', data: v } }) });
      const d = await res.json(); if (d.preset) setScenarios((p) => [...p, d.preset]); setName('');
    } catch { /* ignore */ }
  };
  const delScenario = async (id: string) => {
    setScenarios((p) => p.filter((x) => x.id !== id));
    try { await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-preset', id }) }); } catch { /* ignore */ }
  };
  const renameScenario = async (id: string, nm: string) => {
    if (!nm.trim()) return;
    setScenarios((p) => p.map((x) => (x.id === id ? { ...x, name: nm.trim() } : x))); setEditId(null);
    try { await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rename-preset', id, name: nm.trim() }) }); } catch { /* ignore */ }
  };

  const etaText = A.econReady && A.roadmap.etaMonth != null
    ? `${A.roadmap.etaMonth} mo · ${A.etaRow?.label ?? ''}`
    : A.econReady ? `not within ${v.maxHorizon} mo` : '—';

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Strategy</h1>
          <p className="text-[11px] text-muted-foreground">Scale roadmap — what the target needs, when, and the cheapest lever to get there</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border bg-card overflow-hidden">
            <button onClick={() => setCurrency('INR')} className={`px-2.5 py-1.5 text-[11px] font-semibold transition ${currency === 'INR' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>₹</button>
            <button onClick={() => setCurrency('USD')} className={`px-2.5 py-1.5 text-[11px] font-semibold transition ${currency === 'USD' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>$</button>
          </div>
          {currency === 'USD' && (
            <div className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5">
              <span className="text-[10px] text-muted-foreground">₹</span>
              <input value={rateStr} onChange={(e) => setRateStr(e.target.value)} className="w-12 bg-transparent text-[11px] font-semibold tabular-nums text-foreground outline-none" />
            </div>
          )}
          <button onClick={() => setShow(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"><Bookmark className="h-3.5 w-3.5" />Scenarios{scenarios.length > 0 && <span className="text-primary">({scenarios.length})</span>}</button>
          <button onClick={() => setV(DEFAULTS)} className="rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground">Reset</button>
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-lg border border-border bg-card">
          <Bar>Target &amp; economics
            <select className="ml-auto rounded border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground" value="" onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) applyPreset(p); }}>
              <option value="">{presets.length ? 'prefill from 3PL preset…' : 'no 3PL presets'}</option>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Bar>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 p-4 sm:grid-cols-3">
            <NumF label={`Target ₹/${v.basis}`} val={v.targetRevenue} on={(x) => set('targetRevenue', x)} />
            <SegF label="Basis" val={v.basis} opts={[['day', 'day'], ['month', 'mo']]} on={(x) => set('basis', x as State['basis'])} />
            <SegF label="Counts as" val={v.revenueType} opts={[['booked', 'booked'], ['collected', 'COD']]} on={(x) => set('revenueType', x as State['revenueType'])} />
            <NumF label="Current ₹/day" hint="flat baseline" val={v.baselineRevenue} on={(x) => set('baselineRevenue', x)} />
            <NumF label="AOV ₹" val={v.sellingPrice} on={(x) => set('sellingPrice', x)} />
            <NumF label="COGS ₹" val={v.cogsPerUnit} on={(x) => set('cogsPerUnit', x)} />
            <NumF label="ROAS" val={v.roas} on={(x) => set('roas', x)} />
            <NumF label="Delivery %" val={v.deliveryRate} on={(x) => set('deliveryRate', x)} />
            <NumF label="Units/order" val={v.unitsPerOrder} on={(x) => set('unitsPerOrder', x)} />
            <NumF label="Storage days" val={v.storageDays} on={(x) => set('storageDays', x)} />
            <NumF label="Financing %" val={v.financingFeePct} on={(x) => set('financingFeePct', x)} />
            <div className="flex items-end"><Chk on={v.spGstInclusive} onClick={() => set('spGstInclusive', !v.spGstInclusive)} label="GST-incl price" /></div>
          </div>
        </div>
        <div className="lg:col-span-5 rounded-lg border border-border bg-card">
          <Bar>Portfolio &amp; capital</Bar>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 p-4">
            <NumF label="Winners / mo" val={v.winnersPerMonth} on={(x) => set('winnersPerMonth', x)} />
            <NumF label="Launch ₹/day" val={v.startPerDay} on={(x) => set('startPerDay', x)} />
            <NumF label="Ceiling ₹/day" hint="per product, editable" val={v.ceilingPerDay} on={(x) => set('ceilingPerDay', x)} />
            <NumF label="Mo to ceiling" val={v.monthsToCeiling} on={(x) => set('monthsToCeiling', x)} />
            <NumF label="Capital ₹" val={v.availableCapital} on={(x) => set('availableCapital', x)} />
            <NumF label="Credit line ₹" val={v.creditLine} on={(x) => set('creditLine', x)} />
            <NumF label="Cash cycle d" val={v.cashCycleDays} on={(x) => set('cashCycleDays', x)} />
            <NumF label="Reinvest %" val={v.reinvestPct} on={(x) => set('reinvestPct', x)} />
            <NumF label="Capital +/mo ₹" val={v.capitalInjection} on={(x) => set('capitalInjection', x)} />
            <NumF label="Credit +%/mo" val={v.creditGrowthPct} on={(x) => set('creditGrowthPct', x)} />
            <NumF label="Horizon mo" val={v.maxHorizon} on={(x) => set('maxHorizon', x)} />
            <NumF label="Want it by mo" val={v.goalMonths} on={(x) => set('goalMonths', x)} />
          </div>
        </div>
      </div>

      {!A.econReady ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 px-4 py-12 text-center text-[12px] text-muted-foreground">
          Set target, AOV, delivery rate &amp; per-product ceiling to model the roadmap.
        </div>
      ) : (
        <>
          {/* Verdict strip */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3 lg:grid-cols-6">
            <Kpi k="Reach target in" val={etaText} tone={A.roadmap.reached ? 'good' : 'bad'} />
            <Kpi k="Products at target" val={`${A.at.products}`} sub={`@ ${fc(A.ceiling)}/day`} />
            <Kpi k="Ad spend / day" val={fc(A.at.ad)} sub={`${Math.round(A.at.orders).toLocaleString('en-IN')} orders`} />
            <Kpi k="Net / month" val={fc(A.at.net * 30)} sub={`${A.at.gm.toFixed(0)}% GM`} tone={A.at.net >= 0 ? 'good' : 'bad'} />
            <Kpi k="Working capital" val={fc(A.at.wc)} sub={`vs ${fc(A.available)} avail`} tone={A.at.wc <= A.available ? 'good' : 'bad'} />
            <Kpi k="Binding now" val={BIND_LABEL[A.bindingNow]} tone={A.bindingNow === 'capital' ? 'bad' : 'mut'} />
          </div>

          {/* Diagnosis */}
          <div className="rounded-lg border border-border bg-card">
            <Bar>Diagnosis</Bar>
            <div className="divide-y divide-border/60 text-[12px]">
              <DRow k="Outcome">
                {A.roadmap.reached
                  ? <>Hits <b>{fc(A.targetDay)}/day</b> in <b>{A.roadmap.etaMonth} months</b> ({A.etaRow?.label}). {A.etaRow?.liveProducts} products live, ~{fc(A.perProdAtEta)}/day each. Cumulative net to then {fc(A.etaRow?.cumNet ?? 0)}.</>
                  : <>Plateaus at <b>{fc(A.roadmap.peakRevPerDay)}/day</b> ({((A.roadmap.peakRevPerDay / A.targetDay) * 100).toFixed(0)}% of target) within {v.maxHorizon} months — capital can&apos;t fund the full ramp.</>}
              </DRow>
              <DRow k="Capital">
                {A.roadmap.monthsCapitalBound > 0
                  ? <><b className="text-rose-400">{A.roadmap.monthsCapitalBound}</b> of {A.roadmap.rows.length} months capital-bound (funded fewer than {v.winnersPerMonth} launches, or cut live spend). This is the gate.</>
                  : <>Capital funds every month — not the constraint at these settings. The limiter is launch cadence / ramp speed.</>}
              </DRow>
              <DRow k="Phases">
                <div className="flex flex-wrap gap-1.5">
                  {A.roadmap.phases.map((ph, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded border border-border bg-background/40 px-1.5 py-0.5 text-[10px]">
                      <span className={`font-semibold ${BIND_TONE[ph.binding]}`}>{BIND_LABEL[ph.binding]}</span>
                      <span className="text-muted-foreground">mo {ph.fromMonth}–{ph.toMonth} · {fc(ph.revStart)}→{fc(ph.revEnd)}</span>
                    </span>
                  ))}
                </div>
              </DRow>
              <DRow k={`Hit by mo ${A.goal} via`}>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {A.gap.map(({ lever, r }) => {
                    if (!r) return null;
                    const same = Math.abs(r.value - r.from) < 1e-6;
                    const label = { capital: 'Capital', creditLine: 'Credit', winnersPerMonth: 'Winners/mo', roas: 'ROAS', reinvestPct: 'Reinvest %' }[lever];
                    const fmtV = lever === 'winnersPerMonth' ? `${Math.round(r.value)}` : lever === 'roas' ? `${r.value.toFixed(2)}x` : lever === 'reinvestPct' ? `${r.value.toFixed(0)}%` : fc(r.value);
                    return (
                      <span key={lever} className="tabular-nums">
                        <span className="text-muted-foreground">{label} </span>
                        {!r.reachable ? <span className="text-rose-400">can&apos;t (≥{fmtV})</span>
                          : same ? <span className="text-emerald-400">already ✓</span>
                          : <b className="text-foreground">{fmtV}</b>}
                      </span>
                    );
                  })}
                </div>
              </DRow>
              <DRow k="Concentration">
                {A.perProdAtEta > A.ceiling * 0.9
                  ? <span className="text-amber-400">Products run at {((A.perProdAtEta / A.ceiling) * 100).toFixed(0)}% of ceiling at target — fragile; assume a lower ceiling (more products) for resilience.</span>
                  : <>Per-product load at target is {((A.perProdAtEta / Math.max(1, A.ceiling)) * 100).toFixed(0)}% of ceiling — healthy headroom.</>}
              </DRow>
            </div>
          </div>

          {/* Roadmap */}
          <div className="rounded-lg border border-border bg-card">
            <Bar>Roadmap
              <span className="ml-auto text-[10px] text-muted-foreground">launch winners → ramp to ceiling → profit compounds capital</span>
            </Bar>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    {['Mo', 'Launch', 'Live', 'Rev/day', '% tgt', 'Ad/day', 'Net/day', 'Cum net', 'Work.cap', 'Avail', 'Binding'].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium first:pl-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {A.roadmap.rows.map((r) => {
                    const eta = r.month === A.roadmap.etaMonth;
                    return (
                      <tr key={r.month} className={`border-b border-border/40 last:border-0 ${eta ? 'bg-emerald-500/[0.05]' : ''}`}>
                        <td className="px-3 py-1.5 pl-4 tabular-nums text-foreground">{r.label}</td>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.launches > 0 ? `+${r.launches}` : '·'}</td>
                        <td className="px-3 py-1.5 tabular-nums text-foreground">{r.liveProducts}</td>
                        <td className="px-3 py-1.5 font-mono tabular-nums text-foreground">{fc(r.revPerDay)}</td>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.pctOfTarget.toFixed(0)}</td>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{fc(r.adPerDay)}</td>
                        <td className={`px-3 py-1.5 font-mono tabular-nums ${r.netPerDay >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fc(r.netPerDay)}</td>
                        <td className="px-3 py-1.5 font-mono tabular-nums text-foreground">{fc(r.cumNet)}</td>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{fc(r.workingCapital)}</td>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{fc(r.available)}</td>
                        <td className="px-3 py-1.5"><span className={`text-[10px] font-medium ${BIND_TONE[r.binding]}`}>{r.throttled ? 'throttled' : BIND_LABEL[r.binding]}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ways to hit */}
          <div className="rounded-lg border border-border bg-card">
            <Bar>Ways to hit {fc(A.targetDay)}/day<span className="ml-auto text-[10px] text-muted-foreground">few pushed hard ↔ many run modest</span></Bar>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    {['Per product', 'Products', 'Ad/day', 'Net/mo', 'Working cap', 'Fundability', 'Trade-off'].map((h) => <th key={h} className="px-3 py-2 font-medium first:pl-4">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {A.spectrum.map((o, i) => (
                    <tr key={o.pp} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 pl-4 font-mono tabular-nums text-foreground">{fc(o.pp)}/day</td>
                      <td className="px-3 py-2 tabular-nums text-foreground">{o.products}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{fc(o.ad)}</td>
                      <td className="px-3 py-2 tabular-nums text-emerald-400">{fc(o.net * 30)}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{fc(o.wc)}</td>
                      <td className="px-3 py-2"><span className={o.ok ? (o.tight ? 'text-amber-400' : 'text-emerald-400') : 'text-rose-400'}>{o.ok ? (o.tight ? 'tight' : 'fundable') : `short ${fc(o.wc - A.available)}`}</span></td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground">{i === 0 ? 'max concentration / ad-fatigue risk' : i >= A.spectrum.length - 1 ? 'heavy testing & ops load' : 'balanced'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Scenarios modal */}
      {show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShow(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"><Bookmark className="h-4 w-4 text-primary" />Scenarios</span>
              <button onClick={() => setShow(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-4 max-h-[60vh] overflow-y-auto">
              <div className="flex gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 1cr/day — aggressive" onKeyDown={(e) => e.key === 'Enter' && saveScenario()} className="flex-1 rounded-md border border-border bg-background/60 px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none" />
                <button onClick={saveScenario} disabled={!name.trim()} className="rounded-md bg-primary/15 px-3 py-2 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              {scenarios.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-muted-foreground/50">No saved scenarios</p>
              ) : scenarios.map((p) => (
                <div key={p.id} className="group flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2">
                  {editId === p.id ? (
                    <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') renameScenario(p.id, editName); if (e.key === 'Escape') setEditId(null); }} onBlur={() => renameScenario(p.id, editName)} className="flex-1 rounded border border-primary/30 bg-transparent px-2 py-0.5 text-[12px] text-foreground focus:outline-none" />
                  ) : (
                    <button onClick={() => { setV({ ...DEFAULTS, ...p.data }); setShow(false); }} className="flex-1 text-left min-w-0">
                      <p className="truncate text-[12px] font-medium text-foreground">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground/60">₹{p.data?.targetRevenue}/{p.data?.basis} · {p.data?.winnersPerMonth}/mo · ceil ₹{p.data?.ceilingPerDay}</p>
                    </button>
                  )}
                  {editId !== p.id && (
                    <>
                      <button onClick={() => { setEditId(p.id); setEditName(p.name); }} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => delScenario(p.id)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-[12px] font-semibold text-foreground">{children}</div>;
}

function Kpi({ k, val, sub, tone = 'mut' }: { k: string; val: string; sub?: string; tone?: 'good' | 'bad' | 'mut' }) {
  const c = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-foreground';
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className={`mt-1 text-[15px] font-semibold tabular-nums ${c}`}>{val}</p>
      {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
    </div>
  );
}

function DRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <span className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground pt-0.5">{k}</span>
      <div className="flex-1 leading-relaxed text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">{children}</div>
    </div>
  );
}

function NumF({ label, hint, val, on }: { label: string; hint?: string; val: string; on: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}{hint && <span className="ml-1 normal-case tracking-normal text-muted-foreground/40">· {hint}</span>}</span>
      <input type="text" inputMode="decimal" value={val} onChange={(e) => on(e.target.value)} className="rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[12px] tabular-nums text-foreground focus:border-primary/50 focus:outline-none transition" />
    </label>
  );
}

function SegF({ label, val, opts, on }: { label: string; val: string; opts: [string, string][]; on: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="inline-flex rounded-md border border-border bg-background/60 p-0.5">
        {opts.map(([k, l]) => (
          <button key={k} onClick={() => on(k)} className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition ${val === k ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function Chk({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${on ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-border bg-background/60 text-muted-foreground hover:text-foreground'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />{label}
    </button>
  );
}
