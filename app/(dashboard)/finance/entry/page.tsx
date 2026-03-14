'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Loader2, Save, ArrowLeft, Plus, X,
  BanknoteIcon, CreditCard, TrendingUp, Receipt,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { formatINR } from '@/lib/currency-converter';

// ── Types & Helpers ──────────────────────────────────────────────────────────

function getYesterday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - 86400000));
}

function getToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

const INCOME_CATEGORIES = [
  { value: 'cod-deposit', label: 'COD Deposit Received', icon: '💰' },
  { value: 'prepaid-settlement', label: 'Prepaid Settlement', icon: '💳' },
  { value: 'affiliate', label: 'Affiliate Income', icon: '🤝' },
  { value: 'refund-received', label: 'Refund Received', icon: '↩️' },
  { value: 'cashback', label: 'Cashback / Reward', icon: '🎁' },
  { value: 'loan-received', label: 'Loan / Credit', icon: '🏦' },
  { value: 'investment', label: 'Investment Inflow', icon: '📈' },
  { value: 'marketplace', label: 'Marketplace Payout', icon: '🛒' },
  { value: 'reimbursement', label: 'Reimbursement', icon: '📋' },
  { value: 'other-income', label: 'Other', icon: '•' },
];

const EXPENSE_CATEGORIES = [
  { value: 'inventory', label: 'Inventory / COGS', icon: '📦' },
  { value: 'supplier', label: 'Supplier Payment', icon: '🏭' },
  { value: 'shipping', label: 'Shipping / Logistics', icon: '🚚' },
  { value: 'marketing', label: 'Marketing / Ads', icon: '📣' },
  { value: 'returns', label: 'Returns / RTO', icon: '↩️' },
  { value: 'tools', label: 'Tools / Software', icon: '🔧' },
  { value: 'freelance', label: 'Freelance / Services', icon: '👤' },
  { value: 'other', label: 'Other', icon: '•' },
];

// ── Main Component ───────────────────────────────────────────────────────────

export default function ActualEntryPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'income' | 'expense'>('income');
  const [date, setDate] = useState(getYesterday());

  // Income form state
  const [incomeCategory, setIncomeCategory] = useState('cod-deposit');
  const [incomeDescription, setIncomeDescription] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeEndDate, setIncomeEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [incomeStatus, setIncomeStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Expense form state
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

  return (
    <PageTransition className="mx-auto max-w-3xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/finance" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">Daily Entry</h1>
          <p className="text-[11px] text-muted-foreground">Record actual money in and money out</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="form-input text-[12px] py-1.5"
        />
      </div>

      {/* Tab Switch */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        <button
          onClick={() => setActiveTab('income')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-[12px] font-medium transition ${
            activeTab === 'income'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          Money In
        </button>
        <button
          onClick={() => setActiveTab('expense')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-[12px] font-medium transition ${
            activeTab === 'expense'
              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Receipt className="h-3.5 w-3.5" />
          Money Out
        </button>
      </div>

      {/* ═══ Money In Form ═══ */}
      <AnimatePresence mode="wait">
        {activeTab === 'income' && (
          <motion.div
            key="income"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-500/15">
              <BanknoteIcon className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-foreground">Record Income</h2>
            </div>
            <div className="p-4 space-y-4">
              {/* Category */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Source</label>
                <div className="flex flex-wrap gap-1.5">
                  {INCOME_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setIncomeCategory(cat.value)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition border ${
                        incomeCategory === cat.value
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'text-muted-foreground border-border hover:border-border/80 hover:text-foreground'
                      }`}
                    >
                      <span className="mr-1">{cat.icon}</span>{cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Description</label>
                <input
                  type="text"
                  value={incomeDescription}
                  onChange={(e) => setIncomeDescription(e.target.value)}
                  placeholder="e.g. Kairova COD deposit for March week 1"
                  className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:border-emerald-500/50 focus:outline-none transition"
                />
              </div>

              {/* Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Amount (₹)</label>
                  <input
                    type="number"
                    value={incomeAmount}
                    onChange={(e) => setIncomeAmount(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground tabular-nums placeholder:text-muted-foreground/40 focus:border-emerald-500/50 focus:outline-none transition"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground focus:border-emerald-500/50 focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Date range toggle */}
              <div>
                <button
                  onClick={() => setIsRange(!isRange)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition border ${
                    isRange ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Date range income
                </button>
                <AnimatePresence>
                  {isRange && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="mt-3">
                        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">End Date</label>
                        <input
                          type="date"
                          value={incomeEndDate}
                          onChange={(e) => setIncomeEndDate(e.target.value)}
                          min={date}
                          className="w-full max-w-[200px] rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground focus:border-emerald-500/50 focus:outline-none transition"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Save */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSaveIncome}
                  disabled={savingIncome || !incomeAmount}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-[12px] font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-40"
                >
                  {savingIncome ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Income
                </button>
                <AnimatePresence>
                  {incomeStatus === 'saved' && (
                    <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-emerald-400">Saved</motion.span>
                  )}
                  {incomeStatus === 'error' && (
                    <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-red-400">Failed</motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ Money Out Form ═══ */}
        {activeTab === 'expense' && (
          <motion.div
            key="expense"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-red-500/15">
              <Receipt className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-foreground">Record Expense</h2>
            </div>
            <div className="p-4 space-y-4">
              {/* Category */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setExpenseCategory(cat.value)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition border ${
                        expenseCategory === cat.value
                          ? 'bg-red-500/15 text-red-400 border-red-500/30'
                          : 'text-muted-foreground border-border hover:border-border/80 hover:text-foreground'
                      }`}
                    >
                      <span className="mr-1">{cat.icon}</span>{cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Description</label>
                <input
                  type="text"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  placeholder="e.g. Supplier payment for new stock"
                  className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:border-red-500/50 focus:outline-none transition"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Amount (₹)</label>
                <input
                  type="number"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="0"
                  className="w-full max-w-xs rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground tabular-nums placeholder:text-muted-foreground/40 focus:border-red-500/50 focus:outline-none transition"
                />
              </div>

              {/* Recurring toggle */}
              <div>
                <button
                  onClick={() => setExpenseRecurring(!expenseRecurring)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition border ${
                    expenseRecurring
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  <Receipt className="h-3.5 w-3.5" />
                  Recurring monthly
                </button>
                <AnimatePresence>
                  {expenseRecurring && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 text-[10px] text-amber-400/70"
                    >
                      This expense will repeat on the {new Date(date + 'T00:00:00').getDate()}{['st','nd','rd'][new Date(date + 'T00:00:00').getDate() % 10 - 1] ?? 'th'} of every month.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Save */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSaveExpense}
                  disabled={savingExpense || !expenseAmount}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-5 py-2.5 text-[12px] font-semibold text-white hover:bg-red-500 transition disabled:opacity-40"
                >
                  {savingExpense ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Expense
                </button>
                <AnimatePresence>
                  {expenseStatus === 'saved' && (
                    <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-emerald-400">Saved</motion.span>
                  )}
                  {expenseStatus === 'error' && (
                    <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-red-400">Failed</motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
