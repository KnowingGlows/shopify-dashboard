'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  RefreshCw, Loader2, DollarSign, TrendingUp, Wallet, Plus,
  AlertTriangle, BanknoteIcon, PiggyBank, BarChart3, Building2,
  Bell, X, ArrowRight, ClipboardList,
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

interface BrandCODConfig {
  codRevenue: number;
  deliveryRate: number;
}

const DEFAULT_BRANDS: Record<string, BrandCODConfig> = {
  Kairova: { codRevenue: 0, deliveryRate: 65 },
  Mavric: { codRevenue: 0, deliveryRate: 65 },
};

function loadBrandCOD(): Record<string, BrandCODConfig> {
  if (typeof window === 'undefined') return DEFAULT_BRANDS;
  try {
    const stored = localStorage.getItem('orbit-cod-config');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return DEFAULT_BRANDS;
}

function saveBrandCOD(config: Record<string, BrandCODConfig>) {
  try { localStorage.setItem('orbit-cod-config', JSON.stringify(config)); } catch { /* ignore */ }
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function FinancePage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [brandCOD, setBrandCOD] = useState<Record<string, BrandCODConfig>>(DEFAULT_BRANDS);

  useEffect(() => { setBrandCOD(loadBrandCOD()); }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, remindersRes] = await Promise.all([
        fetch('/api/finance'),
        fetch('/api/finance?action=reminders'),
      ]);
      const [summaryData, remindersData] = await Promise.all([
        summaryRes.json(), remindersRes.json(),
      ]);
      setSummary(summaryData);
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

  const updateBrandCOD = (brand: string, field: keyof BrandCODConfig, value: number) => {
    setBrandCOD((prev) => {
      const next = { ...prev, [brand]: { ...prev[brand], [field]: value } };
      saveBrandCOD(next);
      return next;
    });
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

  // COD inflow calculations
  const brandInflowTotals = Object.entries(brandCOD).map(([brand, cfg]) => {
    const inflow = Math.round(cfg.codRevenue * (cfg.deliveryRate / 100));
    return { brand, ...cfg, inflow };
  });
  const totalProjectedInflow = brandInflowTotals.reduce((s, b) => s + b.inflow, 0);

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
          <MetricCard label="Gross Profit (30d)" value={d.totalGrossProfit} icon={<TrendingUp className="h-4 w-4 text-blue-400" />} color={d.totalGrossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        </StaggerItem>
        <StaggerItem>
          <MetricCard label="Net Profit (30d)" value={d.totalNetProfit} icon={<Wallet className="h-4 w-4 text-violet-400" />} color={d.totalNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        </StaggerItem>
      </StaggerContainer>

      {/* Cost Breakdown */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">30-Day Cost Breakdown</p>
          <p className="text-[11px] text-muted-foreground">
            Daily baseline: {formatINR(d.dailyBaselineTotal)}/day · Monthly: {formatINR(d.monthlyBaselineTotal)}/mo
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <CostItem label="Ad Spend (raw)" amount={d.totalAdSpend} color="bg-amber-400" />
          <CostItem label="Ad Cost (14% inc.)" amount={actualAdCost} color="bg-orange-400" />
          <CostItem label="Other Expenses" amount={d.totalExpenses} color="bg-rose-400" />
        </div>
      </motion.div>

      {/* ═══ COD Cash-In Projections ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-primary"><BanknoteIcon className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-medium text-foreground">COD Cash-In Projections</p>
            <p className="text-[11px] text-muted-foreground">Projected money hitting the bank from delivered COD orders</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Per-brand cards */}
          {Object.entries(brandCOD).map(([brand, cfg]) => {
            const inflow = Math.round(cfg.codRevenue * (cfg.deliveryRate / 100));
            return (
              <div key={brand} className="card-hover-glow rounded-lg border border-border bg-card p-4">
                <div className="relative z-10">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">{brand}</p>
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Monthly COD Revenue</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">₹</span>
                        <input
                          type="number"
                          value={cfg.codRevenue || ''}
                          onChange={(e) => updateBrandCOD(brand, 'codRevenue', Number(e.target.value) || 0)}
                          placeholder="0"
                          className="form-input pl-7"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">COD Delivery Rate %</label>
                      <input
                        type="number"
                        value={cfg.deliveryRate || ''}
                        onChange={(e) => updateBrandCOD(brand, 'deliveryRate', Number(e.target.value) || 0)}
                        placeholder="65"
                        className="form-input"
                      />
                    </div>
                    <div className="h-px bg-border" />
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Projected Bank Deposit</p>
                      <p className="text-xl font-semibold text-emerald-400">{formatINR(inflow)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Total projected inflow */}
          <div className="card-hover-glow rounded-lg border border-primary/20 bg-primary/[0.03] p-4 flex flex-col justify-between">
            <div className="relative z-10">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">Total Projected</p>
              <div className="space-y-2">
                {brandInflowTotals.map((b) => (
                  <div key={b.brand} className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">{b.brand}</span>
                    <span className="text-[12px] font-medium text-foreground">{formatINR(b.inflow)}</span>
                  </div>
                ))}
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-foreground">Total Bank Inflow</span>
                  <span className="text-lg font-semibold text-emerald-400">{formatINR(totalProjectedInflow)}</span>
                </div>
              </div>
            </div>
            <p className="relative z-10 text-[10px] text-muted-foreground/60 mt-3 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              COD deposits arrive 7-8 days after delivery
            </p>
          </div>
        </div>
      </motion.div>

      {/* ═══ Operational Baselines ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-primary"><PiggyBank className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-medium text-foreground">Operational Baselines</p>
            <p className="text-[11px] text-muted-foreground">Cost to run the business</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <BaselineCard title="Daily Baseline" icon={<BarChart3 className="h-3.5 w-3.5 text-blue-400" />} total={d.dailyBaselineTotal} suffix="/day" color="text-blue-400" items={d.dailyBaselines} />
          <BaselineCard title="Monthly Baseline" icon={<Building2 className="h-3.5 w-3.5 text-violet-400" />} total={d.monthlyBaselineTotal} suffix="/mo" color="text-violet-400" items={d.monthlyBaselines} />
        </div>
      </motion.div>

      {/* Bottom bar - View Daily Entries */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        <Link
          href="/finance/entries"
          className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition hover:border-primary/30 hover:bg-accent/20"
        >
          <div className="flex items-center gap-3">
            <ClipboardList className="h-4 w-4 text-muted-foreground group-hover:text-primary transition" />
            <div>
              <p className="text-[13px] font-medium text-foreground">Daily Entries</p>
              <p className="text-[11px] text-muted-foreground">{d.dailyEntries.length} entries in the last 30 days</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition" />
        </Link>
      </motion.div>
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
    <div className="card-hover-glow rounded-lg border border-border bg-card">
      <div className="relative z-10 border-b border-border px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">{icon}<h3 className="text-sm font-medium text-foreground">{title}</h3></div>
        <span className={`text-[11px] font-medium ${color}`}>{formatINR(total)}{suffix}</span>
      </div>
      <div className="relative z-10 p-3 space-y-1.5">
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
