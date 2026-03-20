'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  RefreshCw, Loader2, DollarSign, Plus,
  Calendar, TrendingUp, TrendingDown,
  ArrowDown, BanknoteIcon,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';
import { DatePicker } from '@/components/date-picker';
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

  // Date range filter — start/end date pickers
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(Date.now() - 14 * 86400000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  });
  const [endDate, setEndDate] = useState(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  );

  const todayStr = useMemo(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
  []);

  const fetchAll = useCallback(async () => {
    try {
      const start = new Date(startDate + 'T00:00:00+05:30');
      const end = new Date(endDate + 'T00:00:00+05:30');
      const days = Math.max(7, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
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
  }, [startDate, endDate]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const chartDays = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00+05:30');
    const end = new Date(endDate + 'T00:00:00+05:30');
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  }, [startDate, endDate]);

  // Filter entries within the selected date range
  const pastEntries = useMemo(() =>
    dailyEntries.filter((e) => e.date >= startDate && e.date <= endDate),
  [dailyEntries, startDate, endDate]);

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
        if (ds <= todayStr) {
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
          if (ds <= todayStr) map[ds] = (map[ds] ?? 0) + dailyAmount;
        }
      } else if (incDate <= todayStr) {
        map[incDate] = (map[incDate] ?? 0) + inc.amount;
      }
    }
    return map;
  }, [pastEntries, income, deliveryRates, todayStr]);

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
          if (ds <= todayStr) map[ds] = (map[ds] ?? 0) + dailyAmount;
        }
      } else if (exp.date <= todayStr) {
        map[exp.date] = (map[exp.date] ?? 0) + exp.amount;
      }
    }
    for (const b of baselines) {
      if (b.type === 'monthly' && b.dueDate && b.isPaid && b.dueDate <= todayStr) {
        map[b.dueDate] = (map[b.dueDate] ?? 0) + b.amount;
      }
    }
    return map;
  }, [expenses, baselines, todayStr]);

  // Build chart data — backward from yesterday
  const chartData = useMemo(() => {
    const days: Array<{ date: string; label: string; moneyIn: number; moneyOut: number; cashReserve: number }> = [];
    let runningReserve = 0;
    const end = new Date(todayStr + 'T00:00:00+05:30');
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
  }, [todayStr, chartDays, moneyInByDate, moneyOutByDate]);

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
          <p className="text-[11px] text-muted-foreground">Actual cashflow — up to today</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/finance/entry"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/90 px-4 py-2 text-[12px] font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary hover:shadow-md hover:shadow-primary/25 active:scale-[0.97]"
          >
            <Plus className="h-3.5 w-3.5" />
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
        <DatePicker value={startDate} onChange={setStartDate} max={endDate} compact />
        <span className="text-[11px] text-muted-foreground/40">→</span>
        <DatePicker value={endDate} onChange={setEndDate} min={startDate} max={todayStr} compact />
      </div>

      {/* Key Metrics */}
      <StaggerContainer className="grid grid-cols-3 gap-3">
        <StaggerItem>
          <MetricCard label="Money In" value={totalMoneyIn} icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} color="text-emerald-400" />
        </StaggerItem>
        <StaggerItem>
          <MetricCard label="Money Out" value={totalMoneyOut} icon={<ArrowDown className="h-4 w-4 text-red-400" />} color="text-red-400" />
        </StaggerItem>
        <StaggerItem>
          <MetricCard label="Cash Reserve" value={cashReserve} icon={<BanknoteIcon className="h-4 w-4 text-blue-400" />} color={cashReserve >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        </StaggerItem>
      </StaggerContainer>

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
    </PageTransition>
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
