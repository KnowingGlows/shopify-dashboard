'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Package, Truck, CheckCircle2, AlertTriangle, RotateCcw, XCircle,
  Calendar, ChevronDown, ChevronLeft, Loader2, Store, Clock, ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/currency-converter';

// ── Types ────────────────────────────────────────────────────────────
type DeliveryStatus = 'delivered' | 'in_transit' | 'out_for_delivery' | 'rto' | 'rto_in_transit' | 'unfulfilled' | 'cancelled' | 'attempted';
type PaymentType = 'cod' | 'prepaid';
type DateRange = 'today' | 'yesterday' | '7d' | '14d' | '30d' | 'custom';

interface ClassifiedOrder {
  id: string; name: string; date: string; amount: number;
  paymentType: PaymentType; status: DeliveryStatus;
  trackingCompany?: string; trackingNumber?: string; note?: string; customerName?: string;
  delhiveryStatus?: string; delhiveryInstructions?: string; delhiveryLocation?: string;
  ndrCount?: number; rtoStartedDate?: string; firstAttemptDate?: string;
}

interface DayBreakdown {
  total: number; cod: number; prepaid: number; delivered: number;
  codDelivered: number; inTransit: number; rto: number; rtoInTransit: number; attempted: number;
}

interface StoreData {
  storeName: string;
  orders: ClassifiedOrder[];
  dailyBreakdown: Record<string, DayBreakdown>;
}

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  delivered:       { label: 'Delivered',        color: 'text-emerald-400', bg: 'bg-emerald-500/15', icon: CheckCircle2 },
  in_transit:      { label: 'In Transit',       color: 'text-blue-400',    bg: 'bg-blue-500/15',    icon: Truck },
  out_for_delivery:{ label: 'Out for Delivery', color: 'text-cyan-400',    bg: 'bg-cyan-500/15',    icon: Package },
  attempted:       { label: 'Attempted',        color: 'text-amber-400',   bg: 'bg-amber-500/15',   icon: ShieldAlert },
  rto:             { label: 'RTO',              color: 'text-red-400',     bg: 'bg-red-500/15',     icon: RotateCcw },
  rto_in_transit:  { label: 'RTO In Transit',   color: 'text-orange-400',  bg: 'bg-orange-500/15',  icon: AlertTriangle },
  unfulfilled:     { label: 'Unfulfilled',      color: 'text-zinc-400',    bg: 'bg-zinc-500/15',    icon: Clock },
  cancelled:       { label: 'Cancelled',        color: 'text-zinc-500',    bg: 'bg-zinc-600/15',    icon: XCircle },
};

const RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: '7 Days' },
  { value: '14d', label: '14 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'custom', label: 'Custom Range' },
];

function pct(num: number, den: number): string {
  if (den === 0) return '0%';
  return (num / den * 100).toFixed(1) + '%';
}

function formatDateFull(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00+05:30').toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', weekday: 'short',
  });
}

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium', cfg.bg, cfg.color)}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

export default function BreakdownPage() {
  const [range, setRange] = useState<DateRange>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Record<string, StoreData>>({});
  const [activeStore, setActiveStore] = useState<string>('all');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);

  const todayStr = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range });
      if (range === 'custom' && customStart) {
        params.set('start', customStart);
        if (customEnd) params.set('end', customEnd);
      }
      const res = await fetch(`/api/order-tracking?${params}`);
      const data = await res.json();
      if (data.success) setStores(data.stores ?? {});
    } catch { /* silent */ } finally { setLoading(false); }
  }, [range, customStart, customEnd]);

  useEffect(() => {
    if (range === 'custom' && !customStart) return;
    fetchData();
  }, [fetchData, range, customStart, customEnd]);

  // Active data
  const activeData = useMemo(() => {
    if (activeStore === 'all') {
      const allOrders: ClassifiedOrder[] = [];
      const allDaily: Record<string, DayBreakdown> = {};
      for (const store of Object.values(stores)) {
        allOrders.push(...store.orders);
        for (const [date, day] of Object.entries(store.dailyBreakdown)) {
          if (!allDaily[date]) allDaily[date] = { total: 0, cod: 0, prepaid: 0, delivered: 0, codDelivered: 0, inTransit: 0, rto: 0, rtoInTransit: 0, attempted: 0 };
          const d = allDaily[date];
          d.total += day.total; d.cod += day.cod; d.prepaid += day.prepaid;
          d.delivered += day.delivered; d.codDelivered += day.codDelivered;
          d.inTransit += day.inTransit; d.rto += day.rto; d.rtoInTransit += day.rtoInTransit;
          d.attempted += day.attempted;
        }
      }
      return { orders: allOrders, dailyBreakdown: allDaily };
    }
    const store = stores[activeStore];
    if (!store) return null;
    return { orders: store.orders, dailyBreakdown: store.dailyBreakdown };
  }, [activeStore, stores]);

  const sortedDays = useMemo(() => {
    if (!activeData) return [];
    return Object.entries(activeData.dailyBreakdown).sort(([a], [b]) => b.localeCompare(a));
  }, [activeData]);

  const dayOrders = useMemo(() => {
    if (!expandedDay || !activeData) return [];
    return activeData.orders
      .filter((o) => o.date === expandedDay)
      .sort((a, b) => {
        const p: Record<DeliveryStatus, number> = {
          rto: 0, rto_in_transit: 1, attempted: 2, in_transit: 3,
          out_for_delivery: 4, unfulfilled: 5, delivered: 6, cancelled: 7,
        };
        return (p[a.status] ?? 9) - (p[b.status] ?? 9);
      });
  }, [expandedDay, activeData]);

  const storeNames = Object.keys(stores);

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-5">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <Link href="/orders" className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-card/60 transition">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Day-wise Breakdown</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Individual orders by date with live tracking</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm font-medium text-foreground backdrop-blur-sm transition hover:bg-card/80"
              >
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {RANGE_OPTIONS.find((r) => r.value === range)?.label}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <AnimatePresence>
                {showRangeDropdown && (
                  <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }} transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-[#0c0c0e] p-1 shadow-xl"
                  >
                    {RANGE_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => { setRange(opt.value); setShowRangeDropdown(false); }}
                        className={cn('flex w-full items-center rounded-md px-3 py-1.5 text-sm transition',
                          range === opt.value ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                        )}
                      >{opt.label}</button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {range === 'custom' && (
              <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
                <input type="date" value={customStart} max={todayStr} onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-sm text-foreground backdrop-blur-sm" />
                <span className="text-muted-foreground text-xs">to</span>
                <input type="date" value={customEnd} max={todayStr} onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-sm text-foreground backdrop-blur-sm" />
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Store Tabs */}
        {storeNames.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button onClick={() => setActiveStore('all')}
              className={cn('flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition whitespace-nowrap',
                activeStore === 'all' ? 'bg-primary/15 text-primary border border-primary/30' : 'border border-border bg-card/40 text-muted-foreground hover:bg-card/60 hover:text-foreground'
              )}
            ><Store className="h-3.5 w-3.5" /> All Stores</button>
            {storeNames.map((name) => (
              <button key={name} onClick={() => setActiveStore(name)}
                className={cn('flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition whitespace-nowrap',
                  activeStore === name ? 'bg-primary/15 text-primary border border-primary/30' : 'border border-border bg-card/40 text-muted-foreground hover:bg-card/60 hover:text-foreground'
                )}
              >{name} <span className="text-xs opacity-70">{stores[name]?.orders?.length ?? 0}</span></button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden"
          >
            {/* Table Header */}
            <div className="hidden sm:grid grid-cols-[1fr_repeat(7,_minmax(0,_1fr))] gap-2 px-4 py-2.5 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground/60">
              <span>Date</span>
              <span className="text-center">Orders</span>
              <span className="text-center">COD</span>
              <span className="text-center">Prepaid</span>
              <span className="text-center">Delivered</span>
              <span className="text-center">In Transit</span>
              <span className="text-center">RTO</span>
              <span className="text-center">NDR</span>
            </div>

            <div className="divide-y divide-border">
              {sortedDays.map(([date, day]) => {
                const isExpanded = expandedDay === date;
                const deliveryRate = pct(day.delivered, day.total);
                return (
                  <div key={date}>
                    <button
                      onClick={() => setExpandedDay(isExpanded ? null : date)}
                      className={cn('w-full text-left transition', isExpanded ? 'bg-primary/5' : 'hover:bg-white/[0.02]')}
                    >
                      {/* Desktop */}
                      <div className="hidden sm:grid grid-cols-[1fr_repeat(7,_minmax(0,_1fr))] gap-2 px-4 py-2.5 items-center">
                        <div className="flex items-center gap-2">
                          <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} className="text-muted-foreground">
                            <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                          </motion.div>
                          <span className="text-sm font-medium text-foreground">{formatDateFull(date)}</span>
                          <span className="text-[10px] text-emerald-400/70">{deliveryRate}</span>
                        </div>
                        <span className="text-center text-sm font-semibold text-foreground">{day.total}</span>
                        <span className="text-center text-sm text-amber-400">{day.cod}</span>
                        <span className="text-center text-sm text-violet-400">{day.prepaid}</span>
                        <span className="text-center text-sm text-emerald-400">{day.delivered}</span>
                        <span className="text-center text-sm text-blue-400">{day.inTransit}</span>
                        <span className="text-center text-sm text-red-400">{day.rto + day.rtoInTransit}</span>
                        <span className="text-center text-sm text-amber-400">{day.attempted}</span>
                      </div>
                      {/* Mobile */}
                      <div className="sm:hidden px-4 py-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">{formatDateFull(date)}</span>
                          <span className="text-sm font-bold text-foreground">{day.total} orders</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="text-amber-400">{day.cod} COD</span>
                          <span className="text-violet-400">{day.prepaid} Prepaid</span>
                          <span className="text-emerald-400">{day.delivered} Del</span>
                          {(day.rto + day.rtoInTransit) > 0 && <span className="text-red-400">{day.rto + day.rtoInTransit} RTO</span>}
                        </div>
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="bg-[#0a0a0c] px-4 py-3 space-y-1.5">
                            {dayOrders.length === 0 && <p className="text-sm text-muted-foreground py-2">No orders for this date.</p>}
                            {dayOrders.map((order) => (
                              <div key={order.id}
                                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/50 bg-card/30 px-3 py-2"
                              >
                                <span className="text-sm font-medium text-foreground min-w-[80px]">{order.name}</span>
                                <StatusBadge status={order.status} />
                                <span className={cn('text-[11px] font-medium rounded-full px-2 py-0.5',
                                  order.paymentType === 'cod' ? 'bg-amber-500/15 text-amber-400' : 'bg-violet-500/15 text-violet-400'
                                )}>
                                  {order.paymentType === 'cod' ? 'COD' : 'Prepaid'}
                                </span>
                                <span className="text-sm text-foreground">{formatINR(order.amount)}</span>
                                {order.customerName && (
                                  <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">{order.customerName}</span>
                                )}
                                {order.trackingNumber && (
                                  <span className="text-[10px] text-muted-foreground/60 font-mono">AWB: {order.trackingNumber}</span>
                                )}
                                {order.trackingCompany && (
                                  <span className="text-[10px] text-muted-foreground/60">{order.trackingCompany}</span>
                                )}
                                {order.delhiveryInstructions && (
                                  <span className="w-full text-[11px] text-blue-400/80 mt-0.5">
                                    {order.delhiveryInstructions}
                                    {order.delhiveryLocation && <span className="text-muted-foreground/50"> · {order.delhiveryLocation}</span>}
                                  </span>
                                )}
                                {(order.ndrCount ?? 0) > 0 && (
                                  <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 rounded-full px-2 py-0.5">
                                    {order.ndrCount} delivery attempt{order.ndrCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {order.rtoStartedDate && (
                                  <span className="text-[10px] text-red-400/70">
                                    RTO since {new Date(order.rtoStartedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  </span>
                                )}
                                {(order.status === 'rto' || order.status === 'rto_in_transit' || order.status === 'attempted') && order.note && !order.delhiveryInstructions && (
                                  <span className="w-full text-[11px] text-orange-400/80 italic mt-0.5">Note: {order.note}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {sortedDays.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">No orders found for this period</p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
