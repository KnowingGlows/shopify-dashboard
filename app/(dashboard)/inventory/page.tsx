'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Loader2, Check, AlertTriangle,
  X, Box, ChevronDown, Package, Clock, CalendarClock,
  Ship, MapPin, Store, Send,
} from 'lucide-react';
import type { InventoryEntry } from '@/types/shopify';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const STORE_OPTIONS = ['', 'Kairova', 'Mavric'];
const SOURCING_OPTIONS = ['', 'india', 'china'];
const STATUS_OPTIONS = ['', 'In Stock', 'Low Stock', 'Out of Stock', 'Ordered', 'Discontinued'];

const STATUS_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  'In Stock': { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
  'Low Stock': { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400' },
  'Out of Stock': { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', dot: 'bg-red-400' },
  'Ordered': { color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30', dot: 'bg-sky-400' },
  'Discontinued': { color: 'text-muted-foreground', bg: 'bg-border/30 border-border', dot: 'bg-muted-foreground' },
};

const STORE_CONFIG: Record<string, { color: string; bg: string }> = {
  'Kairova': { color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
  'Mavric': { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
};

const SOURCING_CONFIG: Record<string, { label: string; leadDays: number; color: string; bg: string }> = {
  'india': { label: 'India', leadDays: 1, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  'china': { label: 'China', leadDays: 20, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
};

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function calcTimeline(entry: InventoryEntry) {
  if (!entry.dailyAvgOrders || entry.dailyAvgOrders <= 0) {
    return { daysRemaining: Infinity, reorderDate: null, urgent: false, warning: false };
  }
  const daysRemaining = Math.round(entry.currentStock / entry.dailyAvgOrders);
  const sourcing = SOURCING_CONFIG[entry.sourcingOrigin];
  const leadDays = sourcing?.leadDays ?? 0;
  const reorderInDays = Math.max(0, daysRemaining - leadDays);
  const urgent = reorderInDays <= 0;
  const warning = reorderInDays > 0 && reorderInDays <= 3;
  const reorderDate = addDays(reorderInDays);
  return { daysRemaining, reorderDate, reorderInDays, urgent, warning };
}

export default function InventoryPage() {
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, string>>({});
  const [savingDispatches, setSavingDispatches] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const saveTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formReorder, setFormReorder] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formStatus, setFormStatus] = useState('');
  const [formStore, setFormStore] = useState('');
  const [formSourcing, setFormSourcing] = useState('');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const resetForm = () => {
    setFormName(''); setFormSku(''); setFormStock(''); setFormReorder('');
    setFormSupplier(''); setFormCost(''); setFormStatus(''); setFormStore(''); setFormSourcing('');
  };

  const addItem = async () => {
    if (!formName.trim()) return;
    setAddingItem(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: formName, sku: formSku, currentStock: Number(formStock) || 0,
          reorderLevel: Number(formReorder) || 0, supplier: formSupplier,
          costPerUnit: Number(formCost) || 0, status: formStatus,
          store: formStore, sourcingOrigin: formSourcing,
        }),
      });
      const data = await res.json();
      if (data.entry) { setEntries((prev) => [data.entry, ...prev]); resetForm(); setShowForm(false); }
    } catch { /* silently fail */ }
    finally { setAddingItem(false); }
  };

  const updateField = (id: string, field: keyof InventoryEntry, value: string | number) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const saveEntry = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    setSaveStatus((prev) => ({ ...prev, [id]: 'saving' }));
    try {
      const res = await fetch('/api/inventory', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id, productName: entry.productName, sku: entry.sku,
          currentStock: entry.currentStock, reorderLevel: entry.reorderLevel,
          supplier: entry.supplier, costPerUnit: entry.costPerUnit, status: entry.status,
          store: entry.store, sourcingOrigin: entry.sourcingOrigin,
        }),
      });
      if (!res.ok) throw new Error();
      setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }));
      if (saveTimeouts.current[id]) clearTimeout(saveTimeouts.current[id]);
      saveTimeouts.current[id] = setTimeout(() => setSaveStatus((prev) => ({ ...prev, [id]: 'idle' })), 2000);
    } catch { setSaveStatus((prev) => ({ ...prev, [id]: 'error' })); }
  };

  const deleteEntry = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch('/api/inventory', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch { /* silently fail */ }
    finally { setDeletingIds((prev) => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const saveDispatches = async () => {
    const dispatches = Object.entries(dispatchQuantities)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([inventoryId, qty]) => ({ inventoryId, quantity: Number(qty) }));
    if (dispatches.length === 0) return;

    setSavingDispatches(true);
    setDispatchStatus('idle');
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dispatch', dispatches }),
      });
      if (res.ok) {
        setDispatchQuantities({});
        setDispatchStatus('saved');
        fetchEntries();
        setTimeout(() => { setShowDispatch(false); setDispatchStatus('idle'); }, 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('Dispatch error:', data);
        setDispatchStatus('error');
      }
    } catch (err) {
      console.error('Dispatch error:', err);
      setDispatchStatus('error');
    }
    finally { setSavingDispatches(false); }
  };

  // Stats
  const totalProducts = entries.length;
  const kairovaCount = entries.filter((e) => e.store === 'Kairova').length;
  const mavricCount = entries.filter((e) => e.store === 'Mavric').length;
  const totalValue = entries.reduce((s, e) => s + (e.costPerUnit || 0) * (e.currentStock || 0), 0);

  // Reorder alerts
  const reorderAlerts = entries.filter((e) => {
    const t = calcTimeline(e);
    return t.urgent || t.warning;
  }).sort((a, b) => {
    const ta = calcTimeline(a);
    const tb = calcTimeline(b);
    return (ta.daysRemaining ?? 0) - (tb.daysRemaining ?? 0);
  });

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Inventory</h1>
          <p className="text-[11px] text-muted-foreground">Stock levels, dispatches & reorder planning</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowDispatch(!showDispatch); setShowForm(false); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-[12px] font-medium text-foreground transition hover:bg-accent/30"
          >
            {showDispatch ? <X className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {showDispatch ? 'Close' : 'Log Dispatches'}
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setShowDispatch(false); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? 'Cancel' : 'Add Item'}
          </button>
        </div>
      </div>

      {/* Reorder Alerts */}
      <AnimatePresence>
        {reorderAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] p-4 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <p className="text-[12px] font-semibold text-amber-300 uppercase tracking-wider">Reorder Alerts</p>
              </div>
              {reorderAlerts.map((entry) => {
                const t = calcTimeline(entry);
                const sourcing = SOURCING_CONFIG[entry.sourcingOrigin];
                return (
                  <div key={entry.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${t.urgent ? 'bg-red-500/10 border border-red-500/20' : 'bg-amber-500/5 border border-amber-500/10'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${t.urgent ? 'bg-red-400 animate-pulse' : 'bg-amber-400'}`} />
                      <span className="text-[13px] font-medium text-foreground truncate">{entry.productName}</span>
                      {entry.store && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${STORE_CONFIG[entry.store]?.bg ?? ''} ${STORE_CONFIG[entry.store]?.color ?? ''}`}>
                          {entry.store}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div>
                        <p className={`text-[12px] font-semibold ${t.urgent ? 'text-red-400' : 'text-amber-400'}`}>
                          {t.urgent ? 'ORDER NOW' : `${t.daysRemaining}d left`}
                        </p>
                        {t.reorderDate && (
                          <p className="text-[10px] text-muted-foreground">
                            Order by {t.reorderDate}
                          </p>
                        )}
                      </div>
                      {sourcing && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${sourcing.bg} ${sourcing.color}`}>
                          {sourcing.label} ({sourcing.leadDays}d)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary Stats */}
      <StaggerContainer className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: 'Total Items', value: String(totalProducts), color: 'text-foreground' },
          { label: 'Kairova', value: String(kairovaCount), color: 'text-violet-400' },
          { label: 'Mavric', value: String(mavricCount), color: 'text-blue-400' },
          { label: 'Total Value', value: formatINR(totalValue), color: 'text-foreground' },
        ].map((stat) => (
          <StaggerItem key={stat.label}>
            <motion.div whileHover={{ y: -1 }} className="card-hover-glow rounded-lg border border-border bg-card px-3 py-2">
              <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p>
              <p className={`relative z-10 mt-0.5 text-xl font-semibold ${stat.color}`}>{stat.value}</p>
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Dispatch Panel */}
      <AnimatePresence>
        {showDispatch && entries.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl border border-blue-500/20 bg-card p-5 shadow-[0_0_30px_rgba(59,130,246,0.04)]">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400"><Send className="h-4 w-4" /></div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Log Today&apos;s Dispatches</h2>
                  <p className="text-[10px] text-muted-foreground">Enter how many units were shipped per product</p>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {entries.filter((e) => e.currentStock > 0).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{entry.productName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entry.store && (
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${STORE_CONFIG[entry.store]?.bg ?? ''} ${STORE_CONFIG[entry.store]?.color ?? ''}`}>
                            {entry.store}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">Stock: {entry.currentStock}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        min="0"
                        max={entry.currentStock}
                        value={dispatchQuantities[entry.id] ?? ''}
                        onChange={(e) => setDispatchQuantities((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                        placeholder="0"
                        className="w-20 form-input text-center"
                      />
                      <span className="text-[10px] text-muted-foreground">units</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={saveDispatches}
                  disabled={savingDispatches || Object.values(dispatchQuantities).every((v) => !Number(v))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-5 py-2 text-[13px] font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
                >
                  {savingDispatches ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save Dispatches
                </button>
                <button onClick={() => { setShowDispatch(false); setDispatchQuantities({}); setDispatchStatus('idle'); }} className="rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground">
                  Cancel
                </button>
                <AnimatePresence>
                  {dispatchStatus === 'saved' && (
                    <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-emerald-400">Dispatches saved</motion.span>
                  )}
                  {dispatchStatus === 'error' && (
                    <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-red-400">Failed to save - check console</motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl border border-primary/20 bg-card p-5 shadow-[0_0_30px_rgba(167,139,250,0.06)]">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"><Box className="h-4 w-4" /></div>
                <h2 className="text-sm font-semibold text-foreground">New Inventory Item</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="Product Name" required>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Product name..." className="form-input" autoFocus />
                </FormField>
                <FormField label="Store" required>
                  <select value={formStore} onChange={(e) => setFormStore(e.target.value)} className="form-input">
                    {STORE_OPTIONS.map((s) => <option key={s} value={s}>{s || 'Select store...'}</option>)}
                  </select>
                </FormField>
                <FormField label="Sourcing Origin">
                  <select value={formSourcing} onChange={(e) => setFormSourcing(e.target.value)} className="form-input">
                    {SOURCING_OPTIONS.map((s) => <option key={s} value={s}>{s ? SOURCING_CONFIG[s]?.label + ` (${SOURCING_CONFIG[s]?.leadDays}d lead)` : 'Select origin...'}</option>)}
                  </select>
                </FormField>
                <FormField label="SKU">
                  <input type="text" value={formSku} onChange={(e) => setFormSku(e.target.value)} placeholder="SKU-001" className="form-input" />
                </FormField>
                <FormField label="Current Stock">
                  <input type="number" value={formStock} onChange={(e) => setFormStock(e.target.value)} placeholder="0" className="form-input" />
                </FormField>
                <FormField label="Reorder Level">
                  <input type="number" value={formReorder} onChange={(e) => setFormReorder(e.target.value)} placeholder="0" className="form-input" />
                </FormField>
                <FormField label="Supplier">
                  <input type="text" value={formSupplier} onChange={(e) => setFormSupplier(e.target.value)} placeholder="Supplier name..." className="form-input" />
                </FormField>
                <FormField label="Cost per Unit (INR)">
                  <input type="number" value={formCost} onChange={(e) => setFormCost(e.target.value)} placeholder="0" className="form-input" />
                </FormField>
                <FormField label="Status">
                  <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} className="form-input">
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'Select status...'}</option>)}
                  </select>
                </FormField>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button onClick={addItem} disabled={addingItem || !formName.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50">
                  {addingItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Add Item
                </button>
                <button onClick={() => { resetForm(); setShowForm(false); }} className="rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : entries.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Box className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No inventory items yet</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Click &quot;Add Item&quot; to get started</p>
        </motion.div>
      ) : (
        <StaggerContainer className="space-y-2">
          {entries.map((entry) => {
            const cfg = STATUS_CONFIG[entry.status];
            const storeCfg = STORE_CONFIG[entry.store];
            const sourcing = SOURCING_CONFIG[entry.sourcingOrigin];
            const timeline = calcTimeline(entry);
            const isEditing = editingId === entry.id;
            const status = saveStatus[entry.id] ?? 'idle';
            const stockPct = entry.reorderLevel > 0
              ? Math.min(100, Math.round((entry.currentStock / (entry.reorderLevel * 3)) * 100))
              : entry.currentStock > 0 ? 80 : 0;
            const stockColor = timeline.urgent ? 'bg-red-400' : timeline.warning ? 'bg-amber-400' : 'bg-emerald-400';

            return (
              <StaggerItem key={entry.id}>
                <motion.div layout className={`group rounded-xl border bg-card transition-all hover:shadow-[0_0_20px_rgba(167,139,250,0.04)] ${timeline.urgent ? 'border-red-500/30 bg-red-500/[0.02]' : timeline.warning ? 'border-amber-500/30 bg-amber-500/[0.02]' : 'border-border hover:border-border/80'} ${isEditing ? 'ring-1 ring-primary/20' : ''}`}>
                  {/* Main row */}
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-3">
                      {cfg && <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[14px] font-medium text-foreground truncate">{entry.productName || <span className="text-muted-foreground/40 italic">Unnamed</span>}</p>
                          {storeCfg && (
                            <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${storeCfg.bg} ${storeCfg.color}`}>
                              <Store className="h-2.5 w-2.5" />{entry.store}
                            </span>
                          )}
                          {sourcing && (
                            <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${sourcing.bg} ${sourcing.color}`}>
                              <MapPin className="h-2.5 w-2.5" />{sourcing.label}
                            </span>
                          )}
                        </div>
                        {entry.sku && <p className="text-[11px] text-muted-foreground">{entry.sku}{entry.supplier ? ` · ${entry.supplier}` : ''}</p>}
                      </div>

                      <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                        {/* Stock */}
                        <div className="text-right">
                          <p className={`text-[14px] font-semibold ${timeline.urgent ? 'text-red-400' : timeline.warning ? 'text-amber-400' : 'text-foreground'}`}>{entry.currentStock}</p>
                          <p className="text-[9px] text-muted-foreground uppercase">in stock</p>
                        </div>

                        {/* Daily avg */}
                        {entry.dailyAvgOrders > 0 && (
                          <div className="text-right">
                            <p className="text-[13px] font-medium text-foreground">{entry.dailyAvgOrders}</p>
                            <p className="text-[9px] text-muted-foreground uppercase">avg/day</p>
                          </div>
                        )}

                        {/* Status badge */}
                        {entry.status && cfg && (
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>{entry.status}</span>
                        )}

                        {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                        {status === 'saved' && <Check className="h-3 w-3 text-emerald-400" />}
                        {status === 'error' && <AlertTriangle className="h-3 w-3 text-red-400" />}

                        <button onClick={() => setEditingId(isEditing ? null : entry.id)} className="rounded-md p-1 text-muted-foreground/40 hover:text-foreground transition">
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isEditing ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Timeline bar */}
                    {entry.dailyAvgOrders > 0 && (
                      <div className="flex items-center gap-3 pl-5">
                        <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stockPct}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className={`h-full rounded-full ${stockColor}`}
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className={`text-[11px] font-medium ${timeline.urgent ? 'text-red-400' : timeline.warning ? 'text-amber-400' : 'text-muted-foreground'}`}>
                            {timeline.daysRemaining === Infinity ? '--' : `${timeline.daysRemaining}d left`}
                          </span>
                          {timeline.reorderDate && sourcing && (
                            <>
                              <CalendarClock className="h-3 w-3 text-muted-foreground ml-1" />
                              <span className={`text-[11px] font-medium ${timeline.urgent ? 'text-red-400' : 'text-muted-foreground'}`}>
                                Order by {timeline.reorderDate}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Edit panel */}
                  <AnimatePresence>
                    {isEditing && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="border-t border-border px-4 py-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <FormField label="Product Name">
                            <input type="text" value={entry.productName} onChange={(e) => updateField(entry.id, 'productName', e.target.value)} onBlur={() => saveEntry(entry.id)} className="form-input" />
                          </FormField>
                          <FormField label="Store">
                            <select value={entry.store} onChange={(e) => { updateField(entry.id, 'store', e.target.value); setTimeout(() => saveEntry(entry.id), 0); }} className="form-input">
                              {STORE_OPTIONS.map((s) => <option key={s} value={s}>{s || 'Select...'}</option>)}
                            </select>
                          </FormField>
                          <FormField label="Sourcing Origin">
                            <select value={entry.sourcingOrigin} onChange={(e) => { updateField(entry.id, 'sourcingOrigin', e.target.value); setTimeout(() => saveEntry(entry.id), 0); }} className="form-input">
                              {SOURCING_OPTIONS.map((s) => <option key={s} value={s}>{s ? SOURCING_CONFIG[s]?.label : 'Select...'}</option>)}
                            </select>
                          </FormField>
                          <FormField label="SKU">
                            <input type="text" value={entry.sku} onChange={(e) => updateField(entry.id, 'sku', e.target.value)} onBlur={() => saveEntry(entry.id)} className="form-input" />
                          </FormField>
                          <FormField label="Current Stock">
                            <input type="number" value={entry.currentStock || ''} onChange={(e) => updateField(entry.id, 'currentStock', e.target.value === '' ? 0 : Number(e.target.value))} onBlur={() => saveEntry(entry.id)} className="form-input" />
                          </FormField>
                          <FormField label="Reorder Level">
                            <input type="number" value={entry.reorderLevel || ''} onChange={(e) => updateField(entry.id, 'reorderLevel', e.target.value === '' ? 0 : Number(e.target.value))} onBlur={() => saveEntry(entry.id)} className="form-input" />
                          </FormField>
                          <FormField label="Supplier">
                            <input type="text" value={entry.supplier} onChange={(e) => updateField(entry.id, 'supplier', e.target.value)} onBlur={() => saveEntry(entry.id)} className="form-input" />
                          </FormField>
                          <FormField label="Cost per Unit">
                            <input type="number" value={entry.costPerUnit || ''} onChange={(e) => updateField(entry.id, 'costPerUnit', e.target.value === '' ? 0 : Number(e.target.value))} onBlur={() => saveEntry(entry.id)} className="form-input" />
                          </FormField>
                          <FormField label="Status">
                            <select value={entry.status} onChange={(e) => { updateField(entry.id, 'status', e.target.value); setTimeout(() => saveEntry(entry.id), 0); }} className={`form-input ${cfg?.color ?? ''}`}>
                              {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="bg-card text-foreground">{s || 'Select...'}</option>)}
                            </select>
                          </FormField>
                        </div>
                        {/* Inventory info */}
                        {entry.dailyAvgOrders > 0 && (
                          <div className="border-t border-border px-4 py-2.5 flex items-center gap-4 flex-wrap">
                            <InfoPill icon={<Package className="h-3 w-3" />} label="Avg daily orders" value={String(entry.dailyAvgOrders)} />
                            <InfoPill icon={<Clock className="h-3 w-3" />} label="Days remaining" value={timeline.daysRemaining === Infinity ? '--' : `${timeline.daysRemaining}d`} color={timeline.urgent ? 'text-red-400' : timeline.warning ? 'text-amber-400' : undefined} />
                            {sourcing && <InfoPill icon={<Ship className="h-3 w-3" />} label="Lead time" value={`${sourcing.leadDays}d (${sourcing.label})`} />}
                            {timeline.reorderDate && <InfoPill icon={<CalendarClock className="h-3 w-3" />} label="Reorder by" value={timeline.reorderDate} color={timeline.urgent ? 'text-red-400' : undefined} />}
                            {entry.costPerUnit > 0 && entry.currentStock > 0 && <InfoPill icon={<Store className="h-3 w-3" />} label="Value" value={formatINR(entry.costPerUnit * entry.currentStock)} />}
                          </div>
                        )}
                        <div className="border-t border-border px-4 py-2 flex justify-end">
                          <button onClick={() => deleteEntry(entry.id)} disabled={deletingIds.has(entry.id)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                            {deletingIds.has(entry.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Delete
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}

      <p className="text-[11px] text-muted-foreground">{totalProducts} item{totalProducts !== 1 ? 's' : ''} · Click a row to edit · Auto-saves</p>
    </PageTransition>
  );
}

function FormField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}{required && <span className="text-primary ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

function InfoPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[10px] text-muted-foreground">{label}:</span>
      <span className={`text-[11px] font-semibold ${color ?? 'text-foreground'}`}>{value}</span>
    </div>
  );
}
