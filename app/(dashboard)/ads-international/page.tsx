'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Globe, ArrowRight, AlertTriangle, Search, Layers, Trophy, Sparkles,
  TrendingDown, Funnel as FunnelIcon,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import type { Creative, Funnel, FunnelStatus } from '@/types/funnel';
import type { ProductTrackerEntry } from '@/types/shopify';

const FUNNEL_STATUS_OPTIONS: Array<{ value: FunnelStatus; label: string; tone: 'gray' | 'amber' | 'emerald' | 'sky' | 'rose' }> = [
  { value: 'live',    label: 'Live',    tone: 'emerald' },
  { value: 'testing', label: 'Testing', tone: 'amber' },
  { value: 'paused',  label: 'Paused',  tone: 'sky' },
  { value: 'draft',   label: 'Draft',   tone: 'gray' },
  { value: 'killed',  label: 'Killed',  tone: 'rose' },
];

interface FunnelAdsSummary {
  funnel: Funnel;
  productId?: string;
  total: number;
  testing: number;
  live: number;
  killed: number;
  winners: number;
  losers: number;
  hitRate: number;
  batches: number;
  lastLaunch: string;
}

const TONE: Record<'gray' | 'amber' | 'emerald' | 'sky' | 'rose', { text: string; bg: string; border: string; bar: string; dot: string; glow: string }> = {
  gray:    { text: 'text-muted-foreground', bg: 'bg-border/40',     border: 'border-border',         bar: 'bg-muted-foreground/40', dot: 'bg-muted-foreground', glow: '#71717a' },
  amber:   { text: 'text-amber-400',        bg: 'bg-amber-500/10',  border: 'border-amber-500/30',   bar: 'bg-amber-400',           dot: 'bg-amber-400',          glow: '#fbbf24' },
  emerald: { text: 'text-emerald-400',      bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'bg-emerald-400',         dot: 'bg-emerald-400',        glow: '#34d399' },
  sky:     { text: 'text-sky-400',          bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     bar: 'bg-sky-400',             dot: 'bg-sky-400',            glow: '#38bdf8' },
  rose:    { text: 'text-rose-400',         bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    bar: 'bg-rose-400',            dot: 'bg-rose-400',           glow: '#fb7185' },
};

function useCountUp(value: number, duration = 600) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(0);
  useEffect(() => { ref.current = display; });
  useEffect(() => {
    const from = ref.current;
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

export default function AdsPage() {
  const { user } = useAuth();
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [products, setProducts] = useState<ProductTrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FunnelStatus | 'all' | 'with-creatives'>('with-creatives');
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState<string>('');

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [creativesRes, funnelsRes, productsRes] = await Promise.all([
        fetch('/api/creatives-intl').then((r) => r.json()),
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/product-tracker').then((r) => r.json()),
      ]);
      setCreatives(creativesRes.creatives ?? []);
      setFunnels(funnelsRes.funnels ?? []);
      setProducts(productsRes.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Refresh when the page becomes visible again — handles the case where
  // a funnel/creative was deleted on a detail page and the user navigates
  // back. Without this the summary cards stay stale.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') loadAll(); };
    const onFocus = () => loadAll();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadAll]);

  // After client-side navigation back to this page (e.g. via router.back or
  // a Link), the focus event may not fire — also drop stale references to
  // funnels that were deleted by filtering creatives to existing funnel IDs.
  const validFunnelIds = useMemo(() => new Set(funnels.map((f) => f.id)), [funnels]);
  const liveCreatives = useMemo(() => creatives.filter((c) => validFunnelIds.has(c.funnelId)), [creatives, validFunnelIds]);

  const productIdByName = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => { if (p.productName) m.set(p.productName, p.id); });
    return m;
  }, [products]);

  const summaries = useMemo<FunnelAdsSummary[]>(() => {
    return funnels.map((f) => {
      const my = liveCreatives.filter((c) => {
        if (c.funnelId !== f.id) return false;
        if (filterDate && c.launchDate !== filterDate) return false;
        return true;
      });
      const total = my.length;
      const testing = my.filter((c) => c.status === 'testing').length;
      // "Live" = creatives still spending: status === 'live' OR 'testing', or
      // already marked a winner (winners stay considered "live" even when paused).
      const live = my.filter((c) => c.status === 'live' || c.status === 'testing' || c.result === 'winner').length;
      const killed = my.filter((c) => c.status === 'killed').length;
      const winners = my.filter((c) => c.result === 'winner').length;
      const losers = my.filter((c) => c.result === 'loser').length;
      const decided = winners + losers;
      const hitRate = decided > 0 ? (winners / decided) * 100 : 0;
      const batches = new Set(my.map((c) => c.batchName).filter(Boolean)).size;
      const lastLaunch = my.map((c) => c.launchDate).filter(Boolean).sort().pop() || '';
      const productId = f.productId || productIdByName.get(f.productName);
      return { funnel: f, productId, total, testing, live, killed, winners, losers, hitRate, batches, lastLaunch };
    });
  }, [funnels, liveCreatives, filterDate, productIdByName]);

  const filtered = useMemo<FunnelAdsSummary[]>(() => {
    const q = search.trim().toLowerCase();
    return summaries
      .filter((s) => {
        if (statusFilter === 'with-creatives' && s.total === 0) return false;
        if (statusFilter !== 'all' && statusFilter !== 'with-creatives' && s.funnel.status !== statusFilter) return false;
        if (q) {
          const hay = [s.funnel.productName, s.funnel.country, s.funnel.language].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.total - a.total);
  }, [summaries, statusFilter, search]);

  // Top-level KPIs
  const grand = useMemo(() => {
    const scoped = filterDate ? liveCreatives.filter((c) => c.launchDate === filterDate) : liveCreatives;
    const total = scoped.length;
    const live = scoped.filter((c) => c.status === 'live' || c.status === 'testing' || c.result === 'winner').length;
    const winners = scoped.filter((c) => c.result === 'winner').length;
    const losers = scoped.filter((c) => c.result === 'loser').length;
    const decided = winners + losers;
    const hitRate = decided > 0 ? (winners / decided) * 100 : 0;
    const activeFunnels = summaries.filter((s) => s.total > 0).length;
    return { total, live, winners, hitRate, activeFunnels };
  }, [liveCreatives, filterDate, summaries]);

  const animTotal = useCountUp(grand.total, 500);
  const animLive = useCountUp(grand.live, 500);
  const animWinners = useCountUp(grand.winners, 500);
  const animHit = useCountUp(grand.hitRate, 500);
  const animActive = useCountUp(grand.activeFunnels, 500);

  // Date chips
  const { today, yest } = useMemo(() => {
    const now = new Date();
    const fmtIST = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    return { today: fmtIST(now), yest: fmtIST(new Date(now.getTime() - 86_400_000)) };
  }, []);

  // Per-funnel-status counts
  const statusCounts = useMemo(() => {
    const c: Record<FunnelStatus | 'all' | 'with-creatives', number> = {
      all: summaries.length,
      'with-creatives': summaries.filter((s) => s.total > 0).length,
      live: 0, testing: 0, paused: 0, draft: 0, killed: 0,
    };
    summaries.forEach((s) => { c[s.funnel.status]++; });
    return c;
  }, [summaries]);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Globe className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Ads</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Creative inventory broken down by funnel · {grand.activeFunnels} funnel{grand.activeFunnels === 1 ? '' : 's'} with ads
            </p>
          </div>
        </div>
      </div>

      {/* Top-level KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile icon={<FunnelIcon className="h-3.5 w-3.5" />} label="Funnels with ads" value={Math.round(animActive).toLocaleString('en-IN')} accent="violet" delay={0} />
        <KpiTile icon={<Layers className="h-3.5 w-3.5" />}    label="Total creatives" value={Math.round(animTotal).toLocaleString('en-IN')}  accent="amber" delay={0.04} />
        <KpiTile icon={<Sparkles className="h-3.5 w-3.5" />}  label="Live"            value={Math.round(animLive).toLocaleString('en-IN')}   accent="emerald" delay={0.08} />
        <KpiTile icon={<Trophy className="h-3.5 w-3.5" />}    label="Winners"         value={Math.round(animWinners).toLocaleString('en-IN')} accent="sky" delay={0.12} />
        <KpiTile icon={animHit < 50 ? <TrendingDown className="h-3.5 w-3.5" /> : <Trophy className="h-3.5 w-3.5" />} label="Hit rate" value={grand.winners + liveCreatives.filter((c) => c.result === 'loser').length > 0 ? `${animHit.toFixed(0)}%` : '—'} accent={grand.hitRate >= 50 ? 'emerald' : 'rose'} delay={0.16} hint="winners / decided" />
      </div>

      {/* Date filter */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.18 }}
        className="flex flex-wrap items-center gap-2"
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Launched on</p>
        <DateChip active={filterDate === ''} onClick={() => setFilterDate('')}>Any day</DateChip>
        <DateChip active={filterDate === today} onClick={() => setFilterDate(today)}>Today</DateChip>
        <DateChip active={filterDate === yest} onClick={() => setFilterDate(yest)}>Yesterday</DateChip>
        <DatePicker value={filterDate} onChange={setFilterDate} placeholder="Pick a day" compact />
        {filterDate && <span className="text-[10px] text-emerald-400">{filterDate} only</span>}
      </motion.div>

      {/* Filter pills + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <FilterPill label="With ads" count={statusCounts['with-creatives']} active={statusFilter === 'with-creatives'} onClick={() => setStatusFilter('with-creatives')} tone="emerald" />
          <FilterPill label="All funnels" count={statusCounts.all} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          {FUNNEL_STATUS_OPTIONS.map((s) => (
            <FilterPill key={s.value} label={s.label} count={statusCounts[s.value]} active={statusFilter === s.value} onClick={() => setStatusFilter(s.value)} tone={s.tone} />
          ))}
        </div>
        <div className="ml-auto relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, country…"
            className="form-input pl-8 py-1.5 text-[12px] w-56"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* Funnel cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[200px] rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Layers className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-[13px] font-medium text-foreground">
            {summaries.length === 0 ? 'No funnels yet' : statusFilter === 'with-creatives' ? 'No funnels have creatives logged' : 'No funnels match filters'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {summaries.length === 0
              ? <>Create a funnel first in <Link href="/funnels" className="text-primary hover:text-primary/80">Funnels</Link>.</>
              : statusFilter === 'with-creatives'
                ? 'Click a funnel below — switch to "All funnels" — and add a creative.'
                : 'Try clearing a filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s, i) => <FunnelAdCard key={s.funnel.id} summary={s} index={i} />)}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · ad spend lives at the funnel level (Finance), not per-creative · click any card for the full creative breakdown
      </p>
    </PageTransition>
  );
}

// ── Funnel ad summary card ─────────────────────────────────────────────────

function FunnelAdCard({ summary: s, index }: { summary: FunnelAdsSummary; index: number }) {
  const t = TONE[FUNNEL_STATUS_OPTIONS.find((x) => x.value === s.funnel.status)?.tone ?? 'gray'];
  const decided = s.winners + s.losers;
  const hitTone = s.hitRate >= 50 ? 'text-emerald-400' : decided > 0 ? 'text-rose-400' : 'text-muted-foreground/50';
  const livePct = s.total > 0 ? (s.live / s.total) * 100 : 0;
  const winningGlow = s.hitRate >= 50 && decided >= 2;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: winningGlow ? '0 14px 40px -16px #34d39955, 0 0 0 1px #34d39933' : undefined }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.3), ease: [0.22, 1, 0.36, 1] }}
    >
    <Link
      href={`/ads-international/${s.funnel.id}`}
      className={cn(
        'group relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 transition-colors',
        winningGlow ? 'border-emerald-500/40 hover:border-emerald-500/60' : 'border-border hover:border-border/80'
      )}
    >
      {/* Status accent bar */}
      <div className={cn('absolute inset-x-0 top-0 h-[3px]', winningGlow ? 'bg-gradient-to-r from-emerald-500/60 via-emerald-400 to-emerald-500/60' : t.bar)} aria-hidden />

      {/* Corner glow */}
      {winningGlow && (
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-60"
          style={{ background: 'radial-gradient(circle, #34d39966, transparent 70%)' }}
          aria-hidden
        />
      )}

      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{s.funnel.productName}</p>
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5">
            <Globe className="h-3 w-3 text-sky-400" aria-hidden />
            <span className="text-[11px] font-semibold tracking-tight text-foreground">{s.funnel.country}</span>
            <span className="text-sky-500/40">·</span>
            <span className="text-[11px] font-medium text-sky-300/90">{s.funnel.language}</span>
          </div>
        </div>
        <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', t.bg, t.border, t.text)}>
          <span className={cn('h-1 w-1 rounded-full', t.dot)} />
          {s.funnel.status}
        </span>
      </div>

      {/* Stat grid */}
      <div className="relative z-10 grid grid-cols-3 gap-2 text-[11px]">
        <Cell label="Creatives" value={s.total.toString()} tone="violet" />
        <Cell label="Live"      value={s.live.toString()}  tone="emerald" />
        <Cell label="Batches"   value={s.batches.toString()} tone="amber" />
      </div>

      {/* Hit rate */}
      <div className="relative z-10">
        <div className="flex items-baseline justify-between text-[10px] text-muted-foreground">
          <span>
            Hit rate{' '}
            <span className={cn('font-semibold tabular-nums', hitTone)}>
              {decided > 0 ? `${s.hitRate.toFixed(0)}%` : '—'}
            </span>
          </span>
          <span className="tabular-nums">{s.winners}W · {s.losers}L · {Math.max(0, s.total - decided)}?</span>
        </div>
        {decided > 0 ? (
          <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-border/60">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${s.hitRate}%` }}
              transition={{ duration: 0.7 }}
              className={cn('h-full rounded-full', s.hitRate >= 50 ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : 'bg-rose-400/70')}
            />
          </div>
        ) : (
          <div className="mt-1 h-1.5 rounded-full bg-border/30" />
        )}
      </div>

      {/* Live ratio */}
      {s.total > 0 && (
        <div className="relative z-10">
          <div className="flex items-baseline justify-between text-[10px] text-muted-foreground">
            <span>Live <span className="font-semibold tabular-nums text-emerald-400">{s.live}</span> of {s.total}</span>
            <span className="tabular-nums">{livePct.toFixed(0)}%</span>
          </div>
          <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-border/60">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${livePct}%` }}
              transition={{ duration: 0.7 }}
              className="h-full rounded-full bg-emerald-400/80"
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="relative z-10 flex items-center justify-between border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground">
        <span>{s.lastLaunch ? `Last launch ${s.lastLaunch}` : 'no launches yet'}</span>
        <span className="inline-flex items-center gap-0.5 text-primary opacity-70 transition group-hover:opacity-100">
          Open <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
    </motion.div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'sky' | 'emerald' | 'rose' | 'violet' }) {
  const text = {
    amber: 'text-amber-400', sky: 'text-sky-400', emerald: 'text-emerald-400', rose: 'text-rose-400', violet: 'text-violet-400',
  }[tone];
  return (
    <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
      <p className="text-[8px] font-medium uppercase tracking-wider text-muted-foreground/80">{label}</p>
      <p className={cn('mt-0.5 text-[14px] font-semibold leading-none tabular-nums', text)}>{value}</p>
    </div>
  );
}

// ── KPI tile ────────────────────────────────────────────────────────────────

function KpiTile({ icon, label, value, hint, accent, delay = 0 }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent: 'amber' | 'sky' | 'emerald' | 'rose' | 'violet';
  delay?: number;
}) {
  const text = { amber: 'text-amber-400', sky: 'text-sky-400', emerald: 'text-emerald-400', rose: 'text-rose-400', violet: 'text-violet-400' }[accent];
  const border = { amber: 'border-amber-500/30', sky: 'border-sky-500/30', emerald: 'border-emerald-500/30', rose: 'border-rose-500/30', violet: 'border-violet-500/30' }[accent];
  const glow = { amber: '#fbbf24', sky: '#38bdf8', emerald: '#34d399', rose: '#fb7185', violet: '#a78bfa' }[accent];
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

function FilterPill({ label, count, active, onClick, tone = 'gray' }: {
  label: string; count: number; active: boolean; onClick: () => void;
  tone?: 'gray' | 'amber' | 'emerald' | 'sky' | 'rose';
}) {
  const t = TONE[tone];
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition',
        active ? cn(t.bg, t.border, t.text) : 'border-border bg-card text-muted-foreground hover:text-foreground'
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', t.dot, !active && 'opacity-60')} />
      {label}
      <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums', active ? 'bg-black/20' : 'bg-border/50 text-foreground')}>
        {count}
      </span>
    </button>
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
