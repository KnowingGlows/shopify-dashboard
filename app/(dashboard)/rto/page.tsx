'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PackageX, RefreshCw, Loader2, AlertTriangle, X,
  ChevronDown, ChevronRight, IndianRupee, Boxes, Store,
  Search,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { formatINR } from '@/lib/currency-converter';
import { cn } from '@/lib/utils';
import type { RtoSyncResponse, RtoStoreBucket, RtoOrderItem } from '@/types/rto';

// Sync interval for the page-mounted auto refresh.
// Fires once on mount, and again every 5 minutes while the tab is open.
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const STORE_ACCENTS = [
  { text: 'text-violet-400',  border: 'border-violet-500/30',  bg: 'bg-violet-500/10',  dot: 'bg-violet-400',  glow: '#a78bfa' },
  { text: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400', glow: '#34d399' },
  { text: 'text-sky-400',     border: 'border-sky-500/30',     bg: 'bg-sky-500/10',     dot: 'bg-sky-400',     glow: '#38bdf8' },
  { text: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'bg-amber-500/10',   dot: 'bg-amber-400',   glow: '#fbbf24' },
  { text: 'text-rose-400',    border: 'border-rose-500/30',    bg: 'bg-rose-500/10',    dot: 'bg-rose-400',    glow: '#fb7185' },
  { text: 'text-cyan-400',    border: 'border-cyan-500/30',    bg: 'bg-cyan-500/10',    dot: 'bg-cyan-400',    glow: '#22d3ee' },
];
const accentFor = (idx: number) => STORE_ACCENTS[idx % STORE_ACCENTS.length];

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
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleString('en-IN');
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function RtoPage() {
  const { user } = useAuth();
  const [data, setData] = useState<RtoSyncResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const [selectedStore, setSelectedStore] = useState<string>('all');

  const sync = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true); else setRefreshing(true);
      setError(null);
      const res = await fetch('/api/rto/sync');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RTO data.');
    } finally {
      if (isInitial) setLoading(false); else setRefreshing(false);
    }
  };

  // Initial fetch + interval auto-sync
  useEffect(() => {
    sync(true);
    const id = setInterval(() => { sync(false); }, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const totalUnits = data?.totalUnits ?? 0;
  const totalOrders = data?.totalOrders ?? 0;
  const totalValue = data?.totalValueAtRisk ?? 0;
  const animatedUnits = useCountUp(totalUnits);
  const animatedOrders = useCountUp(totalOrders);
  const animatedValue = useCountUp(totalValue);

  const filteredStores = useMemo<RtoStoreBucket[]>(() => {
    if (!data) return [];
    const stores = selectedStore === 'all'
      ? data.byStore
      : data.byStore.filter((s) => s.storeName === selectedStore);
    if (!search.trim()) return stores;
    const q = search.trim().toLowerCase();
    return stores
      .map((s) => ({
        ...s,
        items: s.items.filter((it) => {
          if (it.orderId.toLowerCase().includes(q)) return true;
          if (it.customerName.toLowerCase().includes(q)) return true;
          if (it.awb.toLowerCase().includes(q)) return true;
          return it.lineItems.some(
            (li) => li.productName.toLowerCase().includes(q) || li.sku.toLowerCase().includes(q)
          );
        }),
        products: s.products.filter(
          (p) => p.productName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.items.length > 0 || s.products.length > 0);
  }, [data, search, selectedStore]);

  const toggleExpand = (storeName: string) => {
    setExpandedStores((prev) => {
      const next = new Set(prev);
      if (next.has(storeName)) next.delete(storeName);
      else next.add(storeName);
      return next;
    });
  };

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
            <PackageX className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">RTO In Transit</h1>
            <p className="text-[11px] text-muted-foreground">
              Live from Delhivery · all stores · all products coming back
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data?.fetchedAt && (
            <span className="text-[11px] text-muted-foreground">
              Updated {relativeTime(data.fetchedAt)}
            </span>
          )}
          <button
            onClick={() => sync(false)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-accent/30 hover:text-foreground disabled:opacity-50"
          >
            {refreshing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/70 hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[120px] rounded-xl border border-border bg-card animate-pulse" />
            ))}
          </div>
          <div className="h-[200px] rounded-xl border border-border bg-card animate-pulse" />
        </div>
      ) : !data || data.byStore.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <PackageX className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-3 text-[13px] font-medium text-foreground">No RTO orders in transit right now</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Delhivery has no shipments returning to origin across your stores.
          </p>
          {data?.warnings && data.warnings.length > 0 && (
            <div className="mt-4 mx-auto max-w-md rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-left text-[11px] text-amber-300">
              {data.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <KpiTile
              label="Units in transit"
              value={Math.round(animatedUnits).toLocaleString('en-IN')}
              hint={`${totalOrders} order${totalOrders === 1 ? '' : 's'}`}
              accent="amber"
              delay={0}
            />
            <KpiTile
              label="Orders in transit"
              value={Math.round(animatedOrders).toLocaleString('en-IN')}
              hint={`across ${data.byStore.length} store${data.byStore.length === 1 ? '' : 's'}`}
              accent="violet"
              delay={0.08}
            />
            <KpiTile
              label="Value at risk"
              value={formatINR(Math.round(animatedValue))}
              hint="COD amount + line item value"
              accent="emerald"
              delay={0.16}
            />
          </div>

          {/* Store filter chips */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex flex-wrap items-center gap-2"
          >
            <FilterChip
              active={selectedStore === 'all'}
              onClick={() => setSelectedStore('all')}
              label="All stores"
              count={totalUnits}
            />
            {data.byStore.map((s, i) => (
              <FilterChip
                key={s.storeName}
                active={selectedStore === s.storeName}
                onClick={() => setSelectedStore(s.storeName)}
                label={s.storeName}
                count={s.units}
                accent={accentFor(i)}
              />
            ))}
            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order, AWB, product, SKU…"
                className="form-input pl-8 py-1.5 text-[12px] w-64"
              />
            </div>
          </motion.div>

          {/* Per-store cards */}
          <div className="space-y-4">
            {filteredStores.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-[12px] text-muted-foreground">
                No matches for &quot;{search}&quot;.
              </div>
            ) : (
              filteredStores.map((store, idx) => {
                const accent = accentFor(data.byStore.findIndex((s) => s.storeName === store.storeName));
                const expanded = expandedStores.has(store.storeName);
                const topProducts = store.products.slice(0, 8);
                return (
                  <motion.div
                    key={store.storeName}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.05 * idx, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -2 }}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border bg-card transition-colors',
                      accent.border,
                    )}
                    style={{ ['--store-color' as string]: accent.glow }}
                  >
                    {/* Corner glow */}
                    <div
                      className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-30 blur-3xl transition-opacity duration-500 group-hover:opacity-60"
                      style={{ background: `radial-gradient(circle, ${accent.glow}55, transparent 70%)` }}
                      aria-hidden
                    />

                    <div className="relative z-10">
                      {/* Store header */}
                      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', accent.bg, accent.text)}>
                            <Store className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <h2 className="text-[14px] font-semibold text-foreground">{store.storeName}</h2>
                            <p className="text-[11px] text-muted-foreground">
                              {store.products.length} product{store.products.length === 1 ? '' : 's'} ·
                              {' '}{store.orders} order{store.orders === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn('text-2xl font-semibold tabular-nums tracking-tight', accent.text)}>
                            {store.units.toLocaleString('en-IN')}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">units</p>
                        </div>
                      </div>

                      {/* Stats strip */}
                      <div className="grid grid-cols-3 gap-px bg-border/60">
                        <Stat label="Orders" value={store.orders.toLocaleString('en-IN')} icon={<Boxes className="h-3 w-3" />} />
                        <Stat label="Units" value={store.units.toLocaleString('en-IN')} icon={<PackageX className="h-3 w-3" />} />
                        <Stat label="Value at risk" value={formatINR(store.valueAtRisk)} icon={<IndianRupee className="h-3 w-3" />} />
                      </div>

                      {/* Product breakdown */}
                      <div className="px-5 py-4">
                        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Products in transit
                        </p>
                        <div className="space-y-1.5">
                          {topProducts.map((p) => {
                            const pct = store.units > 0 ? (p.units / store.units) * 100 : 0;
                            return (
                              <div key={`${p.productName}::${p.sku}`}>
                                <div className="flex items-center justify-between gap-3 text-[12px]">
                                  <span className="min-w-0 flex-1 truncate text-foreground">
                                    {p.productName}
                                    {p.sku && <span className="ml-2 font-mono text-[10px] text-muted-foreground/70">{p.sku}</span>}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-muted-foreground">
                                    <span className={cn('font-semibold', accent.text)}>{p.units}</span>
                                    {' '}× {p.orderCount} order{p.orderCount === 1 ? '' : 's'}
                                  </span>
                                </div>
                                <div className="mt-1 h-1 overflow-hidden rounded-full bg-border/60">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.7, delay: 0.05 + 0.05 * idx, ease: [0.22, 1, 0.36, 1] }}
                                    className="h-full rounded-full"
                                    style={{ background: accent.glow, opacity: 0.7 }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          {store.products.length > topProducts.length && (
                            <p className="pt-1 text-[10px] text-muted-foreground/70">
                              + {store.products.length - topProducts.length} more product{store.products.length - topProducts.length === 1 ? '' : 's'}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Expand button + per-order list */}
                      <div className="border-t border-border/60">
                        <button
                          onClick={() => toggleExpand(store.storeName)}
                          className="flex w-full items-center justify-between px-5 py-2.5 text-[11px] font-medium text-muted-foreground transition hover:bg-white/[0.02] hover:text-foreground"
                        >
                          <span>
                            {expanded ? 'Hide orders' : 'View orders'} ({store.items.length})
                          </span>
                          {expanded
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                        <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden"
                            >
                              <OrderList items={store.items} accent={accent} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>

          {data.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-300">
              <p className="mb-1 font-medium">Warnings</p>
              {data.warnings.map((w, i) => <div key={i} className="text-amber-300/80">· {w}</div>)}
            </div>
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Auto-refreshes every 5 minutes · Logged in as {user?.email ?? '—'}
      </p>
    </PageTransition>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiTile({
  label, value, hint, accent, delay = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: 'amber' | 'violet' | 'emerald';
  delay?: number;
}) {
  const map = {
    amber:   { text: 'text-amber-400',   border: 'border-amber-500/30',   glow: '#fbbf24', dot: 'bg-amber-400' },
    violet:  { text: 'text-violet-400',  border: 'border-violet-500/30',  glow: '#a78bfa', dot: 'bg-violet-400' },
    emerald: { text: 'text-emerald-400', border: 'border-emerald-500/30', glow: '#34d399', dot: 'bg-emerald-400' },
  };
  const c = map[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3, boxShadow: `0 14px 40px -16px ${c.glow}55, 0 0 0 1px ${c.glow}33` }}
      className={cn('group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors', c.border)}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: `radial-gradient(circle, ${c.glow}66, transparent 70%)` }}
        aria-hidden
      />
      <div className="relative z-10 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} aria-hidden />
      </div>
      <p className={cn('relative z-10 mt-2 text-3xl font-semibold leading-none tracking-tight tabular-nums', c.text)}>
        {value}
      </p>
      {hint && <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </motion.div>
  );
}

function FilterChip({
  active, onClick, label, count, accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  accent?: { text: string; bg: string; border: string };
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium transition',
        active
          ? (accent ? cn(accent.bg, accent.border, accent.text) : 'border-primary/40 bg-primary/15 text-primary')
          : 'border-border bg-card text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
      <span className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        active ? 'bg-black/20' : 'bg-border/50 text-foreground'
      )}>
        {count.toLocaleString('en-IN')}
      </span>
    </button>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function OrderList({ items, accent }: { items: RtoOrderItem[]; accent: { text: string; dot: string } }) {
  if (items.length === 0) {
    return <div className="px-5 py-3 text-[11px] text-muted-foreground">No orders match.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="tracker-table">
        <thead>
          <tr>
            <th style={{ width: 130 }}>Order</th>
            <th style={{ width: 130 }}>AWB</th>
            <th>Products · Units</th>
            <th style={{ width: 90 }}>Type</th>
            <th style={{ width: 110, textAlign: 'right' }}>Value</th>
            <th style={{ width: 110 }}>RTO since</th>
            <th style={{ width: 110 }}>Expected</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={`${it.orderId}-${it.awb}`}>
              <td>
                <div className="px-3 py-2 font-mono text-[12px] text-foreground">{it.orderId}</div>
              </td>
              <td>
                <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{it.awb}</div>
              </td>
              <td>
                <div className="px-3 py-2 text-[12px] text-foreground">
                  {it.lineItems.map((li, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <span className="truncate">
                        {li.productName}
                        {li.sku && <span className="ml-1 font-mono text-[10px] text-muted-foreground/70">{li.sku}</span>}
                      </span>
                      <span className={cn('shrink-0 tabular-nums font-semibold', accent.text)}>×{li.quantity}</span>
                    </div>
                  ))}
                </div>
              </td>
              <td>
                <div className="px-3 py-2">
                  <span className={cn(
                    'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium',
                    it.orderType === 'COD'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  )}>
                    {it.orderType || '—'}
                  </span>
                </div>
              </td>
              <td>
                <div className="px-3 py-2 text-right tabular-nums text-[12px] text-foreground">
                  {it.codAmount > 0
                    ? formatINR(it.codAmount)
                    : formatINR(it.lineItems.reduce((s, li) => s + li.valueAtRisk, 0))}
                </div>
              </td>
              <td>
                <div className="px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
                  {formatDate(it.rtoStartedDate)}
                </div>
              </td>
              <td>
                <div className="px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
                  {formatDate(it.expectedReturnDate)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
