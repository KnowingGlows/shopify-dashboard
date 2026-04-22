'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { StoreBreakdown } from './store-breakdown';
import { StoreFilter } from './store-filter';
import { RefreshCw, AlertCircle, Code2, X, Loader2, Store, ArrowUpRight } from 'lucide-react';
import { SalesMetrics, OrderData } from '@/types/shopify';
import { formatCurrency, convertToINR } from '@/lib/currency-converter';
import { aggregateSalesData, filterByStore } from '@/lib/sales-aggregator';
import { cn } from '@/lib/utils';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';

type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom' },
];

function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const NAME_OVERRIDES: Record<string, string> = {
  'tsovansh@gmail.com': 'Sovansh',
};

function displayName(email?: string | null) {
  if (!email) return 'there';
  const key = email.toLowerCase();
  if (NAME_OVERRIDES[key]) return NAME_OVERRIDES[key];
  const handle = email.split('@')[0];
  const first = handle.split(/[._-]/)[0] ?? handle;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

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
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

type SeriesPoint = { t: string; v: number };

function buildSeries(orders: OrderData[], range: RangeKey): SeriesPoint[] {
  const hourly = range === 'today' || range === 'yesterday';
  const flat = orders.flatMap((d) =>
    d.orders.map((o) => {
      const gross = Number(o.total_price || 0) - Number(o.total_refunded || 0);
      return {
        at: new Date(o.created_at).getTime(),
        inr: convertToINR(Math.max(0, gross), o.currency),
      };
    })
  );
  if (flat.length === 0) return [];

  if (hourly) {
    const buckets = new Map<number, number>();
    for (let h = 0; h < 24; h++) buckets.set(h, 0);
    flat.forEach(({ at, inr }) => {
      const h = new Date(at).getHours();
      buckets.set(h, (buckets.get(h) ?? 0) + (Number.isFinite(inr) ? inr : 0));
    });
    return Array.from(buckets.entries()).map(([h, v]) => ({ t: `${h}:00`, v }));
  }

  const buckets = new Map<string, number>();
  flat.forEach(({ at, inr }) => {
    const key = new Date(at).toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + (Number.isFinite(inr) ? inr : 0));
  });
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, v]) => ({ t, v }));
}

function Sparkline({ data, color = '#a78bfa', animationBegin = 0 }: { data: SeriesPoint[]; color?: string; animationBegin?: number }) {
  if (!data || data.length < 2) {
    return <div className="h-10 w-full rounded bg-muted/30" />;
  }
  const gid = `spark-${color.replace('#', '')}`;
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gid})`}
            isAnimationActive
            animationDuration={900}
            animationBegin={animationBegin}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricTile({
  label,
  rawValue,
  format,
  description,
  series,
  color = '#a78bfa',
  delay = 0,
}: {
  label: string;
  rawValue: number;
  format: (n: number) => string;
  description?: string;
  series: SeriesPoint[];
  color?: string;
  delay?: number;
}) {
  const animated = useCountUp(rawValue, 700);
  const hoverShadow = `0 14px 40px -16px ${color}55, 0 0 0 1px ${color}33`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3, boxShadow: hoverShadow }}
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-colors duration-300 hover:border-[color:var(--tile-color)]/40"
      style={{ ['--tile-color' as string]: color }}
    >
      {/* Soft corner glow that brightens on hover */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-40 blur-2xl transition-opacity duration-500 group-hover:opacity-90"
        style={{ background: `radial-gradient(circle, ${color}33, transparent 70%)` }}
        aria-hidden
      />

      <div className="relative z-10 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <span
          className="h-1.5 w-1.5 rounded-full transition-transform duration-300 group-hover:scale-125"
          style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}88` }}
          aria-hidden
        />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: delay + 0.1 }}
        className="relative z-10 mt-2 text-[26px] font-semibold leading-none tracking-tight text-foreground"
      >
        {format(animated)}
      </motion.div>
      {description && (
        <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">{description}</p>
      )}
      <div className="relative z-10 mt-3">
        <Sparkline data={series} color={color} animationBegin={delay * 1000 + 200} />
      </div>
    </motion.div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const [salesData, setSalesData] = useState<SalesMetrics | null>(null);
  const [ordersData, setOrdersData] = useState<OrderData[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [dateRange, setDateRange] = useState<RangeKey>('today');
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [devLog, setDevLog] = useState<{
    status: 'Idle' | 'Fetching' | 'Success' | 'Warning' | 'Error';
    lastAttempt: string;
    lastSync: string;
    error: string | null;
    note: string | null;
    range: string;
    rangeStart: string;
    rangeEnd: string;
    storeCounts: Array<{ name: string; count: number }>;
    storeErrors: Array<{ storeName: string; message: string }>;
  }>({
    status: 'Idle', lastAttempt: '', lastSync: '', error: null, note: null,
    range: '', rangeStart: '', rangeEnd: '', storeCounts: [], storeErrors: [],
  });

  const fetchData = async (range = dateRange, customDates?: { start?: string; end?: string }) => {
    const attemptStamp = new Date().toLocaleString('en-IN');
    try {
      setLoading(true);
      setError(null);
      setDevLog((prev) => ({ ...prev, status: 'Fetching', lastAttempt: attemptStamp, error: null, note: null }));
      const params = new URLSearchParams({ range });
      if (range === 'custom' && customDates?.start) {
        params.set('start', customDates.start);
        if (customDates.end) params.set('end', customDates.end);
      }
      const response = await fetch(`/api/sales?${params.toString()}`);
      let result: {
        data?: SalesMetrics; ordersData?: OrderData[]; lastUpdated?: string;
        error?: string; range?: string; rangeStart?: string; rangeEnd?: string;
        storeErrors?: Array<{ storeName: string; message: string }>;
      };
      try { result = await response.json(); } catch { throw new Error('Invalid JSON response'); }
      if (!response.ok) throw new Error(result?.error || `HTTP ${response.status}`);

      const syncStamp = result.lastUpdated ? new Date(result.lastUpdated).toLocaleString('en-IN') : attemptStamp;
      const nextOrders = result.ordersData || [];
      const storeCounts = nextOrders.map((entry) => ({ name: entry.storeName, count: entry.orders.length }));
      const storeErrors = result.storeErrors || [];
      const totalOrders = nextOrders.reduce((sum, entry) => sum + entry.orders.length, 0);
      const hasWarning = storeErrors.length > 0 || totalOrders === 0;
      const noteParts: string[] = [];
      if (totalOrders === 0) noteParts.push('No orders returned.');
      if (storeErrors.length > 0) noteParts.push('Some stores failed.');

      setOrdersData(nextOrders);
      setSalesData(result.data || null);
      setLastUpdated(syncStamp);
      setDevLog((prev) => ({
        ...prev, status: hasWarning ? 'Warning' : 'Success', lastSync: syncStamp,
        error: null, note: noteParts.length > 0 ? noteParts.join(' ') : null,
        range: result.range ?? '', rangeStart: result.rangeStart ?? '',
        rangeEnd: result.rangeEnd ?? '', storeCounts, storeErrors,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      setDevLog((prev) => ({ ...prev, status: 'Error', error: message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dateRange !== 'custom') fetchData();
  }, [dateRange]);

  useEffect(() => {
    if (ordersData.length > 0) {
      const filteredData = filterByStore(ordersData, selectedStore);
      setSalesData(aggregateSalesData(filteredData));
    }
  }, [selectedStore, ordersData]);

  const filteredOrders = useMemo(
    () => filterByStore(ordersData, selectedStore),
    [ordersData, selectedStore]
  );
  const salesSeries = useMemo(() => buildSeries(filteredOrders, dateRange), [filteredOrders, dateRange]);
  const ordersSeries = useMemo<SeriesPoint[]>(
    () => salesSeries.map((p) => ({ t: p.t, v: p.v > 0 ? 1 : 0 })),
    [salesSeries]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-muted/50" />
            <div className="h-3 w-64 animate-pulse rounded bg-muted/30" />
          </div>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[150px] rounded-xl border border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-destructive/30 bg-card p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-3 text-sm text-foreground">Error Loading Data</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button onClick={() => fetchData(dateRange, dateRange === 'custom' ? customRange : undefined)} className="mt-4 w-full" size="sm">
            <RefreshCw className="mr-2 h-3 w-3" /> Retry
          </Button>
        </div>
        <DevPanel log={devLog} />
      </div>
    );
  }

  if (!salesData) return null;

  const storeNames = ordersData.map((d) => d.storeName);
  const activeRangeLabel = dateRange === 'custom' && customRange.start
    ? `${customRange.start}${customRange.end ? ` → ${customRange.end}` : ''}`
    : RANGE_OPTIONS.find((o) => o.value === dateRange)?.label ?? 'Today';

  const applyCustomRange = () => {
    if (!customRange.start) { setCustomRangeError('Select a start date.'); return; }
    setCustomRangeError(null);
    setDateRange('custom');
    fetchData('custom', customRange);
  };

  const topStore = salesData.storeBreakdown.length > 0
    ? [...salesData.storeBreakdown].sort((a, b) => b.totalSalesINR - a.totalSalesINR)[0]
    : null;
  const activeStoreCount = salesData.storeBreakdown.filter((s) => s.totalOrders > 0).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Greeting header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {greetingFor()}, {displayName(user?.email)}
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {todayLabel()}
            {lastUpdated && <> · Updated {lastUpdated}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
            {(['INR', 'USD'] as const).map((c) => (
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
          <button
            onClick={() => fetchData(dateRange, dateRange === 'custom' ? customRange : undefined)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      {/* Range tabs — Shopify-style underline */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <div className="flex flex-wrap items-center gap-1 -mb-px">
          {RANGE_OPTIONS.map((opt) => {
            const active = opt.value === dateRange;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDateRange(opt.value)}
                className={cn(
                  'relative px-3 py-2 text-[12px] font-medium transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
        <div className="pb-2">
          <StoreFilter stores={storeNames} selectedStore={selectedStore} onStoreChange={setSelectedStore} />
        </div>
      </div>

      {/* Custom range picker */}
      {dateRange === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <span className="text-[11px] text-muted-foreground">From</span>
          <input type="date" value={customRange.start}
            onChange={(e) => { setCustomRangeError(null); setCustomRange((p) => ({ ...p, start: e.target.value })); }}
            className="rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground" />
          <span className="text-[11px] text-muted-foreground">To</span>
          <input type="date" value={customRange.end}
            onChange={(e) => { setCustomRangeError(null); setCustomRange((p) => ({ ...p, end: e.target.value })); }}
            className="rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground" />
          <Button onClick={applyCustomRange} size="sm" variant="outline" className="text-[11px]">Apply</Button>
          {customRangeError && <span className="text-[11px] text-destructive">{customRangeError}</span>}
        </div>
      )}

      {/* Overview section */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-foreground">Overview</h2>
          <span className="text-[11px] text-muted-foreground">
            {activeRangeLabel}
            {selectedStore !== 'all' && <> · {selectedStore}</>}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <MetricTile
            label="Total sales"
            rawValue={salesData.totalSalesINR}
            format={(n) => formatCurrency(n, currency)}
            description={selectedStore === 'all' ? 'Across all stores' : selectedStore}
            series={salesSeries}
            color="#a78bfa"
            delay={0}
          />
          <MetricTile
            label="Orders"
            rawValue={salesData.totalOrders}
            format={(n) => Math.round(n).toLocaleString('en-IN')}
            description={selectedStore === 'all' ? 'Combined orders' : `From ${selectedStore}`}
            series={ordersSeries}
            color="#34d399"
            delay={0.08}
          />
          <MetricTile
            label="Average order value"
            rawValue={salesData.averageOrderValue}
            format={(n) => formatCurrency(n, currency)}
            description="Per order"
            series={salesSeries}
            color="#60a5fa"
            delay={0.16}
          />
        </div>
      </section>

      {/* Breakdown + at-a-glance */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {selectedStore === 'all' && salesData.storeBreakdown.length > 0 ? (
            <StoreBreakdown stores={salesData.storeBreakdown} currency={currency} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
              <div>
                <Store className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {selectedStore === 'all'
                    ? 'No store data for this range.'
                    : `Viewing only ${selectedStore}. Switch to All stores to see the breakdown.`}
                </p>
              </div>
            </div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -2 }}
          className="rounded-xl border border-border bg-card transition-colors hover:border-border/80"
        >
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-medium text-foreground">At a glance</h2>
          </div>
          <dl className="divide-y divide-border text-[12px]">
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-muted-foreground">Active stores</dt>
              <dd className="font-medium text-foreground">{activeStoreCount}</dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-muted-foreground">Top store</dt>
              <dd className="max-w-[60%] truncate text-right font-medium text-foreground">
                {topStore?.storeName ?? '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-muted-foreground">Top store sales</dt>
              <dd className="font-medium text-foreground">
                {topStore ? formatCurrency(topStore.totalSalesINR, currency) : '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-muted-foreground">Range</dt>
              <dd className="font-medium text-foreground">{activeRangeLabel}</dd>
            </div>
          </dl>
          <div className="border-t border-border px-4 py-2.5">
            <a
              href="/orders"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80"
            >
              View orders <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </motion.div>
      </section>

      <DevPanel log={devLog} />
    </div>
  );
}

function DevPanel({ log }: {
  log: {
    status: 'Idle' | 'Fetching' | 'Success' | 'Warning' | 'Error';
    lastAttempt: string; lastSync: string; error: string | null; note: string | null;
    range: string; rangeStart: string; rangeEnd: string;
    storeCounts: Array<{ name: string; count: number }>;
    storeErrors: Array<{ storeName: string; message: string }>;
  };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dot = log.status === 'Error' ? 'bg-red-400' : log.status === 'Warning' ? 'bg-amber-400'
    : log.status === 'Success' ? 'bg-emerald-400' : log.status === 'Fetching' ? 'bg-blue-400' : 'bg-zinc-500';

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-20 hidden md:block">
      {isOpen ? (
        <div className="pointer-events-auto w-64 rounded-lg border border-border bg-card p-3 text-[11px] text-muted-foreground shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">Dev Panel</span>
            <div className="flex items-center gap-2">
              <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
              <button onClick={() => setIsOpen(false)} className="p-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between"><span>Status</span><span className="text-foreground">{log.status}</span></div>
            <div className="flex justify-between"><span>Range</span><span className="text-foreground">{log.range || '—'}</span></div>
            <div className="flex justify-between"><span>Synced</span><span className="text-foreground">{log.lastSync || '—'}</span></div>
          </div>
          {log.storeCounts.length > 0 && (
            <div className="mt-2 rounded border border-border bg-background p-2">
              {log.storeCounts.map((s) => (
                <div key={s.name} className="flex justify-between"><span>{s.name}</span><span className="text-foreground">{s.count}</span></div>
              ))}
            </div>
          )}
          {log.storeErrors.length > 0 && (
            <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-amber-400">
              {log.storeErrors.map((e) => <div key={e.storeName}>{e.storeName}: {e.message}</div>)}
            </div>
          )}
          {log.error && <div className="mt-2 rounded border border-red-500/30 bg-red-500/5 p-2 text-red-400">{log.error}</div>}
        </div>
      ) : (
        <button onClick={() => setIsOpen(true)}
          className={cn('pointer-events-auto relative flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card transition hover:bg-secondary',
            log.status === 'Error' && 'border-red-500/30', log.status === 'Warning' && 'border-amber-500/30')}>
          <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={cn('absolute right-1 top-1 h-1.5 w-1.5 rounded-full', dot)} />
        </button>
      )}
    </div>
  );
}
