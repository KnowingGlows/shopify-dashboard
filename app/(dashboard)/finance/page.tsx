'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Landmark, RefreshCw, Loader2, AlertTriangle, X, TrendingUp, Truck, PackageX, Wallet, CalendarClock } from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import type { FinanceMetrics } from '@/lib/finance/compute';

interface StoreBlock { name: string; accent: string; ordersFetched: number; error: string | null; metrics: FinanceMetrics; }
interface OverviewResponse {
  success: boolean;
  range: { start: string; end: string };
  now: string;
  stores: Record<string, StoreBlock>;
  combined: FinanceMetrics;
  storeMeta: { slug: string; name: string; accent: string; configured: boolean }[];
  error?: string;
}

function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
function addDaysIST(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00+05:30');
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}
const monthStartIST = () => `${todayIST().slice(0, 7)}-01`;

const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const pct = (n: number) => `${(n || 0).toFixed(0)}%`;

function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    const to = Number.isFinite(value) ? value : 0;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

function Kpi({ label, value, sub, accent, big }: { label: string; value: string; sub?: string; accent?: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-semibold', big ? 'text-3xl' : 'text-2xl')} style={{ color: accent ?? 'var(--foreground)' }}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

const PRESETS: { label: string; calc: () => [string, string] }[] = [
  { label: 'Today', calc: () => [todayIST(), todayIST()] },
  { label: '7d', calc: () => [addDaysIST(todayIST(), -6), todayIST()] },
  { label: '30d', calc: () => [addDaysIST(todayIST(), -29), todayIST()] },
  { label: 'This month', calc: () => [monthStartIST(), todayIST()] },
];

export default function FinancePage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(monthStartIST());
  const [end, setEnd] = useState(todayIST());
  const [store, setStore] = useState('all');
  const [projN, setProjN] = useState(100);

  const load = useCallback(async (opts?: { initial?: boolean }) => {
    const initial = opts?.initial ?? false;
    try {
      if (initial) setLoading(true); else setRefreshing(true);
      setError(null);
      const res = await fetch(`/api/finance/overview?start=${start}&end=${end}`, { cache: 'no-store' });
      const json: OverviewResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load finance data.');
    } finally {
      if (initial) setLoading(false); else setRefreshing(false);
    }
  }, [start, end]);

  useEffect(() => { load({ initial: true }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const m: FinanceMetrics | null = useMemo(() => {
    if (!data) return null;
    return store === 'all' ? data.combined : data.stores[store]?.metrics ?? data.combined;
  }, [data, store]);

  const expInflow = useCountUp(m?.codExpTotal ?? 0);
  const collected = useCountUp(m?.codCollected ?? 0);

  const applyPreset = (calc: () => [string, string]) => { const [s, e] = calc(); setStart(s); setEnd(e); };

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <Landmark className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Finance</h1>
            <p className="text-[11px] text-muted-foreground">COD inflow &amp; delivery economics · live from Shopify + Delhivery</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.now && <span className="text-[11px] text-muted-foreground">Updated {relativeTime(data.now)}</span>}
          <button
            onClick={() => load()}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-accent/30 hover:text-foreground disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Hard refresh
          </button>
        </div>
      </div>

      {/* Controls: date range + presets + store filter */}
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker value={start} onChange={(v) => setStart(v || monthStartIST())} max={end || todayIST()} compact />
        <span className="text-[11px] text-muted-foreground">to</span>
        <DatePicker value={end} onChange={(v) => setEnd(v || todayIST())} min={start} max={todayIST()} compact />
        <div className="flex items-center gap-1">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => applyPreset(p.calc)}
              className="rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-card hover:text-foreground">
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={() => load()} disabled={refreshing || loading}
          className="rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/25 disabled:opacity-50">
          Apply
        </button>

        {data && (
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setStore('all')}
              className={cn('rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition',
                store === 'all' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card/60 text-muted-foreground hover:text-foreground')}>
              All stores
            </button>
            {data.storeMeta.filter((s) => s.configured).map((s) => (
              <button key={s.slug} onClick={() => setStore(s.slug)}
                className={cn('rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition',
                  store === s.slug ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card/60 text-muted-foreground hover:text-foreground')}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/70 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {loading || !m ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-[92px] rounded-xl border border-border bg-card animate-pulse" />)}
          </div>
          <div className="h-[260px] rounded-xl border border-border bg-card animate-pulse" />
        </div>
      ) : (
        <>
          {/* Expected COD inflow hero */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" /> Expected COD inflow
                </p>
                <p className="mt-1 text-4xl font-bold text-emerald-400">{inr(expInflow)}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  of {inr(m.codShippedVal)} COD shipped · {m.codShippedVal ? pct(m.codExpTotal / m.codShippedVal * 100) : '0%'} expected collection ·
                  model: {pct(m.p1)} first-attempt + {pct(m.pndr)} NDR-recovery → {pct(m.P)} land
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Already collected</p>
                <p className="text-2xl font-semibold text-emerald-400">{inr(collected)}</p>
                <p className="text-[11px] text-muted-foreground">{m.codDl} COD delivered</p>
              </div>
            </div>
          </div>

          {/* Outcome KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Shipped" value={String(m.shipped)} sub={`${m.cod} COD · ${m.pre} prepaid`} />
            <Kpi label="Delivered" value={String(m.delivered)} sub={`${pct(m.dr)} of completed`} accent="#34d399" />
            <Kpi label="RTO / Returned" value={String(m.rto)} sub={`${pct(m.rr)} of completed`} accent="#fb7185" />
            <Kpi label="In transit" value={String(m.transit)} sub={`${m.shipped ? pct(m.transit / m.shipped * 100) : '0%'} of shipped`} accent="#a78bfa" />
            <Kpi label="In-transit COD" value={inr(m.codTransitVal)} sub={`${m.codTransit} orders pending`} />
            <Kpi label="Expected from transit" value={inr(m.codExpTransit)} sub={`~${Math.round(m.codExpOrders)} of ${m.codTransit} land`} accent="#38bdf8" />
            <Kpi label="Avg transit" value={`${m.avgTt.toFixed(1)}d`} sub={`→ ${m.avgTtRound}d est. for in-transit`} />
            <Kpi label="Avg COD value" value={inr(m.codAvgVal)} sub="per COD order" />
          </div>

          {/* Deposit schedule */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-1 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[13px] font-semibold text-foreground">COD deposit schedule — when cash hits the bank</h2>
            </div>
            <p className="mb-3 text-[11px] text-muted-foreground">
              No deposits Sat/Sun. Mon–Wed deliveries clear +2 days; Thu &amp; Fri roll to Mon; weekend deliveries clear Tue.
              In-transit orders use estimated delivery (pickup + {m.avgTtRound}d) × {pct(m.P)} expected.
            </p>
            {m.deposits.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No COD deposits in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Deposit date</th>
                      <th className="py-2 pr-4 font-medium">~Orders</th>
                      <th className="py-2 pr-4 font-medium">Amount</th>
                      <th className="py-2 font-medium">Cumulative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.deposits.map((d) => (
                      <tr key={d.date} className="border-t border-border/50">
                        <td className="py-2 pr-4 text-foreground">{d.label} <span className="text-muted-foreground">{d.weekday}</span></td>
                        <td className="py-2 pr-4 text-muted-foreground">~{Math.round(d.orders)}</td>
                        <td className="py-2 pr-4 font-medium text-foreground">{inr(d.amount)}</td>
                        <td className="py-2 text-muted-foreground">{inr(d.cumulative)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* COD vs prepaid + NDR */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-2 flex items-center gap-2"><PackageX className="h-4 w-4 text-rose-400" /><h2 className="text-[13px] font-semibold text-foreground">COD vs Prepaid RTO</h2></div>
              <div className="flex items-center justify-between">
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">COD</p><p className="text-2xl font-bold text-rose-400">{pct(m.codRr)}</p><p className="text-[11px] text-muted-foreground">{m.codRtCount}/{m.codFinCount} completed</p></div>
                <div className="text-right"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Prepaid</p><p className="text-2xl font-bold text-emerald-400">{pct(m.preRr)}</p><p className="text-[11px] text-muted-foreground">{m.preRtCount}/{m.preFinCount} completed</p></div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">COD is {m.shipped ? pct(m.cod / m.shipped * 100) : '0%'} of volume. Shifting to prepaid is the biggest RTO lever.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-2 flex items-center gap-2"><Truck className="h-4 w-4 text-sky-400" /><h2 className="text-[13px] font-semibold text-foreground">NDR recovery</h2></div>
              <p className="text-2xl font-bold text-sky-400">{pct(m.ndrRecovery)}</p>
              <p className="text-[11px] text-muted-foreground">{m.ndrDl} delivered of {m.ndrComp} resolved NDRs · {m.ndrTr} still in transit</p>
              <p className="mt-3 text-[11px] text-muted-foreground"><span className="font-semibold text-amber-400">{m.noreatt}</span> lost purely to “no reattempt instruction” — recoverable.</p>
            </div>
            {/* COD projector */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-2 flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-400" /><h2 className="text-[13px] font-semibold text-foreground">COD projector</h2></div>
              <label className="text-[11px] text-muted-foreground">Number of COD orders</label>
              <input type="number" value={projN} min={0} onChange={(e) => setProjN(Math.max(0, +e.target.value || 0))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-lg font-semibold text-foreground outline-none focus:border-primary/50" />
              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                <div><p className="text-[10px] uppercase text-muted-foreground">Will deliver</p><p className="font-semibold text-emerald-400">{Math.round(projN * m.Praw)}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Cash</p><p className="font-semibold text-emerald-400">{inr(projN * m.codAvgVal * m.Praw)}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Likely RTO</p><p className="font-semibold text-rose-400">{Math.round(projN * (1 - m.Praw))}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Timeframe</p><p className="font-semibold text-sky-400">~{m.avgTtRound + 2}–{m.avgTtRound + 9}d</p></div>
              </div>
            </div>
          </div>

          {/* Per-store breakdown when viewing all */}
          {store === 'all' && data && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-[13px] font-semibold text-foreground">Per-store breakdown</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.storeMeta.filter((s) => s.configured).map((s) => {
                  const sm = data.stores[s.slug];
                  if (!sm) return null;
                  const x = sm.metrics;
                  return (
                    <button key={s.slug} onClick={() => setStore(s.slug)} className="rounded-xl border border-border bg-background/40 p-4 text-left transition hover:border-primary/30">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground"><span className="h-2 w-2 rounded-full" style={{ background: s.accent }} />{s.name}</span>
                        <span className="text-[11px] text-muted-foreground">{x.shipped} shipped</span>
                      </div>
                      {sm.error ? (
                        <p className="mt-2 text-[11px] text-rose-400">{sm.error}</p>
                      ) : (
                        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                          <span className="text-muted-foreground">Delivery <b className="text-emerald-400">{pct(x.dr)}</b></span>
                          <span className="text-muted-foreground">RTO <b className="text-rose-400">{pct(x.rr)}</b></span>
                          <span className="text-muted-foreground">Exp COD <b className="text-foreground">{inr(x.codExpTotal)}</b></span>
                          <span className="text-muted-foreground">AOV <b className="text-foreground">{inr(x.codAvgVal)}</b></span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* At-risk */}
          {m.riskRows.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-[13px] font-semibold text-foreground">At-risk shipments <span className="text-muted-foreground">(past promised date, not delivered)</span></h2>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Order</th><th className="py-2 pr-4 font-medium">Waybill</th>
                    <th className="py-2 pr-4 font-medium">Destination</th><th className="py-2 pr-4 font-medium">Promised</th><th className="py-2 font-medium">Last scan</th>
                  </tr></thead>
                  <tbody>
                    {m.riskRows.slice(0, 30).map((r) => (
                      <tr key={r.waybill} className="border-t border-border/50">
                        <td className="py-2 pr-4 text-foreground">{r.order}</td>
                        <td className="py-2 pr-4 font-mono text-muted-foreground">{r.waybill}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.dest}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.promised}</td>
                        <td className="py-2"><span className="text-foreground">{r.last}</span>
                          <span className={cn('ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold', r.failed ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400')}>{r.failed ? 'FAILED' : 'DELAYED'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-[10px] text-muted-foreground">
            {data?.range.start} → {data?.range.end} · rates computed on completed shipments (delivered + returned) · deposit timeline per confirmed remittance rule
          </motion.p>
        </>
      )}
    </PageTransition>
  );
}
