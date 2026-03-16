'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  RefreshCw, Loader2, DollarSign, Plus,
  Calendar, TrendingUp, TrendingDown,
  ArrowDown, BanknoteIcon, X, CreditCard, Receipt,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';
import { formatINR } from '@/lib/currency-converter';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DatePicker } from '@/components/date-picker';

// ── Types ────────────────────────────────────────────────────────────────────

interface FinanceDailyEntry {
  date: string;
  totalSales: number;
  grossMargin: number;
  grossProfit: number;
  adSpend: number;
  netProfit: number;
  codSalesByBrand?: Record<string, number>;
  prepaidSettlement?: number;
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
  endDate?: string;
}

interface IncomeEntry {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  endDate?: string;
}

function fmtMonthDay(dateStr: string): string {
  const [, m, day] = dateStr.split('-');
  return `${m}/${day}`;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ActualFinancePage() {
  const [dailyEntries, setDailyEntries] = useState<FinanceDailyEntry[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<IncomeEntry[]>([]);
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Date range filter — backward from yesterday
  const [dateRange, setDateRange] = useState<'14d' | '30d' | '7d' | '90d'>('14d');

  const yesterdayStr = useMemo(() => {
    const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const d = new Date(todayIST + 'T00:00:00+05:30');
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const days = dateRange === '7d' ? 7 : dateRange === '14d' ? 14 : dateRange === '90d' ? 90 : 30;
      const res = await fetch(`/api/finance?action=combined&days=${days}`);
      const data = await res.json();
      setDailyEntries(data.summary?.dailyEntries ?? []);
      setBaselines([...(data.baselines?.daily ?? []), ...(data.baselines?.monthly ?? [])]);
      setDeliveryRates(data.deliveryRates ?? {});
      setExpenses(data.expenses ?? []);
      setIncome(data.income ?? []);
    } catch { /* silently fail */ }
    finally { setLoading(false); setRefreshing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const chartDays = useMemo(() => {
    if (dateRange === '7d') return 7;
    if (dateRange === '14d') return 14;
    if (dateRange === '30d') return 30;
    if (dateRange === '90d') return 90;
    return 14;
  }, [dateRange]);

  // Filter entries up to yesterday (actual data only)
  const pastEntries = useMemo(() =>
    dailyEntries.filter((e) => e.date <= yesterdayStr),
  [dailyEntries, yesterdayStr]);

  // ── Money In per day ──
  // COD deposits received (using bank deposit date = sale date + 7) + prepaid + income
  const moneyInByDate = useMemo(() => {
    const map: Record<string, number> = {};

    // COD deposits: sale date + 7 days = deposit date. Only count deposits that already landed.
    for (const entry of pastEntries) {
      const codByBrand = entry.codSalesByBrand ?? {};
      let deposit = 0;
      for (const [brand, amount] of Object.entries(codByBrand)) {
        const rate = deliveryRates[brand] ?? 65;
        deposit += Math.round(Number(amount) * (rate / 100));
      }
      if (deposit > 0) {
        // Deposit lands 7 days after the sale
        const depositDate = new Date(entry.date + 'T00:00:00+05:30');
        depositDate.setDate(depositDate.getDate() + 7);
        const ds = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(depositDate);
        if (ds <= yesterdayStr) {
          map[ds] = (map[ds] ?? 0) + deposit;
        }
      }
      // Prepaid settlement received on the entry date
      const prepaid = Number(entry.prepaidSettlement) || 0;
      if (prepaid > 0) {
        map[entry.date] = (map[entry.date] ?? 0) + prepaid;
      }
    }

    // Missed income
    for (const inc of income) {
      const incDate = inc.date ?? '';
      if (inc.endDate) {
        const start = new Date(incDate + 'T00:00:00+05:30');
        const end = new Date(inc.endDate + 'T00:00:00+05:30');
        const rangeDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
        const dailyAmount = Math.round(inc.amount / rangeDays);
        for (let j = 0; j < rangeDays; j++) {
          const dt = new Date(start);
          dt.setDate(start.getDate() + j);
          const ds = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(dt);
          if (ds <= yesterdayStr) map[ds] = (map[ds] ?? 0) + dailyAmount;
        }
      } else if (incDate <= yesterdayStr) {
        map[incDate] = (map[incDate] ?? 0) + inc.amount;
      }
    }
    return map;
  }, [pastEntries, income, deliveryRates, yesterdayStr]);

  // ── Money Out per day ──
  const moneyOutByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const exp of expenses) {
      if (exp.endDate && exp.endDate !== exp.date) {
        // Spread date-range expenses evenly across days (same as Money In does for income)
        const start = new Date(exp.date + 'T00:00:00+05:30');
        const end = new Date(exp.endDate + 'T00:00:00+05:30');
        const rangeDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
        const dailyAmount = Math.round(exp.amount / rangeDays);
        for (let j = 0; j < rangeDays; j++) {
          const dt = new Date(start);
          dt.setDate(start.getDate() + j);
          const ds = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(dt);
          if (ds <= yesterdayStr) map[ds] = (map[ds] ?? 0) + dailyAmount;
        }
      } else if (exp.date <= yesterdayStr) {
        map[exp.date] = (map[exp.date] ?? 0) + exp.amount;
      }
    }
    for (const b of baselines) {
      if (b.type === 'monthly' && b.dueDate && b.isPaid && b.dueDate <= yesterdayStr) {
        map[b.dueDate] = (map[b.dueDate] ?? 0) + b.amount;
      }
    }
    return map;
  }, [expenses, baselines, yesterdayStr]);

  // Build chart data — backward from yesterday
  const chartData = useMemo(() => {
    const days: Array<{ date: string; label: string; moneyIn: number; moneyOut: number; cashReserve: number }> = [];
    let runningReserve = 0;
    const end = new Date(yesterdayStr + 'T00:00:00+05:30');
    for (let i = 0; i < chartDays; i++) {
      const dt = new Date(end);
      dt.setDate(end.getDate() - (chartDays - 1) + i);
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(dt);
      const inAmount = moneyInByDate[dateStr] ?? 0;
      const outAmount = moneyOutByDate[dateStr] ?? 0;
      runningReserve += inAmount - outAmount;
      days.push({
        date: dateStr,
        label: fmtMonthDay(dateStr),
        moneyIn: inAmount,
        moneyOut: outAmount,
        cashReserve: runningReserve,
      });
    }
    return days;
  }, [yesterdayStr, chartDays, moneyInByDate, moneyOutByDate]);

  // Totals
  const totalMoneyIn = chartData.reduce((s, d) => s + d.moneyIn, 0);
  const totalMoneyOut = chartData.reduce((s, d) => s + d.moneyOut, 0);
  const cashReserve = chartData.length > 0 ? chartData[chartData.length - 1].cashReserve : 0;

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

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Finance</h1>
          <p className="text-[11px] text-muted-foreground">Actual cashflow — up to yesterday</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIncomeModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-medium text-emerald-400 transition hover:bg-emerald-500/20 active:scale-[0.97]"
          >
            <Plus className="h-3.5 w-3.5" />
            Income
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-400 transition hover:bg-red-500/20 active:scale-[0.97]"
          >
            <Plus className="h-3.5 w-3.5" />
            Expense
          </button>
          <Link
            href="/finance/entry"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/90 px-3 py-2 text-[12px] font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary hover:shadow-md hover:shadow-primary/25 active:scale-[0.97]"
          >
            Daily Entry
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
          <StaggerContainer className="grid grid-cols-3 gap-3">
            <StaggerItem>
              <MetricCard label={`Money In (${rangeLabel})`} value={totalMoneyIn} icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} color="text-emerald-400" />
            </StaggerItem>
            <StaggerItem>
              <MetricCard label={`Money Out (${rangeLabel})`} value={totalMoneyOut} icon={<ArrowDown className="h-4 w-4 text-red-400" />} color="text-red-400" />
            </StaggerItem>
            <StaggerItem>
              <MetricCard label="Cash Reserve" value={cashReserve} icon={<BanknoteIcon className="h-4 w-4 text-blue-400" />} color={cashReserve >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            </StaggerItem>
          </StaggerContainer>
        );
      })()}

      {/* ═══ Money In Chart ═══ */}
      {totalMoneyIn > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                    <h2 className="text-base font-semibold text-foreground">Money In</h2>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">COD deposits + prepaid + other income received</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Total Received</p>
                  <p className="text-3xl font-bold text-emerald-400 tabular-nums">
                    <AnimatedNumber value={totalMoneyIn} formatter={formatINR} />
                  </p>
                </div>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 20, left: 20, bottom: 24 }}>
                    <defs>
                      <linearGradient id="moneyInGrad" x1="0" y1="0" x2="0" y2="1">
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
                          fontWeight={500}
                          fill="#9ca3af"
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
                          <span className="text-muted-foreground text-[10px] mr-1.5">Received</span>{formatINR(payload[0].value as number)}
                        </div>
                      ) : null}
                    />
                    <Area type="monotone" dataKey="moneyIn" stroke="#10b981" strokeWidth={1.5} fill="url(#moneyInGrad)" dot={false} activeDot={{ r: 3, fill: '#10b981' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ Money Out Chart ═══ */}
      {totalMoneyOut > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <div className="rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-500/[0.04] via-card to-card">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="h-5 w-5 text-red-400" />
                    <h2 className="text-base font-semibold text-foreground">Money Out</h2>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">Expenses + recurring expenses paid</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Total Spent</p>
                  <p className="text-3xl font-bold text-red-400 tabular-nums">
                    <AnimatedNumber value={totalMoneyOut} formatter={formatINR} />
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    <span className="text-[9px] text-muted-foreground/60">Expenses + Recurring</span>
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
                  <AreaChart data={chartData} margin={{ top: 8, right: 20, left: 20, bottom: 24 }}>
                    <defs>
                      <linearGradient id="moneyOutGrad" x1="0" y1="0" x2="0" y2="1">
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
                          fontWeight={500}
                          fill="#9ca3af"
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
                          <span className="text-muted-foreground text-[10px] mr-1.5">Spent</span>{formatINR(payload[0].value as number)}
                        </div>
                      ) : null}
                    />
                    <Area type="monotone" dataKey="moneyOut" stroke="#ef4444" strokeWidth={1.5} fill="url(#moneyOutGrad)" dot={false} activeDot={{ r: 3, fill: '#ef4444' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ Cash Reserve Chart ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <div className="rounded-2xl border border-blue-500/15 bg-gradient-to-br from-blue-500/[0.04] via-card to-card">
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-5 w-5 text-blue-400" />
                  <h2 className="text-base font-semibold text-foreground">Cash Reserve</h2>
                </div>
                <p className="text-[10px] text-muted-foreground/60">Cumulative net position over time</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Current</p>
                <p className={`text-3xl font-bold tabular-nums ${cashReserve >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  <AnimatedNumber value={cashReserve} formatter={formatINR} />
                </p>
              </div>
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 20, left: 20, bottom: 24 }}>
                  <defs>
                    <linearGradient id="reserveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
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
                        fontWeight={500}
                        fill="#9ca3af"
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
                        <span className="text-muted-foreground text-[10px] mr-1.5">Reserve</span>{formatINR(payload[0].value as number)}
                      </div>
                    ) : null}
                  />
                  <Area type="monotone" dataKey="cashReserve" stroke="#3b82f6" strokeWidth={1.5} fill="url(#reserveGrad)" dot={false} activeDot={{ r: 3, fill: '#3b82f6' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </motion.div>
      {/* ═══ Modals ═══ */}
      <AnimatePresence>
        {showIncomeModal && (
          <MissedIncomeModal
            onClose={() => setShowIncomeModal(false)}
            onSaved={() => { setShowIncomeModal(false); fetchAll(); }}
          />
        )}
        {showExpenseModal && (
          <MissedExpenseModal
            onClose={() => setShowExpenseModal(false)}
            onSaved={() => { setShowExpenseModal(false); fetchAll(); }}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

// ── Income Categories ─────────────────────────────────────────────────────────

const INCOME_CATS = [
  { value: 'prepaid-settlement', label: 'Prepaid Settlement', icon: '💳' },
  { value: 'affiliate', label: 'Affiliate Income', icon: '🤝' },
  { value: 'refund-received', label: 'Refund Received', icon: '📥' },
  { value: 'cashback', label: 'Cashback / Reward', icon: '🎁' },
  { value: 'loan-received', label: 'Loan / Credit', icon: '🏦' },
  { value: 'investment', label: 'Investment Inflow', icon: '📈' },
  { value: 'freelance', label: 'Freelance / Service', icon: '📦' },
  { value: 'marketplace', label: 'Marketplace Payout', icon: '🛒' },
  { value: 'reimbursement', label: 'Reimbursement', icon: '💼' },
  { value: 'other-income', label: 'Other', icon: '·' },
];

const EXPENSE_CATS = [
  { value: 'inventory', label: 'Inventory / COGS', icon: '📦' },
  { value: 'supplier', label: 'Supplier Payment', icon: '💰' },
  { value: 'shipping', label: 'Shipping / Logistics', icon: '🚚' },
  { value: 'marketing', label: 'Marketing / Ads', icon: '📢' },
  { value: 'returns', label: 'Returns / RTO', icon: '↩️' },
  { value: 'tools', label: 'Tools / Software', icon: '🔧' },
  { value: 'salary', label: 'Salary / Payroll', icon: '👥' },
  { value: 'rent', label: 'Rent / Utilities', icon: '🏠' },
  { value: 'freelance', label: 'Freelance', icon: '💼' },
  { value: 'other', label: 'Other', icon: '·' },
];

// ── Missed Income Modal ───────────────────────────────────────────────────────

function MissedIncomeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState('prepaid-settlement');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
  const [endDate, setEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!amount || !category) return;
    setSaving(true);
    try {
      await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-income',
          category,
          description,
          amount: Number(amount),
          date,
          endDate: isRange && endDate ? endDate : undefined,
        }),
      });
      onSaved();
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <BanknoteIcon className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Add Income</h2>
              <p className="text-[11px] text-muted-foreground">Log money received</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-border/60 bg-background/60 p-2 text-muted-foreground transition hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Source</label>
            <div className="flex flex-wrap gap-1.5">
              {INCOME_CATS.map((cat) => (
                <button key={cat.value} onClick={() => setCategory(cat.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition border ${
                    category === cat.value
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'text-muted-foreground border-border hover:text-foreground'
                  }`}
                ><span className="mr-1">{cat.icon}</span>{cat.label}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Amazon affiliate payout for Feb"
              className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:border-emerald-500/50 focus:outline-none transition" />
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Amount (₹)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
                className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground tabular-nums placeholder:text-muted-foreground/40 focus:border-emerald-500/50 focus:outline-none transition" />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Date</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>

          <div>
            <button onClick={() => setIsRange(!isRange)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition border ${
                isRange ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'text-muted-foreground border-border hover:text-foreground'
              }`}
            ><CreditCard className="h-3.5 w-3.5" />Date range income</button>
            <AnimatePresence>
              {isRange && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-3">
                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">End Date</label>
                    <DatePicker value={endDate} onChange={setEndDate} min={date} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border/50 px-6 py-4">
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-medium text-muted-foreground transition hover:text-foreground">Cancel</button>
          <button onClick={handleSave} disabled={saving || !amount}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-4 py-2 text-[12px] font-semibold text-emerald-400 transition hover:bg-emerald-500/30 disabled:opacity-40"
          ><Plus className="h-3.5 w-3.5" />{saving ? 'Saving...' : 'Add Income'}</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Missed Expense Modal ──────────────────────────────────────────────────────

function MissedExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState('inventory');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
  const [endDate, setEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!amount || !category) return;
    setSaving(true);
    try {
      await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-expense',
          category,
          description,
          amount: Number(amount),
          date,
          endDate: isRange && endDate ? endDate : undefined,
        }),
      });
      onSaved();
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Add Expense</h2>
              <p className="text-[11px] text-muted-foreground">Log money spent</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-border/60 bg-background/60 p-2 text-muted-foreground transition hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_CATS.map((cat) => (
                <button key={cat.value} onClick={() => setCategory(cat.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition border ${
                    category === cat.value
                      ? 'bg-red-500/15 text-red-400 border-red-500/30'
                      : 'text-muted-foreground border-border hover:text-foreground'
                  }`}
                ><span className="mr-1">{cat.icon}</span>{cat.label}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Delhivery shipping charges for March"
              className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:border-red-500/50 focus:outline-none transition" />
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Amount (₹)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
                className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground tabular-nums placeholder:text-muted-foreground/40 focus:border-red-500/50 focus:outline-none transition" />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Date</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>

          <div>
            <button onClick={() => setIsRange(!isRange)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition border ${
                isRange ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'text-muted-foreground border-border hover:text-foreground'
              }`}
            ><CreditCard className="h-3.5 w-3.5" />Date range expense</button>
            <AnimatePresence>
              {isRange && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-3">
                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">End Date</label>
                    <DatePicker value={endDate} onChange={setEndDate} min={date} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border/50 px-6 py-4">
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-medium text-muted-foreground transition hover:text-foreground">Cancel</button>
          <button onClick={handleSave} disabled={saving || !amount}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/20 px-4 py-2 text-[12px] font-semibold text-red-400 transition hover:bg-red-500/30 disabled:opacity-40"
          ><Plus className="h-3.5 w-3.5" />{saving ? 'Saving...' : 'Add Expense'}</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
      <div className="relative z-10 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={`relative z-10 mt-1.5 text-2xl font-semibold ${color}`}><AnimatedNumber value={value} formatter={formatINR} /></p>
    </motion.div>
  );
}
