'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Plus, Trash2, Check, X, Pencil,
  CreditCard, Users2, Wrench, AlertCircle,
  ChevronDown, ChevronUp, Calendar,
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

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'salaries', label: 'Team & Salaries', color: '#60A5FA', textColor: 'text-blue-400', bgColor: 'bg-blue-500/8', borderColor: 'border-blue-500/20', icon: <Users2 className="h-4 w-4 text-blue-400" /> },
  { key: 'subscriptions', label: 'SaaS & Subscriptions', color: '#34D399', textColor: 'text-emerald-400', bgColor: 'bg-emerald-500/8', borderColor: 'border-emerald-500/20', icon: <CreditCard className="h-4 w-4 text-emerald-400" /> },
  { key: 'operations', label: 'Operations & Overhead', color: '#A78BFA', textColor: 'text-violet-400', bgColor: 'bg-violet-500/8', borderColor: 'border-violet-500/20', icon: <Wrench className="h-4 w-4 text-violet-400" /> },
];

function getToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function BaselinesPage() {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDueDay, setFormDueDay] = useState('');
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

  const togglePaid = async (baseline: Baseline) => {
    const nowPaid = !baseline.isPaid;
    const updated = { ...baseline, isPaid: nowPaid, paidDate: nowPaid ? new Date().toISOString().split('T')[0] : undefined };
    setBaselines((prev) => prev.map((b) => b.id === baseline.id ? updated : b));
    await saveBaseline(updated);
  };

  const resetForm = () => { setEditingId(null); setAddingCategory(null); setFormLabel(''); setFormAmount(''); setFormDueDay(''); };

  const startEdit = (b: Baseline) => {
    setEditingId(b.id); setAddingCategory(null);
    setFormLabel(b.label); setFormAmount(String(b.amount));
    setFormDueDay(b.dueDay ? String(b.dueDay) : '');
  };

  const startAdd = (category: string) => {
    setAddingCategory(category); setEditingId(null);
    setFormLabel(''); setFormAmount(''); setFormDueDay('');
  };

  const handleSubmit = (category: string, existingId?: string) => {
    if (!formLabel.trim() || !formAmount) return;
    const dueDay = formDueDay ? Math.min(31, Math.max(1, Number(formDueDay))) : undefined;
    saveBaseline({ id: existingId, type: 'monthly', category, label: formLabel.trim(), amount: Number(formAmount) || 0, dueDay });
  };

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const monthlyBaselines = baselines.filter((b) => b.type === 'monthly');
  const grandTotal = monthlyBaselines.reduce((s, b) => s + b.amount, 0);
  const paidTotal = monthlyBaselines.filter((b) => b.isPaid).reduce((s, b) => s + b.amount, 0);

  const categoryTotals: Record<string, number> = {};
  for (const b of monthlyBaselines) categoryTotals[b.category] = (categoryTotals[b.category] ?? 0) + b.amount;

  const currentDay = new Date().getDate();

  return (
    <PageTransition className="mx-auto max-w-5xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/finance" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Monthly Baselines</h1>
          <p className="text-[11px] text-muted-foreground">Salaries, SaaS subscriptions & operational overhead</p>
        </div>
      </div>

      {/* Summary */}
      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Monthly Total</p>
            <p className="text-xl font-semibold text-foreground"><AnimatedNumber value={grandTotal} formatter={formatINR} /></p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">{monthlyBaselines.length} items</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/70 mb-1">Paid This Month</p>
            <p className="text-xl font-semibold text-emerald-400"><AnimatedNumber value={paidTotal} formatter={formatINR} /></p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-amber-400/70 mb-1">Remaining</p>
            <p className="text-xl font-semibold text-amber-400"><AnimatedNumber value={grandTotal - paidTotal} formatter={formatINR} /></p>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* Breakdown Bar */}
      {grandTotal > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="space-y-2">
          <div className="h-2 rounded-full overflow-hidden flex gap-0.5">
            {CATEGORIES.filter((c) => (categoryTotals[c.key] ?? 0) > 0).map((cat) => (
              <motion.div key={cat.key} initial={{ flex: 0 }} animate={{ flex: categoryTotals[cat.key] ?? 0 }} transition={{ duration: 0.8 }} className="rounded-full" style={{ backgroundColor: cat.color }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {CATEGORIES.filter((c) => (categoryTotals[c.key] ?? 0) > 0).map((cat) => (
              <div key={cat.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: cat.color }} />
                <span>{cat.label}</span>
                <span className="font-medium text-foreground">{formatINR(categoryTotals[cat.key])} ({Math.round((categoryTotals[cat.key] / grandTotal) * 100)}%)</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Category Tables */}
      <div className="space-y-4">
        {CATEGORIES.map((cat, catIdx) => {
          const items = monthlyBaselines
            .filter((b) => b.category === cat.key)
            .sort((a, b) => { if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1; return (a.dueDay ?? 32) - (b.dueDay ?? 32); });
          const catTotal = items.reduce((s, b) => s + b.amount, 0);
          const paidCount = items.filter((b) => b.isPaid).length;
          const isCollapsed = collapsed[cat.key];

          return (
            <motion.div key={cat.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + catIdx * 0.06 }} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Header */}
              <button onClick={() => setCollapsed((p) => ({ ...p, [cat.key]: !p[cat.key] }))} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-accent/5 transition">
                <div className={`h-9 w-9 rounded-lg ${cat.bgColor} border ${cat.borderColor} flex items-center justify-center shrink-0`}>{cat.icon}</div>
                <div className="flex-1 text-left">
                  <p className="text-[13px] font-semibold text-foreground">{cat.label}</p>
                  <p className="text-[10px] text-muted-foreground/60">{items.length} item{items.length !== 1 ? 's' : ''} · {paidCount} paid</p>
                </div>
                <p className={`text-lg font-semibold ${cat.textColor} tabular-nums mr-2`}>{formatINR(catTotal)}<span className="text-[10px] text-muted-foreground/50 font-normal ml-1">/mo</span></p>
                {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
              </button>

              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-[24px_1fr_90px_100px_80px_50px] gap-2 px-5 py-2 border-t border-border/50 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                      <span />
                      <span>Name</span>
                      <span className="text-right">Amount</span>
                      <span className="text-center">Due Date</span>
                      <span className="text-center">Status</span>
                      <span />
                    </div>

                    {items.length === 0 && addingCategory !== cat.key && (
                      <p className="text-[12px] text-muted-foreground/40 text-center py-6">No items yet</p>
                    )}

                    {items.map((b) => {
                      if (editingId === b.id) {
                        return (
                          <InlineEditRow key={b.id} label={formLabel} amount={formAmount} dueDay={formDueDay}
                            onLabelChange={setFormLabel} onAmountChange={setFormAmount} onDueDayChange={setFormDueDay}
                            onSave={() => handleSubmit(cat.key, b.id)} onCancel={resetForm} saving={saving}
                          />
                        );
                      }
                      const isOverdue = b.dueDay && !b.isPaid && b.dueDay < currentDay;
                      const isDueToday = b.dueDay === currentDay && !b.isPaid;

                      return (
                        <div key={b.id} className="group grid grid-cols-[24px_1fr_90px_100px_80px_50px] gap-2 items-center px-5 py-2.5 border-t border-border/20 hover:bg-accent/5 transition">
                          <button
                            onClick={() => togglePaid(b)}
                            className={`h-[18px] w-[18px] rounded border transition flex items-center justify-center ${b.isPaid ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'border-white/[0.15] hover:border-white/[0.3]'}`}
                          >
                            {b.isPaid && <Check className="h-2.5 w-2.5" />}
                          </button>

                          <span className={`text-[13px] font-medium truncate ${b.isPaid ? 'text-muted-foreground line-through' : isOverdue ? 'text-red-400' : 'text-foreground'}`}>{b.label}</span>

                          <span className={`text-[13px] font-semibold text-right tabular-nums`} style={{ color: b.isPaid ? 'var(--muted-foreground)' : cat.color }}>{formatINR(b.amount)}</span>

                          <span className={`text-[11px] text-center ${isOverdue ? 'text-red-400 font-medium' : isDueToday ? 'text-amber-400' : 'text-muted-foreground/50'}`}>
                            {b.dueDay ? (
                              <span className="flex items-center justify-center gap-1">
                                {isOverdue && <AlertCircle className="h-3 w-3" />}
                                <Calendar className="h-2.5 w-2.5 opacity-50" />
                                {ordinal(b.dueDay)} of month
                              </span>
                            ) : '—'}
                          </span>

                          <span className="text-center">
                            {b.isPaid ? (
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400"><Check className="h-2.5 w-2.5" />Paid</span>
                            ) : isOverdue ? (
                              <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[9px] font-medium text-red-400">Overdue</span>
                            ) : isDueToday ? (
                              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">Today</span>
                            ) : (
                              <span className="text-[9px] text-muted-foreground/40">Pending</span>
                            )}
                          </span>

                          <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => startEdit(b)} className="rounded-md p-1 text-muted-foreground/40 hover:text-foreground transition"><Pencil className="h-3 w-3" /></button>
                            <button onClick={() => deleteBaseline(b.id)} className="rounded-md p-1 text-muted-foreground/40 hover:text-red-400 transition"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </div>
                      );
                    })}

                    {addingCategory === cat.key ? (
                      <InlineEditRow label={formLabel} amount={formAmount} dueDay={formDueDay}
                        onLabelChange={setFormLabel} onAmountChange={setFormAmount} onDueDayChange={setFormDueDay}
                        onSave={() => handleSubmit(cat.key)} onCancel={resetForm} saving={saving}
                      />
                    ) : editingId === null ? (
                      <button onClick={() => startAdd(cat.key)} className="w-full flex items-center justify-center gap-1.5 py-3 border-t border-dashed border-border/30 text-[11px] font-medium text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/5 transition">
                        <Plus className="h-3 w-3" />Add item
                      </button>
                    ) : null}
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

// ── Inline Edit Row ──────────────────────────────────────────────────────────

function InlineEditRow({
  label, amount, dueDay,
  onLabelChange, onAmountChange, onDueDayChange,
  onSave, onCancel, saving,
}: {
  label: string; amount: string; dueDay: string;
  onLabelChange: (v: string) => void; onAmountChange: (v: string) => void; onDueDayChange: (v: string) => void;
  onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-5 py-3 border-t border-primary/10 bg-primary/[0.02]"
    >
      <span className="w-[18px] shrink-0" />
      <input autoFocus value={label} onChange={(e) => onLabelChange(e.target.value)} placeholder="Name"
        className="flex-1 min-w-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/30 outline-none border-b border-primary/20 pb-0.5"
        onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
      />
      <input value={amount} onChange={(e) => onAmountChange(e.target.value)} placeholder="Amount" type="number"
        className="w-24 shrink-0 bg-transparent text-[13px] text-foreground text-right tabular-nums placeholder:text-muted-foreground/30 outline-none border-b border-primary/20 pb-0.5"
        onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
      />
      <div className="shrink-0 flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground/50">Day</span>
        <input value={dueDay} onChange={(e) => onDueDayChange(e.target.value)} placeholder="1-31" type="number" min={1} max={31}
          className="w-12 bg-transparent text-[13px] text-foreground text-center tabular-nums placeholder:text-muted-foreground/30 outline-none border-b border-primary/20 pb-0.5"
          onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
        />
      </div>
      <button type="button" onClick={onSave} disabled={saving || !label.trim() || !amount}
        className="shrink-0 rounded-md bg-primary/20 text-primary px-3 py-1.5 text-[11px] font-medium hover:bg-primary/30 transition disabled:opacity-40">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
      </button>
      <button type="button" onClick={onCancel} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground transition"><X className="h-3.5 w-3.5" /></button>
    </motion.div>
  );
}
