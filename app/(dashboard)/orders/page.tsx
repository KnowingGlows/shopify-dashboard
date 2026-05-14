'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Truck, CheckCircle2, AlertTriangle, RotateCcw, XCircle,
  Calendar, ChevronDown, Loader2, Store,
  Clock, ShieldAlert, Timer, Wallet, CreditCard,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/date-picker';
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
  ndrRate: number | null;
  ndrDeliveredCount: number;
  avgNdrAttempts: number | null;
  totalNdrOrders: number;
  totalEverNdrOrders: number;
  totalAttemptedOrders: number;
  atRiskValue: number;
  codPendingDelivery: number;
  codDeliveredAmount: number;
  codDeliveredCount: number;
  codNdrCount: number;
  codRtoCount: number;
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

/** Returns 1st of current month → today minus 7 days */
function getDefaultRange(): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const [y, m] = todayIST.split('-').map(Number);
  const start = `${y}-${pad(m)}-01`;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const end = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(sevenDaysAgo);
  return { start, end };
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

// ── Main Page ────────────────────────────────────────────────────────
export default function LogisticsPage() {
  const { start: initStart, end: initEnd } = getDefaultRange();
  const [range, setRange] = useState<DateRange>('custom');
  const [customStart, setCustomStart] = useState(initStart);
  const [customEnd, setCustomEnd] = useState(initEnd);
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Record<string, StoreData>>({});
  const [combined, setCombined] = useState<StoreTotals | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [storeAnalytics, setStoreAnalytics] = useState<Record<string, Analytics>>({});
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
        setStoreAnalytics(data.storeAnalytics ?? {});
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

  const storeNames = useMemo(() => Object.keys(stores), [stores]);
  const fulfilledTotal = useMemo(() => (t?.delivered ?? 0) + (t?.rto ?? 0) + (t?.rtoInTransit ?? 0) + (t?.attempted ?? 0), [t]);
  const a = useMemo(() => activeStore === 'all' ? analytics : (storeAnalytics[activeStore] ?? null), [activeStore, analytics, storeAnalytics]);
  const codAttempted = useMemo(() => (a?.codDeliveredCount ?? 0) + (a?.codNdrCount ?? 0) + (a?.codRtoCount ?? 0), [a]);

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
                <DatePicker value={customStart} max={todayStr} onChange={(d) => setCustomStart(d)} compact />
                <span className="text-muted-foreground text-xs">to</span>
                <DatePicker value={customEnd} max={todayStr} onChange={(d) => setCustomEnd(d)} compact />
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

            {/* ─── COD Revenue Pipeline (top priority) ─────────────── */}
            {a && a.totalRevenue > 0 && (
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-5"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-4">COD Revenue Pipeline</p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground/60">Total COD Value</p>
                    <p className="text-xl font-bold text-foreground">{formatINR(a.totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60">Delivered</p>
                    <p className="text-xl font-bold text-emerald-400">{formatINR(a.deliveredRevenue)}</p>
                    <p className="text-[9px] text-muted-foreground/50">{pct(a.deliveredRevenue, a.totalRevenue)} — awaiting deposit</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60">In Transit</p>
                    <p className="text-xl font-bold text-blue-400">{formatINR(a.codPendingDelivery)}</p>
                    <p className="text-[9px] text-muted-foreground/50">Pending delivery</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60">Lost (RTO + In Transit)</p>
                    <p className="text-xl font-bold text-red-400">{formatINR(a.lostRevenue)}</p>
                    <p className="text-[9px] text-muted-foreground/50">{pct(a.lostRevenue, a.totalRevenue)} of COD</p>
                  </div>
                </div>

                <div className="mt-4 h-3 rounded-full bg-zinc-800/50 overflow-hidden flex">
                  {a.deliveredRevenue > 0 && (
                    <motion.div initial={{ width: 0 }} animate={{ width: `${a.deliveredRevenue / a.totalRevenue * 100}%` }}
                      transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-emerald-500 h-full" />
                  )}
                  {a.codPendingDelivery > 0 && (
                    <motion.div initial={{ width: 0 }} animate={{ width: `${a.codPendingDelivery / a.totalRevenue * 100}%` }}
                      transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-blue-500 h-full" />
                  )}
                  {a.atRiskValue > 0 && (
                    <motion.div initial={{ width: 0 }} animate={{ width: `${a.atRiskValue / a.totalRevenue * 100}%` }}
                      transition={{ delay: 0.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-amber-500 h-full" />
                  )}
                  {a.lostRevenue > 0 && (
                    <motion.div initial={{ width: 0 }} animate={{ width: `${a.lostRevenue / a.totalRevenue * 100}%` }}
                      transition={{ delay: 0.7, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-red-500 h-full" />
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

            {/* ─── Key Metrics ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <InsightCard label="Delivery Rate" value={pctNum(t.delivered, fulfilledTotal || t.total)}
                suffix="%" icon={CheckCircle2} color="text-emerald-400" delay={0.1}
                sub={`${t.delivered} of ${fulfilledTotal || t.total} attempted`} />
              <InsightCard label="COD Delivery" value={codAttempted > 0 ? pctNum(a?.codDeliveredCount ?? 0, codAttempted) : 0}
                suffix="%" icon={Wallet} color="text-blue-400" delay={0.14}
                sub={`${a?.codDeliveredCount ?? 0} delivered of ${codAttempted} COD attempted`} />
              <InsightCard label="RTO Rate" value={pctNum(t.rto + t.rtoInTransit, fulfilledTotal || t.total)}
                suffix="%" icon={RotateCcw} color="text-red-400" delay={0.18}
                sub={`${t.rto + t.rtoInTransit} returns`} />
<InsightCard label="NDR Rate" value={a?.ndrRate ?? null}
                suffix="%" icon={AlertTriangle} color="text-orange-400" delay={0.26}
                sub={a && a.totalAttemptedOrders > 0 ? `${a.totalNdrOrders} NDR of ${a.totalAttemptedOrders} attempted` : 'No data'} />
              <InsightCard label="Avg Delivery" value={a?.avgDeliveryDays != null ? `${a.avgDeliveryDays}d` : null}
                icon={Timer} color="text-violet-400" delay={0.3}
                sub={a?.avgCodDeliveryDays != null ? `COD: ${a.avgCodDeliveryDays}d` : 'Calculating...'} />
              <InsightCard label="Prepaid Rate" value={pctNum(t.prepaid, t.total)}
                suffix="%" icon={CreditCard} color="text-cyan-400" delay={0.34}
                sub={`${t.prepaid} prepaid of ${t.total} orders`} />
            </div>

            {/* ─── Status Distribution (prominent) ─────────────────── */}
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}
              className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Order Status</p>
                <p className="text-sm text-muted-foreground">{t.total} total orders</p>
              </div>
              <div className="flex flex-col lg:flex-row items-center gap-6">
                <div className="h-[200px] w-[200px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
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
                <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {([
                    ['Delivered', t.delivered, 'delivered'],
                    ['In Transit', t.inTransit, 'in_transit'],
                    ['Out for Delivery', t.outForDelivery, 'out_for_delivery'],
                    ['NDR / Attempted', t.attempted, 'attempted'],
                    ['RTO', t.rto + t.rtoInTransit, 'rto'],
                    ['Unfulfilled', t.unfulfilled, 'unfulfilled'],
                  ] as [string, number, DeliveryStatus][]).map(([label, value, status]) => {
                    const cfg = STATUS_CONFIG[status];
                    const Icon = cfg.icon;
                    return (
                      <div key={label} className={cn('rounded-xl border border-border p-3 space-y-1', cfg.bg)}>
                        <div className="flex items-center gap-1.5">
                          <Icon className={cn('h-3 w-3', cfg.color)} />
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
                        </div>
                        <p className={cn('text-xl font-bold', cfg.color)}><AnimNum value={value} /></p>
                        <p className="text-[9px] text-muted-foreground/50">{pct(value, t.total)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>


          </div>
        )}
      </div>
    </div>
  );
}
