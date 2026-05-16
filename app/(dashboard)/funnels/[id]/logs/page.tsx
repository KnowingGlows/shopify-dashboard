'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Target, Loader2, AlertTriangle, Trash2, Funnel as FunnelIcon,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import { isWinning, effectiveBeroas } from '@/lib/funnels';
import type { Funnel, FunnelDailyLog } from '@/types/funnel';
import type { ProductTrackerEntry } from '@/types/shopify';

export default function FunnelLogsPage() {
  const params = useParams<{ id: string }>();
  const funnelId = params?.id;
  const { user } = useAuth();

  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [product, setProduct] = useState<ProductTrackerEntry | null>(null);
  const [logs, setLogs] = useState<FunnelDailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<string>('');
  const [winOnly, setWinOnly] = useState(false);

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
      setError(err instanceof Error ? err.message : 'Failed to load logs.');
    } finally {
      setLoading(false);
    }
  }, [funnelId]);

  useEffect(() => { if (funnelId) loadAll(); }, [funnelId, loadAll]);

  const beroas = funnel ? effectiveBeroas(funnel, product ?? undefined) : 0;

  const filtered = useMemo(() => {
    let arr = [...logs];
    if (filterDate) arr = arr.filter((l) => l.date === filterDate);
    if (winOnly) arr = arr.filter((l) => isWinning(Number(l.roas) || 0, beroas));
    return arr.sort((a, b) => b.date.localeCompare(a.date));
  }, [logs, filterDate, winOnly, beroas]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const winningDays = filtered.filter((l) => isWinning(Number(l.roas) || 0, beroas)).length;
    const totalOrders = filtered.reduce((s, l) => s + (Number(l.orders) || 0), 0);
    const roasValues = filtered.filter((l) => Number(l.roas) > 0).map((l) => Number(l.roas));
    const avgRoas = roasValues.length > 0 ? roasValues.reduce((s, v) => s + v, 0) / roasValues.length : 0;
    const bestRoas = roasValues.length > 0 ? Math.max(...roasValues) : 0;
    return { total, winningDays, totalOrders, avgRoas, bestRoas };
  }, [filtered, beroas]);

  const deleteLog = async (id: string) => {
    if (!confirm('Delete this log entry?')) return;
    try {
      const r = await fetch('/api/funnels/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${r.status}`);
      }
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete log.');
    }
  };

  if (loading) {
    return (
      <PageTransition className="mx-auto max-w-7xl p-5">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </PageTransition>
    );
  }

  if (error || !funnel) {
    return (
      <PageTransition className="mx-auto max-w-7xl p-5">
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> <span>{error ?? 'Funnel not found.'}</span>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      <Link
        href={`/funnels/${funnelId}`}
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to {funnel.productName || 'LP'}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Daily performance log</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {funnel.productName}
              {beroas > 0 && <> <span className="text-muted-foreground/40">·</span> win ≥ {(beroas + 1).toFixed(2)}x</>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DatePicker value={filterDate} onChange={setFilterDate} placeholder="Pick a day" compact />
          {filterDate && (
            <button onClick={() => setFilterDate('')} className="text-[10px] text-muted-foreground hover:text-foreground">Clear</button>
          )}
          <button
            onClick={() => setWinOnly((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition',
              winOnly
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', winOnly ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-muted-foreground/40')} />
            Winning only
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Entries" value={summary.total} tone="violet" />
        <Kpi label="Winning days" value={summary.winningDays} tone="emerald" />
        <Kpi label="Orders" value={summary.totalOrders} tone="amber" />
        <Kpi label="Avg ROAS" value={summary.avgRoas > 0 ? `${summary.avgRoas.toFixed(2)}x` : '—'} tone="sky" />
        <Kpi label="Best ROAS" value={summary.bestRoas > 0 ? `${summary.bestRoas.toFixed(2)}x` : '—'} tone="emerald" />
      </div>

      {/* Log rows — card per entry */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Target className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-[13px] font-medium text-foreground">No logs match.</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Clear filters or add an entry from{' '}
            <Link href={`/funnels/${funnelId}`} className="text-primary hover:text-primary/80">the funnel page</Link>.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((l, idx) => {
            const roas = Number(l.roas) || 0;
            const win = isWinning(roas, beroas);
            return (
              <motion.div
                key={l.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(idx * 0.015, 0.2) }}
                className={cn(
                  'group relative grid grid-cols-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors',
                  win ? 'border-emerald-500/25 hover:border-emerald-500/40' : roas > 0 ? 'border-rose-500/20 hover:border-rose-500/40' : 'border-border hover:border-border/80'
                )}
              >
                {win && <span className="absolute inset-y-2 left-0 w-[2px] rounded-r bg-gradient-to-b from-emerald-400 to-emerald-300 shadow-[0_0_8px_#34d399]" aria-hidden />}

                <div className="col-span-3 md:col-span-2">
                  <p className="text-[12px] font-semibold tabular-nums text-foreground">{l.date}</p>
                </div>
                <div className="col-span-4 md:col-span-2">
                  <p className={cn('text-[16px] font-semibold leading-none tabular-nums', roas === 0 ? 'text-muted-foreground/40' : win ? 'text-emerald-400' : 'text-foreground')}>
                    {roas > 0 ? `${roas.toFixed(2)}x` : '—'}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted-foreground">ROAS</p>
                </div>
                <div className="col-span-3 md:col-span-1">
                  <p className="text-[14px] font-medium tabular-nums text-foreground">{Number(l.orders) || 0}</p>
                  <p className="mt-0.5 text-[9px] text-muted-foreground">orders</p>
                </div>
                <div className="col-span-2 md:col-span-1 text-center">
                  {roas === 0 ? (
                    <span className="text-[10px] text-muted-foreground/60">—</span>
                  ) : win ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                      <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" /> Win
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
                      <span className="h-1 w-1 rounded-full bg-rose-400" /> Below
                    </span>
                  )}
                </div>
                <div className="col-span-9 md:col-span-5 min-w-0">
                  <p className="truncate text-[11px] text-muted-foreground/90">{l.notes || <span className="text-muted-foreground/40">no notes</span>}</p>
                </div>
                <div className="col-span-3 md:col-span-1 flex items-center justify-end">
                  <button
                    onClick={() => deleteLog(l.id)}
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-400"
                    title="Delete log"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} ·{' '}
        <Link href={`/funnels/${funnelId}`} className="inline-flex items-center gap-0.5 text-primary hover:text-primary/80">
          <FunnelIcon className="h-3 w-3" /> Funnel performance
        </Link>
      </p>
    </PageTransition>
  );
}

function Kpi({ label, value, tone }: {
  label: string;
  value: number | string;
  tone: 'violet' | 'emerald' | 'amber' | 'sky' | 'rose';
}) {
  const c = {
    violet:  { text: 'text-violet-400',  border: 'border-violet-500/30',  glow: '#a78bfa' },
    emerald: { text: 'text-emerald-400', border: 'border-emerald-500/30', glow: '#34d399' },
    amber:   { text: 'text-amber-400',   border: 'border-amber-500/30',   glow: '#fbbf24' },
    sky:     { text: 'text-sky-400',     border: 'border-sky-500/30',     glow: '#38bdf8' },
    rose:    { text: 'text-rose-400',    border: 'border-rose-500/30',    glow: '#fb7185' },
  }[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: `0 14px 40px -16px ${c.glow}55, 0 0 0 1px ${c.glow}33` }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn('group relative overflow-hidden rounded-xl border bg-card p-4', c.border)}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: `radial-gradient(circle, ${c.glow}66, transparent 70%)` }}
        aria-hidden
      />
      <p className="relative z-10 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn('relative z-10 mt-2 text-[22px] font-semibold leading-none tabular-nums tracking-tight', c.text)}>{value}</p>
    </motion.div>
  );
}
