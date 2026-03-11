'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Trash2, Receipt, Check,
  Pencil, X, Plus, Calendar, Search,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';
import { formatINR } from '@/lib/currency-converter';

// ── Types ────────────────────────────────────────────────────────────────────

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  endDate?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  { value: 'inventory', label: 'Inventory / COGS', icon: '📦' },
  { value: 'supplier', label: 'Supplier Payment', icon: '🏭' },
  { value: 'shipping', label: 'Shipping / Logistics', icon: '🚚' },
  { value: 'product-testing', label: 'Product Testing', icon: '🧪' },
  { value: 'marketing', label: 'Marketing / Ads', icon: '📣' },
  { value: 'returns', label: 'Returns / RTO', icon: '↩️' },
  { value: 'packaging', label: 'Packaging / Labels', icon: '📋' },
  { value: 'freelance', label: 'Freelance / Services', icon: '👤' },
  { value: 'tools', label: 'Tools / Software', icon: '🔧' },
  { value: 'travel', label: 'Travel / Transport', icon: '✈️' },
  { value: 'other', label: 'Other', icon: '•' },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]));

function getToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function getMonthOptions(): Array<{ value: string; label: string }> {
  const months: Array<{ value: string; label: string }> = [{ value: 'all', label: 'All time' }];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    months.push({ value, label });
  }
  return months;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ExpenditurePage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingExpense, setEditingExpense] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const fetchExpenses = useCallback(async () => {
    try {
      const res = await fetch('/api/finance?action=expenses');
      const data = await res.json();
      setExpenses(data.expenses ?? []);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const deleteExpense = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-expense', id }),
      });
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch { /* silently fail */ }
    finally { setDeletingId(null); }
  };

  const startEdit = (exp: Expense) => {
    setEditingExpense(exp.id);
    setEditAmount(String(exp.amount));
    setEditDesc(exp.description);
  };

  const saveEdit = async (exp: Expense) => {
    const updated = { ...exp, amount: Number(editAmount) || exp.amount, description: editDesc || exp.description };
    setExpenses((prev) => prev.map((e) => e.id === exp.id ? updated : e));
    setEditingExpense(null);
    await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-expense', ...updated }),
    }).catch(() => {});
  };

  const handleAddExpense = async (data: { category: string; description: string; amount: number; date: string; endDate?: string }) => {
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-expense', ...data }),
      });
      const result = await res.json();
      if (result.success && result.expense) {
        setExpenses((prev) => [result.expense, ...prev]);
      }
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Filtering
  let filtered = expenses;
  if (monthFilter !== 'all') {
    filtered = filtered.filter((e) => e.date.startsWith(monthFilter));
  }
  if (categoryFilter !== 'all') {
    filtered = filtered.filter((e) => e.category === categoryFilter);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((e) => (e.description ?? '').toLowerCase().includes(q) || (e.category ?? '').toLowerCase().includes(q));
  }

  // Sort by date desc
  filtered.sort((a, b) => b.date.localeCompare(a.date));

  // Stats
  const totalAll = expenses.reduce((s, e) => s + e.amount, 0);
  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0);

  // Category breakdown for filtered
  const categoryBreakdown: Record<string, number> = {};
  for (const e of filtered) {
    categoryBreakdown[e.category] = (categoryBreakdown[e.category] ?? 0) + e.amount;
  }
  const topCategories = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const monthOptions = getMonthOptions();
  const usedCategories = [...new Set(expenses.map((e) => e.category))];

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/finance" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Expenditure Tracker</h1>
            <p className="text-[11px] text-muted-foreground">COGS, supplier payments, shipping, testing & all business expenses</p>
          </div>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Expense
        </button>
      </div>

      {/* Summary Cards */}
      <StaggerContainer className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Total (All Time)</p>
            <p className="text-xl font-semibold text-foreground tabular-nums"><AnimatedNumber value={totalAll} formatter={formatINR} /></p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-violet-400/70 mb-1">Filtered Total</p>
            <p className="text-xl font-semibold text-violet-400 tabular-nums"><AnimatedNumber value={totalFiltered} formatter={formatINR} /></p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Transactions</p>
            <p className="text-xl font-semibold text-foreground tabular-nums">{filtered.length}</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Avg / Transaction</p>
            <p className="text-xl font-semibold text-foreground tabular-nums">{filtered.length > 0 ? formatINR(Math.round(totalFiltered / filtered.length)) : '—'}</p>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* Category breakdown bar */}
      {topCategories.length > 0 && totalFiltered > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="space-y-2">
          <div className="h-2 rounded-full overflow-hidden flex gap-0.5">
            {topCategories.map(([cat, amount]) => (
              <motion.div
                key={cat}
                initial={{ flex: 0 }}
                animate={{ flex: amount }}
                transition={{ duration: 0.8 }}
                className="rounded-full bg-violet-500/40 first:bg-violet-500 [&:nth-child(2)]:bg-violet-500/70 [&:nth-child(3)]:bg-violet-500/50"
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {topCategories.map(([cat, amount]) => (
              <button key={cat} onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition">
                <div className="h-2 w-2 rounded-sm bg-violet-500/50" />
                <span>{CATEGORY_LABELS[cat] ?? cat}</span>
                <span className="font-medium text-foreground">{Math.round((amount / totalFiltered) * 100)}%</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="form-input h-[34px] text-[12px] pr-8"
        >
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="form-input h-[34px] text-[12px] pr-8"
        >
          <option value="all">All categories</option>
          {usedCategories.map((cat) => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat] ?? cat}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[150px] max-w-[250px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search expenses..."
            className="form-input h-[34px] text-[12px] pl-8 w-full"
          />
        </div>
      </div>

      {/* Expenses list */}
      {filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Receipt className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No expenses found</p>
          <button onClick={() => setAddModalOpen(true)} className="mt-3 text-[12px] text-primary hover:text-primary/80 transition font-medium">
            + Add your first expense
          </button>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card overflow-hidden">
          {filtered.map((exp) => {
            const isEditing = editingExpense === exp.id;
            const isRange = exp.endDate && exp.endDate !== exp.date;

            return (
              <div key={exp.id} className="group border-b border-border/30 last:border-0">
                <div className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-accent/5">
                  <div className="h-9 w-9 rounded-lg bg-violet-500/12 border border-violet-500/20 flex items-center justify-center shrink-0">
                    <Receipt className="h-4 w-4 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="w-full bg-transparent text-[13px] font-medium text-foreground outline-none border-b border-primary/30 pb-0.5"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(exp); if (e.key === 'Escape') setEditingExpense(null); }}
                      />
                    ) : (
                      <span className="text-[13px] font-medium text-foreground">{exp.description || (CATEGORY_LABELS[exp.category] ?? exp.category)}</span>
                    )}
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5 flex items-center gap-1">
                      {isRange ? (
                        <><Calendar className="h-2.5 w-2.5" />{exp.date} → {exp.endDate}</>
                      ) : (
                        exp.date
                      )}
                      {' · '}{CATEGORY_LABELS[exp.category] ?? exp.category}
                    </p>
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-24 bg-transparent text-[15px] font-bold text-violet-400 text-right outline-none border-b border-primary/30 pb-0.5 tabular-nums"
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(exp); if (e.key === 'Escape') setEditingExpense(null); }}
                      />
                      <button onClick={() => saveEdit(exp)} className="rounded-md p-1.5 text-emerald-400 hover:bg-emerald-400/10 transition"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setEditingExpense(null)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground transition"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <span className="text-[15px] font-bold text-violet-400 tabular-nums">{formatINR(exp.amount)}</span>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => startEdit(exp)} className="rounded-md p-1.5 text-muted-foreground/40 hover:text-foreground transition"><Pencil className="h-3 w-3" /></button>
                        <button
                          onClick={() => deleteExpense(exp.id)}
                          disabled={deletingId === exp.id}
                          className="rounded-md p-1.5 text-muted-foreground/40 hover:text-red-400 transition disabled:opacity-50"
                        >
                          {deletingId === exp.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {filtered.length} expense{filtered.length !== 1 ? 's' : ''}
        {(monthFilter !== 'all' || categoryFilter !== 'all' || searchQuery) && ' · filtered'}
      </p>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {addModalOpen && (
          <AddExpenseModal
            onClose={() => setAddModalOpen(false)}
            onAdd={(data) => { handleAddExpense(data); setAddModalOpen(false); }}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

// ── Add Expense Modal ──────────────────────────────────────────────────────────

function AddExpenseModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (data: { category: string; description: string; amount: number; date: string; endDate?: string }) => void;
}) {
  const [category, setCategory] = useState('inventory');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getToday());
  const [endDate, setEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!amount || !category) return;
    setSaving(true);
    onAdd({
      category,
      description,
      amount: Number(amount),
      date,
      endDate: isRange && endDate ? endDate : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Add Expense</h2>
              <p className="text-[11px] text-muted-foreground">One-off or date-range expense</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-border/60 bg-background/60 p-2 text-muted-foreground transition hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Category */}
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition border ${
                    category === cat.value
                      ? 'bg-primary/15 text-primary border-primary/30'
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Ordered 500 units from supplier"
              className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none transition"
            />
          </div>

          {/* Amount + Date row */}
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground tabular-nums placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground focus:border-primary/50 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Date range toggle */}
          <div>
            <button
              onClick={() => setIsRange(!isRange)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition border ${
                isRange
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Date range expense
            </button>
            <AnimatePresence>
              {isRange && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3">
                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={date}
                      className="w-full max-w-[200px] rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground focus:border-primary/50 focus:outline-none transition"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/50 px-6 py-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground transition">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!amount || !category || saving}
            className="rounded-lg bg-primary px-5 py-2 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> : <Plus className="h-3.5 w-3.5 inline mr-1" />}
            Add Expense
          </button>
        </div>
      </motion.div>
    </div>
  );
}
