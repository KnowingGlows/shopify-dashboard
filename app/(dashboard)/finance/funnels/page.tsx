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
import { isWinning, effectiveBeroas } from '@/lib/funnels';
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

      {/* Money KPI tiles — modern card style */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCell label="Total spend"   value={fmt(animatedSpend)}   accent="amber" delay={0} />
        <StatCell label="Total revenue" value={fmt(animatedRevenue)} accent="sky"   delay={0.05} />
        <StatCell
          label="Total profit"
          value={fmt(animatedProfit)}
          accent={totals.profit < 0 ? 'rose' : 'emerald'}
          hint={totals.revenue > 0 ? `${totals.profitMargin.toFixed(1)}% margin` : undefined}
          delay={0.1}
        />
        <StatCell label="Blended ROAS" value={animatedRoas > 0 ? `${animatedRoas.toFixed(2)}x` : '—'} accent="violet" delay={0.15} />
      </div>

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
              product={products.find((p) => p.id === (f.productId || productIdByName.get(f.productName)))}
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

      <FinanceModal
        funnel={openFunnel}
        logs={openFunnel ? logsByFunnel[openFunnel.id] ?? [] : []}
        productId={openFunnel ? productIdByName.get(openFunnel.productName) : undefined}
        product={openFunnel ? products.find((p) => p.id === (openFunnel.productId || productIdByName.get(openFunnel.productName))) : undefined}
        fmt={fmt}
        onClose={() => setOpenFunnelId(null)}
        onLogsChanged={() => openFunnel && refreshLogs(openFunnel.id)}
      />
    </PageTransition>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function StatCell({ label, value, hint, accent, delay = 0 }: {
  label: string; value: string; hint?: string;
  accent: 'emerald' | 'amber' | 'sky' | 'violet' | 'rose';
  delay?: number;
}) {
  const text = {
    emerald: 'text-emerald-400',
    amber:   'text-amber-400',
    sky:     'text-sky-400',
    violet:  'text-violet-400',
    rose:    'text-rose-400',
  }[accent];
  const border = {
    emerald: 'border-emerald-500/30',
    amber:   'border-amber-500/30',
    sky:     'border-sky-500/30',
    violet:  'border-violet-500/30',
    rose:    'border-rose-500/30',
  }[accent];
  const glow = {
    emerald: '#34d399',
    amber:   '#fbbf24',
    sky:     '#38bdf8',
    violet:  '#a78bfa',
    rose:    '#fb7185',
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
  funnel: f, money, product, fmt, index, onOpen,
}: {
  funnel: Funnel;
  money: FunnelMoney;
  product: ProductTrackerEntry | undefined;
  fmt: (usd: number) => string;
  index: number;
  onOpen: () => void;
}) {
  const tone = TONE[STATUS_OPTIONS.find((s) => s.value === f.status)?.tone ?? 'gray'];
  const winning = isWinning(money.blendedRoas, effectiveBeroas(f, product));
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

// ── Centered finance modal ──────────────────────────────────────────────────

function FinanceModal({
  funnel, logs, productId, product, fmt, onClose, onLogsChanged,
}: {
  funnel: Funnel | null;
  logs: FunnelDailyLog[];
  productId: string | undefined;
  product: ProductTrackerEntry | undefined;
  fmt: (usd: number) => string;
  onClose: () => void;
  onLogsChanged: () => void;
}) {
  return (
    <AnimatePresence>
      {funnel && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/65 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="relative z-10 flex w-full max-w-3xl max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl"
          >
            <FinanceModalContent
              funnel={funnel}
              logs={logs}
              productId={productId}
              product={product}
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

function FinanceModalContent({
  funnel: f, logs, productId, product, fmt, onClose, onLogsChanged,
}: {
  funnel: Funnel;
  logs: FunnelDailyLog[];
  productId: string | undefined;
  product: ProductTrackerEntry | undefined;
  fmt: (usd: number) => string;
  onClose: () => void;
  onLogsChanged: () => void;
}) {
  const money = aggregateMoney(logs);
  const beroas = effectiveBeroas(f, product);
  const tone = TONE[STATUS_OPTIONS.find((s) => s.value === f.status)?.tone ?? 'gray'];

  // Form: log money for a day
  const today = getISTDate();
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  })();
  const [date, setDate] = useState(today);
  const [spend, setSpend] = useState('');
  const [revenue, setRevenue] = useState('');
  const [profit, setProfit] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Live computed values from inputs
  const spendNum = parseFloat(spend) || 0;
  const revenueNum = parseFloat(revenue) || 0;
  const profitNum = parseFloat(profit) || 0;
  const liveRoas = spendNum > 0 ? revenueNum / spendNum : 0;
  const liveMargin = revenueNum > 0 ? (profitNum / revenueNum) * 100 : 0;
  const liveWinning = isWinning(liveRoas, beroas);
  const hasInputs = spendNum > 0 || revenueNum > 0 || profitNum !== 0;

  const profitTone = money.totalProfit < 0 ? 'rose' : money.totalProfit > 0 ? 'emerald' : 'neutral';
  const roasTone = money.totalSpend === 0 ? 'neutral' : isWinning(money.blendedRoas, beroas) ? 'emerald' : 'rose';

  const addLog = async () => {
    if (!date) { setErr('Date is required.'); return; }
    if (!hasInputs) { setErr('Enter at least one money field.'); return; }
    try {
      setSaving(true);
      setErr(null);
      const res = await fetch('/api/funnels/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnelId: f.id,
          date,
          spend: spendNum,
          revenue: revenueNum,
          profit: profitNum,
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
      <div className="relative shrink-0">
        <div className={cn('absolute inset-x-0 top-0 h-[3px]', tone.bar)} aria-hidden />
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0">
            {productId ? (
              <Link
                href={`/product-tracker/${productId}`}
                className="group inline-flex max-w-full items-center gap-1.5 text-lg font-semibold text-foreground hover:text-primary"
              >
                <span className="min-w-0 flex-1 truncate">{f.productName}</span>
                <ArrowRight className="h-4 w-4 shrink-0 opacity-0 transition group-hover:opacity-100" />
              </Link>
            ) : (
              <p className="truncate text-lg font-semibold text-foreground">{f.productName}</p>
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
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent/30 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 px-6 py-5">
          {/* Big stat tiles */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <BigStat label="Spend"   value={fmt(money.totalSpend)}   tone="amber"  delay={0} />
            <BigStat label="Revenue" value={fmt(money.totalRevenue)} tone="sky"    delay={0.04} />
            <BigStat label="Profit"  value={fmt(money.totalProfit)}  tone={profitTone} delay={0.08} />
            <BigStat
              label="ROAS"
              value={money.blendedRoas > 0 ? `${money.blendedRoas.toFixed(2)}x` : '—'}
              tone={roasTone}
              delay={0.12}
            />
          </div>

          {/* Entry section */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">Log a day</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <DateChip
                  active={date === today}
                  onClick={() => setDate(today)}
                  label="Today"
                />
                <DateChip
                  active={date === yesterday}
                  onClick={() => setDate(yesterday)}
                  label="Yesterday"
                />
                <div className="ml-1">
                  <DatePicker value={date} onChange={(d) => setDate(d || today)} max={today} compact />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <MoneyInput label="Spend"   value={spend}   onChange={setSpend}   tone="amber" />
              <MoneyInput label="Revenue" value={revenue} onChange={setRevenue} tone="sky" />
              <MoneyInput label="Profit"  value={profit}  onChange={setProfit}  tone="emerald" allowNegative />
            </div>

            {/* Live computed strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/40 px-4 py-2.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Live preview
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[12px] tabular-nums">
                <span className="text-muted-foreground">
                  ROAS{' '}
                  <span className={cn('font-semibold', liveRoas > 0 ? (liveWinning ? 'text-emerald-400' : 'text-foreground') : 'text-muted-foreground/50')}>
                    {liveRoas > 0 ? `${liveRoas.toFixed(2)}x` : '—'}
                  </span>
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground">
                  Margin{' '}
                  <span className={cn('font-semibold', liveMargin !== 0 ? 'text-foreground' : 'text-muted-foreground/50')}>
                    {liveMargin !== 0 ? `${liveMargin.toFixed(0)}%` : '—'}
                  </span>
                </span>
                <span className="text-muted-foreground/40">·</span>
                {!hasInputs ? (
                  <span className="text-[11px] text-muted-foreground/50">Enter values</span>
                ) : liveWinning ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Winning
                  </span>
                ) : beroas > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Below {(beroas + 1).toFixed(2)}x
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground/50">No BEROAS set</span>
                )}
              </div>
            </div>

            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)…"
              className="form-input"
            />

            {err && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{err}</span>
              </div>
            )}

            <button
              onClick={addLog}
              disabled={saving || !hasInputs}
              className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-emerald-500/15 px-4 py-3 text-[13px] font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-40 disabled:hover:bg-emerald-500/15"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Add money log'}
            </button>
          </div>

          {/* Recent logs */}
          {logs.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12px] font-semibold text-foreground">Recent logs</h3>
                <span className="text-[11px] text-muted-foreground">{logs.length}</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="tracker-table">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Date</th>
                      <th style={{ textAlign: 'right' }}>Spend</th>
                      <th style={{ textAlign: 'right' }}>Revenue</th>
                      <th style={{ textAlign: 'right' }}>Profit</th>
                      <th style={{ textAlign: 'right', width: 80 }}>ROAS</th>
                      <th style={{ width: 36, textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => {
                      const dailyRoas = l.spend > 0 ? l.revenue / l.spend : 0;
                      const win = dailyRoas > 0 && isWinning(dailyRoas, beroas);
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
                          <td>
                            <div className="px-3 py-2 text-right text-[11px] tabular-nums">
                              {dailyRoas > 0 ? (
                                <span className={cn('inline-flex items-center gap-1', win ? 'text-emerald-400' : 'text-foreground')}>
                                  {win && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                                  {dailyRoas.toFixed(2)}x
                                </span>
                              ) : '—'}
                            </div>
                          </td>
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
            </div>
          )}

          <p className="pt-1 text-center text-[10px] text-muted-foreground/60">
            ROAS / orders / launch info live in <Link href="/funnels" className="text-primary hover:text-primary/80">Funnels</Link>. Same daily log record, different views.
          </p>
        </div>
      </div>
    </>
  );
}

// ── Big input tile for money fields ─────────────────────────────────────────

function MoneyInput({
  label, value, onChange, tone, allowNegative,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tone: 'amber' | 'sky' | 'emerald';
  allowNegative?: boolean;
}) {
  const toneMap = {
    amber:   { accent: 'text-amber-400',   border: 'hover:border-amber-500/40   focus-within:border-amber-500/60',   bg: 'focus-within:bg-amber-500/[0.04]' },
    sky:     { accent: 'text-sky-400',     border: 'hover:border-sky-500/40     focus-within:border-sky-500/60',     bg: 'focus-within:bg-sky-500/[0.04]' },
    emerald: { accent: 'text-emerald-400', border: 'hover:border-emerald-500/40 focus-within:border-emerald-500/60', bg: 'focus-within:bg-emerald-500/[0.04]' },
  };
  const t = toneMap[tone];
  return (
    <div className={cn('group rounded-xl border border-border bg-background/40 p-4 transition-colors', t.border, t.bg)}>
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={cn('text-xl font-semibold leading-none', t.accent)}>$</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={allowNegative ? undefined : 0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full bg-transparent text-[28px] font-semibold leading-none tabular-nums text-foreground outline-none placeholder:text-muted-foreground/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    </div>
  );
}

// ── Animated stat tile ─────────────────────────────────────────────────────

function BigStat({
  label, value, tone, delay = 0,
}: {
  label: string;
  value: string;
  tone: 'amber' | 'sky' | 'emerald' | 'rose' | 'neutral';
  delay?: number;
}) {
  const toneMap = {
    amber:   { text: 'text-amber-400',        border: 'border-amber-500/30',        glow: '#fbbf24', dot: 'bg-amber-400' },
    sky:     { text: 'text-sky-400',          border: 'border-sky-500/30',          glow: '#38bdf8', dot: 'bg-sky-400' },
    emerald: { text: 'text-emerald-400',      border: 'border-emerald-500/30',      glow: '#34d399', dot: 'bg-emerald-400' },
    rose:    { text: 'text-rose-400',         border: 'border-rose-500/30',         glow: '#fb7185', dot: 'bg-rose-400' },
    neutral: { text: 'text-foreground',       border: 'border-border',              glow: '#71717a', dot: 'bg-muted-foreground' },
  };
  const t = toneMap[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, boxShadow: `0 12px 30px -14px ${t.glow}55, 0 0 0 1px ${t.glow}33` }}
      className={cn('group relative overflow-hidden rounded-xl border bg-card p-3.5', t.border)}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-70"
        style={{ background: `radial-gradient(circle, ${t.glow}55, transparent 70%)` }}
        aria-hidden
      />
      <div className="relative z-10 flex items-center justify-between">
        <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} aria-hidden />
      </div>
      <p className={cn('relative z-10 mt-1.5 text-[20px] font-semibold leading-none tabular-nums tracking-tight', t.text)}>
        {value}
      </p>
    </motion.div>
  );
}

// ── Quick date chip ─────────────────────────────────────────────────────────

function DateChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
        active
          ? 'border-primary/40 bg-primary/15 text-primary'
          : 'border-border bg-card text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}
