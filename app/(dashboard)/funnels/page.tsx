'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Funnel as FunnelIcon, Plus, Trash2, Check, X, Loader2,
  AlertTriangle, Globe, Search,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import { MARKETS, getLanguagesForCountry, getCountries } from '@/lib/markets';
import { isWinning, aggregateLogs, hitRate } from '@/lib/funnels';
import type { Funnel, FunnelDailyLog, FunnelStatus } from '@/types/funnel';

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

export default function FunnelsPage() {
  const { user } = useAuth();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [logsByFunnel, setLogsByFunnel] = useState<Record<string, FunnelDailyLog[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
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
      const funnelsRes = await fetch('/api/funnels').then((r) => r.json());
      const list: Funnel[] = funnelsRes.funnels ?? [];
      setFunnels(list);

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
        roasValues.push(agg.latestRoas);
        winRows.push({ roas: agg.latestRoas, beroas: f.beroas });
        if (isWinning(agg.latestRoas, f.beroas)) winCount++;
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
  }, [funnels, logsByFunnel]);

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

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/25"
        >
          <Plus className="h-3.5 w-3.5" /> Add Funnel
        </button>
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
            const winning = isWinning(agg.latestRoas, f.beroas);
            const tone = TONE[STATUS_OPTIONS.find((s) => s.value === f.status)?.tone ?? 'gray'];
            return (
              <FunnelCard
                key={f.id}
                funnel={f}
                latestRoas={agg.latestRoas}
                lastLogDate={agg.lastLogDate}
                totalOrders={agg.totalOrders}
                winning={winning}
                tone={tone}
                index={i}
                onOpen={() => setOpenFunnelId(f.id)}
              />
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · money tracking lives in Finance (separate page)
      </p>

      {/* Add funnel modal */}
      {showAddModal && (
        <AddFunnelModal
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddFunnel}
        />
      )}

      {/* Detail drawer */}
      <FunnelDrawer
        funnel={openFunnel}
        logs={openFunnel ? logsByFunnel[openFunnel.id] ?? [] : []}
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
  funnel: f, latestRoas, lastLogDate, totalOrders, winning, tone, index, onOpen,
}: {
  funnel: Funnel;
  latestRoas: number;
  lastLogDate: string;
  totalOrders: number;
  winning: boolean;
  tone: { text: string; bg: string; border: string; bar: string; dot: string };
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
          <p className="truncate text-[13px] font-semibold text-foreground">{f.productName}</p>
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
        <span>BEROAS <span className="font-semibold tabular-nums text-foreground">{f.beroas > 0 ? `${f.beroas.toFixed(2)}x` : '—'}</span></span>
        <span>{totalOrders > 0 ? `${totalOrders} orders` : 'no orders'}</span>
        <span>{lastLogDate || 'no logs'}</span>
      </div>
    </motion.button>
  );
}

// ── Funnel detail drawer ────────────────────────────────────────────────────

function FunnelDrawer({
  funnel, logs, onClose, onUpdate, onDelete, onLogsChanged,
}: {
  funnel: Funnel | null;
  logs: FunnelDailyLog[];
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
  funnel: f, logs, onClose, onUpdate, onDelete, onLogsChanged,
}: {
  funnel: Funnel;
  logs: FunnelDailyLog[];
  onClose: () => void;
  onUpdate: (patch: Partial<Funnel>) => void;
  onDelete: () => void;
  onLogsChanged: () => void;
}) {
  const agg = aggregateLogs(logs);
  const winning = isWinning(agg.latestRoas, f.beroas);
  const winThreshold = f.beroas > 0 ? f.beroas + 1 : 0;

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
            <p className="truncate text-base font-semibold text-foreground">{f.productName}</p>
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
          {/* Performance summary */}
          <div className="grid grid-cols-3 gap-2">
            <PerfCell
              label="Latest ROAS"
              value={agg.latestRoas > 0 ? `${agg.latestRoas.toFixed(2)}x` : '—'}
              accent={agg.latestRoas > 0 ? (winning ? 'emerald' : 'rose') : undefined}
            />
            <PerfCell
              label="BEROAS"
              value={f.beroas > 0 ? `${f.beroas.toFixed(2)}x` : '—'}
              accent="primary"
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
                    const win = isWinning(l.roas, f.beroas);
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

function FormCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</label>
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

// ── Add Funnel modal ────────────────────────────────────────────────────────

type NewFunnelInput = {
  productName: string;
  country: string;
  language: string;
  funnelishUrl: string;
  status: FunnelStatus;
  launchDate: string;
  beroas: number;
  notes: string;
};

function AddFunnelModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: NewFunnelInput) => Promise<void>;
}) {
  const [productName, setProductName] = useState('');
  const [country, setCountry] = useState('Ireland');
  const [language, setLanguage] = useState('English');
  const [funnelishUrl, setFunnelishUrl] = useState('');
  const [status, setStatus] = useState<FunnelStatus>('draft');
  const [launchDate, setLaunchDate] = useState('');
  const [beroas, setBeroas] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const langs = getLanguagesForCountry(country);
  useEffect(() => {
    if (langs.length > 0 && !langs.includes(language)) setLanguage(langs[0]);
  }, [country, langs, language]);

  const beroasNum = parseFloat(beroas) || 0;
  const winThreshold = beroasNum > 0 ? beroasNum + 1 : 0;

  const submit = async () => {
    if (!productName.trim()) { setErr('Product name is required.'); return; }
    if (!country) { setErr('Country is required.'); return; }
    if (!language) { setErr('Language is required.'); return; }
    setErr(null);
    setSaving(true);
    try {
      await onSubmit({
        productName: productName.trim(),
        country,
        language,
        funnelishUrl: funnelishUrl.trim(),
        status,
        launchDate,
        beroas: beroasNum,
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
          <FormCell label="Product name">
            <input value={productName} onChange={(e) => setProductName(e.target.value)} className="form-input" placeholder="e.g. EMS Booty Trainer" autoFocus />
          </FormCell>

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

          {/* BEROAS — single number */}
          <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
            <div className="grid grid-cols-2 gap-2">
              <FormCell label="BEROAS">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={beroas}
                  onChange={(e) => setBeroas(e.target.value)}
                  className="form-input tabular-nums"
                  placeholder="e.g. 1.67"
                />
              </FormCell>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-muted-foreground">Win threshold</label>
                <div className="flex h-[34px] items-center rounded-lg border border-border bg-background/40 px-3 text-[12px] tabular-nums text-primary">
                  {winThreshold > 0 ? `${winThreshold.toFixed(2)}x` : '—'}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground/70">
              Breakeven ROAS for this product. A funnel is considered <em>winning</em> when its ROAS hits BEROAS + 1.
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
            disabled={saving}
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
