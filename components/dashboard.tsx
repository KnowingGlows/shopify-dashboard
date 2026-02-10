'use client';

import { useEffect, useState } from 'react';
import { StatsCard } from './stats-card';
import { StoreBreakdown } from './store-breakdown';
import { StoreFilter } from './store-filter';
import { BackgroundDecor } from './background-decor';
import { IndianRupee, ShoppingCart, TrendingUp, RefreshCw, AlertCircle, Code2, X } from 'lucide-react';
import { SalesMetrics, OrderData } from '@/types/shopify';
import { formatCurrency } from '@/lib/currency-converter';
import { aggregateSalesData, filterByStore } from '@/lib/sales-aggregator';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

export function Dashboard() {
  const [salesData, setSalesData] = useState<SalesMetrics | null>(null);
  const [ordersData, setOrdersData] = useState<OrderData[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7d' | '30d' | 'custom'>(
    'today'
  );
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });
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
    status: 'Idle',
    lastAttempt: '',
    lastSync: '',
    error: null,
    note: null,
    range: '',
    rangeStart: '',
    rangeEnd: '',
    storeCounts: [],
    storeErrors: [],
  });

  const fetchData = async (
    range = dateRange,
    customDates?: { start?: string; end?: string }
  ) => {
    const attemptStamp = new Date().toLocaleString('en-IN');
    try {
      setLoading(true);
      setError(null);
      setDevLog((prev) => ({
        ...prev,
        status: 'Fetching',
        lastAttempt: attemptStamp,
        error: null,
        note: null,
      }));
      const params = new URLSearchParams({ range });
      if (range === 'custom' && customDates?.start) {
        params.set('start', customDates.start);
        if (customDates.end) {
          params.set('end', customDates.end);
        }
      }
      const response = await fetch(`/api/sales?${params.toString()}`);
      let result: {
        data?: SalesMetrics;
        ordersData?: OrderData[];
        lastUpdated?: string;
        error?: string;
        range?: string;
        rangeStart?: string;
        rangeEnd?: string;
        storeErrors?: Array<{ storeName: string; message: string }>;
      };
      try {
        result = await response.json();
      } catch (err) {
        throw new Error('Invalid JSON response from /api/sales');
      }

      if (!response.ok) {
        const message = result?.error || `HTTP ${response.status} ${response.statusText}`;
        throw new Error(message);
      }

      const syncStamp = result.lastUpdated
        ? new Date(result.lastUpdated).toLocaleString('en-IN')
        : attemptStamp;
      const nextOrders = result.ordersData || [];
      const totalOrders = nextOrders.reduce((sum, entry) => sum + entry.orders.length, 0);
      const storeCounts = nextOrders.map((entry) => ({
        name: entry.storeName,
        count: entry.orders.length,
      }));
      const storeErrors = result.storeErrors || [];
      const hasWarning = storeErrors.length > 0 || totalOrders === 0;
      const noteParts: string[] = [];
      if (totalOrders === 0) {
        noteParts.push('No orders returned for this range.');
      }
      if (storeErrors.length > 0) {
        noteParts.push('Some stores failed to sync.');
      }

      setOrdersData(nextOrders);
      setSalesData(result.data || null);
      setLastUpdated(syncStamp);
      setDevLog((prev) => ({
        ...prev,
        status: hasWarning ? 'Warning' : 'Success',
        lastSync: syncStamp,
        error: null,
        note: noteParts.length > 0 ? noteParts.join(' ') : null,
        range: result.range ?? '',
        rangeStart: result.rangeStart ?? '',
        rangeEnd: result.rangeEnd ?? '',
        storeCounts,
        storeErrors,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      setDevLog((prev) => ({
        ...prev,
        status: 'Error',
        error: message,
      }));
      console.error('Error fetching sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dateRange !== 'custom') {
      fetchData();
    }
  }, [dateRange]);

  useEffect(() => {
    if (ordersData.length > 0) {
      const filteredData = filterByStore(ordersData, selectedStore);
      const metrics = aggregateSalesData(filteredData);
      setSalesData(metrics);
    }
  }, [selectedStore, ordersData]);

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
        <BackgroundDecor />
        <div className="relative text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-[0_0_30px_rgba(34,211,238,0.35)]">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Sync in progress</p>
          <p className="text-muted-foreground">Loading your sales data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
        <BackgroundDecor />
        <Card className="relative max-w-md border-destructive/50 bg-card/70 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Data
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() =>
                fetchData(dateRange, dateRange === 'custom' ? customRange : undefined)
              }
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
        <DeveloperModePanel log={devLog} />
      </div>
    );
  }

  if (!salesData) {
    return null;
  }

  const storeNames = ordersData.map((data) => data.storeName);
  const rangeOptions: Array<{
    value: 'today' | 'yesterday' | '7d' | '30d' | 'custom';
    label: string;
  }> = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7d', label: 'Past 7 Days' },
    { value: '30d', label: 'Past 30 Days' },
    { value: 'custom', label: 'Custom' },
  ];
  const activeRangeLabel =
    dateRange === 'custom' && customRange.start
      ? `${customRange.start}${customRange.end ? ` → ${customRange.end}` : ''}`
      : rangeOptions.find((option) => option.value === dateRange)?.label ?? 'Today';

  const applyCustomRange = () => {
    if (!customRange.start) {
      setCustomRangeError('Select a start date to apply a custom range.');
      return;
    }
    setCustomRangeError(null);
    setDateRange('custom');
    fetchData('custom', customRange);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
      {/* Controls */}
        <div className="flex flex-col gap-4 rounded-3xl border border-border/50 bg-card/60 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          {/* Row 1: Date range + sync info */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1">
              {rangeOptions.map((option) => {
                const isActive = option.value === dateRange;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDateRange(option.value)}
                    className={cn(
                      'rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] transition-all',
                      isActive
                        ? 'bg-primary/20 text-primary shadow-[0_0_16px_rgba(34,211,238,0.45)]'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {activeRangeLabel} · {lastUpdated}
            </div>
          </div>

          {/* Row 2: Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <StoreFilter
              stores={storeNames}
              selectedStore={selectedStore}
              onStoreChange={setSelectedStore}
            />
            <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1">
              {(['INR', 'USD'] as const).map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => setCurrency(curr)}
                  className={cn(
                    'rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] transition-all',
                    currency === curr
                      ? 'bg-primary/20 text-primary shadow-[0_0_16px_rgba(34,211,238,0.45)]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {curr}
                </button>
              ))}
            </div>
            <Button
              onClick={() =>
                fetchData(dateRange, dateRange === 'custom' ? customRange : undefined)
              }
              variant="outline"
              size="icon"
              className="bg-background/60 backdrop-blur border-border/60 hover:border-primary/50 hover:text-primary"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Custom date picker (conditional) */}
          {dateRange === 'custom' ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/50 bg-background/60 p-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Start</span>
                <input
                  type="date"
                  value={customRange.start}
                  onChange={(event) => {
                    setCustomRangeError(null);
                    setCustomRange((prev) => ({ ...prev, start: event.target.value }));
                  }}
                  className="h-9 rounded-xl border border-border/60 bg-background/70 px-3 text-[11px] text-foreground shadow-[0_0_18px_rgba(15,23,42,0.2)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <span>End</span>
                <input
                  type="date"
                  value={customRange.end}
                  onChange={(event) => {
                    setCustomRangeError(null);
                    setCustomRange((prev) => ({ ...prev, end: event.target.value }));
                  }}
                  className="h-9 rounded-xl border border-border/60 bg-background/70 px-3 text-[11px] text-foreground shadow-[0_0_18px_rgba(15,23,42,0.2)]"
                />
              </div>
              <Button
                onClick={applyCustomRange}
                variant="outline"
                className="h-9 border-border/60 bg-background/70 text-[11px] uppercase tracking-[0.2em]"
              >
                Apply
              </Button>
              {customRangeError ? (
                <span className="text-[11px] text-rose-200">{customRangeError}</span>
              ) : null}
            </div>
          ) : null}
        </div>

      {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="Total Sales"
          value={formatCurrency(salesData.totalSalesINR, currency)}
          icon={currency === 'INR' ? IndianRupee : TrendingUp}
          description={selectedStore === 'all' ? 'Across all stores' : selectedStore}
        />
        <StatsCard
          title="Total Orders"
          value={salesData.totalOrders.toLocaleString('en-IN')}
          icon={ShoppingCart}
          description={selectedStore === 'all' ? 'Combined orders' : `From ${selectedStore}`}
        />
        <StatsCard
          title="Average Order Value"
          value={formatCurrency(salesData.averageOrderValue, currency)}
          icon={currency === 'INR' ? IndianRupee : TrendingUp}
          description="Per order"
        />
        </div>

      {/* Store Breakdown */}
        {selectedStore === 'all' && salesData.storeBreakdown.length > 0 && (
          <StoreBreakdown stores={salesData.storeBreakdown} currency={currency} />
        )}

      </div>
      <DeveloperModePanel log={devLog} />
    </div>
  );
}

function DeveloperModePanel({
  log,
}: {
  log: {
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
  };
}) {
  const [isOpen, setIsOpen] = useState(false);

  const statusColor =
    log.status === 'Error'
      ? 'bg-rose-400'
      : log.status === 'Warning'
        ? 'bg-amber-400'
        : log.status === 'Fetching'
          ? 'bg-sky-400'
          : log.status === 'Success'
            ? 'bg-emerald-400'
            : 'bg-muted-foreground';

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-20 hidden md:block">
      {isOpen ? (
        <div className="pointer-events-auto w-72 rounded-2xl border border-border/60 bg-background/70 p-4 text-xs text-muted-foreground shadow-[0_0_30px_rgba(15,23,42,0.4)] backdrop-blur">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            <span>Developer mode</span>
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', statusColor)} />
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 hover:bg-background/80 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span>Range</span>
              <span className="text-foreground">{log.range ? log.range.toUpperCase() : '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Status</span>
              <span className="text-foreground">{log.status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last attempt</span>
              <span className="text-foreground">{log.lastAttempt || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last sync</span>
              <span className="text-foreground">{log.lastSync || '—'}</span>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-[10px] text-muted-foreground">
              <div>Window start: {log.rangeStart || '—'}</div>
              <div>Window end: {log.rangeEnd || '—'}</div>
            </div>
          </div>
          {log.storeCounts.length > 0 ? (
            <div className="mt-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
              {log.storeCounts.map((store) => (
                <div key={store.name} className="flex items-center justify-between">
                  <span>{store.name}</span>
                  <span className="text-foreground">{store.count}</span>
                </div>
              ))}
            </div>
          ) : null}
          {log.note ? (
            <div className="mt-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
              {log.note}
            </div>
          ) : null}
          {log.storeErrors.length > 0 ? (
            <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
              {log.storeErrors.map((storeError) => (
                <div key={storeError.storeName}>
                  {storeError.storeName}: {storeError.message}
                </div>
              ))}
            </div>
          ) : null}
          {log.error ? (
            <div className="mt-3 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {log.error}
            </div>
          ) : null}
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            'pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/70 shadow-[0_0_30px_rgba(15,23,42,0.4)] backdrop-blur transition-colors hover:bg-background/90',
            log.status === 'Error' && 'border-rose-400/50',
            log.status === 'Warning' && 'border-amber-400/50'
          )}
          title="Open developer panel"
        >
          <Code2 className="h-4 w-4 text-muted-foreground" />
          <span className={cn('absolute top-2 right-2 h-2 w-2 rounded-full', statusColor)} />
        </button>
      )}
    </div>
  );
}
