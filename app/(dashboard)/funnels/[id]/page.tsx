'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Funnel as FunnelIcon, ArrowLeft, Plus, Trash2, Loader2, AlertTriangle, Globe,
  TrendingUp, ShoppingCart, Target, Trophy,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import { isWinning, effectiveBeroas, aggregateLogs } from '@/lib/funnels';
import type { ProductTrackerEntry } from '@/types/shopify';
import type { Funnel, FunnelDailyLog, FunnelStatus } from '@/types/funnel';

const STATUS_OPTIONS: Array<{ value: FunnelStatus; label: string; tone: 'gray' | 'amber' | 'emerald' | 'sky' | 'rose' }> = [
  { value: 'live',    label: 'Live',    tone: 'emerald' },
  { value: 'testing', label: 'Testing', tone: 'amber' },
  { value: 'paused',  label: 'Paused',  tone: 'sky' },
  { value: 'draft',   label: 'Draft',   tone: 'gray' },
  { value: 'killed',  label: 'Killed',  tone: 'rose' },
];

const TONE: Record<'gray' | 'amber' | 'emerald' | 'sky' | 'rose', { text: string; bg: string; border: string; bar: string; dot: string; glow: string }> = {
  gray:    { text: 'text-muted-foreground', bg: 'bg-border/40',     border: 'border-border',         bar: 'bg-muted-foreground/40', dot: 'bg-muted-foreground', glow: '#71717a' },
  amber:   { text: 'text-amber-400',        bg: 'bg-amber-500/10',  border: 'border-amber-500/30',   bar: 'bg-amber-400',           dot: 'bg-amber-400',          glow: '#fbbf24' },
  emerald: { text: 'text-emerald-400',      bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'bg-emerald-400',         dot: 'bg-emerald-400',        glow: '#34d399' },
  sky:     { text: 'text-sky-400',          bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     bar: 'bg-sky-400',             dot: 'bg-sky-400',            glow: '#38bdf8' },
  rose:    { text: 'text-rose-400',         bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    bar: 'bg-rose-400',            dot: 'bg-rose-400',           glow: '#fb7185' },
};

function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  useEffect(() => { displayRef.current = display; });
  useEffect(() => {
    const from = displayRef.current;
    const to = Number.isFinite(value) ? value : 0;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

export default function FunnelDetailPage() {
  const params = useParams<{ id: string }>();
  const funnelId = params?.id;
  const { user } = useAuth();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [product, setProduct] = useState<ProductTrackerEntry | null>(null);
  const [logs, setLogs] = useState<FunnelDailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<string>('');

  const loadAll = useCallback(async () => {
    if (!funnelId) return;
    try {
      setLoading(true);
      setError(null);
      const [funnelsRes, productsRes, logsRes] = await Promise.all([
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/product-tracker').then((r) => r.json()),
        fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(funnelId)}`).then((r) => r.json()),
      ]);
      const f: Funnel | undefined = (funnelsRes.funnels ?? []).find((x: Funnel) => x.id === funnelId);
      if (!f) { setError('Funnel not found.'); setFunnel(null); return; }
      setFunnel(f);
      const p: ProductTrackerEntry | undefined = (productsRes.entries ?? []).find((e: ProductTrackerEntry) =>
        (f.productId && e.id === f.productId) || (!f.productId && e.productName === f.productName)
      );
      setProduct(p ?? null);
      setLogs(logsRes.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load funnel.');
    } finally {
      setLoading(false);
    }
  }, [funnelId]);

  useEffect(() => { if (funnelId) loadAll(); }, [funnelId, loadAll]);

  const refreshLogs = async () => {
    if (!funnelId) return;
    try {
      const r = await fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(funnelId)}`).then((r) => r.json());
      setLogs(r.logs ?? []);
    } catch { /* ignore */ }
  };

  const updateFunnel = async (patch: Partial<Funnel>) => {
    if (!funnel) return;
    try {
      const r = await fetch('/api/funnels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: funnel.id, ...patch }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setFunnel({ ...funnel, ...patch });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update funnel.');
    }
  };

  const deleteFunnel = async () => {
    if (!funnel) return;
    if (!confirm('Delete this funnel and all its logs? This cannot be undone.')) return;
    try {
      const r = await fetch('/api/funnels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: funnel.id }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${r.status}`);
      }
      window.location.href = '/funnels';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete funnel.');
    }
  };

  // Filtered logs by date
  const scopedLogs = useMemo(() => filterDate ? logs.filter((l) => l.date === filterDate) : logs, [logs, filterDate]);
  const agg = useMemo(() => aggregateLogs(scopedLogs), [scopedLogs]);
  const beroas = funnel ? effectiveBeroas(funnel, product ?? undefined) : 0;
  const winning = isWinning(agg.latestRoas, beroas);
  const winThreshold = beroas > 0 ? beroas + 1 : 0;
  const progress = winThreshold > 0 && agg.latestRoas > 0
    ? Math.min(1, agg.latestRoas / (winThreshold * 1.1))
    : 0;

  const animLatestRoas = useCountUp(agg.latestRoas, 500);
  const animBeroas = useCountUp(beroas, 500);
  const animOrders = useCountUp(agg.totalOrders, 500);
  const animDays = useCountUp(agg.daysLogged, 400);

  const { today, yest } = useMemo(() => {
    const now = new Date();
    const fmtIST = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    return { today: fmtIST(now), yest: fmtIST(new Date(now.getTime() - 86_400_000)) };
  }, []);

  if (loading) {
    return (
      <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </PageTransition>
    );
  }

  if (error || !funnel) {
    return (
      <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
        <Link href="/funnels" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to Funnels
        </Link>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
          <p className="mt-2 text-[13px] text-foreground">{error ?? 'Funnel not found.'}</p>
        </div>
      </PageTransition>
    );
  }

  const tone = TONE[STATUS_OPTIONS.find((s) => s.value === funnel.status)?.tone ?? 'gray'];
  const productId = product?.id;

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      <Link href="/funnels" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to Funnels
      </Link>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="group relative overflow-hidden rounded-2xl border border-border bg-card"
      >
        <div className={cn('absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r',
          winning ? 'from-emerald-500/60 via-emerald-400 to-emerald-500/60' : tone.bar)} aria-hidden />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl transition-opacity duration-700 group-hover:opacity-40"
          style={{ background: `radial-gradient(circle, ${winning ? '#34d39966' : tone.glow + '55'}, transparent 70%)` }}
          aria-hidden
        />
        <div className="relative z-10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-lg',
                winning ? 'bg-emerald-500/15 text-emerald-400 shadow-emerald-500/20' : 'bg-primary/15 text-primary shadow-primary/10')}>
                {winning ? <Trophy className="h-5 w-5" /> : <FunnelIcon className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                {productId ? (
                  <Link href={`/product-tracker/${productId}`} className="group/title inline-flex items-center gap-1.5 text-2xl font-semibold tracking-tight text-foreground hover:text-primary">
                    <span className="truncate">{funnel.productName}</span>
                  </Link>
                ) : (
                  <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{funnel.productName}</h1>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/25 bg-sky-500/10 px-2.5 py-1">
                    <Globe className="h-3.5 w-3.5 text-sky-400" aria-hidden />
                    <span className="text-[13px] font-semibold tracking-tight text-foreground">{funnel.country}</span>
                    <span className="text-sky-500/40">·</span>
                    <span className="text-[13px] font-medium text-sky-300/90">{funnel.language}</span>
                  </span>
                  {funnel.funnelishUrl && (
                    <a href={funnel.funnelishUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[12px] text-primary hover:text-primary/80">
                      <Globe className="h-3 w-3" /> Funnelish
                    </a>
                  )}
                  {funnel.launchDate && (
                    <span className="text-[12px] text-muted-foreground">launched {funnel.launchDate}</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={funnel.status}
                    onChange={(e) => updateFunnel({ status: e.target.value as FunnelStatus })}
                    className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold cursor-pointer outline-none transition appearance-none pr-6 bg-no-repeat',
                      tone.bg, tone.border, tone.text)}
                    style={{
                      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                      backgroundPosition: 'right 6px center',
                    }}
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value} className="bg-card text-foreground">{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={deleteFunnel}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400"
              title="Delete funnel"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Win threshold progress */}
          {winThreshold > 0 && agg.latestRoas > 0 && (
            <div className="mt-5 rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-muted-foreground">
                  ROAS{' '}
                  <span className={cn('text-2xl font-semibold tabular-nums tracking-tight ml-1', winning ? 'text-emerald-400' : 'text-foreground')}>
                    {agg.latestRoas.toFixed(2)}x
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Win at <span className="font-semibold tabular-nums text-emerald-400">{winThreshold.toFixed(2)}x</span>
                </span>
              </div>
              <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-border/60">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className={cn('h-full rounded-full', winning ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : 'bg-rose-400/70')}
                />
                <span className="absolute top-0 h-full w-px bg-foreground/40" style={{ left: `${(1 / 1.1) * 100}%` }} aria-hidden />
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Date filter */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="flex flex-wrap items-center gap-2"
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Performance for</p>
        <DateChip active={filterDate === ''} onClick={() => setFilterDate('')}>All time</DateChip>
        <DateChip active={filterDate === today} onClick={() => setFilterDate(today)}>Today</DateChip>
        <DateChip active={filterDate === yest} onClick={() => setFilterDate(yest)}>Yesterday</DateChip>
        <DatePicker value={filterDate} onChange={setFilterDate} placeholder="Pick a day" compact />
        {filterDate && <span className="text-[10px] text-emerald-400">{filterDate} only</span>}
      </motion.div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile icon={<TrendingUp className="h-3.5 w-3.5" />} label="Latest ROAS" value={animLatestRoas > 0 ? `${animLatestRoas.toFixed(2)}x` : '—'} accent={agg.latestRoas === 0 ? 'amber' : winning ? 'emerald' : 'rose'} delay={0} />
        <KpiTile icon={<Target className="h-3.5 w-3.5" />} label="BEROAS" value={animBeroas > 0 ? `${animBeroas.toFixed(2)}x` : '—'} accent="violet" hint={beroas > 0 ? `win ≥ ${(beroas + 1).toFixed(2)}x` : 'set pricing'} delay={0.05} />
        <KpiTile icon={<ShoppingCart className="h-3.5 w-3.5" />} label="Orders" value={Math.round(animOrders).toLocaleString('en-IN')} accent="sky" delay={0.1} />
        <KpiTile icon={<FunnelIcon className="h-3.5 w-3.5" />} label="Days logged" value={Math.round(animDays).toLocaleString('en-IN')} accent="amber" hint={agg.lastLogDate ? `last ${agg.lastLogDate}` : 'no logs yet'} delay={0.15} />
      </div>

      {/* Pricing editor */}
      <PricingEditor key={funnel.id} funnel={funnel} product={product} onSave={updateFunnel} />

      {/* Log entry */}
      <LogEntrySection
        funnelId={funnel.id}
        beroas={beroas}
        today={today}
        yest={yest}
        onSaved={refreshLogs}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* Logs table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18 }}
        className="rounded-xl border border-border bg-card overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-medium text-foreground">Daily performance log</h2>
          <span className="text-[11px] text-muted-foreground">{scopedLogs.length} {scopedLogs.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        {scopedLogs.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <FunnelIcon className="mx-auto h-7 w-7 text-muted-foreground/30" />
            <p className="mt-2 text-[12px] text-muted-foreground">No logs {filterDate ? 'on this date' : 'yet'}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tracker-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Date</th>
                  <th style={{ textAlign: 'right', width: 90 }}>ROAS</th>
                  <th style={{ textAlign: 'right', width: 70 }}>Orders</th>
                  <th style={{ width: 60 }}>Win</th>
                  <th>Notes</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {[...scopedLogs].sort((a, b) => b.date.localeCompare(a.date)).map((l) => {
                  const win = isWinning(l.roas, beroas);
                  return (
                    <tr key={l.id}>
                      <td><div className="px-3 py-2 text-[11px] tabular-nums text-foreground">{l.date}</div></td>
                      <td>
                        <div className={cn('px-3 py-2 text-right text-[11px] tabular-nums font-semibold', l.roas === 0 ? 'text-muted-foreground/50' : win ? 'text-emerald-400' : 'text-foreground')}>
                          {l.roas > 0 ? `${l.roas.toFixed(2)}x` : '—'}
                        </div>
                      </td>
                      <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-foreground">{l.orders || '—'}</div></td>
                      <td>
                        <div className="px-3 py-2">
                          {l.roas === 0 ? <span className="text-[10px] text-muted-foreground/60">—</span> : win
                            ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" title="Winning" />
                            : <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" title="Below threshold" />}
                        </div>
                      </td>
                      <td><div className="px-3 py-2 text-[11px] text-muted-foreground truncate max-w-[280px]">{l.notes || '—'}</div></td>
                      <td>
                        <div className="flex items-center justify-end px-3 py-1.5">
                          <DeleteLogButton id={l.id} onDeleted={refreshLogs} onError={setError} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · money tracking lives in{' '}
        <Link href={`/finance/funnels/${funnel.id}`} className="text-primary hover:text-primary/80">Funnel Finance →</Link>
      </p>
    </PageTransition>
  );
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({ icon, label, value, hint, accent, delay = 0 }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent: 'amber' | 'sky' | 'emerald' | 'rose' | 'violet';
  delay?: number;
}) {
  const text = {
    amber: 'text-amber-400', sky: 'text-sky-400', emerald: 'text-emerald-400', rose: 'text-rose-400', violet: 'text-violet-400',
  }[accent];
  const border = {
    amber: 'border-amber-500/30', sky: 'border-sky-500/30', emerald: 'border-emerald-500/30', rose: 'border-rose-500/30', violet: 'border-violet-500/30',
  }[accent];
  const glow = {
    amber: '#fbbf24', sky: '#38bdf8', emerald: '#34d399', rose: '#fb7185', violet: '#a78bfa',
  }[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: `0 14px 40px -16px ${glow}55, 0 0 0 1px ${glow}33` }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn('group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors', border)}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: `radial-gradient(circle, ${glow}66, transparent 70%)` }}
        aria-hidden
      />
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={cn(text, 'opacity-70')}>{icon}</span>
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        </div>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: glow }} aria-hidden />
      </div>
      <p className={cn('relative z-10 mt-2 text-[22px] font-semibold leading-none tabular-nums tracking-tight', text)}>{value}</p>
      {hint && <p className="relative z-10 mt-1.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </motion.div>
  );
}

function DateChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium transition',
        active ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

// ── Pricing editor — SP + delivery rate → auto BEROAS ───────────────────────

function PricingEditor({ funnel: f, product, onSave }: {
  funnel: Funnel;
  product: ProductTrackerEntry | null;
  onSave: (patch: Partial<Funnel>) => void;
}) {
  const [editSP, setEditSP] = useState<string>(f.sellingPrice ? String(f.sellingPrice) : '');
  const [editDR, setEditDR] = useState<string>(f.deliveryRate ? String(f.deliveryRate) : '95');
  const [saved, setSaved] = useState(false);

  const sp = parseFloat(editSP) || 0;
  const dr = parseFloat(editDR) || 0;
  const cost = product ? (Number(product.cogs) || 0) + (Number(product.shipping) || 0) : 0;
  const margin = sp > 0 && sp > cost && dr > 0 ? ((sp - cost) / sp) * (dr / 100) : 0;
  const beroas = margin > 0 ? 1 / margin : 0;
  const winThreshold = beroas > 0 ? beroas + 1 : 0;

  const flush = () => {
    const nextSP = parseFloat(editSP) || 0;
    const nextDR = parseFloat(editDR) || 0;
    if (nextSP === (f.sellingPrice || 0) && nextDR === (f.deliveryRate || 0)) return;
    onSave({ sellingPrice: nextSP, deliveryRate: nextDR });
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.12 }}
      className="rounded-2xl border border-primary/20 bg-primary/[0.03] overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-primary/15 px-5 py-3">
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Pricing for this market</h3>
          {saved && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">saved ✓</span>}
        </div>
        {!product ? (
          <span className="text-[10px] text-amber-400">Link a product first</span>
        ) : cost > 0 ? (
          <span className="text-[10px] text-muted-foreground">Cost ${cost.toFixed(2)} from product</span>
        ) : (
          <span className="text-[10px] text-amber-400">Product has no cost — set COGS + shipping in Products</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Selling price (USD)</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-lg font-semibold text-emerald-400 leading-none">$</span>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={editSP}
              onChange={(e) => setEditSP(e.target.value)}
              onBlur={flush}
              className="w-full bg-transparent text-[22px] font-semibold leading-none tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              placeholder="0"
            />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Delivery rate (%)</p>
          <div className="mt-2 flex items-baseline gap-1">
            <input
              type="number" min="0" max="100" step="0.1" inputMode="decimal"
              value={editDR}
              onChange={(e) => setEditDR(e.target.value)}
              onBlur={flush}
              className="w-full bg-transparent text-[22px] font-semibold leading-none tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-lg font-semibold text-muted-foreground leading-none">%</span>
          </div>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-primary/80">BEROAS</p>
          <p className="mt-2 text-[22px] font-semibold leading-none tabular-nums text-primary">
            {beroas > 0 ? `${beroas.toFixed(2)}x` : '—'}
          </p>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Margin {(margin * 100).toFixed(1)}% · Win at <span className="text-emerald-400 font-semibold">{winThreshold > 0 ? `${winThreshold.toFixed(2)}x` : '—'}</span>
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Log entry section — performance fields only ─────────────────────────────

function LogEntrySection({ funnelId, beroas, today, yest, onSaved }: {
  funnelId: string;
  beroas: number;
  today: string;
  yest: string;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(today);
  const [roas, setRoas] = useState('');
  const [orders, setOrders] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const roasNum = parseFloat(roas) || 0;
  const ordersNum = parseInt(orders, 10) || 0;
  const hasInputs = roasNum > 0 || ordersNum > 0;
  const liveWinning = isWinning(roasNum, beroas);

  const submit = async () => {
    if (!date) { setErr('Date is required.'); return; }
    if (!hasInputs) { setErr('Enter at least ROAS or orders.'); return; }
    try {
      setSaving(true);
      setErr(null);
      const res = await fetch('/api/funnels/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnelId, date, roas: roasNum, orders: ordersNum, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRoas(''); setOrders(''); setNotes('');
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add log.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.16 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Plus className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Log a day</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <DateChip active={date === today} onClick={() => setDate(today)}>Today</DateChip>
          <DateChip active={date === yest} onClick={() => setDate(yest)}>Yesterday</DateChip>
          <DatePicker value={date} onChange={(d) => setDate(d || today)} max={today} compact />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 px-5 py-5 md:grid-cols-2">
        <PerfInput label="ROAS (from Meta)" value={roas} onChange={setRoas} suffix="x" tone="emerald" />
        <PerfInput label="Orders" value={orders} onChange={setOrders} integer tone="sky" />
      </div>

      {/* Live win indicator */}
      <div className="mx-5 mb-4 flex items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-2.5 text-[12px]">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Live preview</span>
        {!hasInputs ? (
          <span className="text-[11px] text-muted-foreground/50">Enter ROAS</span>
        ) : beroas === 0 ? (
          <span className="text-[11px] text-muted-foreground/50">Set pricing to evaluate</span>
        ) : liveWinning ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" /> Winning
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Below {(beroas + 1).toFixed(2)}x
          </span>
        )}
      </div>

      <div className="px-5 pb-5 space-y-2">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)…" className="form-input" />
        {err && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> <span>{err}</span>
          </div>
        )}
        <button
          onClick={submit}
          disabled={saving || !hasInputs}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary/15 px-4 py-3 text-[13px] font-semibold text-primary transition hover:bg-primary/25 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Add log'}
        </button>
      </div>
    </motion.div>
  );
}

function PerfInput({ label, value, onChange, suffix, integer, tone }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  integer?: boolean;
  tone: 'emerald' | 'sky';
}) {
  const accent = {
    emerald: { text: 'text-emerald-400', border: 'hover:border-emerald-500/40 focus-within:border-emerald-500/60', bg: 'focus-within:bg-emerald-500/[0.04]' },
    sky:     { text: 'text-sky-400',     border: 'hover:border-sky-500/40     focus-within:border-sky-500/60',     bg: 'focus-within:bg-sky-500/[0.04]' },
  }[tone];
  return (
    <div className={cn('group rounded-xl border border-border bg-background/40 p-4 transition-colors', accent.border, accent.bg)}>
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <input
          type="number"
          inputMode={integer ? 'numeric' : 'decimal'}
          step={integer ? '1' : '0.01'}
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full bg-transparent text-[28px] font-semibold leading-none tabular-nums text-foreground outline-none placeholder:text-muted-foreground/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {suffix && <span className={cn('text-xl font-semibold leading-none', accent.text)}>{suffix}</span>}
      </div>
    </div>
  );
}

function DeleteLogButton({ id, onDeleted, onError }: { id: string; onDeleted: () => void; onError: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!confirm('Delete this log entry?')) return;
    try {
      setBusy(true);
      const r = await fetch('/api/funnels/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${r.status}`);
      }
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete log.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={remove} disabled={busy} className="rounded-md p-1 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
    </button>
  );
}
