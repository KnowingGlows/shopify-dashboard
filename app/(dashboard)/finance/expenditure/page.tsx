'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Trash2, Receipt, Check,
  CalendarClock, AlertCircle, Pencil, X,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';
import { formatINR, ordinal } from '@/lib/currency-converter';

// ── Types ────────────────────────────────────────────────────────────────────

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

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
}

type ExpenditureItem = {
  kind: 'baseline';
  data: Baseline;
  sortDate: number;
} | {
  kind: 'expense';
  data: Expense;
  sortDate: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMonthOptions(): Array<{ value: string; label: string }> {
  const months: Array<{ value: string; label: string }> = [{ value: 'all', label: 'All' }];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    months.push({ value, label });
  }
  return months;
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  inventory: 'Inventory',
  'product-testing': 'Product Testing',
  marketing: 'Marketing',
  shipping: 'Shipping',
  returns: 'Returns / RTO',
  tools: 'Tools / Software',
  packaging: 'Packaging',
  freelance: 'Freelance',
  travel: 'Travel',
  other: 'Other',
};

// ── Main Component ───────────────────────────────────────────────────────────

export default function ExpenditurePage() {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'baselines' | 'expenses'>('all');
  const [editingExpense, setEditingExpense] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [basRes, expRes] = await Promise.all([
        fetch('/api/finance?action=baselines'),
        fetch('/api/finance?action=expenses'),
      ]);
      const [basData, expData] = await Promise.all([basRes.json(), expRes.json()]);
      setBaselines([...(basData.daily ?? []), ...(basData.monthly ?? [])]);
      setExpenses(expData.expenses ?? []);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const togglePaid = async (baseline: Baseline) => {
    const nowPaid = !baseline.isPaid;
    const updated = { ...baseline, isPaid: nowPaid, paidDate: nowPaid ? new Date().toISOString().split('T')[0] : undefined };
    setBaselines((prev) => prev.map((b) => b.id === baseline.id ? updated : b));
    await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save-baseline', ...updated }),
    }).catch(() => {});
  };

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

  const startEditExpense = (exp: Expense) => {
    setEditingExpense(exp.id);
    setEditAmount(String(exp.amount));
    setEditDesc(exp.description);
  };

  const saveEditExpense = async (exp: Expense) => {
    const updated = { ...exp, amount: Number(editAmount) || exp.amount, description: editDesc || exp.description };
    setExpenses((prev) => prev.map((e) => e.id === exp.id ? updated : e));
    setEditingExpense(null);
    await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-expense', ...updated }),
    }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const today = new Date();
  const currentDay = today.getDate();
  const todayStr = today.toISOString().split('T')[0];
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthlyBaselines = baselines.filter((b) => b.type === 'monthly');

  // Build unified timeline
  const allItems: ExpenditureItem[] = [];

  if (typeFilter !== 'expenses') {
    for (const b of monthlyBaselines) {
      // Each baseline gets a sort date based on due day
      const dueDate = b.dueDay ? new Date(today.getFullYear(), today.getMonth(), b.dueDay).getTime() : today.getTime();
      allItems.push({ kind: 'baseline', data: b, sortDate: dueDate });
    }
  }

  if (typeFilter !== 'baselines') {
    for (const exp of expenses) {
      if (monthFilter !== 'all' && !exp.date.startsWith(monthFilter)) continue;
      allItems.push({ kind: 'expense', data: exp, sortDate: new Date(exp.date).getTime() });
    }
  }

  // Sort: paid/past first, then by date
  allItems.sort((a, b) => b.sortDate - a.sortDate);

  // Stats
  const totalBaselines = monthlyBaselines.reduce((s, b) => s + b.amount, 0);
  const paidBaselines = monthlyBaselines.filter((b) => b.isPaid).reduce((s, b) => s + b.amount, 0);
  const filteredExpenses = monthFilter === 'all' ? expenses : expenses.filter((e) => e.date.startsWith(monthFilter));
  const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const totalOutflow = totalBaselines + totalExpenses;

  const monthOptions = getMonthOptions();

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
            <p className="text-[11px] text-muted-foreground">All outgoing money — baselines, expenses & one-off purchases</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="form-input h-[34px] text-[12px] pr-8"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            {(['all', 'baselines', 'expenses'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 text-[11px] font-medium transition ${
                  typeFilter === t
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/10'
                }`}
              >
                {t === 'all' ? 'All' : t === 'baselines' ? 'Recurring' : 'One-off'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <StaggerContainer className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Monthly Baselines</p>
            <p className="text-xl font-semibold text-foreground tabular-nums"><AnimatedNumber value={totalBaselines} formatter={formatINR} /></p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/70 mb-1">Paid (Baselines)</p>
            <p className="text-xl font-semibold text-emerald-400 tabular-nums"><AnimatedNumber value={paidBaselines} formatter={formatINR} /></p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-violet-400/70 mb-1">Expenses</p>
            <p className="text-xl font-semibold text-violet-400 tabular-nums"><AnimatedNumber value={totalExpenses} formatter={formatINR} /></p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-red-400/70 mb-1">Total Outflow</p>
            <p className="text-xl font-semibold text-red-400 tabular-nums"><AnimatedNumber value={totalOutflow} formatter={formatINR} /></p>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* Items list */}
      {allItems.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Receipt className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No expenditures found</p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card overflow-hidden">
          {allItems.map((item) => {
            if (item.kind === 'expense') {
              const exp = item.data;
              const isEditing = editingExpense === exp.id;
              const isToday = exp.date === todayStr;

              return (
                <div key={`exp-${exp.id}`} className="group border-b border-border/30 last:border-0">
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
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEditExpense(exp); if (e.key === 'Escape') setEditingExpense(null); }}
                        />
                      ) : (
                        <span className="text-[13px] font-medium text-foreground">{exp.description || exp.category}</span>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                        {isToday ? 'Today' : exp.date} · {EXPENSE_CATEGORY_LABELS[exp.category] ?? exp.category}
                      </p>
                    </div>
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-24 bg-transparent text-[15px] font-bold text-violet-400 text-right outline-none border-b border-primary/30 pb-0.5 tabular-nums"
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEditExpense(exp); if (e.key === 'Escape') setEditingExpense(null); }}
                        />
                        <button onClick={() => saveEditExpense(exp)} className="rounded-md p-1.5 text-emerald-400 hover:bg-emerald-400/10 transition">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingExpense(null)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground transition">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-[15px] font-bold text-violet-400 tabular-nums">{formatINR(exp.amount)}</span>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => startEditExpense(exp)} className="rounded-md p-1.5 text-muted-foreground/40 hover:text-foreground transition">
                            <Pencil className="h-3 w-3" />
                          </button>
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
            }

            // Baseline item
            const b = item.data;
            const isOverdue = b.dueDay ? b.dueDay < currentDay && !b.isPaid : false;
            const isDueToday = b.dueDay === currentDay;
            const daysUntil = b.dueDay ? ((b.dueDay - currentDay + 31) % 31) : 0;

            return (
              <div key={`bas-${b.id}`} className={`group border-b border-border/30 last:border-0 transition hover:bg-accent/5 ${isOverdue ? 'bg-red-500/[0.02]' : ''}`}>
                <div className="flex items-center gap-4 px-5 py-3.5">
                  <div className={`h-9 w-9 rounded-lg border flex items-center justify-center shrink-0 ${
                    b.isPaid
                      ? 'bg-emerald-500/12 border-emerald-500/20'
                      : isOverdue
                        ? 'bg-red-500/12 border-red-500/20'
                        : isDueToday
                          ? 'bg-amber-500/12 border-amber-500/20'
                          : 'bg-muted/30 border-border'
                  }`}>
                    {b.isPaid ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : isOverdue ? (
                      <AlertCircle className="h-4 w-4 text-red-400" />
                    ) : (
                      <CalendarClock className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[13px] font-medium ${b.isPaid ? 'text-muted-foreground line-through' : isOverdue ? 'text-red-400' : 'text-foreground'}`}>
                      {b.label}
                    </span>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {b.isPaid
                        ? `Paid ${b.paidDate ?? ''} · Recurring`
                        : b.dueDay
                          ? isOverdue
                            ? `Overdue — was due ${ordinal(b.dueDay)}`
                            : isDueToday
                              ? 'Due today · Recurring'
                              : `Due ${ordinal(b.dueDay)} — in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`
                          : 'Recurring · No due date'
                      }
                      {b.category && ` · ${b.category}`}
                    </p>
                  </div>
                  <span className={`text-[15px] font-bold tabular-nums ${
                    b.isPaid ? 'text-emerald-400' : isOverdue ? 'text-red-400' : isDueToday ? 'text-amber-400' : 'text-foreground'
                  }`}>
                    {formatINR(b.amount)}
                  </span>
                  {!b.isPaid && (
                    <button
                      onClick={() => togglePaid(b)}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition shrink-0"
                    >
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {allItems.length} item{allItems.length !== 1 ? 's' : ''}
        {typeFilter !== 'all' && ` (${typeFilter})`}
        {monthFilter !== 'all' && ' · filtered'}
      </p>
    </PageTransition>
  );
}
