'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Loader2, Plus, Save, ArrowLeft, Calculator, Megaphone,
  Receipt, PiggyBank, BarChart3, Building2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

function getYesterday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - 86400000));
}

function getToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

const DAILY_BASELINE_CATEGORIES = ['Ad Spend', 'Payment Processing (3%)', 'Returns/RTO', 'Other Daily'];
const MONTHLY_BASELINE_CATEGORIES = ['Inventory', 'Salaries', 'Subscriptions & Tools', 'Rent/Office', 'Other Monthly'];
const EXPENSE_CATEGORIES = ['Operations', 'Marketing', 'Shipping', 'Returns', 'Tools/Software', 'Other'];

// ── Main Component ───────────────────────────────────────────────────────────

export default function FinanceEntryPage() {
  const { user } = useAuth();
  const isCMO = user?.role === 'cmo';

  // Daily entry form
  const [dailyDate, setDailyDate] = useState(getYesterday());
  const [dailySales, setDailySales] = useState('');
  const [dailySalesLoading, setDailySalesLoading] = useState(false);
  const [grossMargin, setGrossMargin] = useState('55');
  const [adSpend, setAdSpend] = useState('');
  const [savingDaily, setSavingDaily] = useState(false);
  const [dailySaveStatus, setDailySaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Baselines
  const [dailyBaselines, setDailyBaselines] = useState<Baseline[]>([]);
  const [monthlyBaselines, setMonthlyBaselines] = useState<Baseline[]>([]);
  const [baselineType, setBaselineType] = useState<'daily' | 'monthly'>('daily');
  const [baselineCategory, setBaselineCategory] = useState(DAILY_BASELINE_CATEGORIES[0]);
  const [baselineLabel, setBaselineLabel] = useState('');
  const [baselineAmount, setBaselineAmount] = useState('');
  const [savingBaseline, setSavingBaseline] = useState(false);

  // Expenses
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [expCategory, setExpCategory] = useState('Operations');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(getToday());
  const [addingExpense, setAddingExpense] = useState(false);

  // Section states
  const [showBaselines, setShowBaselines] = useState(true);
  const [showExpenses, setShowExpenses] = useState(false);

  const [loading, setLoading] = useState(true);

  // Fetch existing data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/finance');
      const data = await res.json();
      setDailyBaselines(data.dailyBaselines ?? []);
      setMonthlyBaselines(data.monthlyBaselines ?? []);
      setRecentExpenses(data.recentExpenses ?? []);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-fetch yesterday's sales
  const fetchSales = async () => {
    setDailySalesLoading(true);
    try {
      const res = await fetch(`/api/finance?action=fetch-sales&date=${dailyDate}`);
      const data = await res.json();
      if (data.totalSales) setDailySales(String(Math.round(data.totalSales)));
    } catch { /* silently fail */ }
    finally { setDailySalesLoading(false); }
  };

  useEffect(() => { if (dailyDate) fetchSales(); }, [dailyDate]);

  // Handlers
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
          roas: 0,
          shippingCost: 0,
          enteredBy: user?.email ?? '',
        }),
      });
      if (res.ok) {
        setDailySaveStatus('saved');
        setTimeout(() => setDailySaveStatus('idle'), 3000);
      } else {
        setDailySaveStatus('error');
      }
    } catch { setDailySaveStatus('error'); }
    finally { setSavingDaily(false); }
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
      fetchData();
    } catch { /* silently fail */ }
    finally { setSavingBaseline(false); }
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
      fetchData();
    } catch { /* silently fail */ }
    finally { setAddingExpense(false); }
  };

  // Live calculations
  const calcTotalSales = Number(dailySales) || 0;
  const calcGrossMargin = (Number(grossMargin) || 0) / 100;
  const calcGrossProfit = calcTotalSales * calcGrossMargin;
  const calcAdSpend = Number(adSpend) || 0;
  const calcActualAdCost = Math.round(calcAdSpend * 1.14);
  const calcProcessorFee = Math.round(calcTotalSales * 0.03);
  const calcNetProfit = calcGrossProfit - calcActualAdCost - calcProcessorFee;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageTransition className="mx-auto max-w-5xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/finance" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Finance Entry</h1>
          <p className="text-[11px] text-muted-foreground">Daily P&L, baselines & expenses</p>
        </div>
      </div>

      {/* ═══ Daily P&L Entry ═══ */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Calculator className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Daily P&L Entry</h2>
        </div>
        <div className="p-4 space-y-4">
          {/* Row 1: Date + Sales + Margin */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Date">
              <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="form-input" />
            </FormField>
            <FormField label="Total Sales (auto-fetched)">
              <div className="relative">
                <input type="number" value={dailySales} onChange={(e) => setDailySales(e.target.value)} placeholder="0" className="form-input pr-10" />
                {dailySalesLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-primary" />}
              </div>
            </FormField>
            <FormField label="Gross Margin %">
              <input type="number" value={grossMargin} onChange={(e) => setGrossMargin(e.target.value)} placeholder="55" className="form-input" />
            </FormField>
          </div>

          {/* Row 2: Ad Spend */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={<span className="flex items-center gap-1"><Megaphone className="h-3 w-3 text-blue-400" />Ad Spend (raw){isCMO && <span className="text-amber-400">(required)</span>}</span>}>
              <input type="number" value={adSpend} onChange={(e) => setAdSpend(e.target.value)} placeholder="0" className="form-input" />
            </FormField>
            <div className="flex items-end">
              <div className="rounded-lg border border-border/60 bg-background/50 px-4 py-2.5 flex-1">
                <p className="text-[10px] text-muted-foreground mb-0.5">Actual Ad Cost (14% platform fees)</p>
                <p className="text-[15px] font-semibold text-orange-400">{formatINR(calcActualAdCost)}</p>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="rounded-lg border border-border/60 bg-background/50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Live P&L Preview</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MiniStat label="Gross Profit" value={calcGrossProfit} positive={calcGrossProfit > 0} />
              <MiniStat label="Ad Cost (14%)" value={-calcActualAdCost} positive={false} prefix="-" />
              <MiniStat label="Processor (3%)" value={-calcProcessorFee} positive={false} prefix="-" />
              <MiniStat label="Net Profit" value={calcNetProfit} positive={calcNetProfit > 0} highlight />
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button onClick={handleSaveDaily} disabled={savingDaily || !dailySales} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50">
              {savingDaily ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Entry
            </button>
            <AnimatePresence>
              {dailySaveStatus === 'saved' && (
                <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-emerald-400">Saved successfully</motion.span>
              )}
              {dailySaveStatus === 'error' && (
                <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-red-400">Failed to save</motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ═══ Operational Baselines ═══ */}
      <SectionHeader title="Operational Baselines" subtitle="Cost to run the business" icon={<PiggyBank className="h-4 w-4" />} isOpen={showBaselines} onToggle={() => setShowBaselines(!showBaselines)} />
      <AnimatePresence>
        {showBaselines && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <BaselineList title="Daily" icon={<BarChart3 className="h-3.5 w-3.5 text-blue-400" />} items={dailyBaselines} total={dailyBaselines.reduce((s, b) => s + b.amount, 0)} suffix="/day" color="text-blue-400" />
              <BaselineList title="Monthly" icon={<Building2 className="h-3.5 w-3.5 text-violet-400" />} items={monthlyBaselines} total={monthlyBaselines.reduce((s, b) => s + b.amount, 0)} suffix="/mo" color="text-violet-400" />
            </div>

            {/* Add Baseline */}
            <div className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-end gap-2 px-4 py-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Type</label>
                  <div className="inline-flex rounded-md border border-border bg-background p-0.5">
                    <button onClick={() => { setBaselineType('daily'); setBaselineCategory(DAILY_BASELINE_CATEGORIES[0]); }} className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${baselineType === 'daily' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}>Daily</button>
                    <button onClick={() => { setBaselineType('monthly'); setBaselineCategory(MONTHLY_BASELINE_CATEGORIES[0]); }} className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${baselineType === 'monthly' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}>Monthly</button>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Category</label>
                  <select value={baselineCategory} onChange={(e) => setBaselineCategory(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground">
                    {(baselineType === 'daily' ? DAILY_BASELINE_CATEGORIES : MONTHLY_BASELINE_CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Label</label>
                  <input type="text" value={baselineLabel} onChange={(e) => setBaselineLabel(e.target.value)} placeholder="e.g. Shiprocket" className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/40" />
                </div>
                <div className="flex flex-col gap-1 w-28">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</label>
                  <input type="number" value={baselineAmount} onChange={(e) => setBaselineAmount(e.target.value)} placeholder="0" className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/40" />
                </div>
                <button onClick={handleSaveBaseline} disabled={savingBaseline || !baselineAmount} className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50">
                  {savingBaseline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Add
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Manual Expenses ═══ */}
      <SectionHeader title="Manual Expenses" subtitle="One-off or irregular costs" icon={<Receipt className="h-4 w-4" />} isOpen={showExpenses} onToggle={() => setShowExpenses(!showExpenses)} />
      <AnimatePresence>
        {showExpenses && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Add form */}
            <div className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Category</label>
                <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground">
                  {EXPENSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Description</label>
                <input type="text" value={expDescription} onChange={(e) => setExpDescription(e.target.value)} placeholder="What was this for?" className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/40" />
              </div>
              <div className="flex flex-col gap-1 w-28">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</label>
                <input type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="0" className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/40" />
              </div>
              <div className="flex flex-col gap-1 w-36">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Date</label>
                <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground" />
              </div>
              <button onClick={handleAddExpense} disabled={addingExpense || !expAmount} className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50">
                {addingExpense ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Add
              </button>
            </div>

            {/* List */}
            {recentExpenses.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No expenses recorded yet.</p>
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
                  {recentExpenses.map((exp) => (
                    <tr key={exp.id}>
                      <td className="px-3 py-2 text-[12px] text-muted-foreground">{exp.date}</td>
                      <td className="px-3 py-2 text-[12px]"><span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium">{exp.category}</span></td>
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

function FormField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function MiniStat({ label, value, positive, highlight, prefix }: { label: string; value: number; positive: boolean; highlight?: boolean; prefix?: string }) {
  return (
    <div className={`rounded-md px-2.5 py-1.5 ${highlight ? 'border border-border bg-card' : ''}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-[13px] font-semibold ${highlight ? (positive ? 'text-emerald-400' : 'text-red-400') : 'text-foreground'}`}>
        {prefix}{formatINR(Math.abs(value))}
      </p>
    </div>
  );
}

function BaselineList({ title, icon, items, total, suffix, color }: { title: string; icon: React.ReactNode; items: Baseline[]; total: number; suffix: string; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">{icon}<h3 className="text-sm font-medium text-foreground">{title} Baseline</h3></div>
        <span className={`text-[11px] font-medium ${color}`}>{formatINR(total)}{suffix}</span>
      </div>
      <div className="p-3 space-y-1.5">
        {items.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-3">No {title.toLowerCase()} baselines set</p>
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
