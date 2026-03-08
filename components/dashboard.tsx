'use client';

import { useEffect, useState } from 'react';
import { StatsCard } from './stats-card';
import { StoreBreakdown } from './store-breakdown';
import { StoreFilter } from './store-filter';
import { IndianRupee, ShoppingCart, TrendingUp, RefreshCw, AlertCircle, Code2, X, Loader2 } from 'lucide-react';
import { SalesMetrics, OrderData } from '@/types/shopify';
import { formatCurrency } from '@/lib/currency-converter';
import { aggregateSalesData, filterByStore } from '@/lib/sales-aggregator';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

export function Dashboard() {
  const [salesData, setSalesData] = useState<SalesMetrics | null>(null);
  const [ordersData, setOrdersData] = useState<OrderData[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7d' | '30d' | 'custom'>('today');
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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Loading sales data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-lg border border-destructive/30 bg-card p-6 text-center">
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
  const rangeOptions: Array<{ value: typeof dateRange; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: 'custom', label: 'Custom' },
  ];
  const activeRangeLabel = dateRange === 'custom' && customRange.start
    ? `${customRange.start}${customRange.end ? ` → ${customRange.end}` : ''}`
    : rangeOptions.find((o) => o.value === dateRange)?.label ?? 'Today';

  const applyCustomRange = () => {
    if (!customRange.start) { setCustomRangeError('Select a start date.'); return; }
    setCustomRangeError(null);
    setDateRange('custom');
    fetchData('custom', customRange);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-5">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
          {rangeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDateRange(opt.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-[11px] font-medium transition-all',
                opt.value === dateRange ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <StoreFilter stores={storeNames} selectedStore={selectedStore} onStoreChange={setSelectedStore} />

        <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
          {(['INR', 'USD'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-all',
                currency === c ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <button
          onClick={() => fetchData(dateRange, dateRange === 'custom' ? customRange : undefined)}
          className="rounded-md border border-border bg-card p-2 text-muted-foreground transition hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>

        <span className="ml-auto text-[11px] text-muted-foreground">{activeRangeLabel} · {lastUpdated}</span>
      </div>

      {/* Custom range picker */}
      {dateRange === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
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

      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <StatsCard title="Total Sales" value={formatCurrency(salesData.totalSalesINR, currency)}
          icon={currency === 'INR' ? IndianRupee : TrendingUp}
          description={selectedStore === 'all' ? 'Across all stores' : selectedStore} />
        <StatsCard title="Total Orders" value={salesData.totalOrders.toLocaleString('en-IN')}
          icon={ShoppingCart} description={selectedStore === 'all' ? 'Combined orders' : `From ${selectedStore}`} />
        <StatsCard title="Avg Order Value" value={formatCurrency(salesData.averageOrderValue, currency)}
          icon={currency === 'INR' ? IndianRupee : TrendingUp} description="Per order" />
      </div>

      {/* Store Breakdown */}
      {selectedStore === 'all' && salesData.storeBreakdown.length > 0 && (
        <StoreBreakdown stores={salesData.storeBreakdown} currency={currency} />
      )}

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
