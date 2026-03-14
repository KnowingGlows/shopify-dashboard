'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Truck, CheckCircle2, AlertTriangle, RotateCcw, XCircle,
  Calendar, ChevronDown, Loader2, Store, ArrowUpRight, ArrowDownRight,
  Eye, Clock, ShieldAlert,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/currency-converter';

// ── Types ────────────────────────────────────────────────────────────
type DeliveryStatus = 'delivered' | 'in_transit' | 'out_for_delivery' | 'rto' | 'rto_in_transit' | 'unfulfilled' | 'cancelled' | 'attempted';
type PaymentType = 'cod' | 'prepaid';
type DateRange = '7d' | '14d' | '30d' | 'custom';

interface ClassifiedOrder {
  id: string;
  name: string;
  date: string;
  amount: number;
  paymentType: PaymentType;
  status: DeliveryStatus;
  trackingCompany?: string;
  trackingNumber?: string;
  note?: string;
  customerName?: string;
}

interface StoreTotals {
  total: number; cod: number; prepaid: number; delivered: number; codDelivered: number;
  inTransit: number; outForDelivery: number; rto: number; rtoInTransit: number;
  unfulfilled: number; cancelled: number; attempted: number;
}

interface DayBreakdown {
  total: number; cod: number; prepaid: number; delivered: number;
  codDelivered: number; inTransit: number; rto: number; rtoInTransit: number; attempted: number;
}

interface StoreData {
  storeName: string;
  orders: ClassifiedOrder[];
  totals: StoreTotals;
  dailyBreakdown: Record<string, DayBreakdown>;
}

// ── Status Config ────────────────────────────────────────────────────
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

const PIE_COLORS: Record<DeliveryStatus, string> = {
  delivered: '#34d399', in_transit: '#60a5fa', out_for_delivery: '#22d3ee',
  attempted: '#fbbf24', rto: '#f87171', rto_in_transit: '#fb923c',
  unfulfilled: '#a1a1aa', cancelled: '#71717a',
};

const RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7 Days' },
  { value: '14d', label: '14 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'custom', label: 'Custom' },
];

// ── Helpers ──────────────────────────────────────────────────────────
function pct(num: number, den: number): string {
  if (den === 0) return '0%';
  return (num / den * 100).toFixed(1) + '%';
}

function pctNum(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round(num / den * 1000) / 10;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+05:30');
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+05:30');
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' });
}

// ── Animated Number ──────────────────────────────────────────────────
function AnimNum({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const duration = 600;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{display.toLocaleString('en-IN')}{suffix}</>;
}

// ── Metric Card ──────────────────────────────────────────────────────
function MetricCard({ label, value, suffix, sub, icon: Icon, color, delay }: {
  label: string; value: number; suffix?: string; sub?: string;
  icon: typeof Package; color: string; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4 space-y-2"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className={cn('rounded-lg p-1.5', color.replace('text-', 'bg-').replace('400', '500/15'))}>
          <Icon className={cn('h-3.5 w-3.5', color)} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">
        <AnimNum value={value} suffix={suffix} />
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────
function StatusBadge({ status }: { status: DeliveryStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium', cfg.bg, cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ── Custom Tooltip ───────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-[#0c0c0e]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-[11px] font-medium text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────
export default function OrderTrackingPage() {
  const [range, setRange] = useState<DateRange>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Record<string, StoreData>>({});
  const [combined, setCombined] = useState<StoreTotals | null>(null);
  const [activeStore, setActiveStore] = useState<string>('all');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);

  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

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
      if (data.success) {
        setStores(data.stores ?? {});
        setCombined(data.combined ?? null);
        // Default to first store if exists, else 'all'
        const storeNames = Object.keys(data.stores ?? {});
        if (activeStore !== 'all' && !storeNames.includes(activeStore) && storeNames.length > 0) {
          setActiveStore('all');
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [range, customStart, customEnd, activeStore]);

  useEffect(() => {
    if (range === 'custom' && !customStart) return;
    fetchData();
  }, [fetchData, range, customStart, customEnd]);

  // Active data (per store or combined)
  const activeData = useMemo(() => {
    if (activeStore === 'all') {
      if (!combined) return null;
      // Merge all orders and daily breakdowns
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
      return { totals: combined, orders: allOrders, dailyBreakdown: allDaily };
    }
    const store = stores[activeStore];
    if (!store) return null;
    return { totals: store.totals, orders: store.orders, dailyBreakdown: store.dailyBreakdown };
  }, [activeStore, stores, combined]);

  // Chart data: daily trend sorted by date
  const dailyChartData = useMemo(() => {
    if (!activeData) return [];
    return Object.entries(activeData.dailyBreakdown)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, day]) => ({
        date: formatDate(date),
        rawDate: date,
        Total: day.total,
        COD: day.cod,
        Prepaid: day.prepaid,
        Delivered: day.delivered,
        'In Transit': day.inTransit,
        RTO: day.rto + day.rtoInTransit,
      }));
  }, [activeData]);

  // Pie data for status distribution
  const pieData = useMemo(() => {
    if (!activeData) return [];
    const t = activeData.totals;
    return ([
      { name: 'Delivered', value: t.delivered, status: 'delivered' as DeliveryStatus },
      { name: 'In Transit', value: t.inTransit, status: 'in_transit' as DeliveryStatus },
      { name: 'Out for Delivery', value: t.outForDelivery, status: 'out_for_delivery' as DeliveryStatus },
      { name: 'Attempted', value: t.attempted, status: 'attempted' as DeliveryStatus },
      { name: 'RTO', value: t.rto, status: 'rto' as DeliveryStatus },
      { name: 'RTO In Transit', value: t.rtoInTransit, status: 'rto_in_transit' as DeliveryStatus },
      { name: 'Unfulfilled', value: t.unfulfilled, status: 'unfulfilled' as DeliveryStatus },
      { name: 'Cancelled', value: t.cancelled, status: 'cancelled' as DeliveryStatus },
    ]).filter((d) => d.value > 0);
  }, [activeData]);

  // Day-wise sorted descending
  const sortedDays = useMemo(() => {
    if (!activeData) return [];
    return Object.entries(activeData.dailyBreakdown).sort(([a], [b]) => b.localeCompare(a));
  }, [activeData]);

  // Orders for expanded day
  const dayOrders = useMemo(() => {
    if (!expandedDay || !activeData) return [];
    return activeData.orders
      .filter((o) => o.date === expandedDay)
      .sort((a, b) => {
        const priority: Record<DeliveryStatus, number> = {
          rto: 0, rto_in_transit: 1, attempted: 2, in_transit: 3,
          out_for_delivery: 4, unfulfilled: 5, delivered: 6, cancelled: 7,
        };
        return (priority[a.status] ?? 9) - (priority[b.status] ?? 9);
      });
  }, [expandedDay, activeData]);

  const storeNames = Object.keys(stores);
  const t = activeData?.totals;
  const fulfilledTotal = (t?.delivered ?? 0) + (t?.rto ?? 0) + (t?.rtoInTransit ?? 0) + (t?.attempted ?? 0);

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold text-foreground">Order Tracking</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live fulfillment status across all stores
            </p>
          </div>

          {/* Range Selector */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm font-medium text-foreground backdrop-blur-sm transition hover:bg-card/80"
              >
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {RANGE_OPTIONS.find((r) => r.value === range)?.label}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <AnimatePresence>
                {showRangeDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-[#0c0c0e] p-1 shadow-xl"
                  >
                    {RANGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { setRange(opt.value); setShowRangeDropdown(false); }}
                        className={cn(
                          'flex w-full items-center rounded-md px-3 py-1.5 text-sm transition',
                          range === opt.value ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {range === 'custom' && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2"
              >
                <input
                  type="date"
                  value={customStart}
                  max={todayStr}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-sm text-foreground backdrop-blur-sm"
                />
                <span className="text-muted-foreground text-xs">to</span>
                <input
                  type="date"
                  value={customEnd}
                  max={todayStr}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-sm text-foreground backdrop-blur-sm"
                />
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Store Tabs */}
        {storeNames.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2 overflow-x-auto pb-1"
          >
            <button
              onClick={() => setActiveStore('all')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition whitespace-nowrap',
                activeStore === 'all'
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'border border-border bg-card/40 text-muted-foreground hover:bg-card/60 hover:text-foreground'
              )}
            >
              <Store className="h-3.5 w-3.5" />
              All Stores
              {combined && <span className="ml-1 text-xs opacity-70">{combined.total}</span>}
            </button>
            {storeNames.map((name) => (
              <button
                key={name}
                onClick={() => setActiveStore(name)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition whitespace-nowrap',
                  activeStore === name
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'border border-border bg-card/40 text-muted-foreground hover:bg-card/60 hover:text-foreground'
                )}
              >
                {name}
                <span className="text-xs opacity-70">{stores[name].totals.total}</span>
              </button>
            ))}
          </motion.div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {/* Content */}
        {!loading && t && (
          <div className="space-y-6">

            {/* Metric Cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="Total Orders" value={t.total} icon={Package}
                color="text-violet-400" delay={0}
                sub={`${t.cod} COD · ${t.prepaid} Prepaid`}
              />
              <MetricCard
                label="Delivery Rate" value={pctNum(t.delivered, fulfilledTotal || t.total)}
                suffix="%" icon={CheckCircle2} color="text-emerald-400" delay={0.05}
                sub={`${t.delivered} of ${fulfilledTotal || t.total} delivered`}
              />
              <MetricCard
                label="COD Ratio" value={pctNum(t.cod, t.total)}
                suffix="%" icon={ArrowUpRight} color="text-blue-400" delay={0.1}
                sub={`COD delivery: ${pct(t.codDelivered, t.cod)}`}
              />
              <MetricCard
                label="RTO Rate" value={pctNum(t.rto + t.rtoInTransit, fulfilledTotal || t.total)}
                suffix="%" icon={RotateCcw} color="text-red-400" delay={0.15}
                sub={`${t.rto + t.rtoInTransit} returns`}
              />
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 lg:grid-cols-5">

              {/* Status Distribution Pie */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4 lg:col-span-2"
              >
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Status Distribution</p>
                <div className="flex items-center gap-4">
                  <div className="h-[180px] w-[180px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%" cy="50%"
                          innerRadius={50} outerRadius={80}
                          dataKey="value"
                          strokeWidth={0}
                          animationDuration={800}
                          animationBegin={200}
                        >
                          {pieData.map((d) => (
                            <Cell key={d.status} fill={PIE_COLORS[d.status]} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.[0]) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="rounded-lg border border-border bg-[#0c0c0e]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                                <p className="text-[12px] font-medium text-foreground">{d.name}</p>
                                <p className="text-[11px] text-muted-foreground">{d.value} orders ({pct(d.value, t.total)})</p>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {pieData.map((d) => (
                      <div key={d.status} className="flex items-center gap-2 text-[12px]">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[d.status] }} />
                        <span className="text-muted-foreground truncate">{d.name}</span>
                        <span className="ml-auto font-medium text-foreground">{d.value}</span>
                        <span className="text-muted-foreground/60 w-10 text-right">{pct(d.value, t.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Daily Trend Chart */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4 lg:col-span-3"
              >
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Daily Orders</p>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="ordTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="ordDelivered" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="Total" stroke="#a78bfa" fill="url(#ordTotal)" strokeWidth={2} dot={false} animationDuration={800} />
                      <Area type="monotone" dataKey="Delivered" stroke="#34d399" fill="url(#ordDelivered)" strokeWidth={2} dot={false} animationDuration={800} animationBegin={200} />
                      <Area type="monotone" dataKey="RTO" stroke="#f87171" fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} animationDuration={800} animationBegin={400} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            </div>

            {/* Secondary Metrics Row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {([
                ['In Transit', t.inTransit, 'in_transit'],
                ['Out for Delivery', t.outForDelivery, 'out_for_delivery'],
                ['Attempted / NDR', t.attempted, 'attempted'],
                ['RTO', t.rto, 'rto'],
                ['RTO In Transit', t.rtoInTransit, 'rto_in_transit'],
                ['Unfulfilled', t.unfulfilled, 'unfulfilled'],
              ] as [string, number, DeliveryStatus][]).map(([label, value, status], i) => {
                const cfg = STATUS_CONFIG[status];
                const Icon = cfg.icon;
                return (
                  <motion.div
                    key={status}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.04 }}
                    className={cn('rounded-xl border border-border p-3 space-y-1', cfg.bg)}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                    </div>
                    <p className={cn('text-xl font-bold', cfg.color)}>
                      <AnimNum value={value} />
                    </p>
                  </motion.div>
                );
              })}
            </div>

            {/* COD vs Prepaid Bar Chart */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4"
            >
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">COD vs Prepaid (Daily)</p>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="COD" fill="#f59e0b" radius={[3, 3, 0, 0]} animationDuration={800} />
                    <Bar dataKey="Prepaid" fill="#8b5cf6" radius={[3, 3, 0, 0]} animationDuration={800} animationBegin={200} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Day-wise Breakdown Table */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden"
            >
              <div className="border-b border-border px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Day-wise Breakdown</p>
              </div>

              {/* Table Header */}
              <div className="hidden sm:grid grid-cols-[1fr_repeat(7,_minmax(0,_1fr))] gap-2 px-4 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground/60">
                <span>Date</span>
                <span className="text-center">Orders</span>
                <span className="text-center">COD</span>
                <span className="text-center">Prepaid</span>
                <span className="text-center">Delivered</span>
                <span className="text-center">In Transit</span>
                <span className="text-center">RTO</span>
                <span className="text-center">NDR</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border">
                {sortedDays.map(([date, day], i) => {
                  const isExpanded = expandedDay === date;
                  const deliveryRate = pct(day.delivered, day.total);
                  return (
                    <div key={date}>
                      <button
                        onClick={() => setExpandedDay(isExpanded ? null : date)}
                        className={cn(
                          'w-full text-left transition',
                          isExpanded ? 'bg-primary/5' : 'hover:bg-white/[0.02]'
                        )}
                      >
                        {/* Desktop */}
                        <div className="hidden sm:grid grid-cols-[1fr_repeat(7,_minmax(0,_1fr))] gap-2 px-4 py-2.5 items-center">
                          <div className="flex items-center gap-2">
                            <motion.div
                              animate={{ rotate: isExpanded ? 90 : 0 }}
                              className="text-muted-foreground"
                            >
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

                      {/* Expanded Orders */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="bg-[#0a0a0c] px-4 py-3 space-y-1.5">
                              {dayOrders.length === 0 && (
                                <p className="text-sm text-muted-foreground py-2">No orders for this date.</p>
                              )}
                              {dayOrders.map((order) => (
                                <div
                                  key={order.id}
                                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/50 bg-card/30 px-3 py-2"
                                >
                                  <span className="text-sm font-medium text-foreground min-w-[80px]">{order.name}</span>
                                  <StatusBadge status={order.status} />
                                  <span className={cn(
                                    'text-[11px] font-medium rounded-full px-2 py-0.5',
                                    order.paymentType === 'cod' ? 'bg-amber-500/15 text-amber-400' : 'bg-violet-500/15 text-violet-400'
                                  )}>
                                    {order.paymentType === 'cod' ? 'COD' : 'Prepaid'}
                                  </span>
                                  <span className="text-sm text-foreground">{formatINR(order.amount)}</span>
                                  {order.customerName && (
                                    <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">{order.customerName}</span>
                                  )}
                                  {order.trackingCompany && (
                                    <span className="text-[10px] text-muted-foreground/60">{order.trackingCompany}</span>
                                  )}
                                  {(order.status === 'rto' || order.status === 'rto_in_transit' || order.status === 'attempted') && order.note && (
                                    <span className="w-full text-[11px] text-orange-400/80 italic mt-0.5">
                                      Note: {order.note}
                                    </span>
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

          </div>
        )}
      </div>
    </div>
  );
}
