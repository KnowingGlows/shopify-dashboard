'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Package, Truck, CheckCircle2, AlertTriangle, RotateCcw, XCircle,
  Calendar, ChevronDown, ChevronRight, Loader2, Store, ArrowUpRight,
  Clock, ShieldAlert, Target, Timer, Wallet, TrendingUp, BadgeDollarSign,
  Zap, BarChart3,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/currency-converter';

// ── Types ────────────────────────────────────────────────────────────
type DeliveryStatus = 'delivered' | 'in_transit' | 'out_for_delivery' | 'rto' | 'rto_in_transit' | 'unfulfilled' | 'cancelled' | 'attempted';
type DateRange = 'today' | 'yesterday' | '7d' | '14d' | '30d' | 'custom';

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
  totals: StoreTotals;
  dailyBreakdown: Record<string, DayBreakdown>;
}

interface Analytics {
  fadPct: number | null;
  fadCount: number;
  fadTotal: number;
  avgDeliveryDays: number | null;
  avgCodDeliveryDays: number | null;
  avgPrepaidDeliveryDays: number | null;
  ndrResolutionRate: number | null;
  avgNdrAttempts: number | null;
  totalNdrOrders: number;
  atRiskValue: number;
  codPendingDelivery: number;
  codDeliveredAmount: number;
  prepaidDeliveredAmount: number;
  totalRevenue: number;
  deliveredRevenue: number;
  lostRevenue: number;
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
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: '7 Days' },
  { value: '14d', label: '14 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'custom', label: 'Custom Range' },
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
  return new Date(dateStr + 'T00:00:00+05:30').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
}

// ── Animated Number ──────────────────────────────────────────────────
function AnimNum({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const duration = 600;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setDisplay(Math.round(start + diff * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{display.toLocaleString('en-IN')}{suffix}</>;
}

// ── Insight Card ─────────────────────────────────────────────────────
function InsightCard({ label, value, suffix, sub, icon: Icon, color, delay }: {
  label: string; value: number | string | null; suffix?: string; sub?: string;
  icon: typeof Package; color: string; delay: number;
}) {
  const isNumber = typeof value === 'number' && value !== null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4 space-y-1.5"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className={cn('rounded-lg p-1.5', color.replace('text-', 'bg-').replace('400', '500/15'))}>
          <Icon className={cn('h-3.5 w-3.5', color)} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">
        {isNumber ? <AnimNum value={value} suffix={suffix} /> : (value ?? '—')}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </motion.div>
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
export default function LogisticsPage() {
  const [range, setRange] = useState<DateRange>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Record<string, StoreData>>({});
  const [combined, setCombined] = useState<StoreTotals | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [activeStore, setActiveStore] = useState<string>('all');
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
      if (data.success) {
        setStores(data.stores ?? {});
        setCombined(data.combined ?? null);
        setAnalytics(data.analytics ?? null);
        const storeNames = Object.keys(data.stores ?? {});
        if (activeStore !== 'all' && !storeNames.includes(activeStore) && storeNames.length > 0) {
          setActiveStore('all');
        }
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [range, customStart, customEnd, activeStore]);

  useEffect(() => {
    if (range === 'custom' && !customStart) return;
    fetchData();
  }, [fetchData, range, customStart, customEnd]);

  // Active totals
  const t = useMemo(() => {
    if (activeStore === 'all') return combined;
    return stores[activeStore]?.totals ?? null;
  }, [activeStore, stores, combined]);

  // Chart data
  const dailyChartData = useMemo(() => {
    const src = activeStore === 'all'
      ? Object.values(stores).reduce((acc, s) => {
          for (const [date, day] of Object.entries(s.dailyBreakdown)) {
            if (!acc[date]) acc[date] = { total: 0, cod: 0, prepaid: 0, delivered: 0, codDelivered: 0, inTransit: 0, rto: 0, rtoInTransit: 0, attempted: 0 };
            const d = acc[date]; d.total += day.total; d.cod += day.cod; d.prepaid += day.prepaid;
            d.delivered += day.delivered; d.codDelivered += day.codDelivered;
            d.inTransit += day.inTransit; d.rto += day.rto; d.rtoInTransit += day.rtoInTransit;
            d.attempted += day.attempted;
          }
          return acc;
        }, {} as Record<string, DayBreakdown>)
      : stores[activeStore]?.dailyBreakdown ?? {};
    return Object.entries(src)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, day]) => ({
        date: formatDate(date), Total: day.total, Delivered: day.delivered,
        RTO: day.rto + day.rtoInTransit, COD: day.cod, Prepaid: day.prepaid,
      }));
  }, [activeStore, stores]);

  // Pie data
  const pieData = useMemo(() => {
    if (!t) return [];
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
  }, [t]);

  const storeNames = Object.keys(stores);
  const fulfilledTotal = (t?.delivered ?? 0) + (t?.rto ?? 0) + (t?.rtoInTransit ?? 0) + (t?.attempted ?? 0);
  const a = analytics;

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-5">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold text-foreground">Logistics</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Fulfillment analytics & delivery intelligence</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Range */}
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
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="flex items-center gap-2 overflow-x-auto pb-1"
          >
            <button onClick={() => setActiveStore('all')}
              className={cn('flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition whitespace-nowrap',
                activeStore === 'all' ? 'bg-primary/15 text-primary border border-primary/30' : 'border border-border bg-card/40 text-muted-foreground hover:bg-card/60 hover:text-foreground'
              )}
            >
              <Store className="h-3.5 w-3.5" /> All Stores
              {combined && <span className="ml-1 text-xs opacity-70">{combined.total}</span>}
            </button>
            {storeNames.map((name) => (
              <button key={name} onClick={() => setActiveStore(name)}
                className={cn('flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition whitespace-nowrap',
                  activeStore === name ? 'bg-primary/15 text-primary border border-primary/30' : 'border border-border bg-card/40 text-muted-foreground hover:bg-card/60 hover:text-foreground'
                )}
              >
                {name} <span className="text-xs opacity-70">{stores[name].totals.total}</span>
              </button>
            ))}
          </motion.div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && t && (
          <div className="space-y-5">

            {/* ─── Primary Metrics ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <InsightCard label="Total Orders" value={t.total} icon={Package}
                color="text-violet-400" delay={0} sub={`${t.cod} COD · ${t.prepaid} Prepaid`} />
              <InsightCard label="Delivery Rate" value={pctNum(t.delivered, fulfilledTotal || t.total)}
                suffix="%" icon={CheckCircle2} color="text-emerald-400" delay={0.04}
                sub={`${t.delivered} of ${fulfilledTotal || t.total} delivered`} />
              <InsightCard label="COD Ratio" value={pctNum(t.cod, t.total)}
                suffix="%" icon={ArrowUpRight} color="text-blue-400" delay={0.08}
                sub={`COD delivery: ${pct(t.codDelivered, t.cod)}`} />
              <InsightCard label="RTO Rate" value={pctNum(t.rto + t.rtoInTransit, fulfilledTotal || t.total)}
                suffix="%" icon={RotateCcw} color="text-red-400" delay={0.12}
                sub={`${t.rto + t.rtoInTransit} returns`} />
            </div>

            {/* ─── Delivery Intelligence ─────────────────────────────── */}
            {a && (
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2.5 px-1">Delivery Intelligence</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <InsightCard label="FAD Rate" value={a.fadPct} suffix="%"
                    icon={Target} color="text-emerald-400" delay={0.18}
                    sub={a.fadTotal > 0 ? `${a.fadCount} of ${a.fadTotal} first-attempt` : 'No data'} />
                  <InsightCard label="Avg Delivery" value={a.avgDeliveryDays != null ? `${a.avgDeliveryDays}d` : null}
                    icon={Timer} color="text-blue-400" delay={0.2}
                    sub={a.avgCodDeliveryDays != null ? `COD: ${a.avgCodDeliveryDays}d · Prepaid: ${a.avgPrepaidDeliveryDays ?? '—'}d` : undefined} />
                  <InsightCard label="NDR Resolution" value={a.ndrResolutionRate} suffix="%"
                    icon={Zap} color="text-amber-400" delay={0.22}
                    sub={a.totalNdrOrders > 0 ? `${a.totalNdrOrders} NDR orders · ${a.avgNdrAttempts ?? 0} avg attempts` : 'No NDRs'} />
                  <InsightCard label="Value at Risk" value={a.atRiskValue > 0 ? formatINR(a.atRiskValue) : '₹0'}
                    icon={ShieldAlert} color="text-red-400" delay={0.24}
                    sub="RTO + NDR order value" />
                  <InsightCard label="COD Pending" value={a.codPendingDelivery > 0 ? formatINR(a.codPendingDelivery) : '₹0'}
                    icon={Wallet} color="text-amber-400" delay={0.26}
                    sub="In transit COD value" />
                  <InsightCard label="COD Delivered" value={a.codDeliveredAmount > 0 ? formatINR(a.codDeliveredAmount) : '₹0'}
                    icon={BadgeDollarSign} color="text-emerald-400" delay={0.28}
                    sub="Awaiting bank deposit (~7d)" />
                </div>
              </motion.div>
            )}

            {/* ─── Cashflow Summary ──────────────────────────────────── */}
            {a && a.totalRevenue > 0 && (
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Revenue Pipeline</p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground/60">Total Order Value</p>
                    <p className="text-lg font-bold text-foreground">{formatINR(a.totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60">Delivered Revenue</p>
                    <p className="text-lg font-bold text-emerald-400">{formatINR(a.deliveredRevenue)}</p>
                    <p className="text-[9px] text-muted-foreground/50">{pct(a.deliveredRevenue, a.totalRevenue)} realized</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60">In Pipeline</p>
                    <p className="text-lg font-bold text-blue-400">{formatINR(a.codPendingDelivery + a.prepaidDeliveredAmount)}</p>
                    <p className="text-[9px] text-muted-foreground/50">Pending delivery + prepaid</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60">Lost to RTO</p>
                    <p className="text-lg font-bold text-red-400">{formatINR(a.lostRevenue)}</p>
                    <p className="text-[9px] text-muted-foreground/50">{pct(a.lostRevenue, a.totalRevenue)} of total</p>
                  </div>
                </div>

                {/* Revenue bar */}
                <div className="mt-3 h-3 rounded-full bg-zinc-800/50 overflow-hidden flex">
                  {a.deliveredRevenue > 0 && (
                    <motion.div initial={{ width: 0 }} animate={{ width: `${a.deliveredRevenue / a.totalRevenue * 100}%` }}
                      transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-emerald-500 h-full" title={`Delivered: ${formatINR(a.deliveredRevenue)}`} />
                  )}
                  {a.codPendingDelivery > 0 && (
                    <motion.div initial={{ width: 0 }} animate={{ width: `${a.codPendingDelivery / a.totalRevenue * 100}%` }}
                      transition={{ delay: 0.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-blue-500 h-full" title={`In Transit: ${formatINR(a.codPendingDelivery)}`} />
                  )}
                  {a.atRiskValue > 0 && (
                    <motion.div initial={{ width: 0 }} animate={{ width: `${a.atRiskValue / a.totalRevenue * 100}%` }}
                      transition={{ delay: 0.7, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-amber-500 h-full" title={`At Risk: ${formatINR(a.atRiskValue)}`} />
                  )}
                  {a.lostRevenue > 0 && (
                    <motion.div initial={{ width: 0 }} animate={{ width: `${a.lostRevenue / a.totalRevenue * 100}%` }}
                      transition={{ delay: 0.8, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-red-500 h-full" title={`Lost: ${formatINR(a.lostRevenue)}`} />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-[10px]">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Delivered</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />In Transit</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />At Risk</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Lost</span>
                </div>
              </motion.div>
            )}

            {/* ─── Charts ────────────────────────────────────────────── */}
            <div className="grid gap-4 lg:grid-cols-5">
              {/* Pie */}
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
                className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4 lg:col-span-2"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Status Distribution</p>
                <div className="flex items-center gap-4">
                  <div className="h-[170px] w-[170px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={76}
                          dataKey="value" strokeWidth={0} animationDuration={800} animationBegin={300}>
                          {pieData.map((d) => <Cell key={d.status} fill={PIE_COLORS[d.status]} />)}
                        </Pie>
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="rounded-lg border border-border bg-[#0c0c0e]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                              <p className="text-[12px] font-medium text-foreground">{d.name}</p>
                              <p className="text-[11px] text-muted-foreground">{d.value} orders ({pct(d.value, t.total)})</p>
                            </div>
                          );
                        }} />
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

              {/* Daily Chart */}
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4 lg:col-span-3"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Daily Orders</p>
                <div className="h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="ordT" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="ordD" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="Total" stroke="#a78bfa" fill="url(#ordT)" strokeWidth={2} dot={false} animationDuration={800} />
                      <Area type="monotone" dataKey="Delivered" stroke="#34d399" fill="url(#ordD)" strokeWidth={2} dot={false} animationDuration={800} animationBegin={200} />
                      <Area type="monotone" dataKey="RTO" stroke="#f87171" fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} animationDuration={800} animationBegin={400} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            </div>

            {/* ─── Status Cards + COD vs Prepaid ─────────────────────── */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Status Cards */}
              <div className="grid grid-cols-3 gap-2">
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
                    <motion.div key={status} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.38 + i * 0.03 }}
                      className={cn('rounded-xl border border-border p-3 space-y-1', cfg.bg)}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className={cn('h-3 w-3', cfg.color)} />
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
                      </div>
                      <p className={cn('text-xl font-bold', cfg.color)}><AnimNum value={value} /></p>
                    </motion.div>
                  );
                })}
              </div>

              {/* COD vs Prepaid */}
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">COD vs Prepaid</p>
                <div className="h-[145px]">
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
            </div>

            {/* ─── Day-wise Link ──────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
              <Link href="/orders/breakdown"
                className="flex items-center justify-between rounded-xl border border-border bg-card/60 backdrop-blur-sm px-4 py-3 transition hover:bg-card/80 group"
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Day-wise Breakdown</p>
                    <p className="text-[11px] text-muted-foreground">View individual orders by date with Delhivery tracking</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:text-primary group-hover:translate-x-0.5" />
              </Link>
            </motion.div>

          </div>
        )}
      </div>
    </div>
  );
}
