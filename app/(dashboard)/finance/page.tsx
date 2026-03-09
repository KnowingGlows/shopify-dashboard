'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Loader2, DollarSign, TrendingUp, Target, Wallet, Plus,
  AlertTriangle, Calendar, ArrowRight, ChevronDown, ChevronUp,
  Calculator, Truck, Building2, Receipt, Clock,
  BanknoteIcon, PiggyBank, BarChart3, Bell, X, Save, Megaphone,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';

// ── Types ────────────────────────────────────────────────────────────────────

interface FinanceDailyEntry {
  date: string;
  totalSales: number;
  grossMargin: number;
  grossProfit: number;
  adSpend: number;
  roas: number;
  revenue: number;
  paymentProcessorFee: number;
  shippingCost: number;
  netProfit: number;
  enteredBy: string;
}

interface Baseline {
  id: string;
  type: 'daily' | 'monthly';
  category: string;
  label: string;
  amount: number;
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
}

interface CODWeek {
  weekLabel: string;
  startDate: string;
  endDate: string;
  projectedAmount: number;
}

interface Reminder {
  type: string;
  message: string;
  date: string;
  priority?: string;
}

interface FinanceSummary {
  totalSales: number;
  totalGrossProfit: number;
  totalAdSpend: number;
  totalNetProfit: number;
  totalShipping: number;
  totalProcessorFees: number;
  avgROAS: number;
  totalExpenses: number;
  totalProductTestingSpend: number;
  inventoryValue: number;
  dailyBaselineTotal: number;
  monthlyBaselineTotal: number;
  dailyEntries: FinanceDailyEntry[];
  dailyBaselines: Baseline[];
  monthlyBaselines: Baseline[];
  recentExpenses: Expense[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v);

function getYesterday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date(Date.now() - 86400000)
  );
}

function getToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

const DAILY_BASELINE_CATEGORIES = [
  'Ad Spend',
  'Shipping',
  'Payment Processing (3%)',
  'Returns/RTO',
  'Other Daily',
];

const MONTHLY_BASELINE_CATEGORIES = [
  'Inventory',
  'Salaries',
  'Subscriptions & Tools',
  'Rent/Office',
  'Other Monthly',
];

const EXPENSE_CATEGORIES = [
  'Operations',
  'Marketing',
  'Shipping',
  'Returns',
  'Tools/Software',
  'Other',
];

// ── Main Component ───────────────────────────────────────────────────────────

export default function FinancePage() {
  const { user } = useAuth();
  const isCMO = user?.role === 'cmo';

  // Data states
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [codWeeks, setCodWeeks] = useState<CODWeek[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Daily entry form
  const [dailyDate, setDailyDate] = useState(getYesterday());
  const [dailySales, setDailySales] = useState('');
  const [dailySalesLoading, setDailySalesLoading] = useState(false);
  const [grossMargin, setGrossMargin] = useState('55');
  const [adSpend, setAdSpend] = useState('');
  const [roas, setRoas] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [savingDaily, setSavingDaily] = useState(false);
  const [dailySaveStatus, setDailySaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Baseline form
  const [baselineType, setBaselineType] = useState<'daily' | 'monthly'>('daily');
  const [baselineCategory, setBaselineCategory] = useState(DAILY_BASELINE_CATEGORIES[0]);
  const [baselineLabel, setBaselineLabel] = useState('');
  const [baselineAmount, setBaselineAmount] = useState('');
  const [savingBaseline, setSavingBaseline] = useState(false);

  // Expense form
  const [expCategory, setExpCategory] = useState('Operations');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(getToday());
  const [addingExpense, setAddingExpense] = useState(false);

  // Section collapse states
  const [showDailyEntry, setShowDailyEntry] = useState(true);
  const [showCOD, setShowCOD] = useState(true);
  const [showBaselines, setShowBaselines] = useState(true);
  const [showExpenses, setShowExpenses] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, codRes, remindersRes] = await Promise.all([
        fetch('/api/finance'),
        fetch('/api/finance?action=cod-projections'),
        fetch('/api/finance?action=reminders'),
      ]);

      const [summaryData, codData, remindersData] = await Promise.all([
        summaryRes.json(),
        codRes.json(),
        remindersRes.json(),
      ]);

      setSummary(summaryData);
      setCodWeeks(codData.weeks ?? []);
      setReminders(remindersData.reminders ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-fetch yesterday's sales
  const fetchYesterdaySales = async () => {
    setDailySalesLoading(true);
    try {
      const res = await fetch(`/api/finance?action=fetch-sales&date=${dailyDate}`);
      const data = await res.json();
      if (data.totalSales) {
        setDailySales(String(Math.round(data.totalSales)));
      }
    } catch {
      // silently fail
    } finally {
      setDailySalesLoading(false);
    }
  };

  useEffect(() => {
    if (dailyDate) fetchYesterdaySales();
  }, [dailyDate]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const handleSaveDaily = async () => {
    setSavingDaily(true);
    setDailySaveStatus('idle');
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-daily',
          date: dailyDate,
          totalSales: Number(dailySales) || 0,
          grossMargin: Number(grossMargin) / 100,
          adSpend: Number(adSpend) || 0,
          roas: Number(roas) || 0,
          shippingCost: Number(shippingCost) || 0,
          enteredBy: user?.email ?? '',
        }),
      });
      if (res.ok) {
        setDailySaveStatus('saved');
        fetchAll();
        setTimeout(() => setDailySaveStatus('idle'), 3000);
      } else {
        setDailySaveStatus('error');
      }
    } catch {
      setDailySaveStatus('error');
    } finally {
      setSavingDaily(false);
    }
  };

  const handleSaveBaseline = async () => {
    if (!baselineAmount || !baselineCategory) return;
    setSavingBaseline(true);
    try {
      await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-baseline',
          type: baselineType,
          category: baselineCategory,
          label: baselineLabel || baselineCategory,
          amount: Number(baselineAmount),
        }),
      });
      setBaselineLabel('');
      setBaselineAmount('');
      fetchAll();
    } catch {
      // silently fail
    } finally {
      setSavingBaseline(false);
    }
  };

  const handleAddExpense = async () => {
    if (!expAmount || !expCategory) return;
    setAddingExpense(true);
    try {
      await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-expense',
          category: expCategory,
          description: expDescription,
          amount: Number(expAmount),
          date: expDate,
        }),
      });
      setExpDescription('');
      setExpAmount('');
      fetchAll();
    } catch {
      // silently fail
    } finally {
      setAddingExpense(false);
    }
  };

  const dismissReminder = async (type: string) => {
    setReminders((prev) => prev.filter((r) => r.type !== type));
    await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss-reminder', type }),
    }).catch(() => {});
  };

  // ── Calculations ───────────────────────────────────────────────────────────

  const calcTotalSales = Number(dailySales) || 0;
  const calcGrossMargin = (Number(grossMargin) || 0) / 100;
  const calcGrossProfit = calcTotalSales * calcGrossMargin;
  const calcAdSpend = Number(adSpend) || 0;
  const calcShipping = Number(shippingCost) || 0;
  const calcProcessorFee = calcTotalSales * 0.03;
  const calcNetProfit = calcGrossProfit - calcAdSpend - calcShipping - calcProcessorFee;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Loading financial data...</p>
        </div>
      </div>
    );
  }

  const d = summary ?? {
    totalSales: 0, totalGrossProfit: 0, totalAdSpend: 0, totalNetProfit: 0,
    totalShipping: 0, totalProcessorFees: 0, avgROAS: 0, totalExpenses: 0,
    totalProductTestingSpend: 0, inventoryValue: 0, dailyBaselineTotal: 0,
    monthlyBaselineTotal: 0, dailyEntries: [], dailyBaselines: [],
    monthlyBaselines: [], recentExpenses: [],
  };

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Reminders Banner */}
      <AnimatePresence>
        {reminders.map((reminder) => (
          <motion.div
            key={reminder.type}
            initial={{ opacity: 0, y: -12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -12, height: 0 }}
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3"
          >
            <Bell className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="text-[13px] font-medium text-amber-300">{reminder.message}</p>
              {reminder.priority === 'high' && (
                <p className="text-[11px] text-amber-400/70 mt-0.5">This is needed to calculate net profit</p>
              )}
            </div>
            <button
              onClick={() => dismissReminder(reminder.type)}
              className="rounded-md p-1 text-amber-400/60 hover:text-amber-400 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Finance Command Center</h1>
          <p className="text-[11px] text-muted-foreground">
            Daily P&L, COD projections, and operational costs
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Key Metrics Grid */}
      <StaggerContainer className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <MetricCard
            label="Total Sales (30d)"
            value={d.totalSales}
            icon={<DollarSign className="h-4 w-4 text-emerald-400" />}
            color="text-foreground"
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            label="Gross Profit (30d)"
            value={d.totalGrossProfit}
            icon={<TrendingUp className="h-4 w-4 text-blue-400" />}
            color={d.totalGrossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            label="Net Profit (30d)"
            value={d.totalNetProfit}
            icon={<Wallet className="h-4 w-4 text-violet-400" />}
            color={d.totalNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            label="Avg ROAS"
            value={d.avgROAS}
            icon={<Target className="h-4 w-4 text-amber-400" />}
            color="text-foreground"
            formatter={(v) => `${v.toFixed(2)}x`}
          />
        </StaggerItem>
      </StaggerContainer>

      {/* Cost Breakdown Mini Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="rounded-lg border border-border bg-card px-4 py-3"
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">30-Day Cost Breakdown</p>
          <p className="text-[11px] text-muted-foreground">
            Daily baseline: {formatINR(d.dailyBaselineTotal)}/day · Monthly: {formatINR(d.monthlyBaselineTotal)}/mo
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <CostItem label="Ad Spend" amount={d.totalAdSpend} color="bg-amber-400" />
          <CostItem label="Shipping" amount={d.totalShipping} color="bg-blue-400" />
          <CostItem label="Processor Fees" amount={d.totalProcessorFees} color="bg-violet-400" />
          <CostItem label="Other Expenses" amount={d.totalExpenses} color="bg-rose-400" />
        </div>
      </motion.div>

      {/* ═══ Daily Entry Section ═══ */}
      <SectionHeader
        title="Daily P&L Entry"
        subtitle="Enter yesterday's numbers"
        icon={<Calculator className="h-4 w-4" />}
        isOpen={showDailyEntry}
        onToggle={() => setShowDailyEntry(!showDailyEntry)}
      />
      <AnimatePresence>
        {showDailyEntry && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            <div className="p-4 space-y-4">
              {/* Date + Auto-fetch */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Date</label>
                  <input
                    type="date"
                    value={dailyDate}
                    onChange={(e) => setDailyDate(e.target.value)}
                    className="h-9 rounded-md border border-border bg-background px-3 text-[13px] text-foreground"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Total Sales (auto-fetched)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={dailySales}
                      onChange={(e) => setDailySales(e.target.value)}
                      placeholder="0"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 pr-10 text-[13px] text-foreground placeholder:text-muted-foreground/40"
                    />
                    {dailySalesLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-primary" />
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1 w-24">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Margin %
                  </label>
                  <input
                    type="number"
                    value={grossMargin}
                    onChange={(e) => setGrossMargin(e.target.value)}
                    placeholder="55"
                    className="h-9 rounded-md border border-border bg-background px-3 text-[13px] text-foreground"
                  />
                </div>
              </div>

              {/* CMO inputs */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Megaphone className="h-3 w-3 text-blue-400" />
                    Ad Spend
                    {isCMO && <span className="text-amber-400">(required)</span>}
                  </label>
                  <input
                    type="number"
                    value={adSpend}
                    onChange={(e) => setAdSpend(e.target.value)}
                    placeholder="0"
                    className="h-9 rounded-md border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/40"
                  />
                </div>
                <div className="flex flex-col gap-1 w-24">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Target className="h-3 w-3 text-amber-400" />
                    ROAS
                  </label>
                  <input
                    type="number"
                    value={roas}
                    onChange={(e) => setRoas(e.target.value)}
                    placeholder="0"
                    step="0.1"
                    className="h-9 rounded-md border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/40"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Truck className="h-3 w-3 text-emerald-400" />
                    Shipping Cost
                  </label>
                  <input
                    type="number"
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                    placeholder="0"
                    className="h-9 rounded-md border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/40"
                  />
                </div>
              </div>

              {/* Live P&L Preview */}
              <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                  Live P&L Preview
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <MiniStat label="Gross Profit" value={calcGrossProfit} positive={calcGrossProfit > 0} />
                  <MiniStat label="Ad Spend" value={-calcAdSpend} positive={false} prefix="-" />
                  <MiniStat label="Shipping" value={-calcShipping} positive={false} prefix="-" />
                  <MiniStat label="Processor (3%)" value={-calcProcessorFee} positive={false} prefix="-" />
                  <MiniStat
                    label="Net Profit"
                    value={calcNetProfit}
                    positive={calcNetProfit > 0}
                    highlight
                  />
                </div>
              </div>

              {/* Save button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveDaily}
                  disabled={savingDaily || !dailySales}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {savingDaily ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Entry
                </button>
                <AnimatePresence>
                  {dailySaveStatus === 'saved' && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-[12px] text-emerald-400"
                    >
                      Saved successfully
                    </motion.span>
                  )}
                  {dailySaveStatus === 'error' && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-[12px] text-red-400"
                    >
                      Failed to save
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Recent Daily Entries Table */}
            {d.dailyEntries.length > 0 && (
              <div className="border-t border-border">
                <div className="px-4 py-2 border-b border-border">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Recent Entries
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="tracker-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="text-right">Sales</th>
                        <th className="text-right">Gross Profit</th>
                        <th className="text-right">Ad Spend</th>
                        <th className="text-right">ROAS</th>
                        <th className="text-right">Net Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.dailyEntries.slice(0, 7).map((entry) => (
                        <tr key={entry.date}>
                          <td className="px-3 py-2 text-[12px] text-muted-foreground">{entry.date}</td>
                          <td className="px-3 py-2 text-[12px] text-right">{formatINR(entry.totalSales)}</td>
                          <td className="px-3 py-2 text-[12px] text-right text-emerald-400">{formatINR(entry.grossProfit)}</td>
                          <td className="px-3 py-2 text-[12px] text-right text-amber-400">{formatINR(entry.adSpend)}</td>
                          <td className="px-3 py-2 text-[12px] text-right">
                            <span className={entry.roas >= 2 ? 'text-emerald-400' : entry.roas >= 1 ? 'text-amber-400' : 'text-red-400'}>
                              {entry.roas.toFixed(2)}x
                            </span>
                          </td>
                          <td className={`px-3 py-2 text-[12px] font-medium text-right ${entry.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatINR(entry.netProfit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ COD Cash-In Projections ═══ */}
      <SectionHeader
        title="COD Cash-In Projections"
        subtitle="When money hits the bank (7-day delay)"
        icon={<BanknoteIcon className="h-4 w-4" />}
        isOpen={showCOD}
        onToggle={() => setShowCOD(!showCOD)}
      />
      <AnimatePresence>
        {showCOD && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {codWeeks.length === 0 ? (
              <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
                <Clock className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
                <p className="text-[12px] text-muted-foreground">
                  No daily entries yet. Add daily P&L entries to see COD projections.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {codWeeks.map((week, i) => (
                  <motion.div
                    key={week.weekLabel}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{week.weekLabel}</p>
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2">
                      {week.startDate} <ArrowRight className="inline h-2.5 w-2.5" /> {week.endDate}
                    </p>
                    <p className="text-xl font-semibold text-foreground">
                      <AnimatedNumber value={week.projectedAmount} formatter={formatINR} />
                    </p>
                    {week.projectedAmount === 0 && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        No sales data for source dates
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Operational Baselines ═══ */}
      <SectionHeader
        title="Operational Baselines"
        subtitle="Cost to run the business"
        icon={<PiggyBank className="h-4 w-4" />}
        isOpen={showBaselines}
        onToggle={() => setShowBaselines(!showBaselines)}
      />
      <AnimatePresence>
        {showBaselines && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-3"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Daily Baseline */}
              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
                    <h3 className="text-sm font-medium text-foreground">Daily Baseline</h3>
                  </div>
                  <span className="text-[11px] font-medium text-blue-400">
                    {formatINR(d.dailyBaselineTotal)}/day
                  </span>
                </div>
                <div className="p-3 space-y-1.5">
                  {d.dailyBaselines.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground text-center py-3">No daily baselines set</p>
                  ) : (
                    d.dailyBaselines.map((b) => (
                      <div key={b.id} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent/30 transition">
                        <span className="text-[12px] text-foreground">{b.label}</span>
                        <span className="text-[12px] font-medium text-foreground">{formatINR(b.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Monthly Baseline */}
              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-violet-400" />
                    <h3 className="text-sm font-medium text-foreground">Monthly Baseline</h3>
                  </div>
                  <span className="text-[11px] font-medium text-violet-400">
                    {formatINR(d.monthlyBaselineTotal)}/mo
                  </span>
                </div>
                <div className="p-3 space-y-1.5">
                  {d.monthlyBaselines.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground text-center py-3">No monthly baselines set</p>
                  ) : (
                    d.monthlyBaselines.map((b) => (
                      <div key={b.id} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent/30 transition">
                        <span className="text-[12px] text-foreground">{b.label}</span>
                        <span className="text-[12px] font-medium text-foreground">{formatINR(b.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Add Baseline Form */}
            <div className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-end gap-2 px-4 py-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Type</label>
                  <div className="inline-flex rounded-md border border-border bg-background p-0.5">
                    <button
                      onClick={() => { setBaselineType('daily'); setBaselineCategory(DAILY_BASELINE_CATEGORIES[0]); }}
                      className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${baselineType === 'daily' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => { setBaselineType('monthly'); setBaselineCategory(MONTHLY_BASELINE_CATEGORIES[0]); }}
                      className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${baselineType === 'monthly' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}
                    >
                      Monthly
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Category</label>
                  <select
                    value={baselineCategory}
                    onChange={(e) => setBaselineCategory(e.target.value)}
                    className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                  >
                    {(baselineType === 'daily' ? DAILY_BASELINE_CATEGORIES : MONTHLY_BASELINE_CATEGORIES).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Label</label>
                  <input
                    type="text"
                    value={baselineLabel}
                    onChange={(e) => setBaselineLabel(e.target.value)}
                    placeholder="e.g. Shiprocket"
                    className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/40"
                  />
                </div>
                <div className="flex flex-col gap-1 w-28">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</label>
                  <input
                    type="number"
                    value={baselineAmount}
                    onChange={(e) => setBaselineAmount(e.target.value)}
                    placeholder="0"
                    className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/40"
                  />
                </div>
                <button
                  onClick={handleSaveBaseline}
                  disabled={savingBaseline || !baselineAmount}
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {savingBaseline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Manual Expenses ═══ */}
      <SectionHeader
        title="Manual Expenses"
        subtitle="One-off or irregular costs"
        icon={<Receipt className="h-4 w-4" />}
        isOpen={showExpenses}
        onToggle={() => setShowExpenses(!showExpenses)}
      />
      <AnimatePresence>
        {showExpenses && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            {/* Add Expense Form */}
            <div className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Category</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Description</label>
                <input
                  type="text"
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  placeholder="What was this for?"
                  className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/40"
                />
              </div>
              <div className="flex flex-col gap-1 w-28">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</label>
                <input
                  type="number"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="0"
                  className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/40"
                />
              </div>
              <div className="flex flex-col gap-1 w-36">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Date</label>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                />
              </div>
              <button
                onClick={handleAddExpense}
                disabled={addingExpense || !expAmount}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {addingExpense ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add
              </button>
            </div>

            {/* Expenses List */}
            {d.recentExpenses.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                No expenses recorded yet.
              </p>
            ) : (
              <table className="tracker-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentExpenses.map((exp) => (
                    <tr key={exp.id}>
                      <td className="px-3 py-2 text-[12px] text-muted-foreground">{exp.date}</td>
                      <td className="px-3 py-2 text-[12px]">
                        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium">
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[12px] text-muted-foreground">{exp.description}</td>
                      <td className="px-3 py-2 text-[12px] font-medium text-right">{formatINR(exp.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon,
  color,
  formatter,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  formatter?: (v: number) => string;
}) {
  const format = formatter ?? formatINR;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="rounded-lg border border-border bg-card px-4 py-3 hover:shadow-[0_0_20px_rgba(167,139,250,0.06)] transition-shadow"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={`mt-1.5 text-2xl font-semibold ${color}`}>
        <AnimatedNumber value={value} formatter={format} />
      </p>
    </motion.div>
  );
}

function CostItem({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground truncate">{label}</p>
        <p className="text-[13px] font-medium text-foreground">{formatINR(amount)}</p>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  positive,
  highlight,
  prefix,
}: {
  label: string;
  value: number;
  positive: boolean;
  highlight?: boolean;
  prefix?: string;
}) {
  return (
    <div className={`rounded-md px-2.5 py-1.5 ${highlight ? 'border border-border bg-card' : ''}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-[13px] font-semibold ${highlight ? (positive ? 'text-emerald-400' : 'text-red-400') : 'text-foreground'}`}>
        {prefix}{formatINR(Math.abs(value))}
      </p>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  icon,
  isOpen,
  onToggle,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 hover:bg-accent/30 transition group"
    >
      <span className="text-primary">{icon}</span>
      <div className="flex-1 text-left">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      {isOpen ? (
        <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition" />
      ) : (
        <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition" />
      )}
    </button>
  );
}
