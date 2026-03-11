'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Trash2, Receipt, Check,
  Pencil, X, Plus, Calendar, Search,
  ChevronLeft, ChevronRight,
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
const CATEGORY_COLORS: Record<string, string> = {
  inventory: 'bg-orange-500', supplier: 'bg-rose-500', shipping: 'bg-sky-500',
  'product-testing': 'bg-emerald-500', marketing: 'bg-violet-500', returns: 'bg-red-500',
  packaging: 'bg-amber-500', freelance: 'bg-blue-500', tools: 'bg-cyan-500',
  travel: 'bg-pink-500', other: 'bg-zinc-500',
};

function getToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// ── Calendar Helpers ─────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ExpenditurePage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingExpense, setEditingExpense] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  // Expenses by date (for calendar dots)
  const expensesByDate = useMemo(() => {
    const map: Record<string, { total: number; count: number; categories: Set<string> }> = {};
    for (const e of expenses) {
      if (!map[e.date]) map[e.date] = { total: 0, count: 0, categories: new Set() };
      map[e.date].total += e.amount;
      map[e.date].count += 1;
      map[e.date].categories.add(e.category);
    }
    return map;
  }, [expenses]);

  // Calendar navigation
  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };
  const goToToday = () => {
    const n = new Date();
    setCalYear(n.getFullYear());
    setCalMonth(n.getMonth());
    setSelectedDate(null);
  };

  // Current month string for filtering
  const calMonthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  const monthLabel = new Date(calYear, calMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Filtering
  let filtered = expenses.filter((e) => e.date.startsWith(calMonthStr));
  if (selectedDate) {
    filtered = filtered.filter((e) => e.date === selectedDate);
  }
  if (categoryFilter !== 'all') {
    filtered = filtered.filter((e) => e.category === categoryFilter);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((e) => (e.description ?? '').toLowerCase().includes(q) || (e.category ?? '').toLowerCase().includes(q));
  }
  filtered.sort((a, b) => b.date.localeCompare(a.date));

  // Stats
  const monthExpenses = expenses.filter((e) => e.date.startsWith(calMonthStr));
  const totalMonth = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0);

  // Category breakdown for the month
  const categoryBreakdown: Record<string, number> = {};
  for (const e of monthExpenses) {
    categoryBreakdown[e.category] = (categoryBreakdown[e.category] ?? 0) + e.amount;
  }
  const topCategories = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]);
  const usedCategories = [...new Set(expenses.map((e) => e.category))];

  // Calendar grid
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfWeek(calYear, calMonth);
  const todayStr = getToday();

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
            <p className="text-[11px] text-muted-foreground">All business expenses with calendar view</p>
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

      {/* Calendar + Summary Row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Calendar */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Calendar header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <button onClick={prevMonth} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-foreground">{monthLabel}</h3>
              <button onClick={goToToday} className="rounded-md px-2 py-0.5 text-[9px] font-medium text-muted-foreground hover:text-foreground border border-border/50 hover:border-border transition">
                Today
              </button>
              {selectedDate && (
                <button onClick={() => setSelectedDate(null)} className="rounded-md px-2 py-0.5 text-[9px] font-medium text-primary bg-primary/10 border border-primary/30 hover:bg-primary/20 transition">
                  Clear filter
                </button>
              )}
            </div>
            <button onClick={nextMonth} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 text-center border-b border-border/30">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-2 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {/* Empty cells for offset */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square border-b border-r border-border/10" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayData = expensesByDate[dateStr];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const isFuture = dateStr > todayStr;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`relative aspect-square border-b border-r border-border/10 flex flex-col items-center justify-center gap-0.5 transition hover:bg-accent/10 ${
                    isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : ''
                  } ${isFuture ? 'opacity-40' : ''}`}
                >
                  <span className={`text-[11px] tabular-nums leading-none ${
                    isToday ? 'font-bold text-primary' :
                    isSelected ? 'font-semibold text-primary' :
                    'text-foreground'
                  }`}>
                    {day}
                  </span>
                  {dayData && (
                    <>
                      <span className="text-[8px] font-semibold text-violet-400 tabular-nums leading-none">
                        {dayData.total >= 1000 ? `${Math.round(dayData.total / 1000)}k` : formatINR(dayData.total)}
                      </span>
                      <div className="flex gap-0.5">
                        {[...dayData.categories].slice(0, 3).map((cat) => (
                          <div key={cat} className={`h-1 w-1 rounded-full ${CATEGORY_COLORS[cat] ?? 'bg-zinc-500'}`} />
                        ))}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary sidebar */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {selectedDate ? `${selectedDate}` : monthLabel}
            </p>
            <p className="text-2xl font-semibold text-violet-400 tabular-nums">
              <AnimatedNumber value={selectedDate ? totalFiltered : totalMonth} formatter={formatINR} />
            </p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              {selectedDate ? `${filtered.length} expense${filtered.length !== 1 ? 's' : ''}` : `${monthExpenses.length} this month`}
            </p>
          </div>

          {/* Category breakdown */}
          {topCategories.length > 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Categories</p>
              {topCategories.map(([cat, amount]) => {
                const pct = totalMonth > 0 ? Math.round((amount / totalMonth) * 100) : 0;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
                    className={`w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 transition ${
                      categoryFilter === cat ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-accent/10'
                    }`}
                  >
                    <div className={`h-2 w-2 rounded-full shrink-0 ${CATEGORY_COLORS[cat] ?? 'bg-zinc-500'}`} />
                    <span className="text-[11px] text-foreground flex-1 truncate">{CATEGORY_LABELS[cat] ?? cat}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
                    <span className="text-[11px] font-semibold text-foreground tabular-nums">{formatINR(amount)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">All Time</p>
              <p className="text-[14px] font-semibold text-foreground tabular-nums mt-0.5">{formatINR(expenses.reduce((s, e) => s + e.amount, 0))}</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Avg/Day</p>
              <p className="text-[14px] font-semibold text-foreground tabular-nums mt-0.5">
                {monthExpenses.length > 0 ? formatINR(Math.round(totalMonth / new Date().getDate())) : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
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
        {(categoryFilter !== 'all' || selectedDate || searchQuery) && (
          <button
            onClick={() => { setCategoryFilter('all'); setSelectedDate(null); setSearchQuery(''); }}
            className="text-[11px] text-muted-foreground hover:text-foreground transition"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Expenses table */}
      {filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
          <Receipt className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No expenses found</p>
          <button onClick={() => setAddModalOpen(true)} className="mt-3 text-[12px] text-primary hover:text-primary/80 transition font-medium">
            + Add your first expense
          </button>
        </motion.div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_120px_100px_50px] sm:grid-cols-[1fr_140px_120px_100px_50px] gap-2 px-4 py-2 border-b border-border/50 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
            <span>Expense</span>
            <span className="hidden sm:block">Category</span>
            <span>Date</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          {/* Table body */}
          <div className="max-h-[500px] overflow-y-auto">
            {filtered.map((exp) => {
              const isEditing = editingExpense === exp.id;
              const isRange = exp.endDate && exp.endDate !== exp.date;
              const catColor = CATEGORY_COLORS[exp.category] ?? 'bg-zinc-500';

              return (
                <div key={exp.id} className="group border-b border-border/20 last:border-0">
                  <div className="grid grid-cols-[1fr_120px_100px_50px] sm:grid-cols-[1fr_140px_120px_100px_50px] gap-2 items-center px-4 py-2.5 hover:bg-accent/5 transition">
                    {/* Description */}
                    <div className="min-w-0">
                      {isEditing ? (
                        <input
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          className="w-full bg-transparent text-[12px] font-medium text-foreground outline-none border-b border-primary/30 pb-0.5"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(exp); if (e.key === 'Escape') setEditingExpense(null); }}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${catColor}`} />
                          <span className="text-[12px] font-medium text-foreground truncate">
                            {exp.description || (CATEGORY_LABELS[exp.category] ?? exp.category)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Category */}
                    <span className="hidden sm:block text-[10px] text-muted-foreground/60 truncate">
                      {CATEGORY_LABELS[exp.category] ?? exp.category}
                    </span>

                    {/* Date */}
                    <span className="text-[10px] text-muted-foreground/50">
                      {isRange ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5" />
                          {exp.date.slice(5)} → {exp.endDate!.slice(5)}
                        </span>
                      ) : exp.date.slice(5)}
                    </span>

                    {/* Amount */}
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-20 bg-transparent text-[13px] font-bold text-violet-400 text-right outline-none border-b border-primary/30 pb-0.5 tabular-nums"
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(exp); if (e.key === 'Escape') setEditingExpense(null); }}
                        />
                      </div>
                    ) : (
                      <span className="text-[13px] font-semibold text-violet-400 tabular-nums text-right">{formatINR(exp.amount)}</span>
                    )}

                    {/* Actions */}
                    {isEditing ? (
                      <div className="flex gap-0.5 justify-end">
                        <button onClick={() => saveEdit(exp)} className="rounded-md p-1 text-emerald-400 hover:bg-emerald-400/10 transition"><Check className="h-3 w-3" /></button>
                        <button onClick={() => setEditingExpense(null)} className="rounded-md p-1 text-muted-foreground hover:text-foreground transition"><X className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => startEdit(exp)} className="rounded-md p-1 text-muted-foreground/40 hover:text-foreground transition"><Pencil className="h-3 w-3" /></button>
                        <button
                          onClick={() => deleteExpense(exp.id)}
                          disabled={deletingId === exp.id}
                          className="rounded-md p-1 text-muted-foreground/40 hover:text-red-400 transition disabled:opacity-50"
                        >
                          {deletingId === exp.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {filtered.length} expense{filtered.length !== 1 ? 's' : ''}
        {(categoryFilter !== 'all' || selectedDate || searchQuery) && ' (filtered)'}
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
