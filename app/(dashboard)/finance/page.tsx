'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  RefreshCw, Loader2, DollarSign, Wallet, Plus,
  Bell, X, ArrowRight, Clock, Calendar,
  TrendingDown, TrendingUp,
  ArrowDown, BanknoteIcon, Settings2,
  Check, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';
import { formatINR } from '@/lib/currency-converter';

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
  paidDate?: string;
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
}

interface CODWeek {
  weekLabel: string;
  startDate: string;
  endDate: string;
  projectedAmount: number;
  codRevenue: number;
  brandBreakdown: Record<string, number>;
}

interface Reminder {
  type: string;
  message: string;
  date: string;
  priority?: string;
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
  dailyOutflows?: Array<{ date: string; expenses: number; baselines: number }>;
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

// ── Main Component ───────────────────────────────────────────────────────────

export default function FinancePage() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [codWeeks, setCodWeeks] = useState<CODWeek[]>([]);
  const [spending, setSpending] = useState<SpendingPower | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // Date range filter
  const [dateRange, setDateRange] = useState<'30d' | '7d' | '90d' | 'custom'>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      let summaryUrl = '/api/finance';
      if (dateRange === 'custom' && customStart && customEnd) {
        summaryUrl = `/api/finance?start=${customStart}&end=${customEnd}`;
      } else {
        const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;
        summaryUrl = `/api/finance?days=${days}`;
      }
      const [summaryRes, codRes, spendRes, remindersRes, baselinesRes, ratesRes, expensesRes] = await Promise.all([
        fetch(summaryUrl),
        fetch('/api/finance?action=cod-projections'),
        fetch('/api/finance?action=spending-power'),
        fetch('/api/finance?action=reminders'),
        fetch('/api/finance?action=baselines'),
        fetch('/api/finance?action=delivery-rates'),
        fetch('/api/finance?action=expenses'),
      ]);
      const [summaryData, codData, spendData, remindersData, baselinesData, ratesData, expensesData] = await Promise.all([
        summaryRes.json(), codRes.json(), spendRes.json(), remindersRes.json(), baselinesRes.json(), ratesRes.json(), expensesRes.json(),
      ]);
      setSummary(summaryData);
      setCodWeeks(codData.weeks ?? []);
      setSpending(spendData);
      setReminders(remindersData.reminders ?? []);
      setBaselines([...(baselinesData.daily ?? []), ...(baselinesData.monthly ?? [])]);
      setDeliveryRates(ratesData.rates ?? {});
      setExpenses(expensesData.expenses ?? []);
    } catch { /* silently fail */ }
    finally { setLoading(false); setRefreshing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, customStart, customEnd]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const dismissReminder = async (type: string) => {
    setReminders((prev) => prev.filter((r) => r.type !== type));
    await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss-reminder', type }),
    }).catch(() => {});
  };

  const todayStr = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()), []);

  // Build daily outflow map (expenses + baselines by date)
  const dailyOutflows = useMemo(() => {
    const map: Record<string, { expenses: number; baselines: number; items: string[] }> = {};
    for (const exp of expenses) {
      if (!map[exp.date]) map[exp.date] = { expenses: 0, baselines: 0, items: [] };
      map[exp.date].expenses += exp.amount;
      map[exp.date].items.push(exp.description || exp.category);
    }
    for (const b of baselines) {
      if (b.type === 'monthly' && b.dueDate && !b.isPaid) {
        if (!map[b.dueDate]) map[b.dueDate] = { expenses: 0, baselines: 0, items: [] };
        map[b.dueDate].baselines += b.amount;
        map[b.dueDate].items.push(b.label);
      }
    }
    return map;
  }, [expenses, baselines]);

  // Build outflow chart data — next 14 days from today (must be before loading return)
  const outflowDays = useMemo(() => {
    const days: Array<{ date: string; total: number; expenses: number; baselines: number }> = [];
    const start = new Date(todayStr + 'T00:00:00');
    for (let i = 0; i < 14; i++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + i);
      const dateStr = dt.toISOString().split('T')[0];
      const data = dailyOutflows[dateStr];
      days.push({
        date: dateStr,
        total: (data?.expenses ?? 0) + (data?.baselines ?? 0),
        expenses: data?.expenses ?? 0,
        baselines: data?.baselines ?? 0,
      });
    }
    return days;
  }, [todayStr, dailyOutflows]);

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
    totalExpenses: 0,
    dailyBaselineTotal: 0, monthlyBaselineTotal: 0,
    dailyEntries: [], dailyBaselines: [], monthlyBaselines: [],
  };

  const currentWeek = codWeeks[0];
  const totalCODProjected = codWeeks.reduce((s, w) => s + w.projectedAmount, 0);

  // Past 7 days bar chart — show projected bank deposit per day
  const last7Entries = (d.dailyEntries ?? [])
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);

  // Compute projected deposit per day
  const last7Deposits = last7Entries.map((entry) => {
    const codByBrand = entry.codSalesByBrand ?? {};
    let deposit = 0;
    for (const [brand, amount] of Object.entries(codByBrand)) {
      const rate = deliveryRates[brand] ?? 65;
      deposit += Math.round(Number(amount) * (rate / 100));
    }
    return { date: entry.date, deposit };
  });

  const maxDeposit = Math.max(...last7Deposits.map((e) => e.deposit), 1);
  const maxOutflow = Math.max(...outflowDays.map((od) => od.total), 1);
  const totalOutflow14d = outflowDays.reduce((s, od) => s + od.total, 0);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Reminders */}
      {reminders.map((reminder) => (
        <motion.div
          key={reminder.type}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3"
        >
          <Bell className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-medium text-amber-300">{reminder.message}</p>
            {reminder.priority === 'high' && <p className="text-[11px] text-amber-400/70 mt-0.5">This is needed to calculate net profit</p>}
          </div>
          <button onClick={() => dismissReminder(reminder.type)} className="rounded-md p-1 text-amber-400/60 hover:text-amber-400 transition"><X className="h-3.5 w-3.5" /></button>
        </motion.div>
      ))}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Finance Command Center</h1>
          <p className="text-[11px] text-muted-foreground">Financial overview & projections</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/finance/entry"
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
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        {(['7d', '30d', '90d'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition ${
              dateRange === range
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'border border-border text-muted-foreground hover:text-foreground hover:border-border/80'
            }`}
          >
            {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
          </button>
        ))}
        <button
          onClick={() => setDateRange('custom')}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition ${
            dateRange === 'custom'
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'border border-border text-muted-foreground hover:text-foreground hover:border-border/80'
          }`}
        >
          Custom
        </button>
        {dateRange === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
            <span className="text-[10px] text-muted-foreground">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
        )}
      </div>

      {/* Key Metrics */}
      {(() => {
        const rangeLabel = dateRange === 'custom' ? 'Custom' : dateRange === '7d' ? '7d' : dateRange === '90d' ? '90d' : '30d';
        return (
          <StaggerContainer className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StaggerItem>
              <MetricCard label={`Total Sales (${rangeLabel})`} value={d.totalSales} icon={<DollarSign className="h-4 w-4 text-emerald-400" />} color="text-foreground" />
            </StaggerItem>
            <StaggerItem>
              <MetricCard label="Bank Deposits (4wk)" value={totalCODProjected} icon={<BanknoteIcon className="h-4 w-4 text-blue-400" />} color="text-emerald-400" />
            </StaggerItem>
            <StaggerItem>
              <MetricCard label={`Net Profit (${rangeLabel})`} value={d.totalNetProfit} icon={<Wallet className="h-4 w-4 text-violet-400" />} color={d.totalNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            </StaggerItem>
          </StaggerContainer>
        );
      })()}

      {/* ═══ COD Cash-In — Hero Card ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        {currentWeek && currentWeek.codRevenue > 0 ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card overflow-hidden">
            <div className="p-6">
              {/* Top row */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <BanknoteIcon className="h-5 w-5 text-emerald-400" />
                    <h2 className="text-base font-semibold text-foreground">COD Cash-In</h2>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {currentWeek.startDate} <ArrowRight className="inline h-2.5 w-2.5" /> {currentWeek.endDate}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Projected Deposit</p>
                  <p className="text-3xl font-bold text-emerald-400 tabular-nums">
                    <AnimatedNumber value={currentWeek.projectedAmount} formatter={formatINR} />
                  </p>
                </div>
              </div>

              {/* 7-day projected deposits chart */}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-3">Last 7 Days — Projected Bank Deposits</p>
                <div className="h-36">
                  <div className="flex items-end gap-2 h-full">
                    {last7Deposits.length > 0 ? last7Deposits.map((entry) => {
                      const barHeight = Math.max(Math.round((entry.deposit / maxDeposit) * 100), 4);
                      const dayLabel = entry.date.slice(-2);
                      return (
                        <div key={entry.date} className="flex-1 h-full flex flex-col justify-end items-center">
                          <div className="relative w-full group cursor-default" style={{ height: `${barHeight}%`, minHeight: '4px' }}>
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap rounded-md bg-popover border border-border px-2 py-1 text-[10px] font-medium text-foreground shadow-lg z-10">
                              {formatINR(entry.deposit)}
                            </div>
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: '100%' }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                              className="w-full h-full rounded-t-md bg-emerald-500/30 border border-emerald-500/20 hover:bg-emerald-500/40 transition-colors"
                            />
                          </div>
                          <span className="mt-1.5 text-[9px] text-muted-foreground/50 tabular-nums">{dayLabel}</span>
                        </div>
                      );
                    }) : (
                      <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground/40">No data yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card px-4 py-8 text-center">
            <Clock className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-[12px] text-muted-foreground">No COD data yet. COD orders are auto-fetched when you enter daily data.</p>
          </div>
        )}
      </motion.div>

      {/* ═══ Spending Power — Hero Card ═══ */}
      {spending && spending.projectedDeposit > 0 && (() => {
        const outflows = spending.dailyOutflows ?? [];
        const maxOutflow = Math.max(...outflows.map((d) => d.expenses + d.baselines), 1);
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
                    {spending.weekStart} <ArrowRight className="inline h-2.5 w-2.5" /> {spending.weekEnd}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Available</p>
                  <p className={`text-3xl font-bold tabular-nums ${spending.spendingPower > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    <AnimatedNumber value={spending.spendingPower} formatter={formatINR} />
                  </p>
                </div>
              </div>

              {/* 7-day outflow chart */}
              {outflows.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-3">Weekly Outflows — Expenses & Baselines</p>
                  <div className="h-36">
                    <div className="flex items-end gap-2 h-full">
                      {outflows.map((day) => {
                        const total = day.expenses + day.baselines;
                        const barHeight = total > 0 ? Math.max(Math.round((total / maxOutflow) * 100), 4) : 0;
                        const expPct = total > 0 ? (day.expenses / total) * 100 : 0;
                        const dayLabel = day.date.slice(-2);
                        return (
                          <div key={day.date} className="flex-1 h-full flex flex-col justify-end items-center">
                            {total > 0 ? (
                              <div className="relative w-full group cursor-default" style={{ height: `${barHeight}%`, minHeight: '4px' }}>
                                <div className="absolute -top-9 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap rounded-md bg-popover border border-border px-2 py-1 text-[10px] font-medium text-foreground shadow-lg z-10">
                                  {day.expenses > 0 && <span className="text-red-400">{formatINR(day.expenses)} exp</span>}
                                  {day.expenses > 0 && day.baselines > 0 && <span className="text-muted-foreground"> + </span>}
                                  {day.baselines > 0 && <span className="text-amber-400">{formatINR(day.baselines)} base</span>}
                                </div>
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: '100%' }}
                                  transition={{ duration: 0.6, ease: 'easeOut' }}
                                  className="w-full h-full rounded-t-md overflow-hidden flex flex-col justify-end"
                                >
                                  {day.baselines > 0 && (
                                    <div className="w-full bg-amber-500/30 border-x border-t border-amber-500/20" style={{ height: `${100 - expPct}%`, minHeight: day.baselines > 0 ? '2px' : 0 }} />
                                  )}
                                  {day.expenses > 0 && (
                                    <div className="w-full bg-red-500/30 border-x border-b border-red-500/20" style={{ height: `${expPct}%`, minHeight: day.expenses > 0 ? '2px' : 0 }} />
                                  )}
                                </motion.div>
                              </div>
                            ) : (
                              <div className="w-full h-[2px] rounded bg-border/20" />
                            )}
                            <span className="mt-1.5 text-[9px] text-muted-foreground/50 tabular-nums">{dayLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Legend + progress bar */}
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
                  <span className="text-[9px] text-muted-foreground/60">Baselines {formatINR(spending.baselinesDue)}</span>
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

      {/* ═══ Cash Outflow — Bar Chart ═══ */}
      {totalOutflow14d > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
          <div className="rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-500/[0.04] via-card to-card overflow-hidden">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowDown className="h-5 w-5 text-red-400" />
                    <h2 className="text-base font-semibold text-foreground">Cash Outflow</h2>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Next 14 days — Expenses & baselines
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Total Due</p>
                  <p className="text-3xl font-bold text-red-400 tabular-nums">
                    <AnimatedNumber value={totalOutflow14d} formatter={formatINR} />
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-sm bg-red-500/40" />
                    <span className="text-[9px] text-muted-foreground/60">Expenses</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-sm bg-amber-500/40" />
                    <span className="text-[9px] text-muted-foreground/60">Baselines</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Link href="/finance/expenditure" className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[10px] font-medium text-red-400 transition hover:bg-red-500/10 hover:border-red-500/30">
                    Expenditure →
                  </Link>
                  <Link href="/finance/baselines" className="inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[10px] font-medium text-amber-400 transition hover:bg-amber-500/10 hover:border-amber-500/30">
                    Baselines →
                  </Link>
                </div>
                <div className="h-32">
                  <div className="flex items-end gap-1 h-full">
                    {outflowDays.map((day) => {
                      const barHeight = day.total > 0 ? Math.max(Math.round((day.total / maxOutflow) * 100), 6) : 0;
                      const expPct = day.total > 0 ? (day.expenses / day.total) * 100 : 0;
                      const dayNum = day.date.slice(-2);
                      const isToday = day.date === todayStr;
                      return (
                        <div key={day.date} className="flex-1 h-full flex flex-col justify-end items-center">
                          {barHeight > 0 && (
                            <div className="relative w-full group cursor-default" style={{ height: `${barHeight}%`, minHeight: '6px' }}>
                              <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap rounded-md bg-popover border border-border px-2 py-1 text-[10px] font-medium text-foreground shadow-lg z-10">
                                {day.expenses > 0 && day.baselines > 0
                                  ? `${formatINR(day.expenses)} exp + ${formatINR(day.baselines)} base`
                                  : formatINR(day.total)
                                }
                              </div>
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: '100%' }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                className="w-full h-full rounded-t-md overflow-hidden flex flex-col"
                              >
                                {day.expenses > 0 && (
                                  <div className="bg-red-500/30 border-x border-t border-red-500/20 hover:bg-red-500/40 transition-colors" style={{ flex: expPct }} />
                                )}
                                {day.baselines > 0 && (
                                  <div className="bg-amber-500/30 border-x border-amber-500/20 hover:bg-amber-500/40 transition-colors" style={{ flex: 100 - expPct }} />
                                )}
                              </motion.div>
                            </div>
                          )}
                          <span className={`mt-1.5 text-[8px] tabular-nums ${isToday ? 'text-primary font-bold' : 'text-muted-foreground/40'}`}>{dayNum}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}


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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4 sticky top-0 bg-card/95 backdrop-blur-xl z-10">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Spending Power Breakdown</h2>
              <p className="text-[11px] text-muted-foreground">{spending.weekStart} → {spending.weekEnd}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-border/60 bg-background/60 p-2 text-muted-foreground transition hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Waterfall */}
        <div className="p-4 space-y-0">
          {(() => {
            // Group ALL deductions into: Founder Cut, Inventory, Expenses total, Baselines total
            const knownDeductions = ['founder cut', 'inventory'];
            const isKnownDeduction = (label: string) => knownDeductions.some((k) => label.toLowerCase().includes(k));

            // Known deductions stay as individual rows (founder cut, inventory)
            const keepItems = spending.breakdown.filter((item) =>
              item.type === 'income' || item.type === 'result' || (item.type === 'deduction' && isKnownDeduction(item.label))
            );

            // Everything else gets grouped into Expenses or Baselines total
            const otherDeductions = spending.breakdown.filter((item) =>
              item.type === 'deduction' && !isKnownDeduction(item.label)
            );

            // Use spending.weekExpenses and spending.baselinesDue for accurate totals
            const totalExpenses = spending.weekExpenses;
            const totalBaselines = spending.baselinesDue;

            // Build grouped breakdown
            const grouped: Array<{ label: string; amount: number; type: 'income' | 'deduction' | 'result' }> = [];
            for (const item of keepItems) {
              if (item.type === 'result') {
                if (totalExpenses > 0) {
                  grouped.push({ label: 'Expenses', amount: -totalExpenses, type: 'deduction' });
                }
                if (totalBaselines > 0) {
                  grouped.push({ label: 'Baselines', amount: -totalBaselines, type: 'deduction' });
                }
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
                    isResult
                      ? 'rounded-xl border border-emerald-500/20 bg-emerald-500/5 mt-2'
                      : i > 0 ? 'border-t border-border/30' : ''
                  }`}
                >
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isIncome ? 'bg-emerald-500/10 border border-emerald-500/20'
                      : isResult ? 'bg-emerald-500/15 border border-emerald-500/30'
                      : 'bg-red-500/8 border border-red-500/15'
                  }`}>
                    {isIncome ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> :
                     isResult ? <Wallet className="h-3.5 w-3.5 text-emerald-400" /> :
                     <ArrowDown className="h-3.5 w-3.5 text-red-400" />}
                  </div>
                  <span className={`text-[13px] flex-1 ${isResult ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                    {item.label}
                  </span>
                  <span className={`text-[14px] font-semibold tabular-nums ${
                    isIncome ? 'text-emerald-400'
                      : isResult ? (item.amount > 0 ? 'text-emerald-400' : 'text-red-400')
                      : 'text-red-400'
                  }`}>
                    {isDeduction ? '−' : ''}{formatINR(Math.abs(item.amount))}
                  </span>
                </motion.div>
              );
            });
          })()}

          {/* Quick links */}
          <div className="flex gap-2 px-4 pt-4">
            <Link href="/finance/expenditure" className="flex-1 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-[11px] font-medium text-center text-red-400 transition hover:bg-red-500/10 hover:border-red-500/30">
              View Expenditure →
            </Link>
            <Link href="/finance/baselines" className="flex-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[11px] font-medium text-center text-amber-400 transition hover:bg-amber-500/10 hover:border-amber-500/30">
              View Baselines →
            </Link>
          </div>
        </div>

        {/* Settings */}
        <div className="border-t border-border/50 px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Customize Deductions</p>
          </div>

          {/* Founder cut */}
          <div className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <button onClick={() => toggleItem('founderCut')} className="text-muted-foreground hover:text-foreground transition">
                {enabled.founderCut !== false ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
              </button>
              <span className="text-[12px] font-medium text-foreground">Founder Cut</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                value={founderPct}
                onChange={(e) => setFounderPct(Number(e.target.value) || 0)}
                disabled={enabled.founderCut === false}
                className="w-14 bg-transparent text-right text-[13px] font-semibold text-foreground tabular-nums outline-none border-b border-border/30 focus:border-primary/50 disabled:opacity-40 transition"
              />
              <span className="text-[11px] text-muted-foreground">%</span>
            </div>
          </div>

          {/* Toggle items */}
          {[
            { key: 'inventoryNeeds', label: 'Inventory Restock' },
            { key: 'baselines', label: 'Baselines Due' },
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

          <button
            onClick={saveConfig}
            disabled={saving}
            className="w-full rounded-lg bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
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
