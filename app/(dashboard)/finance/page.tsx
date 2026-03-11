'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  RefreshCw, Loader2, DollarSign, Wallet, Plus,
  AlertTriangle, BanknoteIcon,
  Bell, X, ArrowRight, Clock,
  CalendarClock, TrendingDown, TrendingUp,
  ArrowDown, Minus,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { formatINR } from '@/lib/currency-converter';

// ── Types ────────────────────────────────────────────────────────────────────

interface FinanceDailyEntry {
  date: string;
  totalSales: number;
  grossMargin: number;
  grossProfit: number;
  adSpend: number;
  netProfit: number;
}

interface Baseline {
  id: string;
  type: 'daily' | 'monthly';
  category: string;
  label: string;
  amount: number;
  dueDay?: number;
  isPaid?: boolean;
  paidDate?: string;
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

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
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
  recentExpenses: Expense[];
}

interface SpendingPower {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  codRevenue: number;
  projectedDeposit: number;
  founderCut: number;
  inventoryNeeds: number;
  baselinesDue: number;
  weekExpenses: number;
  spendingPower: number;
  breakdown: Array<{ label: string; amount: number; type: 'income' | 'deduction' | 'result' }>;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function FinancePage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [codWeeks, setCodWeeks] = useState<CODWeek[]>([]);
  const [spending, setSpending] = useState<SpendingPower | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, codRes, spendRes, remindersRes, baselinesRes] = await Promise.all([
        fetch('/api/finance'),
        fetch('/api/finance?action=cod-projections'),
        fetch('/api/finance?action=spending-power'),
        fetch('/api/finance?action=reminders'),
        fetch('/api/finance?action=baselines'),
      ]);
      const [summaryData, codData, spendData, remindersData, baselinesData] = await Promise.all([
        summaryRes.json(), codRes.json(), spendRes.json(), remindersRes.json(), baselinesRes.json(),
      ]);
      setSummary(summaryData);
      setCodWeeks(codData.weeks ?? []);
      setSpending(spendData);
      setReminders(remindersData.reminders ?? []);
      setBaselines([...(baselinesData.daily ?? []), ...(baselinesData.monthly ?? [])]);
    } catch { /* silently fail */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const dismissReminder = async (type: string) => {
    setReminders((prev) => prev.filter((r) => r.type !== type));
    await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss-reminder', type }),
    }).catch(() => {});
  };

  const summaryExpenses = summary?.recentExpenses;

  const { upcomingPayments, currentDay } = useMemo(() => {
    const today = new Date();
    const day = today.getDate();
    const monthly = baselines.filter((b) => b.type === 'monthly');

    return {
      currentDay: day,
      upcomingPayments: monthly
        .filter((b) => !b.isPaid && b.dueDay)
        .sort((a, b) => ((a.dueDay! - day + 31) % 31) - ((b.dueDay! - day + 31) % 31)),
    };
  }, [baselines]);

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
    dailyEntries: [], dailyBaselines: [], monthlyBaselines: [], recentExpenses: [],
  };

  // Current week's COD data (first week from projections)
  const currentWeek = codWeeks[0];
  const totalCODProjected = codWeeks.reduce((s, w) => s + w.projectedAmount, 0);

  // Past 7 days for the mini bar chart
  const last7Entries = (d.dailyEntries ?? [])
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);

  const maxDailyRevenue = Math.max(...last7Entries.map((e) => e.totalSales), 1);

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
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Enter Data
          </Link>
          <button
            onClick={() => { setRefreshing(true); fetchAll(); }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-[12px] font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <StaggerContainer className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StaggerItem>
          <MetricCard label="Total Sales (30d)" value={d.totalSales} icon={<DollarSign className="h-4 w-4 text-emerald-400" />} color="text-foreground" />
        </StaggerItem>
        <StaggerItem>
          <MetricCard label="Bank Deposits (4wk)" value={totalCODProjected} icon={<BanknoteIcon className="h-4 w-4 text-blue-400" />} color="text-emerald-400" />
        </StaggerItem>
        <StaggerItem>
          <MetricCard label="Net Profit (30d)" value={d.totalNetProfit} icon={<Wallet className="h-4 w-4 text-violet-400" />} color={d.totalNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        </StaggerItem>
      </StaggerContainer>

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

              {/* Two columns: COD Revenue + Brand Breakdown | Mini chart */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Revenue + Brands */}
                <div className="space-y-4">
                  <div className="rounded-xl bg-black/20 border border-white/[0.06] p-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2">COD Revenue</p>
                    <p className="text-2xl font-semibold text-foreground tabular-nums">{formatINR(currentWeek.codRevenue)}</p>
                  </div>

                  {/* Brand breakdown */}
                  {Object.keys(currentWeek.brandBreakdown).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Per Brand</p>
                      {Object.entries(currentWeek.brandBreakdown).map(([brand, amount]) => {
                        const pct = currentWeek.codRevenue > 0 ? Math.round((amount / currentWeek.codRevenue) * 100) : 0;
                        return (
                          <div key={brand} className="flex items-center gap-3">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                            <span className="text-[12px] font-medium text-foreground flex-1 truncate">{brand}</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">{pct}%</span>
                            <span className="text-[12px] font-semibold text-foreground tabular-nums">{formatINR(amount)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: 7-day mini chart */}
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-3">Last 7 Days — Daily Revenue</p>
                  <div className="flex items-end gap-1.5 h-32">
                    {last7Entries.length > 0 ? last7Entries.map((entry) => {
                      const height = Math.max((entry.totalSales / maxDailyRevenue) * 100, 4);
                      const dayLabel = entry.date.slice(-2);
                      return (
                        <div key={entry.date} className="flex-1 flex flex-col items-center gap-1.5">
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${height}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className="w-full rounded-t-md bg-emerald-500/30 border border-emerald-500/20 hover:bg-emerald-500/40 transition-colors relative group cursor-default"
                          >
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap rounded-md bg-popover border border-border px-2 py-1 text-[10px] font-medium text-foreground shadow-lg z-10">
                              {formatINR(entry.totalSales)}
                            </div>
                          </motion.div>
                          <span className="text-[9px] text-muted-foreground/50 tabular-nums">{dayLabel}</span>
                        </div>
                      );
                    }) : (
                      <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground/40">No data yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Upcoming weeks strip */}
            {codWeeks.length > 1 && (
              <div className="border-t border-emerald-500/10 bg-black/10">
                <div className="flex divide-x divide-emerald-500/10">
                  {codWeeks.slice(1).map((week) => (
                    <div key={week.weekLabel + week.startDate} className="flex-1 px-4 py-3">
                      <p className="text-[10px] text-muted-foreground/60 mb-0.5">{week.weekLabel}</p>
                      <p className="text-[13px] font-semibold text-foreground tabular-nums">
                        {week.projectedAmount > 0 ? formatINR(week.projectedAmount) : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card px-4 py-8 text-center">
            <Clock className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-[12px] text-muted-foreground">No COD data yet. COD orders are auto-fetched when you enter daily data.</p>
          </div>
        )}
      </motion.div>

      {/* ═══ Spending Power Waterfall ═══ */}
      {spending && spending.projectedDeposit > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                    <TrendingDown className="h-4 w-4 text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Spending Power</h2>
                    <p className="text-[11px] text-muted-foreground">What you can actually spend this week after all obligations</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Available</p>
                  <p className={`text-2xl font-bold tabular-nums ${spending.spendingPower > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    <AnimatedNumber value={spending.spendingPower} formatter={formatINR} />
                  </p>
                </div>
              </div>
            </div>

            {/* Waterfall */}
            <div className="p-4 space-y-0">
              {spending.breakdown.map((item, i) => {
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
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ Expenditure Snapshot ═══ */}
      {upcomingPayments.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-primary"><Wallet className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-medium text-foreground">Upcoming Payments</p>
                <p className="text-[11px] text-muted-foreground">Baselines & recurring costs due soon</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/finance/expenditure" className="text-[11px] text-primary hover:text-primary/80 transition font-medium">
                Expenditure →
              </Link>
              <Link href="/finance/baselines" className="text-[11px] text-muted-foreground hover:text-foreground transition font-medium">
                Baselines →
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {upcomingPayments.slice(0, 5).map((b) => {
              const isOverdue = b.dueDay! < currentDay;
              const isDueToday = b.dueDay === currentDay;
              const daysUntil = ((b.dueDay! - currentDay + 31) % 31);
              return (
                <div key={b.id} className={`flex items-center gap-3 px-4 py-2.5 border-b border-border/30 last:border-0 ${isOverdue ? 'bg-red-500/[0.03]' : ''}`}>
                  <CalendarClock className={`h-3.5 w-3.5 shrink-0 ${isOverdue ? 'text-red-400' : isDueToday ? 'text-amber-400' : 'text-muted-foreground/40'}`} />
                  <span className={`text-[12px] font-medium flex-1 truncate ${isOverdue ? 'text-red-400' : 'text-foreground'}`}>{b.label}</span>
                  <span className="text-[10px] text-muted-foreground/50 shrink-0">
                    {isOverdue ? 'overdue' : isDueToday ? 'today' : `${daysUntil}d`}
                  </span>
                  <span className={`text-[13px] font-semibold tabular-nums shrink-0 ${isOverdue ? 'text-red-400' : isDueToday ? 'text-amber-400' : 'text-foreground'}`}>
                    {formatINR(b.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

    </PageTransition>
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
