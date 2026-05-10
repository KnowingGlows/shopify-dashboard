'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Funnel as FunnelIcon, Plus, Trash2, Check, X, Loader2,
  AlertTriangle, Globe, Search, ArrowRight, BarChart3,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import { MARKETS, getLanguagesForCountry, getCountries } from '@/lib/markets';
import { isWinning, aggregateLogs, hitRate, effectiveBeroas, isBeroasAutoComputed } from '@/lib/funnels';
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

function getISTDate(date?: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date ?? new Date());
}

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
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [openFunnelId, setOpenFunnelId] = useState<string | null>(null);

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

  const refreshLogs = async (funnelId: string) => {
    try {
      const res = await fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(funnelId)}`);
      const data = await res.json();
      setLogsByFunnel((prev) => ({ ...prev, [funnelId]: data.logs ?? [] }));
    } catch { /* ignore */ }
  };

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
      if (filterCountry !== 'all' && f.country !== filterCountry) return false;
      if (q) {
        const hay = [f.productName, f.country, f.language, f.notes].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const sd = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (sd !== 0) return sd;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [funnels, statusFilter, filterProduct, filterCountry, search]);

  // KPIs across all funnels (not filtered) — performance scoreboard
  const summary = useMemo(() => {
    let liveCount = 0;
    let winCount = 0;
    const roasValues: number[] = [];
    const winRows: Array<{ roas: number; beroas: number }> = [];
    funnels.forEach((f) => {
      if (f.status === 'live') liveCount++;
      const logs = logsByFunnel[f.id] ?? [];
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
  }, [funnels, logsByFunnel, productById, products]);

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
      setError(err instanceof Error ? err.message : 'Failed to add funnel.');
    }
  };

  const updateFunnel = async (id: string, patch: Partial<Funnel>) => {
    try {
      const res = await fetch('/api/funnels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setFunnels((prev) => prev.map((f) => (f.id === id ? { ...f, ...data.funnel } : f)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update funnel.');
    }
  };

  const deleteFunnel = async (id: string) => {
    if (!confirm('Delete this funnel and all its logs?')) return;
    try {
      const res = await fetch('/api/funnels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setFunnels((prev) => prev.filter((f) => f.id !== id));
      setLogsByFunnel((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setOpenFunnelId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete funnel.');
    }
  };

  const openFunnel = openFunnelId ? funnels.find((f) => f.id === openFunnelId) ?? null : null;

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <FunnelIcon className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Funnels</h1>
            <p className="text-[11px] text-muted-foreground">
              Launches &amp; performance · {summary.liveCount} live of {funnels.length}
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
              <FunnelIcon className="h-3 w-3" /> Funnels
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
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/25"
          >
            <Plus className="h-3.5 w-3.5" /> Add Funnel
          </button>
        </div>
      </div>

      {/* Compact stat strip — performance only */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4"
      >
        <StatCell label="Live" value={summary.liveCount.toLocaleString('en-IN')} accent="emerald" />
        <StatCell label="Winning" value={Math.round(animatedWin).toLocaleString('en-IN')} hint="ROAS ≥ BEROAS+1" accent="violet" />
        <StatCell label="Hit rate" value={`${animatedHit.toFixed(0)}%`} accent="sky" />
        <StatCell label="Avg ROAS" value={animatedRoas > 0 ? `${animatedRoas.toFixed(2)}x` : '—'} accent="amber" />
      </motion.div>

{viewMode === 'performance' ? (
        <PerformanceView funnels={funnels} logsByFunnel={logsByFunnel} products={products} />
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
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="form-input py-1.5 text-[12px] w-40"
          >
            <option value="all">All countries</option>
            {getCountries().map((c) => <option key={c} value={c}>{c}</option>)}
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
            {funnels.length === 0 ? 'No funnels yet' : 'No funnels match your filters'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {funnels.length === 0
              ? 'Click "Add Funnel" to register your first one.'
              : 'Try clearing a filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((f, i) => {
            const logs = logsByFunnel[f.id] ?? [];
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
                onOpen={() => setOpenFunnelId(f.id)}
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

      {/* Detail drawer */}
      <FunnelDrawer
        funnel={openFunnel}
        logs={openFunnel ? logsByFunnel[openFunnel.id] ?? [] : []}
        productId={openFunnel ? resolveProductId(openFunnel) : undefined}
        product={openFunnel ? resolveProduct(openFunnel) : undefined}
        products={products}
        beroas={openFunnel ? beroasFor(openFunnel) : 0}
        onClose={() => setOpenFunnelId(null)}
        onUpdate={(patch) => openFunnel && updateFunnel(openFunnel.id, patch)}
        onDelete={() => openFunnel && deleteFunnel(openFunnel.id)}
        onLogsChanged={() => openFunnel && refreshLogs(openFunnel.id)}
      />
    </PageTransition>
  );
}

// ── Compact stat cell ──────────────────────────────────────────────────────

function StatCell({ label, value, hint, accent }: {
  label: string; value: string; hint?: string;
  accent: 'emerald' | 'amber' | 'sky' | 'violet';
}) {
  const map = {
    emerald: 'text-emerald-400',
    amber:   'text-amber-400',
    sky:     'text-sky-400',
    violet:  'text-violet-400',
  };
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-[20px] font-semibold leading-none tabular-nums tracking-tight', map[accent])}>{value}</p>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
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
  funnel: f, beroas, latestRoas, lastLogDate, totalOrders, winning, tone, linked, index, onOpen,
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
  onOpen: () => void;
}) {
  const hasData = latestRoas > 0;
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === f.status)?.label ?? f.status;
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.3), ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      onClick={onOpen}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-border/80"
    >
      <div className={cn('absolute inset-x-0 top-0 h-[3px]', tone.bar)} aria-hidden />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold text-foreground">{f.productName}</p>
            {!linked && (
              <span title="Not linked to a product — open to fix" className="shrink-0">
                <AlertTriangle className="h-3 w-3 text-amber-400" />
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {f.country} · {f.language}
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', tone.bg, tone.border, tone.text)}>
          <span className={cn('h-1 w-1 rounded-full', tone.dot)} />
          {statusLabel}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">ROAS</p>
          <p className={cn(
            'text-2xl font-semibold leading-none tabular-nums tracking-tight',
            !hasData ? 'text-muted-foreground/50' : winning ? 'text-emerald-400' : 'text-foreground'
          )}>
            {hasData ? `${latestRoas.toFixed(2)}x` : '—'}
          </p>
        </div>
        {!hasData ? (
          <span className="text-[10px] text-muted-foreground/60">no logs</span>
        ) : winning ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Winning
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Below
          </span>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2.5 text-[10px] text-muted-foreground">
        <span>BEROAS <span className="font-semibold tabular-nums text-foreground">{beroas > 0 ? `${beroas.toFixed(2)}x` : '—'}</span></span>
        <span>{totalOrders > 0 ? `${totalOrders} orders` : 'no orders'}</span>
        <span>{lastLogDate || 'no logs'}</span>
      </div>
    </motion.button>
  );
}

// ── Funnel detail drawer ────────────────────────────────────────────────────

function FunnelDrawer({
  funnel, logs, productId, product, products, beroas, onClose, onUpdate, onDelete, onLogsChanged,
}: {
  funnel: Funnel | null;
  logs: FunnelDailyLog[];
  productId: string | undefined;
  product: ProductTrackerEntry | undefined;
  products: ProductTrackerEntry[];
  beroas: number;
  onClose: () => void;
  onUpdate: (patch: Partial<Funnel>) => void;
  onDelete: () => void;
  onLogsChanged: () => void;
}) {
  return (
    <AnimatePresence>
      {funnel && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-border bg-card shadow-2xl"
          >
            <FunnelDrawerContent
              funnel={funnel}
              logs={logs}
              productId={productId}
              product={product}
              products={products}
              beroas={beroas}
              onClose={onClose}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onLogsChanged={onLogsChanged}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function FunnelDrawerContent({
  funnel: f, logs, productId, product, products, beroas, onClose, onUpdate, onDelete, onLogsChanged,
}: {
  funnel: Funnel;
  logs: FunnelDailyLog[];
  productId: string | undefined;
  product: ProductTrackerEntry | undefined;
  products: ProductTrackerEntry[];
  beroas: number;
  onClose: () => void;
  onUpdate: (patch: Partial<Funnel>) => void;
  onDelete: () => void;
  onLogsChanged: () => void;
}) {
  const agg = aggregateLogs(logs);
  const winning = isWinning(agg.latestRoas, beroas);
  const winThreshold = beroas > 0 ? beroas + 1 : 0;
  const beroasAuto = isBeroasAutoComputed(f, product);

  const [date, setDate] = useState(getISTDate());
  const [roas, setRoas] = useState('');
  const [orders, setOrders] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tone = TONE[STATUS_OPTIONS.find((s) => s.value === f.status)?.tone ?? 'gray'];

  const addLog = async () => {
    if (!date) { setErr('Date is required.'); return; }
    if (!roas && !orders) { setErr('Enter at least ROAS or orders.'); return; }
    try {
      setSaving(true);
      setErr(null);
      const res = await fetch('/api/funnels/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnelId: f.id,
          date,
          roas: parseFloat(roas) || 0,
          orders: parseInt(orders, 10) || 0,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRoas(''); setOrders(''); setNotes('');
      onLogsChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add log.');
    } finally {
      setSaving(false);
    }
  };

  const removeLog = async (id: string) => {
    if (!confirm('Delete this log entry?')) return;
    try {
      const res = await fetch('/api/funnels/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      onLogsChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete log.');
    }
  };

  return (
    <>
      {/* Header */}
      <div className="relative">
        <div className={cn('absolute inset-x-0 top-0 h-[3px]', tone.bar)} aria-hidden />
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {productId ? (
              <Link
                href={`/product-tracker/${productId}`}
                className="group inline-flex max-w-full items-center gap-1.5 truncate text-base font-semibold text-foreground hover:text-primary"
              >
                <span className="truncate">{f.productName}</span>
                <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
              </Link>
            ) : (
              <p className="truncate text-base font-semibold text-foreground">{f.productName}</p>
            )}
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {f.country} · {f.language}
              {f.launchDate && <> · launched {f.launchDate}</>}
              {f.funnelishUrl && (
                <>
                  {' · '}
                  <a href={f.funnelishUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:text-primary/80">
                    <Globe className="h-3 w-3" /> Funnelish
                  </a>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={f.status}
              onChange={(e) => onUpdate({ status: e.target.value as FunnelStatus })}
              className="form-input py-1 text-[11px] w-28"
            >
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground transition hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 px-5 py-4">
          {/* Product link warning — surfaces unlinked legacy funnels */}
          {!productId && (
            <ProductLinkChip
              currentName={f.productName}
              products={products}
              onLink={(p) => onUpdate({ productId: p.id, productName: p.productName })}
            />
          )}

          {/* Per-market pricing editor — drives BEROAS auto-compute.
              Keyed on funnel.id so input state resets when switching funnels. */}
          <PricingEditor key={f.id} funnel={f} product={product} onSave={onUpdate} />

          {/* Performance summary */}
          <div className="grid grid-cols-3 gap-2">
            <PerfCell
              label="Latest ROAS"
              value={agg.latestRoas > 0 ? `${agg.latestRoas.toFixed(2)}x` : '—'}
              accent={agg.latestRoas > 0 ? (winning ? 'emerald' : 'rose') : undefined}
            />
            <PerfCell
              label="BEROAS"
              value={beroas > 0 ? `${beroas.toFixed(2)}x` : '—'}
              accent="primary"
              hint={beroasAuto ? 'auto from pricing' : beroas > 0 ? 'manual' : 'no pricing yet'}
            />
            <PerfCell
              label="Win threshold"
              value={winThreshold > 0 ? `${winThreshold.toFixed(2)}x` : '—'}
              hint="BEROAS + 1"
            />
          </div>

          {/* Add log inline form — performance only */}
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-medium text-foreground">Log a day</span>
              {err && <span className="ml-auto text-[10px] text-destructive">{err}</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <FormCell label="Date">
                <DatePicker value={date} onChange={(d) => setDate(d || getISTDate())} max={getISTDate()} compact />
              </FormCell>
              <FormCell label="ROAS (Meta)">
                <input type="number" min="0" inputMode="decimal" step="0.01" value={roas} onChange={(e) => setRoas(e.target.value)} className="form-input tabular-nums" placeholder="0.00" />
              </FormCell>
              <FormCell label="Orders">
                <input type="number" min="0" inputMode="numeric" value={orders} onChange={(e) => setOrders(e.target.value)} className="form-input tabular-nums" placeholder="0" />
              </FormCell>
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)…"
              className="form-input mt-2 text-[11px]"
            />
            <button
              onClick={addLog}
              disabled={saving}
              className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-primary/15 py-2 text-[12px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add log
            </button>
          </div>

          {/* Logs table */}
          {logs.length === 0 ? (
            <p className="px-1 py-4 text-center text-[11px] text-muted-foreground/60">No logs yet — add the first day above.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="tracker-table">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Date</th>
                    <th style={{ textAlign: 'right', width: 80 }}>ROAS</th>
                    <th style={{ textAlign: 'right', width: 70 }}>Orders</th>
                    <th style={{ width: 50 }}>Win</th>
                    <th>Notes</th>
                    <th style={{ width: 36, textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => {
                    const win = isWinning(l.roas, beroas);
                    return (
                      <tr key={l.id}>
                        <td><div className="px-3 py-2 text-[11px] tabular-nums text-foreground">{l.date}</div></td>
                        <td>
                          <div className={cn('px-3 py-2 text-right text-[11px] tabular-nums', l.roas === 0 ? 'text-muted-foreground/60' : win ? 'text-emerald-400' : 'text-foreground')}>
                            {l.roas > 0 ? `${l.roas.toFixed(2)}x` : '—'}
                          </div>
                        </td>
                        <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-foreground">{l.orders || '—'}</div></td>
                        <td>
                          <div className="px-3 py-2">
                            {l.roas === 0 ? <span className="text-[10px] text-muted-foreground/60">—</span> : win
                              ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" title="Winning" />
                              : <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" title="Below threshold" />}
                          </div>
                        </td>
                        <td><div className="px-3 py-2 text-[11px] text-muted-foreground truncate max-w-[160px]">{l.notes || '—'}</div></td>
                        <td>
                          <div className="flex items-center justify-end px-3 py-1.5">
                            <button onClick={() => removeLog(l.id)} className="rounded-md p-1 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {f.notes && (
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Notes</p>
              <p className="mt-1 text-[12px] text-foreground">{f.notes}</p>
            </div>
          )}

          <p className="pt-2 text-[10px] text-muted-foreground/60">
            Money tracking lives in Finance (separate page). This view is launches &amp; performance only.
          </p>
        </div>
      </div>
    </>
  );
}

// Per-market pricing editor inside the drawer. Local state for live preview
// of margin/BEROAS as the user types; saves on blur so values flow back into
// the funnel's effectiveBeroas immediately.
function PricingEditor({
  funnel: f,
  product,
  onSave,
}: {
  funnel: Funnel;
  product: ProductTrackerEntry | undefined;
  onSave: (patch: Partial<Funnel>) => void;
}) {
  // Component is keyed on funnel.id by the parent, so this initial state
  // is correct each time the user opens a different funnel.
  const [editSP, setEditSP] = useState<string>(f.sellingPrice ? String(f.sellingPrice) : '');
  const [editDR, setEditDR] = useState<string>(f.deliveryRate ? String(f.deliveryRate) : '95');
  const [savedTick, setSavedTick] = useState(false);

  const sp = parseFloat(editSP) || 0;
  const dr = parseFloat(editDR) || 0;
  const cost = product ? (Number(product.cogs) || 0) + (Number(product.shipping) || 0) : 0;
  const margin = sp > 0 && sp > cost && dr > 0 ? ((sp - cost) / sp) * (dr / 100) : 0;
  const beroas = margin > 0 ? 1 / margin : 0;
  const winThreshold = beroas > 0 ? beroas + 1 : 0;

  const flush = () => {
    const nextSP = parseFloat(editSP) || 0;
    const nextDR = parseFloat(editDR) || 0;
    const changed = nextSP !== (f.sellingPrice || 0) || nextDR !== (f.deliveryRate || 0);
    if (!changed) return;
    onSave({ sellingPrice: nextSP, deliveryRate: nextDR });
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 1200);
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-primary/80">
            Pricing for this market
          </p>
          {savedTick && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
              <Check className="h-3 w-3" /> saved
            </span>
          )}
        </div>
        {!product ? (
          <span className="text-[10px] text-amber-400">Link a product first</span>
        ) : cost > 0 ? (
          <span className="text-[10px] text-muted-foreground">Cost ${cost.toFixed(2)} from product</span>
        ) : (
          <span className="text-[10px] text-amber-400">Product has no cost — set COGS + shipping in Products</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormCell label="Selling price (USD)" hint="varies per market">
          <input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={editSP}
            onChange={(e) => setEditSP(e.target.value)}
            onBlur={flush}
            className="form-input tabular-nums"
            placeholder="0.00"
          />
        </FormCell>
        <FormCell label="Delivery rate %">
          <input
            type="number" min="0" max="100" step="0.1" inputMode="decimal"
            value={editDR}
            onChange={(e) => setEditDR(e.target.value)}
            onBlur={flush}
            className="form-input tabular-nums"
          />
        </FormCell>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-md border border-border bg-background/40 px-3 py-1.5">
          <span className="text-muted-foreground">Margin: </span>
          <span className="font-semibold tabular-nums text-foreground">
            {(margin * 100).toFixed(1)}%
          </span>
        </div>
        <div className="rounded-md border border-border bg-background/40 px-3 py-1.5">
          <span className="text-muted-foreground">BEROAS: </span>
          <span className="font-semibold tabular-nums text-primary">
            {beroas > 0 ? `${beroas.toFixed(2)}x` : '—'}
          </span>
        </div>
        <div className="rounded-md border border-border bg-background/40 px-3 py-1.5">
          <span className="text-muted-foreground">Win at: </span>
          <span className="font-semibold tabular-nums text-emerald-400">
            {winThreshold > 0 ? `${winThreshold.toFixed(2)}x` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// Surfaces in the drawer when a funnel has no productId. Lets the user
// pick the right product manually so we never silently mis-match.
function ProductLinkChip({
  currentName, products, onLink,
}: {
  currentName: string;
  products: ProductTrackerEntry[];
  onLink: (p: ProductTrackerEntry) => void;
}) {
  // Suggest products whose name shares any token with the funnel's productName.
  const suggested = useMemo(() => {
    const tokens = currentName.toLowerCase().split(/[\s\-_]+/).filter((t) => t.length > 2);
    if (tokens.length === 0) return [];
    return products
      .map((p) => {
        const name = p.productName.toLowerCase();
        const score = tokens.reduce((s, t) => s + (name.includes(t) ? 1 : 0), 0);
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.p);
  }, [currentName, products]);

  const [picking, setPicking] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-amber-300">Not linked to a product</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            This funnel was created before product linking. Pick the matching product so it shows up on the dossier.
          </p>

          {suggested.length > 0 && !picking && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Suggested:</span>
              {suggested.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onLink(p)}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 transition hover:bg-emerald-500/20"
                >
                  <Check className="h-3 w-3" /> {p.productName}
                </button>
              ))}
              <button
                onClick={() => setPicking(true)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Or pick another →
              </button>
            </div>
          )}

          {(picking || suggested.length === 0) && (
            <div className="mt-2 flex items-center gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="form-input flex-1 py-1 text-[11px]"
              >
                <option value="">Choose a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.productName || '(unnamed)'}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const p = products.find((x) => x.id === selectedId);
                  if (p) onLink(p);
                }}
                disabled={!selectedId}
                className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-3 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"
              >
                <Check className="h-3 w-3" /> Link
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
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

function PerfCell({ label, value, hint, accent }: {
  label: string; value: string; hint?: string;
  accent?: 'primary' | 'emerald' | 'rose';
}) {
  const map = {
    primary: 'text-primary',
    emerald: 'text-emerald-400',
    rose:    'text-rose-400',
  };
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-[16px] font-semibold tabular-nums', accent ? map[accent] : 'text-foreground')}>{value}</p>
      {hint && <p className="mt-0.5 text-[9px] text-muted-foreground/60">{hint}</p>}
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
  type Aggregate = {
    funnelCount: number;
    funnelsWithData: number;
    winners: number;
    spend: number;
    revenue: number;
  };

  const enriched = useMemo(() => {
    return funnels.map((f) => {
      const logs = logsByFunnel[f.id] ?? [];
      const agg = aggregateLogs(logs);
      let spend = 0, revenue = 0;
      for (const l of logs) { spend += Number(l.spend) || 0; revenue += Number(l.revenue) || 0; }
      const blendedRoas = spend > 0 ? revenue / spend : 0;
      const roasShown = agg.latestRoas > 0 ? agg.latestRoas : blendedRoas;
      const hasData = roasShown > 0 || spend > 0;
      const product = (f.productId && productById.get(f.productId)) || productByName.get(f.productName);
      const winning = isWinning(roasShown, effectiveBeroas(f, product));
      return { funnel: f, roasShown, spend, revenue, hasData, winning };
    });
  }, [funnels, logsByFunnel, productById, productByName]);

  const byCountry = useMemo(() => {
    const map = new Map<string, Aggregate>();
    enriched.forEach((e) => {
      const key = e.funnel.country || '—';
      const a = map.get(key) ?? { funnelCount: 0, funnelsWithData: 0, winners: 0, spend: 0, revenue: 0 };
      a.funnelCount++;
      if (e.hasData) {
        a.funnelsWithData++;
        if (e.winning) a.winners++;
      }
      a.spend += e.spend;
      a.revenue += e.revenue;
      map.set(key, a);
    });
    return Array.from(map.entries())
      .map(([country, a]) => ({
        country, ...a,
        blendedRoas: a.spend > 0 ? a.revenue / a.spend : 0,
        hitRate: a.funnelsWithData > 0 ? (a.winners / a.funnelsWithData) * 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [enriched]);

  const byProduct = useMemo(() => {
    const map = new Map<string, Aggregate>();
    enriched.forEach((e) => {
      const key = e.funnel.productName || '—';
      const a = map.get(key) ?? { funnelCount: 0, funnelsWithData: 0, winners: 0, spend: 0, revenue: 0 };
      a.funnelCount++;
      if (e.hasData) {
        a.funnelsWithData++;
        if (e.winning) a.winners++;
      }
      a.spend += e.spend;
      a.revenue += e.revenue;
      map.set(key, a);
    });
    return Array.from(map.entries())
      .map(([product, a]) => ({
        product, ...a,
        blendedRoas: a.spend > 0 ? a.revenue / a.spend : 0,
        hitRate: a.funnelsWithData > 0 ? (a.winners / a.funnelsWithData) * 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [enriched]);

  const ranked = useMemo(() => {
    return enriched
      .filter((e) => e.hasData)
      .sort((a, b) => b.roasShown - a.roasShown);
  }, [enriched]);

  const top5 = ranked.slice(0, 5);
  const bottom5 = [...ranked].reverse().slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PerfTable
          title="By country"
          rows={byCountry.map((b) => ({
            label: b.country,
            funnelCount: b.funnelCount,
            roas: b.blendedRoas,
            hit: b.hitRate,
            spend: b.spend,
          }))}
        />
        <PerfTable
          title="By product"
          rows={byProduct.map((b) => ({
            label: b.product,
            funnelCount: b.funnelCount,
            roas: b.blendedRoas,
            hit: b.hitRate,
            spend: b.spend,
          }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankingTable title="Top performers" emoji="🏆" funnels={top5} />
        <RankingTable title="Underperformers" emoji="🔻" funnels={bottom5} muted />
      </div>
    </div>
  );
}

function PerfTable({ title, rows }: {
  title: string;
  rows: Array<{ label: string; funnelCount: number; roas: number; hit: number; spend: number }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No data yet.</p>
      ) : (
        <table className="tracker-table">
          <thead>
            <tr>
              <th>{title.split(' ').pop()}</th>
              <th style={{ textAlign: 'right', width: 70 }}>Funnels</th>
              <th style={{ textAlign: 'right', width: 80 }}>ROAS</th>
              <th style={{ textAlign: 'right', width: 80 }}>Hit rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td><div className="px-3 py-2 text-[12px] text-foreground truncate max-w-[200px]">{r.label}</div></td>
                <td><div className="px-3 py-2 text-right text-[12px] tabular-nums text-muted-foreground">{r.funnelCount}</div></td>
                <td><div className="px-3 py-2 text-right text-[12px] tabular-nums text-foreground">{r.roas > 0 ? `${r.roas.toFixed(2)}x` : '—'}</div></td>
                <td><div className="px-3 py-2 text-right text-[12px] tabular-nums text-foreground">{r.hit.toFixed(0)}%</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RankingTable({
  title, emoji, funnels, muted,
}: {
  title: string;
  emoji: string;
  funnels: Array<{ funnel: Funnel; roasShown: number; winning: boolean }>;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-medium text-foreground">
          <span className="mr-1.5">{emoji}</span> {title}
        </h3>
        <span className="text-[11px] text-muted-foreground">{funnels.length}</span>
      </div>
      {funnels.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No funnels with data yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {funnels.map(({ funnel: f, roasShown, winning }) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-foreground">{f.productName}</p>
                <p className="text-[10px] text-muted-foreground">{f.country} · {f.language}</p>
              </div>
              <span className={cn(
                'shrink-0 text-[14px] font-semibold tabular-nums',
                muted ? 'text-rose-400' : winning ? 'text-emerald-400' : 'text-foreground'
              )}>
                {roasShown.toFixed(2)}x
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Add Funnel modal ────────────────────────────────────────────────────────

type NewFunnelInput = {
  productId: string;
  productName: string;
  country: string;
  language: string;
  funnelishUrl: string;
  status: FunnelStatus;
  launchDate: string;
  sellingPrice: number;
  deliveryRate: number;
  beroas: number;
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
  const [country, setCountry] = useState('Ireland');
  const [language, setLanguage] = useState('English');
  const [funnelishUrl, setFunnelishUrl] = useState('');
  const [status, setStatus] = useState<FunnelStatus>('draft');
  const [launchDate, setLaunchDate] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [deliveryRate, setDeliveryRate] = useState('95');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const langs = getLanguagesForCountry(country);
  useEffect(() => {
    if (langs.length > 0 && !langs.includes(language)) setLanguage(langs[0]);
  }, [country, langs, language]);

  const selectedProduct = products.find((p) => p.id === productId);

  // Live preview of margin & BEROAS from product cost + this funnel's pricing
  const sp = parseFloat(sellingPrice) || 0;
  const dr = (parseFloat(deliveryRate) || 0) / 100;
  const cost = (selectedProduct?.cogs ?? 0) + (selectedProduct?.shipping ?? 0);
  const margin = sp > 0 && sp > cost && dr > 0 ? ((sp - cost) / sp) * dr : 0;
  const beroasComputed = margin > 0 ? 1 / margin : 0;
  const winThreshold = beroasComputed > 0 ? beroasComputed + 1 : 0;
  const productHasCost = cost > 0;

  const submit = async () => {
    if (!productId || !selectedProduct) { setErr('Pick a product from the tracker.'); return; }
    if (!country) { setErr('Country is required.'); return; }
    if (!language) { setErr('Language is required.'); return; }
    setErr(null);
    setSaving(true);
    try {
      await onSubmit({
        productId,
        productName: selectedProduct.productName,
        country,
        language,
        funnelishUrl: funnelishUrl.trim(),
        status,
        launchDate,
        sellingPrice: sp,
        deliveryRate: parseFloat(deliveryRate) || 0,
        beroas: 0, // computed at read-time from pricing; manual field unused for new funnels
        notes: notes.trim(),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add funnel.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Add Funnel</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          {products.length === 0 ? (
            <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-center">
              <p className="text-[12px] font-medium text-foreground">No products in your tracker yet</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Funnels must link to a product. Create one first, then come back.
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
                  // Group products by stage so winners surface first.
                  const byStage = new Map<string, ProductTrackerEntry[]>();
                  products.forEach((p) => {
                    const k = p.productStage || '(no stage)';
                    if (!byStage.has(k)) byStage.set(k, []);
                    byStage.get(k)!.push(p);
                  });
                  // Order: winners → testing ads → testing store page → research → other
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
            <FormCell label="Country">
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="form-input">
                {[1, 2, 3, 4].map((phase) => (
                  <optgroup key={phase} label={`Phase ${phase}`}>
                    {MARKETS.filter((m) => m.phase === phase).map((m) => (
                      <option key={m.country} value={m.country}>{m.country}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </FormCell>
            <FormCell label="Language">
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="form-input">
                {langs.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormCell>
          </div>

          <FormCell label="Funnelish URL (optional)">
            <input value={funnelishUrl} onChange={(e) => setFunnelishUrl(e.target.value)} className="form-input" placeholder="https://…" />
          </FormCell>

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

          {/* Per-market pricing — drives auto-computed BEROAS */}
          <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-wider text-primary/80">
                Pricing for this market
              </p>
              {productHasCost ? (
                <span className="text-[10px] text-muted-foreground">
                  Cost ${cost.toFixed(2)} from product
                </span>
              ) : (
                <span className="text-[10px] text-amber-400">
                  Product has no cost — set COGS + shipping in Products
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormCell label="Selling price (USD)">
                <input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="form-input tabular-nums"
                  placeholder="0.00"
                />
              </FormCell>
              <FormCell label="Delivery rate %">
                <input
                  type="number" min="0" max="100" step="0.1" inputMode="decimal"
                  value={deliveryRate}
                  onChange={(e) => setDeliveryRate(e.target.value)}
                  className="form-input tabular-nums"
                />
              </FormCell>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-md border border-border bg-background/40 px-3 py-1.5">
                <span className="text-muted-foreground">Margin: </span>
                <span className="font-semibold tabular-nums text-foreground">{(margin * 100).toFixed(1)}%</span>
              </div>
              <div className="rounded-md border border-border bg-background/40 px-3 py-1.5">
                <span className="text-muted-foreground">BEROAS: </span>
                <span className="font-semibold tabular-nums text-primary">{beroasComputed > 0 ? `${beroasComputed.toFixed(2)}x` : '—'}</span>
              </div>
              <div className="rounded-md border border-border bg-background/40 px-3 py-1.5">
                <span className="text-muted-foreground">Win at: </span>
                <span className="font-semibold tabular-nums text-emerald-400">{winThreshold > 0 ? `${winThreshold.toFixed(2)}x` : '—'}</span>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground/70">
              BEROAS = 1 / margin. A funnel is <em>winning</em> when its ROAS reaches BEROAS + 1.
            </p>
          </div>

          <FormCell label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="form-input" />
          </FormCell>

          {err && <p className="text-[11px] text-destructive">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/50 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || products.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-1.5 text-[12px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Create funnel
          </button>
        </div>
      </motion.div>
    </div>
  );
}
