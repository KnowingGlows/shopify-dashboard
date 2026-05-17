'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Funnel as FunnelIcon, Plus, Check, X, Loader2,
  AlertTriangle, Link2, Search, ArrowRight, BarChart3,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import { productEconomicsOf } from '@/lib/3pl';
import { formatINR } from '@/lib/currency-converter';
import { isWinning, aggregateLogs, hitRate, effectiveBeroas } from '@/lib/funnels';
import type { Funnel, FunnelDailyLog, FunnelStatus } from '@/types/funnel';
import type { ProductTrackerEntry } from '@/types/shopify';

const STATUS_OPTIONS: Array<{ value: FunnelStatus; label: string; tone: 'gray' | 'amber' | 'emerald' | 'sky' | 'rose' }> = [
  { value: 'live',    label: 'Live',    tone: 'emerald' },
  { value: 'testing', label: 'Testing', tone: 'amber' },
  { value: 'paused',  label: 'Paused',  tone: 'sky' },
  { value: 'draft',   label: 'Draft',   tone: 'gray' },
  { value: 'killed',  label: 'Killed',  tone: 'rose' },
];

const STATUS_RANK: Record<FunnelStatus, number> = {
  live: 0, testing: 1, paused: 2, draft: 3, killed: 4,
};

const TONE: Record<'gray' | 'amber' | 'emerald' | 'sky' | 'rose', { text: string; bg: string; border: string; bar: string; dot: string }> = {
  gray:    { text: 'text-muted-foreground', bg: 'bg-border/40',     border: 'border-border',         bar: 'bg-muted-foreground/40', dot: 'bg-muted-foreground' },
  amber:   { text: 'text-amber-400',        bg: 'bg-amber-500/10',  border: 'border-amber-500/30',   bar: 'bg-amber-400',           dot: 'bg-amber-400' },
  emerald: { text: 'text-emerald-400',      bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'bg-emerald-400',         dot: 'bg-emerald-400' },
  sky:     { text: 'text-sky-400',          bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     bar: 'bg-sky-400',             dot: 'bg-sky-400' },
  rose:    { text: 'text-rose-400',         bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    bar: 'bg-rose-400',            dot: 'bg-rose-400' },
};

function useCountUp(value: number, duration = 600) {
  const [display, setDisplay] = useState(0);
  // Mirror the displayed value into a ref so the next animation starts from
  // wherever we are *now*, not from the last target. Prevents visible jumps
  // when value changes mid-animation (filter swaps, refreshes, etc.).
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

export default function FunnelsPage() {
  const { user } = useAuth();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [logsByFunnel, setLogsByFunnel] = useState<Record<string, FunnelDailyLog[]>>({});
  const [products, setProducts] = useState<ProductTrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode + filters
  const [viewMode, setViewMode] = useState<'list' | 'performance'>('list');
  const [statusFilter, setStatusFilter] = useState<FunnelStatus | 'all'>('all');
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState<string>('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [funnelsRes, productsRes] = await Promise.all([
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/product-tracker').then((r) => r.json()),
      ]);
      const list: Funnel[] = funnelsRes.funnels ?? [];
      setFunnels(list);
      setProducts(productsRes.entries ?? []);

      const logsRes = await Promise.all(
        list.map((f) => fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(f.id)}`).then((r) => r.json()))
      );
      const map: Record<string, FunnelDailyLog[]> = {};
      list.forEach((f, i) => { map[f.id] = logsRes[i]?.logs ?? []; });
      setLogsByFunnel(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load funnels.');
    } finally {
      setLoading(false);
    }
  };

  // Resolve a funnel's product id. New funnels carry productId directly;
  // legacy funnels only have productName, so we fall back to a name lookup.
  const productIdByName = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => { if (p.productName) m.set(p.productName, p.id); });
    return m;
  }, [products]);
  const productIds = useMemo(() => new Set(products.map((p) => p.id)), [products]);
  const resolveProductId = (f: Funnel): string | undefined => {
    if (f.productId && productIds.has(f.productId)) return f.productId;
    return productIdByName.get(f.productName);
  };
  const productById = useMemo(() => {
    const m = new Map<string, ProductTrackerEntry>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);
  const resolveProduct = (f: Funnel): ProductTrackerEntry | undefined => {
    const id = resolveProductId(f);
    return id ? productById.get(id) : undefined;
  };
  const beroasFor = (f: Funnel): number => effectiveBeroas(f, resolveProduct(f));

  // ── Derived data ─────────────────────────────────────────────────────────
  const productOptions = useMemo(
    () => Array.from(new Set(funnels.map((f) => f.productName).filter(Boolean))).sort(),
    [funnels]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return funnels.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (filterProduct !== 'all' && f.productName !== filterProduct) return false;
      if (q) {
        const hay = [f.productName, f.funnelishUrl, f.notes].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const sd = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (sd !== 0) return sd;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [funnels, statusFilter, filterProduct, search]);

  // Filtered logs view — when a specific date is picked, scope all aggregations to that day.
  const logsScoped = useMemo(() => {
    if (!filterDate) return logsByFunnel;
    const out: Record<string, FunnelDailyLog[]> = {};
    for (const id of Object.keys(logsByFunnel)) {
      out[id] = (logsByFunnel[id] ?? []).filter((l) => l.date === filterDate);
    }
    return out;
  }, [logsByFunnel, filterDate]);

  // KPIs across all funnels (not filtered) — performance scoreboard
  const summary = useMemo(() => {
    let liveCount = 0;
    let winCount = 0;
    const roasValues: number[] = [];
    const winRows: Array<{ roas: number; beroas: number }> = [];
    funnels.forEach((f) => {
      if (f.status === 'live' || f.status === 'testing') liveCount++;
      const logs = logsScoped[f.id] ?? [];
      const agg = aggregateLogs(logs);
      if (agg.latestRoas > 0) {
        const product = (f.productId && productById.get(f.productId))
          || products.find((p) => p.productName === f.productName);
        const fb = effectiveBeroas(f, product);
        roasValues.push(agg.latestRoas);
        winRows.push({ roas: agg.latestRoas, beroas: fb });
        if (isWinning(agg.latestRoas, fb)) winCount++;
      }
    });
    const avgRoas = roasValues.length > 0
      ? roasValues.reduce((s, v) => s + v, 0) / roasValues.length
      : 0;
    return {
      liveCount,
      winCount,
      hitRate: hitRate(winRows),
      avgRoas,
    };
  }, [funnels, logsScoped, productById, products]);

  const animatedHit = useCountUp(summary.hitRate, 500);
  const animatedRoas = useCountUp(summary.avgRoas, 500);
  const animatedWin = useCountUp(summary.winCount, 400);

  // Status counts for the pill row
  const statusCounts = useMemo(() => {
    const c: Record<FunnelStatus | 'all', number> = {
      all: funnels.length, live: 0, testing: 0, paused: 0, draft: 0, killed: 0,
    };
    funnels.forEach((f) => { c[f.status]++; });
    return c;
  }, [funnels]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleAddFunnel = async (input: NewFunnelInput) => {
    try {
      const res = await fetch('/api/funnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setFunnels((prev) => [data.funnel, ...prev]);
      setLogsByFunnel((prev) => ({ ...prev, [data.funnel.id]: [] }));
      setShowAddModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add LP.');
    }
  };

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <FunnelIcon className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">LPs</h1>
            <p className="text-[11px] text-muted-foreground">
              Landing pages &amp; performance · {summary.liveCount} live of {funnels.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors',
                viewMode === 'list' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <FunnelIcon className="h-3 w-3" /> LPs
            </button>
            <button
              type="button"
              onClick={() => setViewMode('performance')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors',
                viewMode === 'performance' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BarChart3 className="h-3 w-3" /> Performance
            </button>
          </div>
          <motion.button
            onClick={() => setShowAddModal(true)}
            whileHover={{ y: -2, boxShadow: '0 14px 36px -14px rgba(167,139,250,0.55), 0 0 0 1px rgba(167,139,250,0.4)' }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90"
          >
            <span
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              aria-hidden
            />
            <span className="relative z-10 flex items-center gap-2">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span className="tracking-tight">Add LP</span>
            </span>
          </motion.button>
        </div>
      </div>

      {/* KPI tiles — gradient borders + hover glow, matching dossier aesthetic */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCell label="Live"        value={summary.liveCount.toLocaleString('en-IN')} accent="emerald" delay={0} />
        <StatCell label="Winning"     value={Math.round(animatedWin).toLocaleString('en-IN')} hint="ROAS ≥ BEROAS+1" accent="violet" delay={0.05} />
        <StatCell label="Hit rate"    value={`${animatedHit.toFixed(0)}%`} accent="sky" delay={0.1} />
        <StatCell label="Avg ROAS"    value={animatedRoas > 0 ? `${animatedRoas.toFixed(2)}x` : '—'} accent="amber" delay={0.15} />
      </div>

      <DateFilterStrip filterDate={filterDate} onChange={setFilterDate} />

{viewMode === 'performance' ? (
        <PerformanceView funnels={funnels} logsByFunnel={logsScoped} products={products} />
      ) : (
        <>
      {/* Status pills + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <FilterPill label="All" count={statusCounts.all} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          {STATUS_OPTIONS.map((s) => (
            <FilterPill
              key={s.value}
              label={s.label}
              count={statusCounts[s.value]}
              active={statusFilter === s.value}
              onClick={() => setStatusFilter(s.value)}
              tone={s.tone}
            />
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="form-input py-1.5 text-[12px] w-40"
          >
            <option value="all">All products</option>
            {productOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="form-input pl-8 py-1.5 text-[12px] w-44"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/70 hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Card grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[140px] rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <FunnelIcon className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-[13px] font-medium text-foreground">
            {funnels.length === 0 ? 'No LPs yet' : 'No LPs match your filters'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {funnels.length === 0
              ? 'Click "Add LP" to register your first one.'
              : 'Try clearing a filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((f, i) => {
            const logs = logsScoped[f.id] ?? [];
            const agg = aggregateLogs(logs);
            const fb = beroasFor(f);
            const winning = isWinning(agg.latestRoas, fb);
            const tone = TONE[STATUS_OPTIONS.find((s) => s.value === f.status)?.tone ?? 'gray'];
            const linked = !!resolveProductId(f);
            return (
              <FunnelCard
                key={f.id}
                funnel={f}
                beroas={fb}
                latestRoas={agg.latestRoas}
                lastLogDate={agg.lastLogDate}
                totalOrders={agg.totalOrders}
                winning={winning}
                tone={tone}
                linked={linked}
                index={i}
              />
            );
          })}
        </div>
      )}

        </>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · money tracking lives in Finance (separate page)
      </p>

      {/* Add funnel modal */}
      {showAddModal && (
        <AddFunnelModal
          products={products}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddFunnel}
        />
      )}

    </PageTransition>
  );
}

// ── Modern stat tile — gradient hover, colored border, count-up friendly ──

function StatCell({ label, value, hint, accent, delay = 0 }: {
  label: string; value: string; hint?: string;
  accent: 'emerald' | 'amber' | 'sky' | 'violet';
  delay?: number;
}) {
  const text = {
    emerald: 'text-emerald-400',
    amber:   'text-amber-400',
    sky:     'text-sky-400',
    violet:  'text-violet-400',
  }[accent];
  const border = {
    emerald: 'border-emerald-500/30',
    amber:   'border-amber-500/30',
    sky:     'border-sky-500/30',
    violet:  'border-violet-500/30',
  }[accent];
  const glow = {
    emerald: '#34d399',
    amber:   '#fbbf24',
    sky:     '#38bdf8',
    violet:  '#a78bfa',
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
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: glow }} aria-hidden />
      </div>
      <p className={cn('relative z-10 mt-2 text-[24px] font-semibold leading-none tabular-nums tracking-tight', text)}>{value}</p>
      {hint && <p className="relative z-10 mt-1.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </motion.div>
  );
}

// ── Date filter strip — themed calendar with quick chips ────────────────────

function DateFilterStrip({ filterDate, onChange }: { filterDate: string; onChange: (d: string) => void }) {
  const { today, yest } = useMemo(() => {
    const now = new Date();
    const fmtIST = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    return { today: fmtIST(now), yest: fmtIST(new Date(now.getTime() - 86_400_000)) };
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.18 }}
      className="flex flex-wrap items-center gap-2"
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Performance for</p>
      <DateChip active={filterDate === ''} onClick={() => onChange('')}>All time</DateChip>
      <DateChip active={filterDate === today} onClick={() => onChange(today)}>Today</DateChip>
      <DateChip active={filterDate === yest} onClick={() => onChange(yest)}>Yesterday</DateChip>
      <DatePicker value={filterDate} onChange={onChange} placeholder="Pick a day" compact />
      {filterDate && (
        <span className="text-[10px] text-emerald-400">Viewing {filterDate} only</span>
      )}
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

// ── Filter pill ────────────────────────────────────────────────────────────

function FilterPill({ label, count, active, onClick, tone = 'gray' }: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'gray' | 'amber' | 'emerald' | 'sky' | 'rose';
}) {
  const t = TONE[tone];
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition',
        active
          ? cn(t.bg, t.border, t.text)
          : 'border-border bg-card text-muted-foreground hover:text-foreground'
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

// ── Funnel card ────────────────────────────────────────────────────────────

function FunnelCard({
  funnel: f, beroas, latestRoas, lastLogDate, totalOrders, winning, tone, linked, index,
}: {
  funnel: Funnel;
  beroas: number;
  latestRoas: number;
  lastLogDate: string;
  totalOrders: number;
  winning: boolean;
  tone: { text: string; bg: string; border: string; bar: string; dot: string };
  linked: boolean;
  index: number;
}) {
  const hasData = latestRoas > 0;
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === f.status)?.label ?? f.status;
  const winThreshold = beroas > 0 ? beroas + 1 : 0;
  const progress = winThreshold > 0 && latestRoas > 0 ? Math.min(1, latestRoas / (winThreshold * 1.1)) : 0;
  const winBorder = winning ? 'border-emerald-500/40 hover:border-emerald-500/60' : 'border-border hover:border-border/80';
  const winGlow = winning ? '0 14px 40px -16px #34d39955, 0 0 0 1px #34d39933' : undefined;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.03, 0.3), ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3, boxShadow: winGlow }}
    >
    <Link
      href={`/funnels/${f.id}`}
      className={cn(
        'group relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 text-left transition-colors',
        winBorder
      )}
    >
      {/* Status accent bar (top, gradient when winning) */}
      <div className={cn('absolute inset-x-0 top-0 h-[3px]', winning ? 'bg-gradient-to-r from-emerald-500/60 via-emerald-400 to-emerald-500/60' : tone.bar)} aria-hidden />

      {/* Ambient corner glow — emerald for winners */}
      {winning && (
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-60"
          style={{ background: 'radial-gradient(circle, #34d39966, transparent 70%)' }}
          aria-hidden
        />
      )}

      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold text-foreground">{f.productName}</p>
            {!linked && (
              <span title="Not linked to a product — open to fix" className="shrink-0">
                <AlertTriangle className="h-3 w-3 text-amber-400" />
              </span>
            )}
          </div>
          <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background/40 px-2 py-0.5">
            <Link2 className={cn('h-3 w-3 shrink-0', f.funnelishUrl ? 'text-sky-400' : 'text-muted-foreground/40')} aria-hidden />
            <span className="truncate text-[11px] font-medium text-muted-foreground">
              {f.funnelishUrl ? f.funnelishUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'No LP link'}
            </span>
          </div>
        </div>
        <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', tone.bg, tone.border, tone.text)}>
          <span className={cn('h-1 w-1 rounded-full', tone.dot)} />
          {statusLabel}
        </span>
      </div>

      <div className="relative z-10 flex items-end justify-between">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">ROAS</p>
          <p className={cn(
            'text-3xl font-semibold leading-none tabular-nums tracking-tight',
            !hasData ? 'text-muted-foreground/40' : winning ? 'text-emerald-400' : 'text-foreground'
          )}>
            {hasData ? `${latestRoas.toFixed(2)}x` : '—'}
          </p>
        </div>
        {!hasData ? (
          <span className="text-[10px] text-muted-foreground/60">no logs</span>
        ) : winning ? (
          <motion.span
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" /> Winning
          </motion.span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Below
          </span>
        )}
      </div>

      {/* Progress bar — ROAS vs win threshold */}
      {hasData && winThreshold > 0 && (
        <div className="relative z-10">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-border/60">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className={cn('h-full rounded-full', winning ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : 'bg-rose-400/70')}
            />
            {/* Win threshold marker */}
            <span
              className="absolute top-0 h-full w-px bg-foreground/40"
              style={{ left: `${(1 / 1.1) * 100}%` }}
              aria-hidden
              title={`Win at ${winThreshold.toFixed(2)}x`}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground/70">
            <span>0</span>
            <span className="tabular-nums">Win {winThreshold.toFixed(2)}x</span>
          </div>
        </div>
      )}

      <div className="relative z-10 flex items-center justify-between border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground">
        <span>BEROAS <span className="font-semibold tabular-nums text-foreground">{beroas > 0 ? `${beroas.toFixed(2)}x` : '—'}</span></span>
        <span>{totalOrders > 0 ? `${totalOrders} orders` : 'no orders'}</span>
        <span>{lastLogDate || '—'}</span>
      </div>
    </Link>
    </motion.div>
  );
}


function FormCell({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
        {hint && <span className="ml-1.5 normal-case tracking-normal text-muted-foreground/60">{hint}</span>}
      </label>
      {children}
    </div>
  );
}


// ── Performance view ────────────────────────────────────────────────────────

function PerformanceView({
  funnels, logsByFunnel, products,
}: {
  funnels: Funnel[];
  logsByFunnel: Record<string, FunnelDailyLog[]>;
  products: ProductTrackerEntry[];
}) {
  const productById = useMemo(() => {
    const m = new Map<string, ProductTrackerEntry>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);
  const productByName = useMemo(() => {
    const m = new Map<string, ProductTrackerEntry>();
    products.forEach((p) => { if (p.productName) m.set(p.productName, p); });
    return m;
  }, [products]);

  type EnrichedFunnel = {
    funnel: Funnel;
    roasShown: number;
    beroas: number;
    spend: number;
    revenue: number;
    profit: number;
    orders: number;
    hasData: boolean;
    winning: boolean;
  };

  type Aggregate = {
    funnelCount: number;
    funnelsWithData: number;
    winners: number;
    spend: number;
    revenue: number;
    orders: number;
  };

  const enriched: EnrichedFunnel[] = useMemo(() => {
    return funnels.map((f) => {
      const logs = logsByFunnel[f.id] ?? [];
      const agg = aggregateLogs(logs);
      let spend = 0, revenue = 0, expense = 0, orders = 0;
      for (const l of logs) {
        spend += Number(l.spend) || 0;
        revenue += Number(l.revenue) || 0;
        expense += Number(l.expense) || 0;
        orders += Number(l.orders) || 0;
      }
      const profit = revenue - spend - expense;
      const blendedRoas = spend > 0 ? revenue / spend : 0;
      const roasShown = agg.latestRoas > 0 ? agg.latestRoas : blendedRoas;
      const hasData = roasShown > 0 || spend > 0;
      const product = (f.productId && productById.get(f.productId)) || productByName.get(f.productName);
      const beroas = effectiveBeroas(f, product);
      const winning = isWinning(roasShown, beroas);
      return { funnel: f, roasShown, beroas, spend, revenue, profit, orders, hasData, winning };
    });
  }, [funnels, logsByFunnel, productById, productByName]);

  const grand = useMemo(() => {
    let spend = 0, revenue = 0, profit = 0, winners = 0, withData = 0;
    enriched.forEach((e) => {
      spend += e.spend;
      revenue += e.revenue;
      profit += e.profit;
      if (e.hasData) {
        withData++;
        if (e.winning) winners++;
      }
    });
    return {
      spend, revenue, profit,
      blendedRoas: spend > 0 ? revenue / spend : 0,
      hitRate: withData > 0 ? (winners / withData) * 100 : 0,
      winners,
      withData,
    };
  }, [enriched]);

  const animSpend = useCountUp(grand.spend, 600);
  const animRevenue = useCountUp(grand.revenue, 600);
  const animProfit = useCountUp(grand.profit, 600);
  const animRoas = useCountUp(grand.blendedRoas, 600);

  const byProduct = useMemo(() => {
    const map = new Map<string, Aggregate>();
    enriched.forEach((e) => {
      const key = e.funnel.productName || '—';
      const a = map.get(key) ?? { funnelCount: 0, funnelsWithData: 0, winners: 0, spend: 0, revenue: 0, orders: 0 };
      a.funnelCount++;
      if (e.hasData) {
        a.funnelsWithData++;
        if (e.winning) a.winners++;
      }
      a.spend += e.spend;
      a.revenue += e.revenue;
      a.orders += e.orders;
      map.set(key, a);
    });
    return Array.from(map.entries())
      .map(([product, a]) => ({
        product, ...a,
        profit: a.revenue - a.spend,
        blendedRoas: a.spend > 0 ? a.revenue / a.spend : 0,
        hitRate: a.funnelsWithData > 0 ? (a.winners / a.funnelsWithData) * 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [enriched]);

  // Partition funnels with data by whether they're WINNING (ROAS ≥ BEROAS+1),
  // not just by ranking. This way a winning funnel never appears in
  // Underperformers, and a losing funnel never appears in Top performers —
  // a funnel can only be in one bucket.
  const { top5, bottom5 } = useMemo(() => {
    const withData = enriched.filter((e) => e.hasData);
    const winners = withData.filter((e) => e.winning).sort((a, b) => b.roasShown - a.roasShown);
    const losers = withData.filter((e) => !e.winning).sort((a, b) => a.roasShown - b.roasShown);
    return { top5: winners.slice(0, 5), bottom5: losers.slice(0, 5) };
  }, [enriched]);

  const hasAnyData = grand.spend > 0 || grand.revenue > 0;

  return (
    <div className="space-y-4">
      {/* Money KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <PerfMoneyTile label="Ad spend" value={animSpend} accent="amber" delay={0} />
        <PerfMoneyTile label="Revenue" value={animRevenue} accent="sky" delay={0.05} />
        <PerfMoneyTile label="Profit" value={animProfit} accent={animProfit >= 0 ? 'emerald' : 'rose'} delay={0.1} signed />
        <PerfRoasTile label="Blended ROAS" roas={animRoas} hit={grand.hitRate} winners={grand.winners} delay={0.15} />
      </div>

      {!hasAnyData && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <BarChart3 className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-[13px] font-medium text-foreground">No performance data yet</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Log daily ROAS / spend / revenue inside any LP to populate this view.</p>
        </div>
      )}

      {hasAnyData && (
        <>
          <PerfBreakdown
            title="By product"
            icon={<FunnelIcon className="h-3.5 w-3.5" />}
            rows={byProduct.map((b) => ({
              label: b.product,
              funnelCount: b.funnelCount,
              roas: b.blendedRoas,
              hit: b.hitRate,
              spend: b.spend,
              revenue: b.revenue,
              profit: b.profit,
            }))}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FunnelRanking title="Top performers" tone="emerald" funnels={top5} />
            <FunnelRanking title="Underperformers" tone="rose" funnels={bottom5} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Money KPI tile (used inside PerformanceView) ───────────────────────────

function PerfMoneyTile({ label, value, accent, delay = 0, signed }: {
  label: string;
  value: number;
  accent: 'emerald' | 'amber' | 'sky' | 'rose';
  delay?: number;
  signed?: boolean;
}) {
  const text = { emerald: 'text-emerald-400', amber: 'text-amber-400', sky: 'text-sky-400', rose: 'text-rose-400' }[accent];
  const border = { emerald: 'border-emerald-500/30', amber: 'border-amber-500/30', sky: 'border-sky-500/30', rose: 'border-rose-500/30' }[accent];
  const glow = { emerald: '#34d399', amber: '#fbbf24', sky: '#38bdf8', rose: '#fb7185' }[accent];
  const display = `${signed && value < 0 ? '−' : ''}${formatINR(Math.abs(value))}`;
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
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: glow }} aria-hidden />
      </div>
      <p className={cn('relative z-10 mt-2 text-[22px] font-semibold leading-none tabular-nums tracking-tight', text)}>{display}</p>
      <p className="relative z-10 mt-1.5 text-[10px] text-muted-foreground/70">across LPs</p>
    </motion.div>
  );
}

function PerfRoasTile({ label, roas, hit, winners, delay = 0 }: {
  label: string; roas: number; hit: number; winners: number; delay?: number;
}) {
  const tone = roas >= 2 ? 'emerald' : roas >= 1 ? 'amber' : 'rose';
  const text = { emerald: 'text-emerald-400', amber: 'text-amber-400', rose: 'text-rose-400' }[tone];
  const border = { emerald: 'border-emerald-500/30', amber: 'border-amber-500/30', rose: 'border-rose-500/30' }[tone];
  const glow = { emerald: '#34d399', amber: '#fbbf24', rose: '#fb7185' }[tone];
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
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: glow }} aria-hidden />
      </div>
      <p className={cn('relative z-10 mt-2 text-[22px] font-semibold leading-none tabular-nums tracking-tight', text)}>
        {roas > 0 ? `${roas.toFixed(2)}x` : '—'}
      </p>
      <p className="relative z-10 mt-1.5 text-[10px] text-muted-foreground/70">
        Hit rate <span className="font-semibold text-foreground">{hit.toFixed(0)}%</span> · {winners} winning
      </p>
    </motion.div>
  );
}

// ── Breakdown card — country / product, with visual share bars ──────────────

function PerfBreakdown({ title, icon, rows }: {
  title: string;
  icon: React.ReactNode;
  rows: Array<{ label: string; funnelCount: number; roas: number; hit: number; spend: number; revenue: number; profit: number }>;
}) {
  const maxSpend = useMemo(() => Math.max(0, ...rows.map((r) => r.spend)), [rows]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </h3>
        <span className="text-[10px] text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((r, i) => {
            const sharePct = maxSpend > 0 ? (r.spend / maxSpend) * 100 : 0;
            const roasTone = r.roas >= 2 ? 'text-emerald-400' : r.roas >= 1 ? 'text-amber-400' : r.roas > 0 ? 'text-rose-400' : 'text-muted-foreground/50';
            const profitTone = r.profit > 0 ? 'text-emerald-400' : r.profit < 0 ? 'text-rose-400' : 'text-muted-foreground';
            return (
              <motion.li
                key={r.label}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.25) }}
                className="group relative px-4 py-3 transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-foreground">{r.label}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {r.funnelCount} LP{r.funnelCount === 1 ? '' : 's'}
                      <span className="text-muted-foreground/40"> · </span>
                      hit <span className="tabular-nums text-foreground">{r.hit.toFixed(0)}%</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn('text-[14px] font-semibold leading-none tabular-nums', roasTone)}>
                      {r.roas > 0 ? `${r.roas.toFixed(2)}x` : '—'}
                    </p>
                    <p className={cn('mt-1 text-[10px] tabular-nums', profitTone)}>
                      {r.profit >= 0 ? '+' : '−'}{formatINR(Math.abs(r.profit))}
                    </p>
                  </div>
                </div>
                {/* Spend share bar */}
                <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-border/40">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${sharePct}%` }}
                    transition={{ duration: 0.7, delay: Math.min(i * 0.04, 0.3), ease: [0.22, 1, 0.36, 1] }}
                    className={cn('h-full rounded-full', r.roas >= 2 ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : r.roas >= 1 ? 'bg-gradient-to-r from-amber-500 to-amber-300' : 'bg-gradient-to-r from-rose-500/80 to-rose-400/60')}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground/70">
                  <span>spend {formatINR(r.spend)}</span>
                  <span>rev {formatINR(r.revenue)}</span>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}

// ── Ranking list — top / bottom performing funnels ─────────────────────────

function FunnelRanking({ title, tone, funnels }: {
  title: string;
  tone: 'emerald' | 'rose';
  funnels: Array<{ funnel: Funnel; roasShown: number; beroas: number; profit: number; winning: boolean }>;
}) {
  const accent = tone === 'emerald' ? '#34d399' : '#fb7185';
  const borderTone = tone === 'emerald' ? 'border-emerald-500/30' : 'border-rose-500/30';
  const maxRoas = useMemo(() => Math.max(0.01, ...funnels.map((f) => f.roasShown)), [funnels]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn('relative overflow-hidden rounded-xl border bg-card', borderTone)}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-20 blur-2xl"
        style={{ background: `radial-gradient(circle, ${accent}66, transparent 70%)` }}
        aria-hidden
      />
      <div className="relative z-10 flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <h3 className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} aria-hidden />
          {title}
        </h3>
        <span className="text-[10px] text-muted-foreground">{funnels.length}</span>
      </div>
      {funnels.length === 0 ? (
        <p className="relative z-10 px-4 py-6 text-center text-[12px] text-muted-foreground">No LPs with data yet.</p>
      ) : (
        <ul className="relative z-10 divide-y divide-border/60">
          {funnels.map(({ funnel: f, roasShown, beroas, profit, winning }, i) => {
            const pct = (roasShown / maxRoas) * 100;
            const profitTone = profit > 0 ? 'text-emerald-400' : profit < 0 ? 'text-rose-400' : 'text-muted-foreground';
            return (
              <motion.li
                key={f.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
              >
                <Link
                  href={`/funnels/${f.id}`}
                  className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
                >
                  <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums',
                    tone === 'emerald' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400')}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-foreground group-hover:text-primary">{f.productName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {beroas > 0 && <span className="text-[10px] text-muted-foreground">BEROAS {beroas.toFixed(2)}x</span>}
                    </div>
                    <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-border/40">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, delay: Math.min(i * 0.05, 0.3) }}
                        className="h-full rounded-full"
                        style={{ background: accent }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn('text-[14px] font-semibold leading-none tabular-nums',
                      winning ? 'text-emerald-400' : tone === 'rose' ? 'text-rose-400' : 'text-foreground')}>
                      {roasShown.toFixed(2)}x
                    </p>
                    <p className={cn('mt-0.5 text-[10px] tabular-nums', profitTone)}>
                      {profit >= 0 ? '+' : '−'}{formatINR(Math.abs(profit))}
                    </p>
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}

// ── Add Funnel modal ────────────────────────────────────────────────────────

type NewFunnelInput = {
  productId: string;
  productName: string;
  funnelishUrl: string;
  inspoLink: string;
  status: FunnelStatus;
  launchDate: string;
  notes: string;
};

function AddFunnelModal({
  products,
  onClose,
  onSubmit,
}: {
  products: ProductTrackerEntry[];
  onClose: () => void;
  onSubmit: (input: NewFunnelInput) => Promise<void>;
}) {
  const [productId, setProductId] = useState<string>(products[0]?.id ?? '');
  const [funnelishUrl, setFunnelishUrl] = useState('');
  const [inspoLink, setInspoLink] = useState('');
  const [status, setStatus] = useState<FunnelStatus>('draft');
  const [launchDate, setLaunchDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedProduct = products.find((p) => p.id === productId);

  // BEROAS + margin are the PRODUCT's economics — every LP of this product
  // inherits them. Shown read-only so you know what you're launching against.
  const econ = selectedProduct ? productEconomicsOf(selectedProduct) : null;
  const beroasComputed = econ && Number.isFinite(econ.beroas) ? econ.beroas : 0;
  const grossMarginPct = econ ? econ.grossMarginPct : 0;
  const winThreshold = beroasComputed > 0 ? beroasComputed + 1 : 0;
  const productPriced = !!selectedProduct
    && (Number(selectedProduct.sellingPrice) || 0) > 0
    && (Number(selectedProduct.deliveryRate) || 0) > 0;

  const submit = async () => {
    if (!productId || !selectedProduct) { setErr('Pick a product from the tracker.'); return; }
    setErr(null);
    setSaving(true);
    try {
      await onSubmit({
        productId,
        productName: selectedProduct.productName,
        funnelishUrl: funnelishUrl.trim(),
        inspoLink: inspoLink.trim(),
        status,
        launchDate,
        notes: notes.trim(),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add LP.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* Header — neutral steel tone */}
        <div className="relative overflow-hidden border-b border-border bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 px-7 pt-6 pb-5">
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <motion.div
                initial={{ scale: 0.85 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 220 }}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30"
              >
                <FunnelIcon className="h-5 w-5 text-primary" />
              </motion.div>
              <div>
                <h2 className="text-[18px] font-semibold tracking-tight text-foreground">Launch a new LP</h2>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Link a product — its BEROAS &amp; margin carry to every LP and ad.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-7 py-5">
          {products.length === 0 ? (
            <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-5 text-center">
              <p className="text-[13px] font-semibold text-foreground">No products in your tracker yet</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Every LP links to a product. Create one first, then come back.
              </p>
              <Link
                href="/product-tracker"
                className="mt-3 inline-flex items-center gap-1 rounded-md bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/25"
              >
                Open Products page <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <FormCell label="Product" hint="from your Products tracker">
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="form-input"
                autoFocus
              >
                {(() => {
                  const byStage = new Map<string, ProductTrackerEntry[]>();
                  products.forEach((p) => {
                    const k = p.productStage || '(no stage)';
                    if (!byStage.has(k)) byStage.set(k, []);
                    byStage.get(k)!.push(p);
                  });
                  const stageOrder = [
                    'Winner - Moved To OPS',
                    'Testing Ads',
                    'Testing Store Page Done',
                    'Research Phase',
                    'Dropped',
                    '(no stage)',
                  ];
                  return stageOrder
                    .filter((s) => byStage.has(s))
                    .map((s) => (
                      <optgroup key={s} label={s}>
                        {byStage.get(s)!.map((p) => (
                          <option key={p.id} value={p.id}>{p.productName || '(unnamed)'}</option>
                        ))}
                      </optgroup>
                    ));
                })()}
              </select>
              <Link
                href="/product-tracker"
                className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80"
              >
                Manage products <ArrowRight className="h-3 w-3" />
              </Link>
            </FormCell>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormCell label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as FunnelStatus)} className="form-input">
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </FormCell>
            <FormCell label="Launch date (optional)">
              <DatePicker value={launchDate} onChange={(d) => setLaunchDate(d)} />
            </FormCell>
          </div>

          <FormCell label="LP link" hint="the landing page URL">
            <input value={funnelishUrl} onChange={(e) => setFunnelishUrl(e.target.value)} className="form-input" placeholder="https://…" />
          </FormCell>

          <FormCell label="Inspiration (optional)" hint="competitor LP / swipe / doc">
            <input value={inspoLink} onChange={(e) => setInspoLink(e.target.value)} className="form-input" placeholder="https://…" />
          </FormCell>

          {/* Product economics — read-only; inherited by every LP & ad */}
          <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
            <div className="relative z-10 mb-3 flex items-center justify-between">
              <p className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em] text-primary/90">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_#a78bfa]" />
                Product economics
              </p>
              {!productPriced && (
                <span className="text-[10px] text-amber-400">set price &amp; delivery on the product</span>
              )}
            </div>
            <div className="relative z-10 grid grid-cols-3 gap-2">
              <PreviewTile label="Gross margin" value={productPriced ? `${grossMarginPct.toFixed(1)}%` : '—'} tone="sky" />
              <PreviewTile label="BEROAS" value={beroasComputed > 0 ? `${beroasComputed.toFixed(2)}x` : '—'} tone="violet" />
              <PreviewTile label="Win at" value={winThreshold > 0 ? `${winThreshold.toFixed(2)}x` : '—'} tone="emerald" />
            </div>
            <p className="relative z-10 mt-2.5 text-[10px] text-muted-foreground/70">
              From the product&apos;s COGS · price · delivery rate (3PL model) — an LP wins when ROAS ≥ BEROAS + 1
            </p>
          </div>

          <FormCell label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="form-input" />
          </FormCell>

          {err && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/50 bg-card/60 px-7 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-card px-4 py-2 text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            Cancel
          </button>
          <motion.button
            onClick={submit}
            disabled={saving || products.length === 0}
            whileHover={!saving && products.length > 0 ? { y: -2, boxShadow: '0 14px 36px -14px rgba(167,139,250,0.55), 0 0 0 1px rgba(167,139,250,0.4)' } : undefined}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-lg"
          >
            <span
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              aria-hidden
            />
            <span className="relative z-10 flex items-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
              <span className="tracking-tight">{saving ? 'Creating…' : 'Create LP'}</span>
            </span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

function PreviewTile({ label, value, tone }: {
  label: string;
  value: string;
  tone: 'sky' | 'violet' | 'emerald';
}) {
  const c = {
    sky:     { text: 'text-sky-400',     border: 'border-sky-500/25',     dot: 'bg-sky-400' },
    violet:  { text: 'text-violet-400',  border: 'border-violet-500/30',  dot: 'bg-violet-400' },
    emerald: { text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  }[tone];
  return (
    <div className={cn('rounded-lg border bg-card/40 px-3 py-2', c.border)}>
      <p className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className={cn('h-1 w-1 rounded-full', c.dot)} />
        {label}
      </p>
      <p className={cn('mt-1 text-[15px] font-semibold leading-none tabular-nums tracking-tight', c.text)}>{value}</p>
    </div>
  );
}
