'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PackageCheck, Plus, Trash2, Pencil, Check, X, Loader2, ChevronLeft, ChevronRight, IndianRupee, AlertTriangle } from 'lucide-react';
import { PageTransition } from '@/components/motion';
import type { DailyDispatchEntry } from '@/types/shopify';
import { formatINR } from '@/lib/currency-converter';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';

type Tier = {
  key: 'tier1' | 'tier2' | 'tier3';
  label: string;
  upTo: number;          // upper bound inclusive
  base: number;          // INR base payout
  rangeLabel: string;
};

const TIERS: Tier[] = [
  { key: 'tier1', label: 'Tier 1', upTo: 3000,  base: 125000, rangeLabel: 'Up to 3,000 orders' },
  { key: 'tier2', label: 'Tier 2', upTo: 7000,  base: 175000, rangeLabel: '3,001 – 7,000 orders' },
  { key: 'tier3', label: 'Tier 3', upTo: 15000, base: 300000, rangeLabel: '7,001 – 15,000 orders' },
];

function tierFor(monthlyOrders: number): { tier: Tier; exceedsCap: boolean } {
  if (monthlyOrders <= TIERS[0].upTo) return { tier: TIERS[0], exceedsCap: false };
  if (monthlyOrders <= TIERS[1].upTo) return { tier: TIERS[1], exceedsCap: false };
  if (monthlyOrders <= TIERS[2].upTo) return { tier: TIERS[2], exceedsCap: false };
  return { tier: TIERS[2], exceedsCap: true };
}

function getISTDate(date?: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date ?? new Date());
}

function getISTMonth(date?: Date): string {
  // YYYY-MM in IST
  return getISTDate(date).slice(0, 7);
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    const to = Number.isFinite(value) ? value : 0;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

export default function DispatchPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState<string>(getISTMonth());
  const [entries, setEntries] = useState<DailyDispatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New-entry form state
  const [newDate, setNewDate] = useState<string>(getISTDate());
  const [newOrders, setNewOrders] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');

  // Inline-edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editOrders, setEditOrders] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const fetchEntries = async (m = month) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/dispatch?month=${encodeURIComponent(m)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries(month);
  }, [month]);

  const monthlyTotal = useMemo(
    () => entries.reduce((sum, e) => sum + (Number(e.orders) || 0), 0),
    [entries]
  );
  const animatedTotal = useCountUp(monthlyTotal);
  const { tier, exceedsCap } = tierFor(monthlyTotal);
  const animatedPayout = useCountUp(tier.base);

  // Tier progress within the 0 → 15k scale, capped at 100%
  const progressPct = Math.min(100, (monthlyTotal / TIERS[TIERS.length - 1].upTo) * 100);

  const addEntry = async () => {
    const orders = parseInt(newOrders, 10);
    if (!newDate || !Number.isFinite(orders) || orders < 0) {
      setError('Enter a valid date and a non-negative order count.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, orders, notes: newNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNewOrders('');
      setNewNotes('');
      // If the new entry's month matches the active filter, prepend; otherwise refetch its month
      if (newDate.startsWith(month)) {
        setEntries((prev) => [data.entry, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      } else {
        // Switch to that month so the user sees their entry
        setMonth(newDate.slice(0, 7));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add entry.');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (e: DailyDispatchEntry) => {
    setEditingId(e.id);
    setEditDate(e.date);
    setEditOrders(String(e.orders));
    setEditNotes(e.notes ?? '');
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (id: string) => {
    const orders = parseInt(editOrders, 10);
    if (!editDate || !Number.isFinite(orders) || orders < 0) {
      setError('Enter a valid date and a non-negative order count.');
      return;
    }
    try {
      setSaving(true);
      const res = await fetch('/api/dispatch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, date: editDate, orders, notes: editNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setEntries((prev) =>
        prev
          .map((e) => (e.id === id ? { ...e, date: editDate, orders, notes: editNotes } : e))
          .filter((e) => e.date.startsWith(month))
          .sort((a, b) => b.date.localeCompare(a.date))
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update entry.');
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (id: string) => {
    if (!confirm('Delete this dispatch entry?')) return;
    try {
      setSaving(true);
      const res = await fetch('/api/dispatch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry.');
    } finally {
      setSaving(false);
    }
  };

  const isCurrentMonth = month === getISTMonth();
  const recordedDays = entries.length;
  const avgPerRecordedDay = recordedDays > 0 ? Math.round(monthlyTotal / recordedDays) : 0;

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <PackageCheck className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Daily Dispatch</h1>
            <p className="text-[11px] text-muted-foreground">
              Track daily orders dispatched and Umang&apos;s monthly tier
            </p>
          </div>
        </div>

        {/* Month selector */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/30 hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="px-2 text-[12px] font-medium text-foreground tabular-nums min-w-[140px] text-center">
            {monthLabel(month)}
            {isCurrentMonth && <span className="ml-2 text-[10px] font-normal text-primary">· Current</span>}
          </span>
          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/30 hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tier + payout summary */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ y: -2 }}
        className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow"
      >
        <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
          {/* Total */}
          <div className="border-b border-border md:border-b-0 md:border-r p-5">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Monthly orders
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground tabular-nums">
              {Math.round(animatedTotal).toLocaleString('en-IN')}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {recordedDays} day{recordedDays === 1 ? '' : 's'} recorded
              {recordedDays > 0 && <> · ~{avgPerRecordedDay.toLocaleString('en-IN')}/day avg</>}
            </p>
          </div>

          {/* Tier */}
          <div className="border-b border-border md:border-b-0 md:border-r p-5">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Active tier
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {tier.label}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{tier.rangeLabel}</p>
            {exceedsCap && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Exceeds 15k cap
              </p>
            )}
          </div>

          {/* Payout */}
          <div className="p-5">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Base payout to Umang
            </p>
            <div className="mt-2 flex items-baseline gap-1">
              <IndianRupee className="h-5 w-5 text-emerald-400" />
              <p className="text-3xl font-semibold tracking-tight text-emerald-400 tabular-nums">
                {Math.round(animatedPayout).toLocaleString('en-IN')}
              </p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{formatINR(tier.base)}</p>
          </div>
        </div>

        {/* Tier progress bar */}
        <div className="px-5 pb-5">
          <div className="relative h-2 overflow-hidden rounded-full bg-border">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-primary via-emerald-400 to-emerald-500"
            />
            {/* Tier markers */}
            {TIERS.slice(0, -1).map((t) => (
              <span
                key={t.key}
                className="absolute top-0 h-full w-px bg-background/60"
                style={{ left: `${(t.upTo / TIERS[TIERS.length - 1].upTo) * 100}%` }}
                aria-hidden
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>0</span>
            <span>3,000</span>
            <span>7,000</span>
            <span>15,000</span>
          </div>
        </div>
      </motion.div>

      {/* Add new entry */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="rounded-xl border border-border bg-card overflow-hidden"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Plus className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-sm font-medium text-foreground">Record a day</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[160px_140px_1fr_auto]">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Date</label>
            <DatePicker
              value={newDate}
              onChange={(d) => setNewDate(d || getISTDate())}
              max={getISTDate()}
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Orders dispatched</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={newOrders}
              onChange={(e) => setNewOrders(e.target.value)}
              placeholder="e.g. 145"
              className="form-input tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Notes (optional)</label>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Any context for this day…"
              className="form-input"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={addEntry}
              disabled={saving || !newOrders}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-primary/15 px-4 text-[12px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
          </div>
        </div>
      </motion.div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-destructive/70 hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Entries table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="rounded-xl border border-border bg-card overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-medium text-foreground">{monthLabel(month)} entries</h2>
          <span className="text-[11px] text-muted-foreground">
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
            {entries.length > 0 && <> · {monthlyTotal.toLocaleString('en-IN')} orders</>}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <PackageCheck className="mx-auto h-6 w-6 text-muted-foreground/30" />
            <p className="mt-2 text-[12px] text-muted-foreground">
              No dispatches recorded for {monthLabel(month)} yet.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/60">
              Add the first day above to start tracking.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tracker-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Date</th>
                  <th style={{ width: 130 }}>Orders</th>
                  <th>Notes</th>
                  <th style={{ width: 160 }}>Recorded by</th>
                  <th style={{ width: 90, textAlign: 'right' }}>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {entries.map((e, idx) => {
                    const isEditing = editingId === e.id;
                    return (
                      <motion.tr
                        key={e.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.25, delay: Math.min(idx * 0.02, 0.2) }}
                      >
                        <td>
                          {isEditing ? (
                            <div className="px-2 py-1.5">
                              <DatePicker
                                value={editDate}
                                onChange={(d) => setEditDate(d)}
                                max={getISTDate()}
                                compact
                              />
                            </div>
                          ) : (
                            <div className="px-3 py-2 text-[13px] tabular-nums text-foreground">
                              {new Date(e.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </div>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={editOrders}
                              onChange={(ev) => setEditOrders(ev.target.value)}
                              className="tracker-input tabular-nums"
                            />
                          ) : (
                            <div className="px-3 py-2 text-[13px] font-semibold tabular-nums text-foreground">
                              {e.orders.toLocaleString('en-IN')}
                            </div>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editNotes}
                              onChange={(ev) => setEditNotes(ev.target.value)}
                              className="tracker-input"
                              placeholder="Notes"
                            />
                          ) : (
                            <div className="px-3 py-2 text-[12px] text-muted-foreground">
                              {e.notes || <span className="text-muted-foreground/40">—</span>}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="px-3 py-2 text-[11px] text-muted-foreground">
                            {e.recordedBy || '—'}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1 px-3 py-1.5">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(e.id)}
                                  disabled={saving}
                                  className="rounded-md p-1.5 text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-40"
                                  aria-label="Save"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/30 hover:text-foreground"
                                  aria-label="Cancel"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => beginEdit(e)}
                                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/30 hover:text-foreground"
                                  aria-label="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => removeEntry(e.id)}
                                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400"
                                  aria-label="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Tier reference */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Tier reference
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TIERS.map((t) => {
            const isActive = t.key === tier.key && !exceedsCap;
            return (
              <div
                key={t.key}
                className={`rounded-lg border px-3 py-2.5 transition-colors ${
                  isActive
                    ? 'border-primary/40 bg-primary/[0.06]'
                    : 'border-border bg-background/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-foreground">{t.label}</span>
                  <span className={`text-[12px] font-semibold tabular-nums ${isActive ? 'text-primary' : 'text-foreground'}`}>
                    {formatINR(t.base)}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{t.rangeLabel}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground/60">
          Logged in as {user?.email ?? '—'} · entries are timestamped with your account.
        </p>
      </div>
    </PageTransition>
  );
}
