'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BackgroundDecor } from '@/components/background-decor';
import { Card, CardContent } from '@/components/ui/card';
import {
  ShoppingCart,
  Search,
  ArrowLeft,
  Loader2,
  Package,
} from 'lucide-react';

type OrderRow = {
  id: string;
  name: string;
  orderNumber: number;
  customerName: string;
  phone: string | null;
  email: string;
  totalPrice: string;
  currency: string;
  financialStatus: string;
  fulfillmentStatus: string | null;
  createdAt: string;
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground/50">--</span>;

  const colors: Record<string, string> = {
    paid: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    pending: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    refunded: 'border-red-500/40 bg-red-500/10 text-red-400',
    partially_refunded: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
    fulfilled: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    unfulfilled: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    partial: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] ${colors[status] ?? 'border-border/40 text-muted-foreground'}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function OrdersContent() {
  const searchParams = useSearchParams();
  const storeName = searchParams.get('store') ?? '';

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchOrders = useCallback(async () => {
    if (!storeName) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ store: storeName });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch orders.');
      setOrders(data.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [storeName, debouncedSearch]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
        {/* Header */}
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="flex items-center gap-3">
            <Link
              href="/brands"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <ShoppingCart className="h-3.5 w-3.5 text-primary" />
              Orders
            </div>
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                {storeName || 'Orders'}
              </h1>
              <p className="mt-2 text-muted-foreground">
                View and search orders for {storeName}.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              {orders.length} orders
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order ID (e.g., #1001)"
              className="w-full rounded-2xl border border-border/50 bg-background/50 py-3 pl-11 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/40 focus:shadow-[0_0_16px_rgba(34,211,238,0.15)]"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="border-destructive/40 bg-card/70">
            <CardContent className="py-8 text-center text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        ) : orders.length === 0 ? (
          <Card className="border-border/50 bg-card/70">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No orders match your search.' : 'No orders found.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <Card
                key={order.id}
                className="group border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)] transition-all duration-200 hover:border-primary/30"
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-primary/10 text-primary">
                      <ShoppingCart className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {order.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.customerName}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {order.phone && (
                      <span className="text-muted-foreground">{order.phone}</span>
                    )}
                    <span className="font-semibold text-foreground">
                      {order.currency} {order.totalPrice}
                    </span>
                    <StatusBadge status={order.financialStatus} />
                    <StatusBadge status={order.fulfillmentStatus} />
                    <span className="text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <OrdersContent />
    </Suspense>
  );
}
