'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  RefreshCw, Loader2, DollarSign, Wallet, Plus,
  X, ArrowRight, Clock, Calendar,
  TrendingDown, TrendingUp,
  ArrowDown, BanknoteIcon, Settings2,
  Check, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';
import { formatINR } from '@/lib/currency-converter';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

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

// ── Main Component ───────────────────────────────────────────────────────────

export default function ProjectedFinancePage() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [codWeeks, setCodWeeks] = useState<CODWeek[]>([]);
  const [spending, setSpending] = useState<SpendingPower | null>(null);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<IncomeEntry[]>([]);
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // Date range filter — 14d default (projection window)
  const [dateRange, setDateRange] = useState<'14d' | '30d' | '7d' | '90d'>('14d');

  const fetchAll = useCallback(async () => {
    try {
      const days = dateRange === '7d' ? 7 : dateRange === '14d' ? 14 : dateRange === '90d' ? 90 : 30;
      const res = await fetch(`/api/finance?action=combined&days=${days}`);
      const data = await res.json();
      setSummary(data.summary);
      setCodWeeks(data.codWeeks ?? []);
      setSpending(data.spending);
      setBaselines([...(data.baselines?.daily ?? []), ...(data.baselines?.monthly ?? [])]);
      setDeliveryRates(data.deliveryRates ?? {});
      setExpenses(data.expenses ?? []);
      setIncome(data.income ?? []);
    } catch { /* silently fail */ }
    finally { setLoading(false); setRefreshing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const todayStr = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()), []);

  const chartDays = useMemo(() => {
    if (dateRange === '7d') return 7;
    if (dateRange === '14d') return 14;
    if (dateRange === '30d') return 30;
    if (dateRange === '90d') return 90;
    return 14;
  }, [dateRange]);

  // Build daily outflow map (expenses + baselines by date) — FORWARD looking
  const dailyOutflows = useMemo(() => {
    const map: Record<string, { expenses: number; unpaidBaselines: number; paidBaselines: number; items: string[] }> = {};
    for (const exp of expenses) {
      if (!map[exp.date]) map[exp.date] = { expenses: 0, unpaidBaselines: 0, paidBaselines: 0, items: [] };
      map[exp.date].expenses += exp.amount;
      map[exp.date].items.push(exp.description || exp.category);
    }
    for (const b of baselines) {
      if (b.type === 'monthly' && b.dueDate) {
        if (!map[b.dueDate]) map[b.dueDate] = { expenses: 0, unpaidBaselines: 0, paidBaselines: 0, items: [] };
        if (b.isPaid) {
          map[b.dueDate].paidBaselines += b.amount;
        } else {
          map[b.dueDate].unpaidBaselines += b.amount;
        }
        map[b.dueDate].items.push(b.label + (b.isPaid ? ' ✓' : ''));
      }
    }
    return map;
  }, [expenses, baselines]);

  // Build outflow chart data — today FORWARD for chartDays
  const outflowDays = useMemo(() => {
    const days: Array<{ date: string; label: string; total: number; expenses: number; unpaidBaselines: number; paidBaselines: number }> = [];
    const start = new Date(todayStr + 'T00:00:00');
    for (let i = 0; i < chartDays; i++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + i);
      const dateStr = dt.toISOString().split('T')[0];
      const data = dailyOutflows[dateStr];
      days.push({
        date: dateStr,
        label: fmtMonthDay(dateStr),
        total: (data?.expenses ?? 0) + (data?.unpaidBaselines ?? 0),
        expenses: data?.expenses ?? 0,
        unpaidBaselines: data?.unpaidBaselines ?? 0,
        paidBaselines: data?.paidBaselines ?? 0,
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

  // Forward-looking inflow — COD deposits + missed income
  const inflowByDate: Record<string, number> = {};
  for (const entry of (d.dailyEntries ?? [])) {
    const codByBrand = entry.codSalesByBrand ?? {};
    let deposit = 0;
    for (const [brand, amount] of Object.entries(codByBrand)) {
      const rate = deliveryRates[brand] ?? 65;
      deposit += Math.round(Number(amount) * (rate / 100));
    }
    if (deposit > 0) inflowByDate[entry.date] = (inflowByDate[entry.date] ?? 0) + deposit;
  }
  for (const inc of income) {
    const incDate = inc.date ?? '';
    if (inc.endDate) {
      const start = new Date(incDate + 'T00:00:00');
      const end = new Date(inc.endDate + 'T00:00:00');
      const rangeDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      const dailyAmount = Math.round(inc.amount / rangeDays);
      for (let j = 0; j < rangeDays; j++) {
        const dt = new Date(start);
        dt.setDate(start.getDate() + j);
        const ds = dt.toISOString().split('T')[0];
        inflowByDate[ds] = (inflowByDate[ds] ?? 0) + dailyAmount;
      }
    } else {
      inflowByDate[incDate] = (inflowByDate[incDate] ?? 0) + inc.amount;
    }
  }

  // Build inflow chart — today FORWARD for chartDays
  const inflowChartData = Array.from({ length: chartDays }, (_, i) => {
    const dt = new Date(todayStr + 'T00:00:00');
    dt.setDate(dt.getDate() + i);
    const dateStr = dt.toISOString().split('T')[0];
    return {
      date: dateStr,
      deposit: inflowByDate[dateStr] ?? 0,
      label: fmtMonthDay(dateStr),
    };
  });

  const totalOutflow = outflowDays.reduce((s, od) => s + od.total, 0);
  const totalInflow = inflowChartData.reduce((s, d) => s + d.deposit, 0);

  // Income in chart range
  const chartEndDate = (() => {
    const dt = new Date(todayStr + 'T00:00:00');
    dt.setDate(dt.getDate() + chartDays - 1);
    return dt.toISOString().split('T')[0];
  })();
  const totalIncomeInRange = income.reduce((s, inc) => {
    const incDate = inc.date ?? '';
    const incEnd = inc.endDate ?? incDate;
    if (incDate <= chartEndDate && incEnd >= todayStr) return s + inc.amount;
    return s;
  }, 0);

  // P&L Net Profit = grossProfit - (adSpend * 1.14) — the formula-based approach
  const pnlNetProfit = d.totalGrossProfit - Math.round(d.totalAdSpend * 1.14);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Projected Finance</h1>
          <p className="text-[11px] text-muted-foreground">Forward-looking projections & planning</p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        {(['14d', '30d', '90d', '7d'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition ${
              dateRange === range
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'border border-border text-muted-foreground hover:text-foreground hover:border-border/80'
            }`}
          >
            {range === '7d' ? '7 Days' : range === '14d' ? '14 Days' : range === '30d' ? '30 Days' : '90 Days'}
          </button>
        ))}
      </div>

      {/* Key Metrics */}
      {(() => {
        const rangeLabel = dateRange === '7d' ? '7d' : dateRange === '14d' ? '14d' : dateRange === '90d' ? '90d' : '30d';
        return (
          <StaggerContainer className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StaggerItem>
              <MetricCard label={`Projected Deposits (${rangeLabel})`} value={totalCODProjected} icon={<BanknoteIcon className="h-4 w-4 text-blue-400" />} color="text-emerald-400" />
            </StaggerItem>
            <StaggerItem>
              <MetricCard label={`P&L Net Profit (${rangeLabel})`} value={pnlNetProfit} icon={<Wallet className="h-4 w-4 text-violet-400" />} color={pnlNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            </StaggerItem>
            <StaggerItem>
              <MetricCard label={`Total Sales (${rangeLabel})`} value={d.totalSales} icon={<DollarSign className="h-4 w-4 text-emerald-400" />} color="text-foreground" />
            </StaggerItem>
          </StaggerContainer>
        );
      })()}

      {/* ═══ Projected Cash-In ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        {(() => {
          const hasData = totalInflow > 0 || (currentWeek && currentWeek.codRevenue > 0);
          if (!hasData) return (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center">
              <Clock className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-[12px] text-muted-foreground">No inflow data yet. Enter daily P&L data to see projections.</p>
            </div>
          );
          return (
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <BanknoteIcon className="h-5 w-5 text-emerald-400" />
                    <h2 className="text-base font-semibold text-foreground">Projected Cash-In</h2>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Total Projected</p>
                  <p className="text-3xl font-bold text-emerald-400 tabular-nums">
                    <AnimatedNumber value={totalInflow} formatter={formatINR} />
                  </p>
                </div>
              </div>

              <div>
                {inflowChartData.length > 0 ? (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={inflowChartData} margin={{ top: 8, right: 20, left: 20, bottom: 24 }}>
                        <defs>
                          <linearGradient id="depositGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
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
                          content={({ active, payload }) => active && payload?.length ? (
                            <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] font-medium text-foreground shadow-lg">
                              <span className="text-muted-foreground text-[10px] mr-1.5">Projected</span>{formatINR(payload[0].value as number)}
                            </div>
                          ) : null}
                        />
                        <Area type="monotone" dataKey="deposit" stroke="#10b981" strokeWidth={1.5} fill="url(#depositGrad)" dot={false} activeDot={{ r: 3, fill: '#10b981' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-[11px] text-muted-foreground/40">No data yet</div>
                )}
              </div>
            </div>
          </div>
          );
        })()}
      </motion.div>

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

      {/* ═══ Projected Cash Outflow ═══ */}
      {totalOutflow > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
          <div className="rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-500/[0.04] via-card to-card">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowDown className="h-5 w-5 text-red-400" />
                    <h2 className="text-base font-semibold text-foreground">Projected Cash Outflow</h2>
                  </div>
                  {totalIncomeInRange > 0 && (
                    <p className="text-[10px] text-emerald-400/70 mt-0.5">
                      +{formatINR(totalIncomeInRange)} income offset
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Net Due</p>
                  <p className={`text-3xl font-bold tabular-nums ${totalOutflow - totalIncomeInRange > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    <AnimatedNumber value={Math.max(0, totalOutflow - totalIncomeInRange)} formatter={formatINR} />
                  </p>
                  {totalIncomeInRange > 0 && (
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5 line-through">{formatINR(totalOutflow)}</p>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      <span className="text-[9px] text-muted-foreground/60">Expenses</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      <span className="text-[9px] text-muted-foreground/60">Recurring (unpaid)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-400/30 ring-1 ring-amber-400/40" />
                      <span className="text-[9px] text-muted-foreground/60">Recurring (paid)</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Link href="/finance/expenditure" className="rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-[9px] font-medium text-red-400 transition hover:bg-red-500/10">
                      Expenditure
                    </Link>
                    <Link href="/finance/expenditure" className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-[9px] font-medium text-amber-400 transition hover:bg-amber-500/10">
                      Recurring
                    </Link>
                  </div>
                </div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={outflowDays} margin={{ top: 8, right: 20, left: 20, bottom: 24 }}>
                      <defs>
                        <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="unpaidBaseGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.03} />
                        </linearGradient>
                        <linearGradient id="paidBaseGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.01} />
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
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const exp = (payload.find((p) => p.dataKey === 'expenses')?.value as number) ?? 0;
                          const unpaid = (payload.find((p) => p.dataKey === 'unpaidBaselines')?.value as number) ?? 0;
                          const paid = (payload.find((p) => p.dataKey === 'paidBaselines')?.value as number) ?? 0;
                          if (exp + unpaid + paid === 0) return null;
                          return (
                            <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-[10px] shadow-lg space-y-0.5">
                              {exp > 0 && <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" /><span className="text-muted-foreground">Expenses</span><span className="font-semibold text-foreground ml-auto pl-3">{formatINR(exp)}</span></div>}
                              {unpaid > 0 && <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" /><span className="text-muted-foreground">Due</span><span className="font-semibold text-foreground ml-auto pl-3">{formatINR(unpaid)}</span></div>}
                              {paid > 0 && <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-400/40 inline-block" /><span className="text-muted-foreground">Paid ✓</span><span className="font-semibold text-foreground ml-auto pl-3">{formatINR(paid)}</span></div>}
                            </div>
                          );
                        }}
                      />
                      <Area type="monotone" dataKey="paidBaselines" stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 3" fill="url(#paidBaseGrad)" dot={false} stackId="stack" />
                      <Area type="monotone" dataKey="unpaidBaselines" stroke="#f59e0b" strokeWidth={1.5} fill="url(#unpaidBaseGrad)" dot={false} stackId="stack" />
                      <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={1.5} fill="url(#expGrad)" dot={false} stackId="stack" />
                    </AreaChart>
                  </ResponsiveContainer>
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
