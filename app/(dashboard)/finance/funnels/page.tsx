'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, Plus, Trash2, X, Loader2, AlertTriangle, Search, Globe, ArrowRight,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import { getCountries } from '@/lib/markets';
import { isWinning } from '@/lib/funnels';
import { formatFromUSD, type SupportedCurrency, type UsdRates } from '@/lib/currency-converter';
import type { Funnel, FunnelDailyLog, FunnelStatus } from '@/types/funnel';
import type { ProductTrackerEntry } from '@/types/shopify';
import type { FxRates } from '@/lib/fx-rates';

const STATUS_OPTIONS: Array<{ value: FunnelStatus; label: string; tone: 'gray' | 'amber' | 'emerald' | 'sky' | 'rose' }> = [
  { value: 'live',    label: 'Live',    tone: 'emerald' },
  { value: 'testing', label: 'Testing', tone: 'amber' },
  { value: 'paused',  label: 'Paused',  tone: 'sky' },
  { value: 'draft',   label: 'Draft',   tone: 'gray' },
  { value: 'killed',  label: 'Killed',  tone: 'rose' },
];

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

interface FunnelMoney {
  totalSpend: number;
  totalRevenue: number;
  totalProfit: number;
  blendedRoas: number;
  daysLogged: number;
  lastLogDate: string;
}

function aggregateMoney(logs: FunnelDailyLog[]): FunnelMoney {
  if (logs.length === 0) {
    return { totalSpend: 0, totalRevenue: 0, totalProfit: 0, blendedRoas: 0, daysLogged: 0, lastLogDate: '' };
  }
  let totalSpend = 0, totalRevenue = 0, totalProfit = 0, lastLogDate = '';
  for (const l of logs) {
    totalSpend += Number(l.spend) || 0;
    totalRevenue += Number(l.revenue) || 0;
    totalProfit += Number(l.profit) || 0;
    if (l.date > lastLogDate) lastLogDate = l.date;
  }
  return {
    totalSpend, totalRevenue, totalProfit,
    blendedRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    daysLogged: logs.filter((l) => l.spend > 0 || l.revenue > 0 || l.profit !== 0).length,
    lastLogDate,
  };
}

export default function FunnelFinancePage() {
  const { user } = useAuth();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [logsByFunnel, setLogsByFunnel] = useState<Record<string, FunnelDailyLog[]>>({});
  const [products, setProducts] = useState<ProductTrackerEntry[]>([]);
  const [fx, setFx] = useState<FxRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');

  // Filters
  const [statusFilter, setStatusFilter] = useState<FunnelStatus | 'all'>('all');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [openFunnelId, setOpenFunnelId] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [funnelsRes, fxRes, productsRes] = await Promise.all([
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/fx').then((r) => r.json()),
        fetch('/api/product-tracker').then((r) => r.json()),
      ]);
      const list: Funnel[] = funnelsRes.funnels ?? [];
      setFunnels(list);
      setFx(fxRes ?? null);
      setProducts(productsRes.entries ?? []);

      const logsRes = await Promise.all(
        list.map((f) => fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(f.id)}`).then((r) => r.json()))
      );
      const map: Record<string, FunnelDailyLog[]> = {};
      list.forEach((f, i) => { map[f.id] = logsRes[i]?.logs ?? []; });
      setLogsByFunnel(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
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

  const rates: UsdRates = fx?.rates ?? { USD: 1, EUR: 0.92, INR: 83.5 };
  const fmt = (usd: number) => formatFromUSD(usd, currency, rates);

  const productIdByName = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => { if (p.productName) m.set(p.productName, p.id); });
    return m;
  }, [products]);

  // Derived
  const moneyByFunnel = useMemo(() => {
    const m: Record<string, FunnelMoney> = {};
    funnels.forEach((f) => { m[f.id] = aggregateMoney(logsByFunnel[f.id] ?? []); });
    return m;
  }, [funnels, logsByFunnel]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return funnels.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (filterCountry !== 'all' && f.country !== filterCountry) return false;
      if (q) {
        const hay = [f.productName, f.country, f.language].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // Highest spend first — money page focuses on where the dollars are
      const sa = moneyByFunnel[a.id]?.totalSpend ?? 0;
      const sb = moneyByFunnel[b.id]?.totalSpend ?? 0;
      return sb - sa;
    });
  }, [funnels, statusFilter, filterCountry, search, moneyByFunnel]);

  // Grand totals
  const totals = useMemo(() => {
    let spend = 0, revenue = 0, profit = 0;
    funnels.forEach((f) => {
      const m = moneyByFunnel[f.id];
      if (!m) return;
      spend += m.totalSpend;
      revenue += m.totalRevenue;
      profit += m.totalProfit;
    });
    return {
      spend, revenue, profit,
      blendedRoas: spend > 0 ? revenue / spend : 0,
      profitMargin: revenue > 0 ? (profit / revenue) * 100 : 0,
    };
  }, [funnels, moneyByFunnel]);

  const animatedSpend = useCountUp(totals.spend);
  const animatedRevenue = useCountUp(totals.revenue);
  const animatedProfit = useCountUp(totals.profit);
  const animatedRoas = useCountUp(totals.blendedRoas, 500);

  const statusCounts = useMemo(() => {
    const c: Record<FunnelStatus | 'all', number> = {
      all: funnels.length, live: 0, testing: 0, paused: 0, draft: 0, killed: 0,
    };
    funnels.forEach((f) => { c[f.status]++; });
    return c;
  }, [funnels]);

  const openFunnel = openFunnelId ? funnels.find((f) => f.id === openFunnelId) ?? null : null;

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Funnel Finance</h1>
            <p className="text-[11px] text-muted-foreground">
              Money tracking for international funnels · stored USD, view in {currency}
            </p>
          </div>
        </div>

        <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
          {(['USD', 'EUR', 'INR'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={cn(
                'rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors',
                currency === c ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Money KPI strip */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4"
      >
        <StatCell label="Total spend"   value={fmt(animatedSpend)}   accent="amber" />
        <StatCell label="Total revenue" value={fmt(animatedRevenue)} accent="sky" />
        <StatCell
          label="Total profit"
          value={fmt(animatedProfit)}
          accent={totals.profit < 0 ? 'rose' : 'emerald'}
          hint={totals.revenue > 0 ? `${totals.profitMargin.toFixed(1)}% margin` : undefined}
        />
        <StatCell label="Blended ROAS" value={animatedRoas > 0 ? `${animatedRoas.toFixed(2)}x` : '—'} accent="violet" />
      </motion.div>

      {/* Filters */}
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
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[170px] rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Wallet className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-[13px] font-medium text-foreground">
            {funnels.length === 0 ? 'No funnels yet' : 'No funnels match your filters'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {funnels.length === 0 ? 'Create funnels in the Funnels page first.' : 'Try clearing a filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((f, i) => (
            <FinanceCard
              key={f.id}
              funnel={f}
              money={moneyByFunnel[f.id] ?? { totalSpend: 0, totalRevenue: 0, totalProfit: 0, blendedRoas: 0, daysLogged: 0, lastLogDate: '' }}
              fmt={fmt}
              index={i}
              onOpen={() => setOpenFunnelId(f.id)}
            />
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · {fx?.source === 'live' ? 'live FX' : fx?.source === 'cache' ? 'cached FX' : fx?.source === 'fallback' ? 'fallback FX' : 'FX loading'} · launches/performance live in <a href="/funnels" className="text-primary hover:text-primary/80">Funnels</a>
      </p>

      <FinanceDrawer
        funnel={openFunnel}
        logs={openFunnel ? logsByFunnel[openFunnel.id] ?? [] : []}
        productId={openFunnel ? productIdByName.get(openFunnel.productName) : undefined}
        fmt={fmt}
        onClose={() => setOpenFunnelId(null)}
        onLogsChanged={() => openFunnel && refreshLogs(openFunnel.id)}
      />
    </PageTransition>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function StatCell({ label, value, hint, accent }: {
  label: string; value: string; hint?: string;
  accent: 'emerald' | 'amber' | 'sky' | 'violet' | 'rose';
}) {
  const map = {
    emerald: 'text-emerald-400',
    amber:   'text-amber-400',
    sky:     'text-sky-400',
    violet:  'text-violet-400',
    rose:    'text-rose-400',
  };
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-[20px] font-semibold leading-none tabular-nums tracking-tight', map[accent])}>{value}</p>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
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

function FinanceCard({
  funnel: f, money, fmt, index, onOpen,
}: {
  funnel: Funnel;
  money: FunnelMoney;
  fmt: (usd: number) => string;
  index: number;
  onOpen: () => void;
}) {
  const tone = TONE[STATUS_OPTIONS.find((s) => s.value === f.status)?.tone ?? 'gray'];
  const winning = isWinning(money.blendedRoas, f.beroas);
  const hasSpend = money.totalSpend > 0;
  const profitTone = money.totalProfit < 0 ? 'text-rose-400' : money.totalProfit > 0 ? 'text-emerald-400' : 'text-muted-foreground';

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
          <p className="mt-0.5 text-[11px] text-muted-foreground">{f.country} · {f.language}</p>
        </div>
        <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', tone.bg, tone.border, tone.text)}>
          <span className={cn('h-1 w-1 rounded-full', tone.dot)} />
          {STATUS_OPTIONS.find((s) => s.value === f.status)?.label}
        </span>
      </div>

      {/* Big profit number */}
      <div>
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Profit</p>
        <p className={cn('text-2xl font-semibold leading-none tabular-nums tracking-tight', profitTone)}>
          {hasSpend ? fmt(money.totalProfit) : '—'}
        </p>
      </div>

      {/* Mini stats grid */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <MiniStat label="Spend" value={hasSpend ? fmt(money.totalSpend) : '—'} />
        <MiniStat label="Revenue" value={hasSpend ? fmt(money.totalRevenue) : '—'} />
        <MiniStat
          label="ROAS"
          value={hasSpend ? `${money.blendedRoas.toFixed(2)}x` : '—'}
          tone={hasSpend ? (winning ? 'emerald' : 'rose') : undefined}
        />
        <MiniStat label="Days" value={money.daysLogged.toString()} />
      </div>
    </motion.button>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'rose' }) {
  const map = { emerald: 'text-emerald-400', rose: 'text-rose-400' };
  return (
    <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
      <p className="text-[8px] font-medium uppercase tracking-wider text-muted-foreground/80">{label}</p>
      <p className={cn('mt-0.5 text-[12px] font-semibold tabular-nums', tone ? map[tone] : 'text-foreground')}>{value}</p>
    </div>
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────────

function FinanceDrawer({
  funnel, logs, productId, fmt, onClose, onLogsChanged,
}: {
  funnel: Funnel | null;
  logs: FunnelDailyLog[];
  productId: string | undefined;
  fmt: (usd: number) => string;
  onClose: () => void;
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
            <FinanceDrawerContent
              funnel={funnel}
              logs={logs}
              productId={productId}
              fmt={fmt}
              onClose={onClose}
              onLogsChanged={onLogsChanged}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function FinanceDrawerContent({
  funnel: f, logs, productId, fmt, onClose, onLogsChanged,
}: {
  funnel: Funnel;
  logs: FunnelDailyLog[];
  productId: string | undefined;
  fmt: (usd: number) => string;
  onClose: () => void;
  onLogsChanged: () => void;
}) {
  const money = aggregateMoney(logs);
  const tone = TONE[STATUS_OPTIONS.find((s) => s.value === f.status)?.tone ?? 'gray'];

  // Form: log money for a day
  const [date, setDate] = useState(getISTDate());
  const [spend, setSpend] = useState('');
  const [revenue, setRevenue] = useState('');
  const [profit, setProfit] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Auto-compute profit suggestion from spend & revenue (revenue × margin − spend)
  // We don't auto-fill since margin isn't computed here; user enters profit themselves.

  const addLog = async () => {
    if (!date) { setErr('Date is required.'); return; }
    if (!spend && !revenue && !profit) { setErr('Enter at least one money field.'); return; }
    try {
      setSaving(true);
      setErr(null);
      const res = await fetch('/api/funnels/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnelId: f.id,
          date,
          spend: parseFloat(spend) || 0,
          revenue: parseFloat(revenue) || 0,
          profit: parseFloat(profit) || 0,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSpend(''); setRevenue(''); setProfit(''); setNotes('');
      onLogsChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add log.');
    } finally {
      setSaving(false);
    }
  };

  const removeLog = async (id: string) => {
    if (!confirm('Delete this log entry? (Includes performance fields too.)')) return;
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
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground transition hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 px-5 py-4">
          {/* Money summary */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Cell label="Spend"   value={fmt(money.totalSpend)} />
            <Cell label="Revenue" value={fmt(money.totalRevenue)} />
            <Cell
              label="Profit"
              value={fmt(money.totalProfit)}
              accent={money.totalProfit < 0 ? 'rose' : money.totalProfit > 0 ? 'emerald' : undefined}
            />
            <Cell
              label="ROAS"
              value={money.blendedRoas > 0 ? `${money.blendedRoas.toFixed(2)}x` : '—'}
              accent={money.totalSpend > 0 ? (isWinning(money.blendedRoas, f.beroas) ? 'emerald' : 'rose') : undefined}
            />
          </div>

          {/* Add log form — money fields */}
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-medium text-foreground">Log money for a day (USD)</span>
              {err && <span className="ml-auto text-[10px] text-destructive">{err}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormCell label="Date">
                <DatePicker value={date} onChange={(d) => setDate(d || getISTDate())} max={getISTDate()} compact />
              </FormCell>
              <FormCell label="Spend (USD)">
                <input type="number" min="0" inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} className="form-input tabular-nums" placeholder="0" />
              </FormCell>
              <FormCell label="Revenue (USD)">
                <input type="number" min="0" inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} className="form-input tabular-nums" placeholder="0" />
              </FormCell>
              <FormCell label="Profit (USD)">
                <input type="number" inputMode="decimal" value={profit} onChange={(e) => setProfit(e.target.value)} className="form-input tabular-nums" placeholder="0" />
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
              className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-500/15 py-2 text-[12px] font-medium text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add money log
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
                    <th style={{ width: 90 }}>Date</th>
                    <th style={{ textAlign: 'right' }}>Spend</th>
                    <th style={{ textAlign: 'right' }}>Revenue</th>
                    <th style={{ textAlign: 'right' }}>Profit</th>
                    <th style={{ textAlign: 'right', width: 70 }}>ROAS</th>
                    <th style={{ width: 36, textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => {
                    const dailyRoas = l.spend > 0 ? l.revenue / l.spend : 0;
                    return (
                      <tr key={l.id}>
                        <td><div className="px-3 py-2 text-[11px] tabular-nums text-foreground">{l.date}</div></td>
                        <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-foreground">{fmt(l.spend)}</div></td>
                        <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-foreground">{fmt(l.revenue)}</div></td>
                        <td>
                          <div className={cn('px-3 py-2 text-right text-[11px] tabular-nums', l.profit < 0 ? 'text-rose-400' : l.profit > 0 ? 'text-emerald-400' : 'text-muted-foreground')}>
                            {fmt(l.profit)}
                          </div>
                        </td>
                        <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-foreground">{dailyRoas > 0 ? `${dailyRoas.toFixed(2)}x` : '—'}</div></td>
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

          <p className="pt-2 text-[10px] text-muted-foreground/60">
            ROAS / orders / launch info live in <a href="/funnels" className="text-primary hover:text-primary/80">Funnels</a>. Same daily log record, different views.
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

function Cell({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'rose' }) {
  const map = { emerald: 'text-emerald-400', rose: 'text-rose-400' };
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-[14px] font-semibold tabular-nums', accent ? map[accent] : 'text-foreground')}>{value}</p>
    </div>
  );
}
