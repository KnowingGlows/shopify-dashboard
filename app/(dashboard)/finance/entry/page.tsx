'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Loader2, Plus, Save, ArrowLeft, Calculator, Megaphone,
  Receipt, PiggyBank,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';

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
  const [baselineType, setBaselineType] = useState<'daily' | 'monthly'>('daily');
  const [baselineCategory, setBaselineCategory] = useState(DAILY_BASELINE_CATEGORIES[0]);
  const [baselineLabel, setBaselineLabel] = useState('');
  const [baselineAmount, setBaselineAmount] = useState('');
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [baselineSaveStatus, setBaselineSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Expenses
  const [expCategory, setExpCategory] = useState('Operations');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(getToday());
  const [addingExpense, setAddingExpense] = useState(false);
  const [expenseSaveStatus, setExpenseSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Auto-fetch yesterday's sales
  const fetchSales = useCallback(async () => {
    setDailySalesLoading(true);
    try {
      const res = await fetch(`/api/finance?action=fetch-sales&date=${dailyDate}`);
      const data = await res.json();
      if (data.totalSales) setDailySales(String(Math.round(data.totalSales)));
    } catch { /* silently fail */ }
    finally { setDailySalesLoading(false); }
  }, [dailyDate]);

  useEffect(() => { if (dailyDate) fetchSales(); }, [dailyDate, fetchSales]);

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
    setBaselineSaveStatus('idle');
    try {
      const res = await fetch('/api/finance', {
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
      if (res.ok) {
        setBaselineLabel('');
        setBaselineAmount('');
        setBaselineSaveStatus('saved');
        setTimeout(() => setBaselineSaveStatus('idle'), 3000);
      } else {
        setBaselineSaveStatus('error');
      }
    } catch { setBaselineSaveStatus('error'); }
    finally { setSavingBaseline(false); }
  };

  const handleAddExpense = async () => {
    if (!expAmount || !expCategory) return;
    setAddingExpense(true);
    setExpenseSaveStatus('idle');
    try {
      const res = await fetch('/api/finance', {
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
      if (res.ok) {
        setExpDescription('');
        setExpAmount('');
        setExpenseSaveStatus('saved');
        setTimeout(() => setExpenseSaveStatus('idle'), 3000);
      } else {
        setExpenseSaveStatus('error');
      }
    } catch { setExpenseSaveStatus('error'); }
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

  return (
    <PageTransition className="mx-auto max-w-3xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/finance" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Enter Data</h1>
          <p className="text-[11px] text-muted-foreground">Add daily P&L, baselines & expenses</p>
        </div>
      </div>

      {/* ═══ Daily P&L Entry ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Calculator className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Daily P&L</h2>
        </div>
        <div className="p-4 space-y-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={<span className="flex items-center gap-1"><Megaphone className="h-3 w-3 text-blue-400" />Ad Spend{isCMO && <span className="text-amber-400 normal-case">(required)</span>}</span>}>
              <input type="number" value={adSpend} onChange={(e) => setAdSpend(e.target.value)} placeholder="0" className="form-input" />
            </FormField>
            <div className="flex items-end">
              <div className="rounded-lg border border-border/60 bg-background/50 px-4 py-2.5 flex-1">
                <p className="text-[10px] text-muted-foreground mb-0.5">Actual Ad Cost (14% fees)</p>
                <p className="text-[15px] font-semibold text-orange-400">{formatINR(calcActualAdCost)}</p>
              </div>
            </div>
          </div>

          {/* Compact live preview */}
          <div className="flex items-center gap-3 rounded-lg bg-background/50 border border-border/40 px-3 py-2 overflow-x-auto">
            <PreviewPill label="Gross" value={formatINR(calcGrossProfit)} />
            <span className="text-muted-foreground/30">-</span>
            <PreviewPill label="Ads" value={formatINR(calcActualAdCost)} negative />
            <span className="text-muted-foreground/30">-</span>
            <PreviewPill label="Fees" value={formatINR(calcProcessorFee)} negative />
            <span className="text-muted-foreground/30">=</span>
            <PreviewPill label="Net" value={formatINR(calcNetProfit)} highlight positive={calcNetProfit >= 0} />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleSaveDaily} disabled={savingDaily || !dailySales} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50">
              {savingDaily ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Entry
            </button>
            <StatusBadge status={dailySaveStatus} />
          </div>
        </div>
      </motion.div>

      {/* ═══ Add Baseline ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <PiggyBank className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Add Baseline</h2>
          <span className="text-[10px] text-muted-foreground ml-auto">Operational cost line items</span>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Type</label>
              <div className="inline-flex rounded-md border border-border bg-background p-0.5">
                <button onClick={() => { setBaselineType('daily'); setBaselineCategory(DAILY_BASELINE_CATEGORIES[0]); }} className={`rounded px-2.5 py-1.5 text-[11px] font-medium transition ${baselineType === 'daily' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}>Daily</button>
                <button onClick={() => { setBaselineType('monthly'); setBaselineCategory(MONTHLY_BASELINE_CATEGORIES[0]); }} className={`rounded px-2.5 py-1.5 text-[11px] font-medium transition ${baselineType === 'monthly' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}>Monthly</button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Category</label>
              <select value={baselineCategory} onChange={(e) => setBaselineCategory(e.target.value)} className="form-input h-[34px]">
                {(baselineType === 'daily' ? DAILY_BASELINE_CATEGORIES : MONTHLY_BASELINE_CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Label</label>
              <input type="text" value={baselineLabel} onChange={(e) => setBaselineLabel(e.target.value)} placeholder="e.g. Shiprocket" className="form-input" />
            </div>
            <div className="flex flex-col gap-1.5 w-28">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</label>
              <input type="number" value={baselineAmount} onChange={(e) => setBaselineAmount(e.target.value)} placeholder="0" className="form-input" />
            </div>
            <button onClick={handleSaveBaseline} disabled={savingBaseline || !baselineAmount} className="inline-flex h-[34px] items-center gap-1 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50">
              {savingBaseline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Add
            </button>
            <StatusBadge status={baselineSaveStatus} />
          </div>
        </div>
      </motion.div>

      {/* ═══ Add Expense ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Receipt className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Add Expense</h2>
          <span className="text-[10px] text-muted-foreground ml-auto">One-off or irregular costs</span>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Category</label>
              <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)} className="form-input h-[34px]">
                {EXPENSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Description</label>
              <input type="text" value={expDescription} onChange={(e) => setExpDescription(e.target.value)} placeholder="What was this for?" className="form-input" />
            </div>
            <div className="flex flex-col gap-1.5 w-28">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</label>
              <input type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="0" className="form-input" />
            </div>
            <div className="flex flex-col gap-1.5 w-36">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Date</label>
              <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className="form-input" />
            </div>
            <button onClick={handleAddExpense} disabled={addingExpense || !expAmount} className="inline-flex h-[34px] items-center gap-1 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50">
              {addingExpense ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Add
            </button>
            <StatusBadge status={expenseSaveStatus} />
          </div>
        </div>
      </motion.div>
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

function PreviewPill({ label, value, negative, highlight, positive }: { label: string; value: string; negative?: boolean; highlight?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-[12px] font-semibold font-mono ${
        highlight ? (positive ? 'text-emerald-400' : 'text-red-400') :
        negative ? 'text-orange-400/80' : 'text-foreground'
      }`}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: 'idle' | 'saved' | 'error' }) {
  return (
    <AnimatePresence>
      {status === 'saved' && (
        <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-emerald-400">Saved</motion.span>
      )}
      {status === 'error' && (
        <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-red-400">Failed</motion.span>
      )}
    </AnimatePresence>
  );
}
