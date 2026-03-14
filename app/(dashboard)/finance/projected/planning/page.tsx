'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Loader2, Trash2, X, Calendar, Save,
  ShoppingCart, TrendingUp, Package, Megaphone, Wrench, Users, Repeat, Receipt,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';
import { formatINR } from '@/lib/currency-converter';

interface PlannedExpense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
}

const PLAN_CATEGORIES = [
  { value: 'reinvestment', label: 'Reinvestment', icon: TrendingUp, color: 'violet' },
  { value: 'inventory', label: 'Inventory Restock', icon: Package, color: 'orange' },
  { value: 'marketing', label: 'Marketing / Ads', icon: Megaphone, color: 'pink' },
  { value: 'product-testing', label: 'Product Testing', icon: ShoppingCart, color: 'emerald' },
  { value: 'tools', label: 'Tools / Software', icon: Wrench, color: 'cyan' },
  { value: 'hiring', label: 'Hiring / Team', icon: Users, color: 'blue' },
  { value: 'recurring', label: 'Recurring Setup', icon: Repeat, color: 'amber' },
  { value: 'other', label: 'Other', icon: Receipt, color: 'zinc' },
];

const CATEGORY_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  reinvestment: { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  inventory: { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  marketing: { text: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/30' },
  'product-testing': { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  tools: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  hiring: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  recurring: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  other: { text: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/30' },
};

function getToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function ProjectedPlanningPage() {
  const [planned, setPlanned] = useState<PlannedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form
  const [category, setCategory] = useState('reinvestment');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getToday());

  const fetchPlanned = useCallback(async () => {
    try {
      const res = await fetch('/api/finance?action=planned');
      const data = await res.json();
      setPlanned(data.planned ?? []);
    } catch { setPlanned([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPlanned(); }, [fetchPlanned]);

  const addPlanned = async () => {
    if (!amount || !category) return;
    setSaving(true);
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-planned', category, description, amount: Number(amount), date }),
      });
      const data = await res.json();
      if (data.planned) {
        setPlanned((prev) => [...prev, data.planned].sort((a, b) => a.date.localeCompare(b.date)));
        setDescription('');
        setAmount('');
        setShowForm(false);
      }
    } catch { /* fail silently */ }
    finally { setSaving(false); }
  };

  const deletePlanned = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-planned', id }),
      });
      setPlanned((prev) => prev.filter((p) => p.id !== id));
    } catch { /* fail silently */ }
    finally { setDeletingId(null); }
  };

  // Stats
  const total = planned.reduce((s, p) => s + p.amount, 0);
  const byCategory: Record<string, number> = {};
  for (const p of planned) byCategory[p.category] = (byCategory[p.category] ?? 0) + p.amount;
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  return (
    <PageTransition className="mx-auto max-w-5xl p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/finance/projected" className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Expense Planning</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Plan how to reinvest profits — projected outflows</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] shadow-lg shadow-primary/20"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? 'Cancel' : 'Plan Expense'}
        </button>
      </div>

      {/* Summary */}
      {planned.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1">Total Planned</p>
            <p className="text-2xl font-bold text-red-400 tabular-nums">{formatINR(total)}</p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">{planned.length} planned expense{planned.length !== 1 ? 's' : ''}</p>
          </div>
          {topCategories.slice(0, 3).map(([cat, amt]) => {
            const cfg = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other;
            const catLabel = PLAN_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
            return (
              <div key={cat} className={`rounded-xl border ${cfg.border} ${cfg.bg} px-4 py-3`}>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1">{catLabel}</p>
                <p className={`text-xl font-bold tabular-nums ${cfg.text}`}>{formatINR(amt)}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">{Math.round((amt / total) * 100)}% of total</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Plan an Expense</h2>
                  <p className="text-[10px] text-muted-foreground">Where will this profit go?</p>
                </div>
              </div>

              {/* Category */}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2">Category</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                  {PLAN_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isActive = category === cat.value;
                    const cfg = CATEGORY_COLORS[cat.value];
                    return (
                      <button
                        key={cat.value}
                        onClick={() => setCategory(cat.value)}
                        className={`group flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-center transition-all border ${
                          isActive
                            ? `${cfg.bg} ${cfg.border} ${cfg.text} shadow-sm`
                            : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent/5'
                        }`}
                      >
                        <Icon className={`h-4 w-4 transition ${isActive ? cfg.text : 'text-muted-foreground/50 group-hover:text-foreground'}`} />
                        <span className="text-[10px] font-medium leading-tight">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount + Description + Date */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_auto] gap-4">
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 block">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-semibold text-primary/60">₹</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-border/40 bg-background/40 pl-10 pr-4 py-3.5 text-[20px] font-semibold text-foreground tabular-nums placeholder:text-muted-foreground/20 focus:border-primary/40 focus:outline-none transition"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 block">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Restock Kairova bestseller — 500 units from supplier"
                    className="w-full rounded-xl border border-border/40 bg-background/40 px-4 py-3.5 text-[13px] text-foreground placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none transition"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 block">Planned Date</label>
                  <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-3">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="bg-transparent text-[12px] font-medium text-foreground outline-none [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={addPlanned}
                disabled={saving || !amount}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-[13px] font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Plan
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Planned List */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : planned.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No expenses planned yet</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Plan how to reinvest your profits</p>
        </motion.div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_120px_40px] sm:grid-cols-[1fr_160px_140px_120px_40px] gap-2 px-4 py-2 border-b border-border/50 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
            <span>Expense</span>
            <span className="hidden sm:block">Category</span>
            <span>Date</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <StaggerContainer className="max-h-[600px] overflow-y-auto">
            {planned.map((item) => {
              const cfg = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other;
              const catLabel = PLAN_CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category;
              return (
                <StaggerItem key={item.id}>
                  <div className="group grid grid-cols-[1fr_140px_120px_40px] sm:grid-cols-[1fr_160px_140px_120px_40px] gap-2 items-center px-4 py-3 border-b border-border/20 last:border-0 hover:bg-accent/5 transition">
                    <div className="min-w-0 flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${cfg.bg.replace('/10', '')} ${cfg.text.replace('text-', 'bg-').replace('-400', '-500')}`} />
                      <span className="text-[12px] font-medium text-foreground truncate">
                        {item.description || catLabel}
                      </span>
                    </div>
                    <span className={`hidden sm:inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.border} ${cfg.text} w-fit`}>
                      {catLabel}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60">
                      {new Date(item.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-[13px] font-semibold text-red-400 tabular-nums text-right">{formatINR(item.amount)}</span>
                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => deletePlanned(item.id)}
                        disabled={deletingId === item.id}
                        className="rounded-md p-1 text-muted-foreground/40 hover:text-red-400 transition disabled:opacity-50"
                      >
                        {deletingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      )}
    </PageTransition>
  );
}
