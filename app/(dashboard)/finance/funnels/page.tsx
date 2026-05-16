'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Wallet, X, AlertTriangle, Search, Globe,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
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
  const [filterDate, setFilterDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<FunnelStatus | 'all'>('all');
  const [search, setSearch] = useState('');


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

  const rates: UsdRates = fx?.rates ?? { USD: 1, INR: 83.5 };
  const fmt = (usd: number) => formatFromUSD(usd, currency, rates);

  const productIdByName = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => { if (p.productName) m.set(p.productName, p.id); });
    return m;
  }, [products]);

  // Derived
  const moneyByFunnel = useMemo(() => {
    const m: Record<string, FunnelMoney> = {};
    funnels.forEach((f) => {
      const all = logsByFunnel[f.id] ?? [];
      const scoped = filterDate ? all.filter((l) => l.date === filterDate) : all;
      m[f.id] = aggregateMoney(scoped);
    });
    return m;
  }, [funnels, logsByFunnel, filterDate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return funnels.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (q) {
        const hay = [f.productName, f.funnelishUrl].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // Highest spend first — money page focuses on where the dollars are
      const sa = moneyByFunnel[a.id]?.totalSpend ?? 0;
      const sb = moneyByFunnel[b.id]?.totalSpend ?? 0;
      return sb - sa;
    });
  }, [funnels, statusFilter, search, moneyByFunnel]);

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
          {(['USD', 'INR'] as const).map((c) => (
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

      <DateFilterStrip filterDate={filterDate} onChange={setFilterDate} />

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
            />
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · {fx?.source === 'live' ? 'live FX' : fx?.source === 'cache' ? 'cached FX' : fx?.source === 'fallback' ? 'fallback FX' : 'FX loading'} · launches/performance live in <Link href="/funnels" className="text-primary hover:text-primary/80">Funnels</Link>
      </p>

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
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Money for</p>
      <FilterDateChip active={filterDate === ''} onClick={() => onChange('')}>All time</FilterDateChip>
      <FilterDateChip active={filterDate === today} onClick={() => onChange(today)}>Today</FilterDateChip>
      <FilterDateChip active={filterDate === yest} onClick={() => onChange(yest)}>Yesterday</FilterDateChip>
      <DatePicker value={filterDate} onChange={onChange} placeholder="Pick a day" compact />
      {filterDate && (
        <span className="text-[10px] text-emerald-400">Viewing {filterDate} only</span>
      )}
    </motion.div>
  );
}

function FilterDateChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
  funnel: f, money, product, fmt, index,
}: {
  funnel: Funnel;
  money: FunnelMoney;
  product: ProductTrackerEntry | undefined;
  fmt: (usd: number) => string;
  index: number;
}) {
  const tone = TONE[STATUS_OPTIONS.find((s) => s.value === f.status)?.tone ?? 'gray'];
  const winning = isWinning(money.blendedRoas, effectiveBeroas(f, product));
  const hasSpend = money.totalSpend > 0;
  const profitTone = money.totalProfit < 0 ? 'text-rose-400' : money.totalProfit > 0 ? 'text-emerald-400' : 'text-muted-foreground';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.3), ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="relative"
    >
    <Link
      href={`/finance/funnels/${f.id}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-border/80"
    >
      <div className={cn('absolute inset-x-0 top-0 h-[3px]', tone.bar)} aria-hidden />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{f.productName}</p>
          <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background/40 px-2 py-0.5">
            <Globe className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden />
            <span className="truncate text-[11px] font-medium text-muted-foreground">
              {f.funnelishUrl ? f.funnelishUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'No LP link'}
            </span>
          </div>
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
    </Link>
    </motion.div>
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

