'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Loader2, Save, ArrowLeft, Calendar, Trash2,
  BanknoteIcon, CreditCard, TrendingUp, Receipt, Repeat,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';
import { DatePicker } from '@/components/date-picker';
import { useAuth } from '@/components/auth-provider';
import { formatINR } from '@/lib/currency-converter';

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

const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

function getCategoryLabel(value: string): string {
  return ALL_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

interface EntryItem {
  id: string;
  type: 'income' | 'expense';
  category: string;
  description?: string;
  amount: number;
  date: string;
  endDate?: string;
  recurring?: boolean;
  createdAt?: string;
}

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

  // Entries list
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/finance?action=combined&range=90d');
      const data = await res.json();
      const items: EntryItem[] = [];
      for (const inc of (data.income ?? [])) {
        items.push({ id: inc.id, type: 'income', category: inc.category, description: inc.description, amount: inc.amount, date: inc.date, endDate: inc.endDate, createdAt: inc.createdAt });
      }
      for (const exp of (data.expenses ?? [])) {
        items.push({ id: exp.id, type: 'expense', category: exp.category, description: exp.description, amount: exp.amount, date: exp.date, endDate: exp.endDate, recurring: exp.recurring, createdAt: exp.createdAt });
      }
      items.sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date));
      setEntries(items);
    } catch { /* silently fail */ }
    finally { setLoadingEntries(false); }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

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
        const data = await res.json();
        setIncomeStatus('saved');
        // Add to local list
        if (data.income) {
          setEntries((prev) => [{ id: data.income.id, type: 'income', category: data.income.category, description: data.income.description, amount: data.income.amount, date: data.income.date, endDate: data.income.endDate, createdAt: data.income.createdAt }, ...prev]);
        }
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
        const data = await res.json();
        setExpenseStatus('saved');
        if (data.expense) {
          setEntries((prev) => [{ id: data.expense.id, type: 'expense', category: data.expense.category, description: data.expense.description, amount: data.expense.amount, date: data.expense.date, recurring: data.expense.recurring, createdAt: data.expense.createdAt }, ...prev]);
        }
        setExpenseDescription('');
        setExpenseAmount('');
        setExpenseRecurring(false);
        setTimeout(() => setExpenseStatus('idle'), 3000);
      } else setExpenseStatus('error');
    } catch { setExpenseStatus('error'); }
    finally { setSavingExpense(false); }
  };

  const handleDeleteEntry = async (entry: EntryItem) => {
    if (!confirm(`Delete this ${entry.type} entry? (${getCategoryLabel(entry.category)} - ${formatINR(entry.amount)})`)) return;
    setDeletingId(entry.id);
    try {
      const action = entry.type === 'income' ? 'delete-income' : 'delete-expense';
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: entry.id }),
      });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      }
    } catch { /* silently fail */ }
    finally { setDeletingId(null); }
  };

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Filter entries by active tab
  const filteredEntries = entries.filter((e) => e.type === activeTab);

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

      {/* ── Recent Entries ──────────────────────────────────────────────────── */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Recent {activeTab === 'income' ? 'Income' : 'Expense'} Entries
          </p>
          <span className="text-[10px] text-muted-foreground/40 tabular-nums">
            {filteredEntries.length} entr{filteredEntries.length === 1 ? 'y' : 'ies'}
          </span>
        </div>

        {loadingEntries ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-dashed border-border/40 bg-card/30 py-10 text-center"
          >
            <p className="text-[12px] text-muted-foreground/40">No {activeTab} entries yet</p>
          </motion.div>
        ) : (
          <StaggerContainer className="space-y-2">
            {filteredEntries.map((entry) => (
              <StaggerItem key={entry.id}>
                <motion.div
                  layout
                  className="group flex items-center gap-3 rounded-xl border border-border/30 bg-card/40 px-4 py-3 hover:bg-card/60 transition"
                >
                  {/* Color dot */}
                  <div className={`h-2 w-2 rounded-full shrink-0 ${entry.type === 'income' ? 'bg-emerald-400' : 'bg-red-400'}`} />

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-foreground">{getCategoryLabel(entry.category)}</span>
                      {entry.recurring && (
                        <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">recurring</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground/50">{entry.date}</span>
                      {entry.endDate && entry.endDate !== entry.date && (
                        <span className="text-[11px] text-muted-foreground/40">to {entry.endDate}</span>
                      )}
                      {entry.description && (
                        <>
                          <span className="text-muted-foreground/20">·</span>
                          <span className="text-[11px] text-muted-foreground/40 truncate">{entry.description}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <span className={`text-[13px] font-semibold tabular-nums shrink-0 ${entry.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {entry.type === 'income' ? '+' : '-'}{formatINR(entry.amount)}
                  </span>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteEntry(entry)}
                    disabled={deletingId === entry.id}
                    className="rounded-lg p-1.5 text-muted-foreground/30 hover:text-red-400 hover:bg-red-400/10 transition opacity-0 group-hover:opacity-100 disabled:opacity-50 shrink-0"
                  >
                    {deletingId === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </div>
    </PageTransition>
  );
}
