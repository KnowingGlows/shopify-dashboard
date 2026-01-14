'use client';

import { useEffect, useState } from 'react';
import { StatsCard } from './stats-card';
import { StoreBreakdown } from './store-breakdown';
import { StoreFilter } from './store-filter';
import { BackgroundDecor } from './background-decor';
import { IndianRupee, ShoppingCart, TrendingUp, RefreshCw, AlertCircle } from 'lucide-react';
import { SalesMetrics, OrderData } from '@/types/shopify';
import { formatINR } from '@/lib/currency-converter';
import { aggregateSalesData, filterByStore } from '@/lib/sales-aggregator';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

export function Dashboard() {
  const [salesData, setSalesData] = useState<SalesMetrics | null>(null);
  const [ordersData, setOrdersData] = useState<OrderData[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7d' | '30d'>(
    'today'
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchData = async (range = dateRange) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/sales?range=${range}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      setOrdersData(result.ordersData);
      setSalesData(result.data);
      setLastUpdated(new Date(result.lastUpdated).toLocaleString('en-IN'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
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
            <Button onClick={() => fetchData()} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!salesData) {
    return null;
  }

  const storeNames = ordersData.map((data) => data.storeName);
  const rangeOptions: Array<{
    value: 'today' | 'yesterday' | '7d' | '30d';
    label: string;
  }> = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7d', label: 'Past 7 Days' },
    { value: '30d', label: 'Past 30 Days' },
  ];
  const activeRangeLabel =
    rangeOptions.find((option) => option.value === dateRange)?.label ?? 'Today';

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
      {/* Header */}
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
              Live Insights
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Sales Dashboard
            </h1>
            <p className="text-muted-foreground mt-2">
              Track your Shopify stores performance in one place.
            </p>
          </div>
          <div className="flex flex-col items-start gap-4 md:items-end">
            <div className="flex flex-wrap items-center gap-3">
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
              <StoreFilter
                stores={storeNames}
                selectedStore={selectedStore}
                onStoreChange={setSelectedStore}
              />
              <Button
                onClick={() => fetchData()}
                variant="outline"
                size="icon"
                className="bg-background/60 backdrop-blur border-border/60 hover:border-primary/50 hover:text-primary"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Showing: {activeRangeLabel} · Last sync: {lastUpdated}
            </div>
          </div>
        </div>

      {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="Total Sales"
          value={formatINR(salesData.totalSalesINR)}
          icon={IndianRupee}
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
          value={formatINR(salesData.averageOrderValue)}
          icon={TrendingUp}
          description="Per order"
        />
        </div>

      {/* Store Breakdown */}
        {selectedStore === 'all' && salesData.storeBreakdown.length > 1 && (
          <StoreBreakdown stores={salesData.storeBreakdown} />
        )}

      {/* Footer */}
        <div className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Shopify sales analytics
        </div>
      </div>
    </div>
  );
}
