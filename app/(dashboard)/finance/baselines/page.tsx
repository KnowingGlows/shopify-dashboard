'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Plus, Trash2, Check, X, Pencil,
  CreditCard, Users2, Wrench, AlertCircle,
  CalendarClock, ChevronDown, ChevronUp, CalendarDays,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';

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

interface CategoryDef {
  key: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: CategoryDef[] = [
  { key: 'salaries', label: 'Salaries & Contractors', color: 'text-blue-400', bgColor: 'bg-blue-400/8', borderColor: 'border-blue-400/20', icon: <Users2 className="h-3.5 w-3.5 text-blue-400" /> },
  { key: 'subscriptions', label: 'Subscriptions & SaaS', color: 'text-emerald-400', bgColor: 'bg-emerald-400/8', borderColor: 'border-emerald-400/20', icon: <CreditCard className="h-3.5 w-3.5 text-emerald-400" /> },
  { key: 'operations', label: 'Operations & Tools', color: 'text-violet-400', bgColor: 'bg-violet-400/8', borderColor: 'border-violet-400/20', icon: <Wrench className="h-3.5 w-3.5 text-violet-400" /> },
];

const CATEGORY_COLORS: Record<string, string> = {
  salaries: '#60A5FA',
  subscriptions: '#34D399',
  operations: '#A78BFA',
};

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function BaselinesPage() {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  // Edit/Add state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDueDay, setFormDueDay] = useState('');

  // Collapse state
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const fetchBaselines = useCallback(async () => {
    try {
      const res = await fetch('/api/finance?action=baselines');
      const data = await res.json();
      setBaselines([...(data.daily ?? []), ...(data.monthly ?? [])]);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBaselines(); }, [fetchBaselines]);

  const saveBaseline = async (baseline: Partial<Baseline>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-baseline', ...baseline }),
      });
      const data = await res.json();
      if (data.success && data.baseline) {
        setBaselines((prev) => {
          const existing = prev.findIndex((b) => b.id === data.baseline.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = data.baseline;
            return updated;
          }
          return [...prev, data.baseline];
        });
      }
    } catch { /* silently fail */ }
    finally { setSaving(false); resetForm(); }
  };

  const deleteBaseline = async (id: string) => {
    setBaselines((prev) => prev.filter((b) => b.id !== id));
    await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-baseline', id }),
    }).catch(() => {});
  };

  const clearAllBaselines = async () => {
    if (!confirm('Delete all baselines? This cannot be undone.')) return;
    setClearingAll(true);
    try {
      await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-all-baselines' }),
      });
      setBaselines([]);
    } catch { /* silently fail */ }
    finally { setClearingAll(false); }
  };

  const togglePaid = async (baseline: Baseline) => {
    const nowPaid = !baseline.isPaid;
    await saveBaseline({
      ...baseline,
      isPaid: nowPaid,
      paidDate: nowPaid ? new Date().toISOString().split('T')[0] : undefined,
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setAddingCategory(null);
    setFormLabel('');
    setFormAmount('');
    setFormDueDay('');
  };

  const startEdit = (b: Baseline) => {
    setEditingId(b.id);
    setAddingCategory(null);
    setFormLabel(b.label);
    setFormAmount(String(b.amount));
    // Convert dueDay number to a date string for the date input (use current month)
    if (b.dueDay) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(b.dueDay).padStart(2, '0')}`;
      setFormDueDay(dateStr);
    } else {
      setFormDueDay('');
    }
  };

  const startAdd = (category: string) => {
    setAddingCategory(category);
    setEditingId(null);
    setFormLabel('');
    setFormAmount('');
    setFormDueDay('');
  };

  const handleSubmit = (category: string, existingId?: string) => {
    if (!formLabel.trim() || !formAmount) return;
    // Extract day-of-month from date string (e.g. "2026-03-15" → 15)
    const dueDay = formDueDay ? new Date(formDueDay + 'T00:00:00').getDate() : undefined;
    saveBaseline({
      id: existingId,
      type: 'monthly',
      category,
      label: formLabel.trim(),
      amount: Number(formAmount) || 0,
      dueDay,
    });
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const monthlyBaselines = baselines.filter((b) => b.type === 'monthly');

  const grandTotal = monthlyBaselines.reduce((s, b) => s + b.amount, 0);
  const paidTotal = monthlyBaselines.filter((b) => b.isPaid).reduce((s, b) => s + b.amount, 0);
  const unpaidTotal = grandTotal - paidTotal;

  const categoryTotals: Record<string, number> = {};
  for (const b of monthlyBaselines) {
    categoryTotals[b.category] = (categoryTotals[b.category] ?? 0) + b.amount;
  }

  const today = new Date();
  const currentDay = today.getDate();
  const upcomingDeductions = monthlyBaselines
    .filter((b) => b.dueDay && !b.isPaid)
    .sort((a, b) => {
      const aDist = ((a.dueDay! - currentDay + 31) % 31);
      const bDist = ((b.dueDay! - currentDay + 31) % 31);
      return aDist - bDist;
    });

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/finance" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Monthly Baselines</h1>
            <p className="text-[11px] text-muted-foreground">Fixed costs & recurring expenses</p>
          </div>
        </div>
        {baselines.length > 0 && (
          <button
            onClick={clearAllBaselines}
            disabled={clearingAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
          >
            {clearingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Clear All
          </button>
        )}
      </div>

      {/* Summary Row */}
      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Monthly Total</p>
            <p className="text-xl font-semibold text-foreground">
              <AnimatedNumber value={grandTotal} formatter={formatINR} />
            </p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/70 mb-1">Paid This Month</p>
            <p className="text-xl font-semibold text-emerald-400">
              <AnimatedNumber value={paidTotal} formatter={formatINR} />
            </p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-amber-400/70 mb-1">Remaining</p>
            <p className="text-xl font-semibold text-amber-400">
              <AnimatedNumber value={unpaidTotal} formatter={formatINR} />
            </p>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* Breakdown Bar */}
      {grandTotal > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="space-y-2.5">
          <div className="h-1.5 rounded-full overflow-hidden flex gap-0.5">
            {CATEGORIES.filter((c) => (categoryTotals[c.key] ?? 0) > 0).map((cat) => (
              <motion.div
                key={cat.key}
                initial={{ flex: 0 }}
                animate={{ flex: categoryTotals[cat.key] ?? 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[cat.key] }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {CATEGORIES.filter((c) => (categoryTotals[c.key] ?? 0) > 0).map((cat) => (
              <div key={cat.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[cat.key] }} />
                <span>{cat.label}</span>
                <span className="font-medium text-foreground">{Math.round((categoryTotals[cat.key] / grandTotal) * 100)}%</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Upcoming Deductions */}
      {upcomingDeductions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-2.5">
            <CalendarClock className="h-3.5 w-3.5 text-amber-400" />
            <p className="text-[11px] font-medium uppercase tracking-wider text-amber-400">Upcoming Deductions</p>
          </div>
          <div className="space-y-1.5">
            {upcomingDeductions.slice(0, 5).map((b) => {
              const isOverdue = b.dueDay! < currentDay;
              return (
                <div key={b.id} className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-2">
                    {isOverdue && <AlertCircle className="h-3 w-3 text-red-400" />}
                    <span className={isOverdue ? 'text-red-400' : 'text-foreground'}>{b.label}</span>
                    <span className="text-muted-foreground/60">
                      {isOverdue ? `Overdue (was ${ordinal(b.dueDay!)})` : `Due ${ordinal(b.dueDay!)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground tabular-nums">{formatINR(b.amount)}</span>
                    <button
                      onClick={() => togglePaid(b)}
                      className="rounded-md px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition"
                    >
                      Mark Paid
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Category Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {CATEGORIES.map((cat, catIdx) => {
          const items = monthlyBaselines.filter((b) => b.category === cat.key);
          const catTotal = items.reduce((s, b) => s + b.amount, 0);
          const isCollapsed = collapsed[cat.key];

          return (
            <motion.div
              key={cat.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + catIdx * 0.08 }}
              className={`rounded-xl border ${cat.borderColor} ${cat.bgColor} overflow-hidden`}
            >
              {/* Category Header */}
              <div className="px-4 py-3 flex items-center justify-between">
                <button onClick={() => setCollapsed((p) => ({ ...p, [cat.key]: !p[cat.key] }))} className="flex items-center gap-2 group">
                  {cat.icon}
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${cat.color}`}>{cat.label}</span>
                  {isCollapsed ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronUp className="h-3 w-3 text-muted-foreground" />}
                </button>
                <div className="text-right">
                  <p className={`text-lg font-semibold ${cat.color} tabular-nums`}>{formatINR(catTotal)}</p>
                  <p className="text-[10px] text-muted-foreground/60">/ month</p>
                </div>
              </div>

              {/* Items */}
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-1.5">
                      {items.length === 0 && addingCategory !== cat.key && (
                        <p className="text-[12px] text-muted-foreground/50 text-center py-4">No items yet</p>
                      )}

                      {items.map((b) => (
                        editingId === b.id ? (
                          <InlineForm
                            key={b.id}
                            label={formLabel}
                            amount={formAmount}
                            dueDay={formDueDay}
                            onLabelChange={setFormLabel}
                            onAmountChange={setFormAmount}
                            onDueDayChange={setFormDueDay}
                            onSave={() => handleSubmit(cat.key, b.id)}
                            onCancel={resetForm}
                            saving={saving}
                            color={CATEGORY_COLORS[cat.key]}
                          />
                        ) : (
                          <BaselineRow
                            key={b.id}
                            baseline={b}
                            color={CATEGORY_COLORS[cat.key]}
                            currentDay={currentDay}
                            onEdit={() => startEdit(b)}
                            onDelete={() => deleteBaseline(b.id)}
                            onTogglePaid={() => togglePaid(b)}
                          />
                        )
                      ))}

                      {addingCategory === cat.key && (
                        <InlineForm
                          label={formLabel}
                          amount={formAmount}
                          dueDay={formDueDay}
                          onLabelChange={setFormLabel}
                          onAmountChange={setFormAmount}
                          onDueDayChange={setFormDueDay}
                          onSave={() => handleSubmit(cat.key)}
                          onCancel={resetForm}
                          saving={saving}
                          color={CATEGORY_COLORS[cat.key]}
                        />
                      )}

                      {addingCategory !== cat.key && editingId === null && (
                        <button
                          onClick={() => startAdd(cat.key)}
                          className={`w-full mt-1 py-2.5 rounded-lg border border-dashed text-[11px] font-medium transition flex items-center justify-center gap-1.5 ${cat.borderColor} ${cat.color} opacity-40 hover:opacity-80 hover:bg-white/[0.02]`}
                        >
                          <Plus className="h-3 w-3" />
                          Add item
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </PageTransition>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function BaselineRow({
  baseline: b,
  color,
  currentDay,
  onEdit,
  onDelete,
  onTogglePaid,
}: {
  baseline: Baseline;
  color: string;
  currentDay: number;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePaid: () => void;
}) {
  const isOverdue = b.dueDay && !b.isPaid && b.dueDay < currentDay;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition ${
        b.isPaid
          ? 'bg-white/[0.02] border border-white/[0.04]'
          : 'bg-white/[0.03] border border-white/[0.06]'
      } ${isOverdue ? 'border-red-400/30' : ''}`}
    >
      {/* Paid toggle */}
      <button
        onClick={onTogglePaid}
        className={`shrink-0 h-4 w-4 rounded border transition flex items-center justify-center ${
          b.isPaid
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
            : 'border-white/[0.15] hover:border-white/[0.3]'
        }`}
      >
        {b.isPaid && <Check className="h-2.5 w-2.5" />}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] font-medium ${b.isPaid ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
            {b.label}
          </span>
          {isOverdue && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">Overdue</span>
          )}
        </div>
        {b.dueDay && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
            <CalendarDays className="h-2.5 w-2.5" />
            Due {ordinal(b.dueDay)} of every month
            {b.isPaid && b.paidDate && ` · Paid ${b.paidDate}`}
          </p>
        )}
      </div>

      {/* Amount */}
      <span className="text-[13px] font-medium tabular-nums" style={{ color: b.isPaid ? 'var(--muted-foreground)' : color }}>
        {formatINR(b.amount)}
      </span>

      {/* Actions */}
      <div className="flex gap-1">
        <button onClick={onEdit} className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-accent/30 transition">
          <Pencil className="h-3 w-3" />
        </button>
        <button onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground/50 hover:text-red-400 hover:bg-red-400/10 transition">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </motion.div>
  );
}

function InlineForm({
  label, amount, dueDay,
  onLabelChange, onAmountChange, onDueDayChange,
  onSave, onCancel, saving, color,
}: {
  label: string; amount: string; dueDay: string;
  onLabelChange: (v: string) => void; onAmountChange: (v: string) => void; onDueDayChange: (v: string) => void;
  onSave: () => void; onCancel: () => void; saving: boolean; color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg bg-white/[0.04] border border-white/[0.1] p-3 space-y-3"
    >
      <div className="grid grid-cols-[1fr_100px_130px] gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Name</label>
          <input
            autoFocus
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="e.g. Shopify Plan"
            className="bg-white/[0.06] border border-white/[0.1] rounded-md px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-white/[0.25] transition"
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Amount</label>
          <input
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="0"
            type="number"
            className="bg-white/[0.06] border border-white/[0.1] rounded-md px-2.5 py-1.5 text-[13px] text-foreground text-right tabular-nums placeholder:text-muted-foreground/30 focus:outline-none focus:border-white/[0.25] transition"
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Due Date</label>
          <input
            value={dueDay}
            onChange={(e) => onDueDayChange(e.target.value)}
            type="date"
            className="bg-white/[0.06] border border-white/[0.1] rounded-md px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-white/[0.25] transition"
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-white/[0.06] hover:bg-white/[0.1] transition">
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !label.trim() || !amount}
          className="rounded-md px-3 py-1.5 text-[11px] font-medium text-[#050810] disabled:opacity-40 transition"
          style={{ backgroundColor: color }}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </motion.div>
  );
}
