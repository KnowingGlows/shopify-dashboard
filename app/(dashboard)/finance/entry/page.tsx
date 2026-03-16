'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Loader2, Save, ArrowLeft, Calendar,
  BanknoteIcon, CreditCard, TrendingUp, Receipt, Repeat,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { DatePicker } from '@/components/date-picker';
import { useAuth } from '@/components/auth-provider';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getYesterday(): string {
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const d = new Date(todayIST + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

const INCOME_CATEGORIES = [
  { value: 'cod-deposit', label: 'COD Deposit', icon: BanknoteIcon, color: 'emerald' },
  { value: 'prepaid-settlement', label: 'Prepaid Settlement', icon: CreditCard, color: 'blue' },
  { value: 'affiliate', label: 'Affiliate', icon: TrendingUp, color: 'violet' },
  { value: 'refund-received', label: 'Refund', icon: Receipt, color: 'amber' },
  { value: 'loan-received', label: 'Loan / Credit', icon: BanknoteIcon, color: 'cyan' },
  { value: 'marketplace', label: 'Marketplace', icon: CreditCard, color: 'pink' },
  { value: 'other-income', label: 'Other', icon: Receipt, color: 'zinc' },
];

const EXPENSE_CATEGORIES = [
  { value: 'inventory', label: 'Inventory / COGS', icon: Receipt, color: 'orange' },
  { value: 'supplier', label: 'Supplier Payment', icon: BanknoteIcon, color: 'rose' },
  { value: 'shipping', label: 'Shipping', icon: Receipt, color: 'sky' },
  { value: 'marketing', label: 'Marketing / Ads', icon: TrendingUp, color: 'violet' },
  { value: 'returns', label: 'Returns / RTO', icon: Receipt, color: 'red' },
  { value: 'tools', label: 'Tools / Software', icon: CreditCard, color: 'cyan' },
  { value: 'freelance', label: 'Freelance', icon: BanknoteIcon, color: 'blue' },
  { value: 'other', label: 'Other', icon: Receipt, color: 'zinc' },
];

// ── Main Component ───────────────────────────────────────────────────────────

export default function ActualEntryPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'income' | 'expense'>('income');
  const [date, setDate] = useState(getYesterday());

  // Income form
  const [incomeCategory, setIncomeCategory] = useState('cod-deposit');
  const [incomeDescription, setIncomeDescription] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeEndDate, setIncomeEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [incomeStatus, setIncomeStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Expense form
  const [expenseCategory, setExpenseCategory] = useState('inventory');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseRecurring, setExpenseRecurring] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseStatus, setExpenseStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const handleSaveIncome = async () => {
    if (!incomeAmount || !incomeCategory) return;
    setSavingIncome(true);
    setIncomeStatus('idle');
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-income',
          category: incomeCategory,
          description: incomeDescription,
          amount: Number(incomeAmount),
          date,
          endDate: isRange && incomeEndDate ? incomeEndDate : undefined,
          enteredBy: user?.email ?? '',
        }),
      });
      if (res.ok) {
        setIncomeStatus('saved');
        setIncomeDescription('');
        setIncomeAmount('');
        setIncomeEndDate('');
        setIsRange(false);
        setTimeout(() => setIncomeStatus('idle'), 3000);
      } else setIncomeStatus('error');
    } catch { setIncomeStatus('error'); }
    finally { setSavingIncome(false); }
  };

  const handleSaveExpense = async () => {
    if (!expenseAmount || !expenseCategory) return;
    setSavingExpense(true);
    setExpenseStatus('idle');
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-expense',
          category: expenseCategory,
          description: expenseDescription,
          amount: Number(expenseAmount),
          date,
          recurring: expenseRecurring || undefined,
        }),
      });
      if (res.ok) {
        setExpenseStatus('saved');
        setExpenseDescription('');
        setExpenseAmount('');
        setExpenseRecurring(false);
        setTimeout(() => setExpenseStatus('idle'), 3000);
      } else setExpenseStatus('error');
    } catch { setExpenseStatus('error'); }
    finally { setSavingExpense(false); }
  };

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <PageTransition className="mx-auto max-w-5xl px-5 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/finance" className="rounded-xl p-2 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-foreground">Daily Entry</h1>
          <p className="text-[11px] text-muted-foreground/60">Record actual money in &amp; out</p>
        </div>
        <DatePicker
          value={date}
          onChange={(d) => setDate(d)}
          compact
        />
      </div>

      {/* Date chip */}
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[11px] font-medium text-primary">
          {dateLabel}
        </span>
      </div>

      {/* Tab Switch */}
      <div className="relative flex items-center rounded-2xl border border-border/50 bg-card/50 p-1 backdrop-blur-sm">
        <motion.div
          layout
          className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-xl transition-colors duration-200 ${
            activeTab === 'income' ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'
          }`}
          animate={{ left: activeTab === 'income' ? 4 : '50%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
        <button
          onClick={() => setActiveTab('income')}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold transition ${
            activeTab === 'income' ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Money In
        </button>
        <button
          onClick={() => setActiveTab('expense')}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold transition ${
            activeTab === 'expense' ? 'text-red-400' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Receipt className="h-4 w-4" />
          Money Out
        </button>
      </div>

      {/* Forms */}
      <AnimatePresence mode="wait">
        {activeTab === 'income' ? (
          <motion.div
            key="income"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
          >
            {/* Category Grid */}
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-3">Income Source</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {INCOME_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = incomeCategory === cat.value;
                  return (
                    <button
                      key={cat.value}
                      onClick={() => setIncomeCategory(cat.value)}
                      className={`group relative flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-center transition-all border ${
                        isActive
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-500/10'
                          : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent/5'
                      }`}
                    >
                      <Icon className={`h-4 w-4 transition ${isActive ? 'text-emerald-400' : 'text-muted-foreground/50 group-hover:text-foreground'}`} />
                      <span className="text-[10px] font-medium leading-tight">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount & Description */}
            <div className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur-sm">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 block">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-semibold text-emerald-400/60">₹</span>
                    <input
                      type="number"
                      value={incomeAmount}
                      onChange={(e) => setIncomeAmount(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-border/40 bg-background/40 pl-10 pr-4 py-3.5 text-[20px] font-semibold text-foreground tabular-nums placeholder:text-muted-foreground/20 focus:border-emerald-500/40 focus:outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 block">Description (optional)</label>
                  <input
                    type="text"
                    value={incomeDescription}
                    onChange={(e) => setIncomeDescription(e.target.value)}
                    placeholder="e.g. Kairova COD deposit for March week 1"
                    className="w-full rounded-xl border border-border/40 bg-background/40 px-4 py-3.5 text-[13px] text-foreground placeholder:text-muted-foreground/30 focus:border-emerald-500/40 focus:outline-none transition"
                  />
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsRange(!isRange)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[11px] font-medium transition border ${
                  isRange ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'text-muted-foreground/60 border-border/40 hover:text-foreground hover:border-border'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Date range
              </button>
            </div>
            <AnimatePresence>
              {isRange && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/60 p-3">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <span className="text-[11px] text-muted-foreground/60">End date</span>
                    <DatePicker
                      value={incomeEndDate}
                      onChange={(d) => setIncomeEndDate(d)}
                      min={date}
                      compact
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Save */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveIncome}
                disabled={savingIncome || !incomeAmount}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-[13px] font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 hover:shadow-emerald-500/30 active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
              >
                {savingIncome ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Income
              </button>
              <AnimatePresence>
                {incomeStatus === 'saved' && (
                  <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-[12px] font-medium text-emerald-400">Saved successfully</motion.span>
                )}
                {incomeStatus === 'error' && (
                  <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-[12px] font-medium text-red-400">Failed to save</motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="expense"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
          >
            {/* Category Grid */}
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-3">Expense Category</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {EXPENSE_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = expenseCategory === cat.value;
                  return (
                    <button
                      key={cat.value}
                      onClick={() => setExpenseCategory(cat.value)}
                      className={`group relative flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-center transition-all border ${
                        isActive
                          ? 'bg-red-500/10 border-red-500/30 text-red-400 shadow-sm shadow-red-500/10'
                          : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent/5'
                      }`}
                    >
                      <Icon className={`h-4 w-4 transition ${isActive ? 'text-red-400' : 'text-muted-foreground/50 group-hover:text-foreground'}`} />
                      <span className="text-[10px] font-medium leading-tight">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount & Description */}
            <div className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur-sm">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 block">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-semibold text-red-400/60">₹</span>
                    <input
                      type="number"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-border/40 bg-background/40 pl-10 pr-4 py-3.5 text-[20px] font-semibold text-foreground tabular-nums placeholder:text-muted-foreground/20 focus:border-red-500/40 focus:outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 block">Description (optional)</label>
                  <input
                    type="text"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    placeholder="e.g. Supplier payment for new stock"
                    className="w-full rounded-xl border border-border/40 bg-background/40 px-4 py-3.5 text-[13px] text-foreground placeholder:text-muted-foreground/30 focus:border-red-500/40 focus:outline-none transition"
                  />
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpenseRecurring(!expenseRecurring)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[11px] font-medium transition border ${
                  expenseRecurring
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'text-muted-foreground/60 border-border/40 hover:text-foreground hover:border-border'
                }`}
              >
                <Repeat className="h-3.5 w-3.5" />
                Recurring monthly
              </button>
            </div>
            <AnimatePresence>
              {expenseRecurring && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5">
                    <Repeat className="h-3.5 w-3.5 text-amber-400/60" />
                    <p className="text-[11px] text-amber-400/70">
                      Repeats on the {new Date(date + 'T00:00:00').getDate()}{['st','nd','rd'][(new Date(date + 'T00:00:00').getDate() % 10) - 1] ?? 'th'} of every month
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Save */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveExpense}
                disabled={savingExpense || !expenseAmount}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-[13px] font-semibold text-white shadow-lg shadow-red-600/20 transition-all hover:bg-red-500 hover:shadow-red-500/30 active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
              >
                {savingExpense ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Expense
              </button>
              <AnimatePresence>
                {expenseStatus === 'saved' && (
                  <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-[12px] font-medium text-emerald-400">Saved successfully</motion.span>
                )}
                {expenseStatus === 'error' && (
                  <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-[12px] font-medium text-red-400">Failed to save</motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
