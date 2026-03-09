'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  RefreshCw, Loader2, DollarSign, TrendingUp, Wallet, Plus,
  AlertTriangle, Calendar, ArrowRight, ChevronDown, ChevronUp,
  BanknoteIcon, PiggyBank, BarChart3, Building2, Clock, Bell, X,
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
  paymentProcessorFee: number;
  netProfit: number;
}

interface Baseline {
  id: string;
  type: 'daily' | 'monthly';
  category: string;
  label: string;
  amount: number;
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
  totalProcessorFees: number;
  totalExpenses: number;
  inventoryValue: number;
  dailyBaselineTotal: number;
  monthlyBaselineTotal: number;
  dailyEntries: FinanceDailyEntry[];
  dailyBaselines: Baseline[];
  monthlyBaselines: Baseline[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

// ── Main Component ───────────────────────────────────────────────────────────

export default function FinancePage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [codWeeks, setCodWeeks] = useState<CODWeek[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCOD, setShowCOD] = useState(true);
  const [showBaselines, setShowBaselines] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, codRes, remindersRes] = await Promise.all([
        fetch('/api/finance'),
        fetch('/api/finance?action=cod-projections'),
        fetch('/api/finance?action=reminders'),
      ]);
      const [summaryData, codData, remindersData] = await Promise.all([
        summaryRes.json(), codRes.json(), remindersRes.json(),
      ]);
      setSummary(summaryData);
      setCodWeeks(codData.weeks ?? []);
      setReminders(remindersData.reminders ?? []);
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
    totalProcessorFees: 0, totalExpenses: 0, inventoryValue: 0,
    dailyBaselineTotal: 0, monthlyBaselineTotal: 0,
    dailyEntries: [], dailyBaselines: [], monthlyBaselines: [],
  };

  const actualAdCost = Math.round(d.totalAdSpend * 1.14);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Reminders */}
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
              {reminder.priority === 'high' && <p className="text-[11px] text-amber-400/70 mt-0.5">This is needed to calculate net profit</p>}
            </div>
            <button onClick={() => dismissReminder(reminder.type)} className="rounded-md p-1 text-amber-400/60 hover:text-amber-400 transition"><X className="h-3.5 w-3.5" /></button>
          </motion.div>
        ))}
      </AnimatePresence>

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
          <MetricCard label="Gross Profit (30d)" value={d.totalGrossProfit} icon={<TrendingUp className="h-4 w-4 text-blue-400" />} color={d.totalGrossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        </StaggerItem>
        <StaggerItem>
          <MetricCard label="Net Profit (30d)" value={d.totalNetProfit} icon={<Wallet className="h-4 w-4 text-violet-400" />} color={d.totalNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        </StaggerItem>
      </StaggerContainer>

      {/* Cost Breakdown */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">30-Day Cost Breakdown</p>
          <p className="text-[11px] text-muted-foreground">
            Daily baseline: {formatINR(d.dailyBaselineTotal)}/day · Monthly: {formatINR(d.monthlyBaselineTotal)}/mo
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <CostItem label="Ad Spend (raw)" amount={d.totalAdSpend} color="bg-amber-400" />
          <CostItem label="Ad Cost (14% inc.)" amount={actualAdCost} color="bg-orange-400" />
          <CostItem label="Processor Fees (3%)" amount={d.totalProcessorFees} color="bg-violet-400" />
          <CostItem label="Other Expenses" amount={d.totalExpenses} color="bg-rose-400" />
        </div>
      </motion.div>

      {/* Recent Entries */}
      {d.dailyEntries.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Recent Daily Entries</p>
          </div>
          <div className="overflow-x-auto">
            <table className="tracker-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-right">Sales</th>
                  <th className="text-right">Gross Profit</th>
                  <th className="text-right">Ad Spend</th>
                  <th className="text-right">Ad Cost (14%)</th>
                  <th className="text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {d.dailyEntries.slice(0, 10).map((entry) => (
                  <tr key={entry.date}>
                    <td className="px-3 py-2 text-[12px] text-muted-foreground">{entry.date}</td>
                    <td className="px-3 py-2 text-[12px] text-right">{formatINR(entry.totalSales)}</td>
                    <td className="px-3 py-2 text-[12px] text-right text-emerald-400">{formatINR(entry.grossProfit)}</td>
                    <td className="px-3 py-2 text-[12px] text-right text-amber-400">{formatINR(entry.adSpend)}</td>
                    <td className="px-3 py-2 text-[12px] text-right text-orange-400">{formatINR(Math.round(entry.adSpend * 1.14))}</td>
                    <td className={`px-3 py-2 text-[12px] font-medium text-right ${entry.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatINR(entry.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* COD Projections */}
      <SectionHeader title="COD Cash-In Projections" subtitle="When money hits the bank (7-day delay)" icon={<BanknoteIcon className="h-4 w-4" />} isOpen={showCOD} onToggle={() => setShowCOD(!showCOD)} />
      <AnimatePresence>
        {showCOD && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            {codWeeks.length === 0 ? (
              <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
                <Clock className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
                <p className="text-[12px] text-muted-foreground">No daily entries yet. Add daily P&L entries to see COD projections.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {codWeeks.map((week, i) => (
                  <motion.div key={week.weekLabel} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{week.weekLabel}</p>
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2">{week.startDate} <ArrowRight className="inline h-2.5 w-2.5" /> {week.endDate}</p>
                    <p className="text-xl font-semibold text-foreground"><AnimatedNumber value={week.projectedAmount} formatter={formatINR} /></p>
                    {week.projectedAmount === 0 && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />No sales data for source dates</p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Baselines */}
      <SectionHeader title="Operational Baselines" subtitle="Cost to run the business" icon={<PiggyBank className="h-4 w-4" />} isOpen={showBaselines} onToggle={() => setShowBaselines(!showBaselines)} />
      <AnimatePresence>
        {showBaselines && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <BaselineCard title="Daily Baseline" icon={<BarChart3 className="h-3.5 w-3.5 text-blue-400" />} total={d.dailyBaselineTotal} suffix="/day" color="text-blue-400" items={d.dailyBaselines} />
              <BaselineCard title="Monthly Baseline" icon={<Building2 className="h-3.5 w-3.5 text-violet-400" />} total={d.monthlyBaselineTotal} suffix="/mo" color="text-violet-400" items={d.monthlyBaselines} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, icon, color, formatter }: { label: string; value: number; icon: React.ReactNode; color: string; formatter?: (v: number) => string }) {
  const format = formatter ?? formatINR;
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="rounded-lg border border-border bg-card px-4 py-3 hover:shadow-[0_0_20px_rgba(167,139,250,0.06)] transition-shadow">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={`mt-1.5 text-2xl font-semibold ${color}`}><AnimatedNumber value={value} formatter={format} /></p>
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

function BaselineCard({ title, icon, total, suffix, color, items }: { title: string; icon: React.ReactNode; total: number; suffix: string; color: string; items: Array<{ id: string; label: string; amount: number }> }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">{icon}<h3 className="text-sm font-medium text-foreground">{title}</h3></div>
        <span className={`text-[11px] font-medium ${color}`}>{formatINR(total)}{suffix}</span>
      </div>
      <div className="p-3 space-y-1.5">
        {items.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-3">No baselines set</p>
        ) : (
          items.map((b) => (
            <div key={b.id} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent/30 transition">
              <span className="text-[12px] text-foreground">{b.label}</span>
              <span className="text-[12px] font-medium text-foreground">{formatINR(b.amount)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle, icon, isOpen, onToggle }: { title: string; subtitle: string; icon: React.ReactNode; isOpen: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 hover:bg-accent/30 transition group">
      <span className="text-primary">{icon}</span>
      <div className="flex-1 text-left">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition" /> : <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition" />}
    </button>
  );
}
