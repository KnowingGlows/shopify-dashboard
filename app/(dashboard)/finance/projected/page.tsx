'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  RefreshCw, Loader2, DollarSign, Wallet, Plus,
  X, ArrowRight, Calendar,
  TrendingDown, TrendingUp,
  ArrowDown, BanknoteIcon, Settings2,
  Check, ToggleLeft, ToggleRight,
  Save, Trash2,
  ShoppingCart, Package, Megaphone, Wrench, Users, Repeat, Receipt,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';
import { DatePicker } from '@/components/date-picker';
import { formatINR } from '@/lib/currency-converter';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────

interface FinanceDailyEntry {
  date: string;
  totalSales: number;
  grossMargin: number;
  grossProfit: number;
  adSpend: number;
  netProfit: number;
  codSalesByBrand?: Record<string, number>;
}

interface Baseline {
  id: string;
  type: 'daily' | 'monthly';
  category: string;
  label: string;
  amount: number;
  dueDate?: string;
  isPaid?: boolean;
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
}

interface IncomeEntry {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  endDate?: string;
}

interface CODWeek {
  weekLabel: string;
  startDate: string;
  endDate: string;
  projectedAmount: number;
  codRevenue: number;
  brandBreakdown: Record<string, number>;
}

interface SpendingPower {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  codRevenue: number;
  projectedDeposit: number;
  founderCut: number;
  founderCutPct: number;
  inventoryNeeds: number;
  baselinesDue: number;
  weekExpenses: number;
  spendingPower: number;
  breakdown: Array<{ label: string; amount: number; type: 'income' | 'deduction' | 'result' }>;
  enabledItems: Record<string, boolean>;
}

interface FinanceSummary {
  totalSales: number;
  totalGrossProfit: number;
  totalAdSpend: number;
  totalNetProfit: number;
  totalExpenses: number;
  dailyBaselineTotal: number;
  monthlyBaselineTotal: number;
  dailyEntries: FinanceDailyEntry[];
  dailyBaselines: Baseline[];
  monthlyBaselines: Baseline[];
}

function fmtMonthDay(dateStr: string): string {
  const [, m, day] = dateStr.split('-');
  return `${m}/${day}`;
}

// ── Planning constants ────────────────────────────────────────────────────────

interface PlannedExpense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
}

const PLAN_CATEGORIES = [
  { value: 'reinvestment', label: 'Reinvestment', icon: TrendingUp, color: 'violet' },
  { value: 'inventory', label: 'Inventory Restock', icon: Package, color: 'orange' },
  { value: 'marketing', label: 'Marketing / Ads', icon: Megaphone, color: 'pink' },
  { value: 'product-testing', label: 'Product Testing', icon: ShoppingCart, color: 'emerald' },
  { value: 'tools', label: 'Tools / Software', icon: Wrench, color: 'cyan' },
  { value: 'hiring', label: 'Hiring / Team', icon: Users, color: 'blue' },
  { value: 'recurring', label: 'Recurring Setup', icon: Repeat, color: 'amber' },
  { value: 'other', label: 'Other', icon: Receipt, color: 'zinc' },
];

const CATEGORY_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  reinvestment: { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  inventory: { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  marketing: { text: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/30' },
  'product-testing': { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  tools: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  hiring: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  recurring: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  other: { text: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/30' },
};

// ── Main Component ───────────────────────────────────────────────────────────

function getToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function ProjectedFinancePage() {
  const [activeTab, setActiveTab] = useState<'projection' | 'planning'>('projection');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [codWeeks, setCodWeeks] = useState<CODWeek[]>([]);
  const [spending, setSpending] = useState<SpendingPower | null>(null);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<IncomeEntry[]>([]);
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({});
  const [deliveryDays, setDeliveryDays] = useState<Record<string, number>>({});
  const [showDeliveryConfig, setShowDeliveryConfig] = useState(false);
  const [editDeliveryDays, setEditDeliveryDays] = useState<Record<string, string>>({});
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [plannedExpenses, setPlannedExpenses] = useState<Array<{ id: string; category: string; description: string; amount: number; date: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // Planning tab state
  const [planned, setPlanned] = useState<PlannedExpense[]>([]);
  const [loadingPlanned, setLoadingPlanned] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [planCategory, setPlanCategory] = useState('reinvestment');
  const [planDescription, setPlanDescription] = useState('');
  const [planAmount, setPlanAmount] = useState('');
  const [planDate, setPlanDate] = useState(getToday());

  // Date range filter — start/end date pickers
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(Date.now() - 14 * 86400000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  });
  const [endDate, setEndDate] = useState(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  );

  const fetchAll = useCallback(async () => {
    try {
      const start = new Date(startDate + 'T00:00:00+05:30');
      const end = new Date(endDate + 'T00:00:00+05:30');
      // Add 42 extra days for COD projection window
      const days = Math.max(7, Math.round((end.getTime() - start.getTime()) / 86400000) + 1) + 42;
      // Fetch finance data first (fast)
      const [res, plannedRes] = await Promise.all([
        fetch(`/api/finance?action=combined&days=${days}`),
        fetch('/api/finance?action=planned'),
      ]);
      const [data, plannedData] = await Promise.all([res.json(), plannedRes.json()]);
      setSummary(data.summary);
      setCodWeeks(data.codWeeks ?? []);
      setSpending(data.spending);
      setBaselines([...(data.baselines?.daily ?? []), ...(data.baselines?.monthly ?? [])]);
      setDeliveryRates(data.deliveryRates ?? {});
      setDeliveryDays(data.deliveryDays ?? {});
      setExpenses(data.expenses ?? []);
      setIncome(data.income ?? []);
      setPlannedExpenses(plannedData.planned ?? []);
      setLoading(false);
    } catch { /* silently fail */ }
    finally { setLoading(false); setRefreshing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchPlanned = useCallback(async () => {
    setLoadingPlanned(true);
    try {
      const res = await fetch('/api/finance?action=planned');
      const data = await res.json();
      setPlanned(data.planned ?? []);
    } catch { setPlanned([]); }
    finally { setLoadingPlanned(false); }
  }, []);

  useEffect(() => { if (activeTab === 'planning') fetchPlanned(); }, [activeTab, fetchPlanned]);

  const saveDeliveryDaysConfig = async () => {
    const days: Record<string, number> = {};
    for (const [brand, val] of Object.entries(editDeliveryDays)) {
      if (Number(val) > 0) days[brand] = Number(val);
    }
    setSavingDelivery(true);
    try {
      await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-delivery-rates', days }),
      });
      setDeliveryDays(days);
      setShowDeliveryConfig(false);
      fetchAll();
    } catch { /* ignore */ }
    finally { setSavingDelivery(false); }
  };

  const addPlanned = async () => {
    if (!planAmount || !planCategory) return;
    setSavingPlan(true);
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-planned', category: planCategory, description: planDescription, amount: Number(planAmount), date: planDate }),
      });
      const data = await res.json();
      if (data.planned) {
        setPlanned((prev) => [...prev, data.planned].sort((a, b) => a.date.localeCompare(b.date)));
        setPlanDescription('');
        setPlanAmount('');
        setShowPlanForm(false);
      }
    } catch { /* fail silently */ }
    finally { setSavingPlan(false); }
  };

  const deletePlanned = async (id: string) => {
    setDeletingPlanId(id);
    try {
      await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-planned', id }),
      });
      setPlanned((prev) => prev.filter((p) => p.id !== id));
    } catch { /* fail silently */ }
    finally { setDeletingPlanId(null); }
  };

  const todayStr = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()), []);

  const chartDays = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00+05:30');
    const end = new Date(endDate + 'T00:00:00+05:30');
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  }, [startDate, endDate]);

  // Build daily outflow map from PLANNED expenses only
  const dailyOutflows = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of plannedExpenses) {
      if (p.date >= todayStr) {
        map[p.date] = (map[p.date] ?? 0) + p.amount;
      }
    }
    return map;
  }, [plannedExpenses, todayStr]);

  // Build outflow chart data — today FORWARD for chartDays
  const outflowDays = useMemo(() => {
    const days: Array<{ date: string; label: string; planned: number }> = [];
    const start = new Date(todayStr + 'T00:00:00+05:30');
    for (let i = 0; i < chartDays; i++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + i);
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(dt);
      days.push({
        date: dateStr,
        label: fmtMonthDay(dateStr),
        planned: dailyOutflows[dateStr] ?? 0,
      });
    }
    return days;
  }, [todayStr, dailyOutflows, chartDays]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Loading projections...</p>
        </div>
      </div>
    );
  }

  const d = summary ?? {
    totalSales: 0, totalGrossProfit: 0, totalAdSpend: 0, totalNetProfit: 0,
    totalExpenses: 0, dailyBaselineTotal: 0, monthlyBaselineTotal: 0,
    dailyEntries: [], dailyBaselines: [], monthlyBaselines: [],
  };

  const currentWeek = codWeeks[0];
  const totalCODProjected = codWeeks.reduce((s, w) => s + w.projectedAmount, 0);

  // Forward-looking inflow — shift each sale to its projected deposit date
  // depositDate = weekendAdjust(saleDate + brandDays[brand] + 2)
  function clientWeekendAdjust(d: Date): Date {
    const day = d.getDay();
    if (day === 5) d.setDate(d.getDate() + 3); // Fri → Mon
    else if (day === 6) d.setDate(d.getDate() + 3); // Sat → Tue
    else if (day === 0) d.setDate(d.getDate() + 2); // Sun → Tue
    return d;
  }
  const inflowByDate: Record<string, number> = {};
  for (const entry of (d.dailyEntries ?? [])) {
    const codByBrand = entry.codSalesByBrand ?? {};
    for (const [brand, amount] of Object.entries(codByBrand)) {
      const val = Number(amount) || 0;
      if (val <= 0) continue;
      const delDays = (deliveryDays[brand] ?? 7) + 2;
      const base = new Date(entry.date + 'T00:00:00+05:30');
      base.setDate(base.getDate() + delDays);
      const depositDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(clientWeekendAdjust(base));
      const rate = deliveryRates[brand] ?? 65;
      const deposit = Math.round(val * (rate / 100));
      if (deposit > 0) inflowByDate[depositDate] = (inflowByDate[depositDate] ?? 0) + deposit;
    }
  }

  // Total COD collected (raw COD revenue before delivery rate)
  const totalCODCollected = (d.dailyEntries ?? []).reduce((s, e) => {
    const cod = e.codSalesByBrand ?? {};
    return s + Object.values(cod).reduce((a, v) => a + Number(v), 0);
  }, 0);

  // Build inflow chart — today FORWARD for chartDays (IST dates to match inflowByDate keys)
  const inflowChartData = Array.from({ length: chartDays }, (_, i) => {
    const dt = new Date(todayStr + 'T00:00:00+05:30');
    dt.setDate(dt.getDate() + i);
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(dt);
    return {
      date: dateStr,
      deposit: inflowByDate[dateStr] ?? 0,
      label: fmtMonthDay(dateStr),
    };
  });

  const totalOutflow = outflowDays.reduce((s, od) => s + od.planned, 0);
  const totalInflow = inflowChartData.reduce((s, d) => s + d.deposit, 0);

  // P&L Net Profit = grossProfit - (adSpend * 1.14) — the formula-based approach
  const pnlNetProfit = d.totalGrossProfit - Math.round(d.totalAdSpend * 1.14);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">COD Projection</h1>
          <p className="text-[11px] text-muted-foreground">Forward-looking projections & expense planning</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'projection' && (
            <>
              <Link
                href="/finance/projected/entry"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/90 px-4 py-2 text-[12px] font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary hover:shadow-md hover:shadow-primary/25 active:scale-[0.97]"
              >
                <Plus className="h-3.5 w-3.5" />
                Daily P&L
              </Link>
              <button
                onClick={() => { setRefreshing(true); fetchAll(); }}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-[12px] font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
          {activeTab === 'planning' && (
            <button
              onClick={() => setShowPlanForm(!showPlanForm)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] shadow-lg shadow-primary/20"
            >
              {showPlanForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showPlanForm ? 'Cancel' : 'Plan Expense'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card/60 p-1 w-fit">
        {([
          { key: 'projection', label: 'COD Projection', icon: TrendingUp },
          { key: 'planning', label: 'Expense Planning', icon: TrendingDown },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-medium transition-all ${
              activeTab === key
                ? 'bg-primary/15 text-primary border border-primary/25 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Date Range Filter — projection tab only */}
      {activeTab === 'projection' && (
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        <DatePicker value={startDate} onChange={setStartDate} max={endDate} compact />
        <span className="text-[11px] text-muted-foreground/40">→</span>
        <DatePicker value={endDate} onChange={setEndDate} min={startDate} compact />
      </div>
      )}

      {/* ── Projection Tab ── */}
      {activeTab === 'projection' && (<>

      {/* Key Metrics */}
      <StaggerContainer className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StaggerItem>
          <MetricCard label="Projected Deposits" value={totalCODProjected} icon={<BanknoteIcon className="h-4 w-4 text-blue-400" />} color="text-emerald-400" />
        </StaggerItem>
        <StaggerItem>
          <MetricCard label="P&L Net Profit" value={pnlNetProfit} icon={<Wallet className="h-4 w-4 text-violet-400" />} color={pnlNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        </StaggerItem>
        <StaggerItem>
          <MetricCard label="COD Collected" value={totalCODCollected} icon={<DollarSign className="h-4 w-4 text-emerald-400" />} color="text-foreground" />
        </StaggerItem>
      </StaggerContainer>

      {/* ═══ Delivery Timeline Config ═══ */}
      {Object.keys(deliveryRates).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="rounded-xl border border-border/50 bg-card/60">
            <button
              onClick={() => {
                if (!showDeliveryConfig) {
                  const init: Record<string, string> = {};
                  for (const brand of Object.keys(deliveryRates)) {
                    init[brand] = String(deliveryDays[brand] ?? 7);
                  }
                  setEditDeliveryDays(init);
                }
                setShowDeliveryConfig(!showDeliveryConfig);
              }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/5 transition rounded-xl"
            >
              <div className="flex items-center gap-2">
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[12px] font-medium text-muted-foreground">COD Delivery Timeline</span>
                <span className="text-[10px] text-muted-foreground/50">per store avg days</span>
              </div>
              <div className="flex items-center gap-3">
                {Object.entries(deliveryDays).map(([brand, days]) => (
                  <span key={brand} className="text-[10px] font-medium text-primary/70">{brand}: {days}d</span>
                ))}
                <ArrowRight className={`h-3.5 w-3.5 text-muted-foreground/40 transition-transform ${showDeliveryConfig ? 'rotate-90' : ''}`} />
              </div>
            </button>
            <AnimatePresence>
              {showDeliveryConfig && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border/30">
                  <div className="px-4 py-4 space-y-3">
                    <p className="text-[10px] text-muted-foreground/60">Set the average delivery days for each store. Deposit = delivery days + 2 days (with weekend adjustment).</p>
                    <div className="flex flex-wrap gap-4">
                      {Object.keys(deliveryRates).map((brand) => (
                        <div key={brand} className="flex items-center gap-2">
                          <label className="text-[11px] font-medium text-foreground">{brand}</label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={editDeliveryDays[brand] ?? '7'}
                            onChange={(e) => setEditDeliveryDays((prev) => ({ ...prev, [brand]: e.target.value }))}
                            className="w-16 rounded-lg border border-border/40 bg-background/60 px-2 py-1.5 text-[13px] font-semibold text-foreground text-center tabular-nums focus:border-primary/40 focus:outline-none transition"
                          />
                          <span className="text-[10px] text-muted-foreground">days</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={saveDeliveryDaysConfig}
                      disabled={savingDelivery}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary/90 px-4 py-2 text-[11px] font-medium text-primary-foreground transition hover:bg-primary active:scale-[0.97] disabled:opacity-50"
                    >
                      {savingDelivery ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Save
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* ═══ Spending Power ═══ */}
      {spending && spending.projectedDeposit > 0 && (() => {
        return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <div className="rounded-2xl border border-violet-500/15 bg-gradient-to-br from-violet-500/[0.04] via-card to-card overflow-hidden">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="h-5 w-5 text-violet-400" />
                    <h2 className="text-base font-semibold text-foreground">Spending Power</h2>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtMonthDay(spending.weekStart)} <ArrowRight className="inline h-2.5 w-2.5" /> {fmtMonthDay(spending.weekEnd)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Available</p>
                  <p className={`text-3xl font-bold tabular-nums ${spending.spendingPower > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    <AnimatedNumber value={spending.spendingPower} formatter={formatINR} />
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-4 mb-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-sm bg-emerald-500/40" />
                  <span className="text-[9px] text-muted-foreground/60">Deposit {formatINR(spending.projectedDeposit)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-sm bg-red-500/40" />
                  <span className="text-[9px] text-muted-foreground/60">Expenses {formatINR(spending.weekExpenses)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-sm bg-amber-500/40" />
                  <span className="text-[9px] text-muted-foreground/60">Recurring {formatINR(spending.baselinesDue)}</span>
                </div>
              </div>

              <div className="h-3 rounded-full bg-border/30 overflow-hidden flex">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (spending.spendingPower / spending.projectedDeposit) * 100)}%` }}
                  transition={{ duration: 0.8 }}
                  className={`h-full rounded-full ${spending.spendingPower > 0 ? 'bg-emerald-500/50' : 'bg-red-500/50'}`}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[9px] text-muted-foreground/40">₹0</span>
                <span className="text-[9px] text-muted-foreground/40">{formatINR(spending.projectedDeposit)}</span>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setBreakdownOpen(true)}
                  className="rounded-lg border border-border px-4 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition"
                >
                  View Breakdown
                </button>
              </div>
            </div>
          </div>
        </motion.div>
        );
      })()}

      {/* ═══ Projected COD Deposits ═══ */}
      {totalInflow > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
          <div className="rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.04] via-card to-card">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                    <h2 className="text-base font-semibold text-foreground">Projected COD Deposits</h2>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">Estimated bank deposits from COD deliveries</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Total Expected</p>
                  <p className="text-3xl font-bold tabular-nums text-emerald-400">
                    <AnimatedNumber value={totalInflow} formatter={formatINR} />
                  </p>
                </div>
              </div>

              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={inflowChartData} margin={{ top: 8, right: 20, left: 20, bottom: 24 }}>
                    <defs>
                      <linearGradient id="codDepositGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="label"
                      interval={chartDays <= 30 ? 0 : 6}
                      tick={({ x, y, payload }) => (
                        <text
                          x={x as number} y={(y as number) + 14}
                          textAnchor="middle"
                          fontSize={chartDays <= 14 ? 10 : chartDays <= 30 ? 8 : 9}
                          fontWeight={payload.value === fmtMonthDay(todayStr) ? 700 : 500}
                          fill={payload.value === fmtMonthDay(todayStr) ? '#a78bfa' : '#9ca3af'}
                        >
                          {payload.value}
                        </text>
                      )}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip
                      content={({ active, payload }) => active && payload?.length && (payload[0].value as number) > 0 ? (
                        <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] font-medium text-foreground shadow-lg">
                          <span className="text-muted-foreground text-[10px] mr-1.5">Deposit</span>{formatINR(payload[0].value as number)}
                        </div>
                      ) : null}
                    />
                    <Area type="monotone" dataKey="deposit" stroke="#10b981" strokeWidth={1.5} fill="url(#codDepositGrad)" dot={false} activeDot={{ r: 3, fill: '#10b981' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ Projected Cash Outflow ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
        <div className="rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-500/[0.04] via-card to-card">
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ArrowDown className="h-5 w-5 text-red-400" />
                  <h2 className="text-base font-semibold text-foreground">Projected Cash Outflow</h2>
                </div>
                <p className="text-[10px] text-muted-foreground/60">Planned reinvestment & expenses</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab('planning')}
                  className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-[10px] font-medium text-primary transition hover:bg-primary/10"
                >
                  Plan Expenses →
                </button>
                {totalOutflow > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Total Planned</p>
                    <p className="text-3xl font-bold tabular-nums text-red-400">
                      <AnimatedNumber value={totalOutflow} formatter={formatINR} />
                    </p>
                  </div>
                )}
              </div>
            </div>

            {totalOutflow > 0 ? (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={outflowDays} margin={{ top: 8, right: 20, left: 20, bottom: 24 }}>
                    <defs>
                      <linearGradient id="plannedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      interval={chartDays <= 30 ? 0 : 6}
                      tick={({ x, y, payload }) => (
                        <text
                          x={x as number} y={(y as number) + 14}
                          textAnchor="middle"
                          fontSize={chartDays <= 14 ? 10 : chartDays <= 30 ? 8 : 9}
                          fontWeight={payload.value === fmtMonthDay(todayStr) ? 700 : 500}
                          fill={payload.value === fmtMonthDay(todayStr) ? '#a78bfa' : '#9ca3af'}
                        >
                          {payload.value}
                        </text>
                      )}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => active && payload?.length && (payload[0].value as number) > 0 ? (
                        <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] font-medium text-foreground shadow-lg">
                          <span className="text-muted-foreground text-[10px] mr-1.5">Planned</span>{formatINR(payload[0].value as number)}
                        </div>
                      ) : null}
                    />
                    <Area type="monotone" dataKey="planned" stroke="#ef4444" strokeWidth={1.5} fill="url(#plannedGrad)" dot={false} activeDot={{ r: 3, fill: '#ef4444' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center text-center">
                <ArrowDown className="h-6 w-6 text-muted-foreground/20 mb-2" />
                <p className="text-[12px] text-muted-foreground/50">No expenses planned yet</p>
                <button onClick={() => setActiveTab('planning')} className="text-[11px] text-primary hover:text-primary/80 mt-1 transition">
                  Plan your reinvestment →
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ═══ Spending Power Breakdown Modal ═══ */}
      <AnimatePresence>
        {breakdownOpen && spending && (
          <SpendingBreakdownModal
            spending={spending}
            onClose={() => setBreakdownOpen(false)}
            onRefresh={fetchAll}
          />
        )}
      </AnimatePresence>

      </>)}

      {/* ── Planning Tab ── */}
      <AnimatePresence mode="wait">
      {activeTab === 'planning' && (
        <motion.div key="planning" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2 }} className="space-y-5">

          {/* Planning Summary */}
          {planned.length > 0 && (() => {
            const total = planned.reduce((s, p) => s + p.amount, 0);
            const byCategory: Record<string, number> = {};
            for (const p of planned) byCategory[p.category] = (byCategory[p.category] ?? 0) + p.amount;
            const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent px-4 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1">Total Planned</p>
                  <p className="text-2xl font-bold text-red-400 tabular-nums">{formatINR(total)}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{planned.length} planned expense{planned.length !== 1 ? 's' : ''}</p>
                </div>
                {topCategories.slice(0, 3).map(([cat, amt]) => {
                  const cfg = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other;
                  const catLabel = PLAN_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
                  return (
                    <div key={cat} className={`rounded-xl border ${cfg.border} ${cfg.bg} px-4 py-3`}>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1">{catLabel}</p>
                      <p className={`text-xl font-bold tabular-nums ${cfg.text}`}>{formatINR(amt)}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">{Math.round((amt / total) * 100)}% of total</p>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Add Form */}
          <AnimatePresence>
            {showPlanForm && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <TrendingDown className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Plan an Expense</h2>
                      <p className="text-[10px] text-muted-foreground">Where will this profit go?</p>
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2">Category</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                      {PLAN_CATEGORIES.map((cat) => {
                        const Icon = cat.icon;
                        const isActive = planCategory === cat.value;
                        const cfg = CATEGORY_COLORS[cat.value];
                        return (
                          <button
                            key={cat.value}
                            onClick={() => setPlanCategory(cat.value)}
                            className={`group flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-center transition-all border ${
                              isActive
                                ? `${cfg.bg} ${cfg.border} ${cfg.text} shadow-sm`
                                : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent/5'
                            }`}
                          >
                            <Icon className={`h-4 w-4 transition ${isActive ? cfg.text : 'text-muted-foreground/50 group-hover:text-foreground'}`} />
                            <span className="text-[10px] font-medium leading-tight">{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Amount + Description + Date */}
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_auto] gap-4">
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 block">Amount</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-semibold text-primary/60">₹</span>
                        <input
                          type="number"
                          value={planAmount}
                          onChange={(e) => setPlanAmount(e.target.value)}
                          placeholder="0"
                          className="w-full rounded-xl border border-border/40 bg-background/40 pl-10 pr-4 py-3.5 text-[20px] font-semibold text-foreground tabular-nums placeholder:text-muted-foreground/20 focus:border-primary/40 focus:outline-none transition"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 block">Description</label>
                      <input
                        type="text"
                        value={planDescription}
                        onChange={(e) => setPlanDescription(e.target.value)}
                        placeholder="e.g. Restock Kairova bestseller — 500 units from supplier"
                        className="w-full rounded-xl border border-border/40 bg-background/40 px-4 py-3.5 text-[13px] text-foreground placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 block">Planned Date</label>
                      <DatePicker value={planDate} onChange={(d) => setPlanDate(d)} />
                    </div>
                  </div>

                  <button
                    onClick={addPlanned}
                    disabled={savingPlan || !planAmount}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-[13px] font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
                  >
                    {savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Plan
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Planned List */}
          {loadingPlanned ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : planned.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
              <TrendingDown className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No expenses planned yet</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">Plan how to reinvest your profits</p>
            </motion.div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-[1fr_140px_120px_40px] sm:grid-cols-[1fr_160px_140px_120px_40px] gap-2 px-4 py-2 border-b border-border/50 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                <span>Expense</span>
                <span className="hidden sm:block">Category</span>
                <span>Date</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
              <StaggerContainer className="max-h-[600px] overflow-y-auto">
                {planned.map((item) => {
                  const cfg = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other;
                  const catLabel = PLAN_CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category;
                  return (
                    <StaggerItem key={item.id}>
                      <div className="group grid grid-cols-[1fr_140px_120px_40px] sm:grid-cols-[1fr_160px_140px_120px_40px] gap-2 items-center px-4 py-3 border-b border-border/20 last:border-0 hover:bg-accent/5 transition">
                        <div className="min-w-0 flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${cfg.text.replace('text-', 'bg-').replace('-400', '-500')}`} />
                          <span className="text-[12px] font-medium text-foreground truncate">{item.description || catLabel}</span>
                        </div>
                        <span className={`hidden sm:inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.border} ${cfg.text} w-fit`}>
                          {catLabel}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60">
                          {new Date(item.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className="text-[13px] font-semibold text-red-400 tabular-nums text-right">{formatINR(item.amount)}</span>
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => deletePlanned(item.id)}
                            disabled={deletingPlanId === item.id}
                            className="rounded-md p-1 text-muted-foreground/40 hover:text-red-400 transition disabled:opacity-50"
                          >
                            {deletingPlanId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                    </StaggerItem>
                  );
                })}
              </StaggerContainer>
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>

    </PageTransition>
  );
}

// ── Spending Breakdown Modal ─────────────────────────────────────────────────

function SpendingBreakdownModal({ spending, onClose, onRefresh }: { spending: SpendingPower; onClose: () => void; onRefresh: () => void }) {
  const [founderPct, setFounderPct] = useState(spending.founderCutPct ?? 50);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(spending.enabledItems ?? { founderCut: true, inventoryNeeds: true, baselines: true, expenses: true });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-spending-config', founderCutPct: founderPct, enabledItems: enabled }),
      });
      setSaved(true);
      onRefresh();
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const toggleItem = (key: string) => {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[8vh] md:pt-[10vh]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-[92vw] max-w-[520px] rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl mx-4 max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4 sticky top-0 bg-card/95 backdrop-blur-xl z-10">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Spending Power Breakdown</h2>
              <p className="text-[11px] text-muted-foreground">{fmtMonthDay(spending.weekStart)} → {fmtMonthDay(spending.weekEnd)}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-border/60 bg-background/60 p-2 text-muted-foreground transition hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-0">
          {(() => {
            const knownDeductions = ['founder cut', 'inventory'];
            const isKnownDeduction = (label: string) => knownDeductions.some((k) => label.toLowerCase().includes(k));
            const keepItems = spending.breakdown.filter((item) =>
              item.type === 'income' || item.type === 'result' || (item.type === 'deduction' && isKnownDeduction(item.label))
            );
            const totalExpenses = spending.weekExpenses;
            const totalBaselines = spending.baselinesDue;
            const grouped: Array<{ label: string; amount: number; type: 'income' | 'deduction' | 'result' }> = [];
            for (const item of keepItems) {
              if (item.type === 'result') {
                if (totalExpenses > 0) grouped.push({ label: 'Expenses', amount: -totalExpenses, type: 'deduction' });
                if (totalBaselines > 0) grouped.push({ label: 'Recurring Expenses', amount: -totalBaselines, type: 'deduction' });
              }
              grouped.push(item);
            }
            return grouped.map((item, i) => {
              const isIncome = item.type === 'income';
              const isResult = item.type === 'result';
              const isDeduction = item.type === 'deduction';
              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    isResult ? 'rounded-xl border border-emerald-500/20 bg-emerald-500/5 mt-2' : i > 0 ? 'border-t border-border/30' : ''
                  }`}
                >
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isIncome ? 'bg-emerald-500/10 border border-emerald-500/20' : isResult ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-red-500/8 border border-red-500/15'
                  }`}>
                    {isIncome ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> :
                     isResult ? <Wallet className="h-3.5 w-3.5 text-emerald-400" /> :
                     <ArrowDown className="h-3.5 w-3.5 text-red-400" />}
                  </div>
                  <span className={`text-[13px] flex-1 ${isResult ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{item.label}</span>
                  <span className={`text-[14px] font-semibold tabular-nums ${
                    isIncome ? 'text-emerald-400' : isResult ? (item.amount > 0 ? 'text-emerald-400' : 'text-red-400') : 'text-red-400'
                  }`}>
                    {isDeduction ? '−' : ''}{formatINR(Math.abs(item.amount))}
                  </span>
                </motion.div>
              );
            });
          })()}

          <div className="flex gap-2 px-4 pt-4">
            <Link href="/finance/expenditure" className="flex-1 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-[11px] font-medium text-center text-red-400 transition hover:bg-red-500/10 hover:border-red-500/30">
              View Expenditure →
            </Link>
            <Link href="/finance/expenditure" className="flex-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[11px] font-medium text-center text-amber-400 transition hover:bg-amber-500/10 hover:border-amber-500/30">
              View Recurring →
            </Link>
          </div>
        </div>

        <div className="border-t border-border/50 px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Customize Deductions</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <button onClick={() => toggleItem('founderCut')} className="text-muted-foreground hover:text-foreground transition">
                {enabled.founderCut !== false ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
              </button>
              <span className="text-[12px] font-medium text-foreground">Founder Cut</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input type="number" min={0} max={100} value={founderPct} onChange={(e) => setFounderPct(Number(e.target.value) || 0)} disabled={enabled.founderCut === false} className="w-14 bg-transparent text-right text-[13px] font-semibold text-foreground tabular-nums outline-none border-b border-border/30 focus:border-primary/50 disabled:opacity-40 transition" />
              <span className="text-[11px] text-muted-foreground">%</span>
            </div>
          </div>
          {[
            { key: 'inventoryNeeds', label: 'Inventory Restock' },
            { key: 'baselines', label: 'Recurring Expenses Due' },
            { key: 'expenses', label: 'Week Expenses' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <button onClick={() => toggleItem(key)} className="text-muted-foreground hover:text-foreground transition">
                  {enabled[key] !== false ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
                <span className="text-[12px] font-medium text-foreground">{label}</span>
              </div>
            </div>
          ))}
          <button onClick={saveConfig} disabled={saving} className="w-full rounded-lg bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-40 flex items-center justify-center gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
            {saved ? 'Saved!' : 'Save Configuration'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, icon, color, formatter }: { label: string; value: number; icon: React.ReactNode; color: string; formatter?: (v: number) => string }) {
  const format = formatter ?? formatINR;
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
      <div className="relative z-10 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={`relative z-10 mt-1.5 text-2xl font-semibold ${color}`}><AnimatedNumber value={value} formatter={format} /></p>
    </motion.div>
  );
}
