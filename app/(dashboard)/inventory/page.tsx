'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Loader2, Check, AlertTriangle,
  X, Box, Package, Clock, CalendarClock,
  Ship, Send, History, ChevronRight,
  Search, Filter, RefreshCw, ArrowUp, FileText,
  TrendingDown, Layers,
} from 'lucide-react';
import type { InventoryEntry } from '@/types/shopify';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';
import { formatINR } from '@/lib/currency-converter';
import { DatePicker } from '@/components/date-picker';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface DispatchLog {
  id: string;
  inventoryId: string;
  quantity: number;
  date: string;
  createdAt: string;
}

const DEFAULT_STORE_OPTIONS = ['', 'Kairova', 'Mavric'];
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

function getISTDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function calcTimeline(entry: InventoryEntry) {
  if (!entry.dailyAvgOrders || entry.dailyAvgOrders <= 0) {
    return { daysRemaining: Infinity, reorderDate: null, urgent: false, warning: false, reorderInDays: Infinity };
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, string>>({});
  const [savingDispatches, setSavingDispatches] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [dispatchLogs, setDispatchLogs] = useState<Record<string, DispatchLog[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({});
  const saveTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Restock modal state
  const [restockId, setRestockId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockDate, setRestockDate] = useState(getISTDate());
  const [savingRestock, setSavingRestock] = useState(false);

  // Filter/search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSourcing, setFilterSourcing] = useState('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formReorderQty, setFormReorderQty] = useState('');
  const [formStatus, setFormStatus] = useState('');
  const [formStore, setFormStore] = useState('');
  const [formSourcing, setFormSourcing] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [storeOptions, setStoreOptions] = useState<string[]>(DEFAULT_STORE_OPTIONS);

  // Fetch stores dynamically
  useEffect(() => {
    fetch('/api/stores')
      .then((r) => r.json())
      .then((data) => {
        const stores: string[] = (data.stores ?? []).map((s: { handle: string; displayName?: string }) => s.displayName || s.handle).filter(Boolean);
        if (stores.length > 0) {
          const all = ['', ...new Set([...stores, ...DEFAULT_STORE_OPTIONS.filter(Boolean)])];
          setStoreOptions(all);
        }
      })
      .catch(() => {});
  }, []);

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

  const fetchDispatchLogs = async (inventoryId: string) => {
    if (dispatchLogs[inventoryId]) return;
    setLoadingLogs((prev) => ({ ...prev, [inventoryId]: true }));
    try {
      const res = await fetch(`/api/inventory?action=dispatches&inventoryId=${inventoryId}`);
      const data = await res.json();
      setDispatchLogs((prev) => ({ ...prev, [inventoryId]: data.dispatches ?? [] }));
    } catch { /* ignore */ }
    finally { setLoadingLogs((prev) => ({ ...prev, [inventoryId]: false })); }
  };

  const resetForm = () => {
    setFormName(''); setFormSku(''); setFormStock('');
    setFormCost(''); setFormStatus(''); setFormStore('');
    setFormSourcing(''); setFormNotes(''); setFormReorderQty('');
  };

  const addItem = async () => {
    if (!formName.trim()) return;
    setAddingItem(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: formName, sku: formSku, currentStock: Number(formStock) || 0,
          costPerUnit: Number(formCost) || 0, reorderQty: Number(formReorderQty) || 0,
          status: formStatus, store: formStore, sourcingOrigin: formSourcing, notes: formNotes,
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
          currentStock: entry.currentStock, reorderQty: entry.reorderQty,
          costPerUnit: entry.costPerUnit, status: entry.status,
          store: entry.store, sourcingOrigin: entry.sourcingOrigin,
          notes: entry.notes, lastRestockedDate: entry.lastRestockedDate,
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
      setExpandedId(null);
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
        setDispatchLogs({});
        fetchEntries();
        setTimeout(() => { setShowDispatch(false); setDispatchStatus('idle'); }, 1500);
      } else {
        setDispatchStatus('error');
      }
    } catch { setDispatchStatus('error'); }
    finally { setSavingDispatches(false); }
  };

  const handleRestock = async () => {
    if (!restockId || !restockQty) return;
    setSavingRestock(true);
    try {
      const entry = entries.find((e) => e.id === restockId);
      if (!entry) return;
      const newStock = (entry.currentStock || 0) + Number(restockQty);
      const res = await fetch('/api/inventory', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: restockId, currentStock: newStock, lastRestockedDate: restockDate, status: 'In Stock' }),
      });
      if (res.ok) {
        setEntries((prev) => prev.map((e) => e.id === restockId ? { ...e, currentStock: newStock, lastRestockedDate: restockDate, status: 'In Stock' } : e));
        setRestockId(null);
        setRestockQty('');
      }
    } catch { /* ignore */ }
    finally { setSavingRestock(false); }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      fetchDispatchLogs(id);
    }
  };

  // Stats
  const totalProducts = entries.length;
  const totalValue = entries.reduce((s, e) => s + (e.costPerUnit || 0) * (e.currentStock || 0), 0);
  const lowStockCount = entries.filter((e) => {
    const t = calcTimeline(e);
    return t.urgent || t.warning;
  }).length;
  const outOfStockCount = entries.filter((e) => e.status === 'Out of Stock').length;
  const orderedCount = entries.filter((e) => e.status === 'Ordered').length;

  // Reorder alerts
  const reorderAlerts = entries.filter((e) => {
    const t = calcTimeline(e);
    return t.urgent || t.warning;
  }).sort((a, b) => {
    const ta = calcTimeline(a);
    const tb = calcTimeline(b);
    return (ta.daysRemaining ?? 0) - (tb.daysRemaining ?? 0);
  });

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (searchQuery && !e.productName.toLowerCase().includes(searchQuery.toLowerCase()) && !e.sku.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterStore && e.store !== filterStore) return false;
      if (filterStatus && e.status !== filterStatus) return false;
      if (filterSourcing && e.sourcingOrigin !== filterSourcing) return false;
      return true;
    });
  }, [entries, searchQuery, filterStore, filterStatus, filterSourcing]);

  const hasFilter = searchQuery || filterStore || filterStatus || filterSourcing;

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Inventory</h1>
          <p className="text-[11px] text-muted-foreground">Stock levels, velocity & reorder planning</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchEntries()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-[12px] font-medium text-foreground hover:bg-accent/30 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
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

      {/* Stats */}
      <StaggerContainer className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Items', value: String(totalProducts), color: 'text-foreground', icon: <Layers className="h-4 w-4 text-muted-foreground" /> },
          { label: 'Total Value', value: formatINR(totalValue), color: 'text-foreground', icon: <Package className="h-4 w-4 text-muted-foreground" /> },
          { label: 'Needs Reorder', value: String(lowStockCount), color: lowStockCount > 0 ? 'text-amber-400' : 'text-muted-foreground', icon: <AlertTriangle className="h-4 w-4 text-amber-400/70" /> },
          { label: 'Out of Stock', value: String(outOfStockCount > 0 ? `${outOfStockCount}${orderedCount > 0 ? ` (${orderedCount} ordered)` : ''}` : outOfStockCount), color: outOfStockCount > 0 ? 'text-red-400' : 'text-muted-foreground', icon: <TrendingDown className="h-4 w-4 text-red-400/70" /> },
        ].map((stat) => (
          <StaggerItem key={stat.label}>
            <motion.div whileHover={{ y: -1 }} className="card-hover-glow rounded-xl border border-border bg-card px-4 py-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{stat.label}</p>
                {stat.icon}
              </div>
              <p className={`relative z-10 text-xl font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Reorder Alerts */}
      <AnimatePresence>
        {reorderAlerts.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] p-4 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <p className="text-[12px] font-semibold text-amber-300 uppercase tracking-wider">Reorder Alerts</p>
                <span className="text-[10px] text-amber-400/60 font-medium">{reorderAlerts.length} item{reorderAlerts.length !== 1 ? 's' : ''}</span>
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
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${STORE_CONFIG[entry.store]?.bg ?? ''} ${STORE_CONFIG[entry.store]?.color ?? ''}`}>
                          {entry.store}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {entry.reorderQty > 0 && (
                        <span className="text-[10px] text-muted-foreground/60">Order {entry.reorderQty} units</span>
                      )}
                      <p className={`text-[12px] font-semibold ${t.urgent ? 'text-red-400' : 'text-amber-400'}`}>
                        {t.urgent ? 'ORDER NOW' : `${t.daysRemaining}d left`}
                      </p>
                      {sourcing && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${sourcing.bg} ${sourcing.color}`}>
                          {sourcing.label} ({sourcing.leadDays}d)
                        </span>
                      )}
                      <button
                        onClick={() => { setRestockId(entry.id); setRestockQty(String(entry.reorderQty || '')); setRestockDate(getISTDate()); }}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                      >
                        <ArrowUp className="h-2.5 w-2.5" />
                        Restock
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Restock Modal */}
      <AnimatePresence>
        {restockId && (() => {
          const entry = entries.find((e) => e.id === restockId);
          if (!entry) return null;
          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRestockId(null)} />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }} className="relative z-10 w-[92vw] max-w-sm rounded-2xl border border-emerald-500/20 bg-card/95 shadow-2xl backdrop-blur-xl p-5 space-y-4 mx-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <ArrowUp className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Restock</p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{entry.productName}</p>
                    </div>
                  </div>
                  <button onClick={() => setRestockId(null)} className="rounded-lg border border-border/50 p-1.5 text-muted-foreground hover:text-foreground transition">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="rounded-lg border border-border/30 bg-background/40 px-3 py-2 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Current stock</span>
                  <span className="text-[13px] font-semibold text-foreground tabular-nums">{entry.currentStock} units</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">Units to Add</label>
                    <input
                      type="number"
                      min={1}
                      value={restockQty}
                      onChange={(e) => setRestockQty(e.target.value)}
                      placeholder={entry.reorderQty > 0 ? String(entry.reorderQty) : '0'}
                      autoFocus
                      className="w-full rounded-xl border border-border/40 bg-background/40 px-4 py-3 text-[18px] font-semibold text-foreground tabular-nums placeholder:text-muted-foreground/20 focus:border-primary/40 focus:outline-none transition"
                    />
                    {restockQty && (
                      <p className="text-[10px] text-emerald-400 mt-1">New stock: {(entry.currentStock || 0) + Number(restockQty)} units</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">Restock Date</label>
                    <DatePicker value={restockDate} onChange={(d) => setRestockDate(d)} />
                  </div>
                </div>

                <button
                  onClick={handleRestock}
                  disabled={savingRestock || !restockQty}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-[13px] font-semibold text-white transition hover:bg-emerald-600 active:scale-[0.97] disabled:opacity-40 shadow-lg shadow-emerald-500/20"
                >
                  {savingRestock ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                  Confirm Restock
                </button>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Dispatch Panel */}
      <AnimatePresence>
        {showDispatch && entries.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl border border-blue-500/20 bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400"><Send className="h-4 w-4" /></div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Log Today&apos;s Dispatches</h2>
                  <p className="text-[10px] text-muted-foreground">Enter how many units were shipped per product</p>
                </div>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {entries.filter((e) => e.currentStock > 0).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{entry.productName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entry.store && (
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${STORE_CONFIG[entry.store]?.bg ?? ''} ${STORE_CONFIG[entry.store]?.color ?? ''}`}>
                            {entry.store}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">Stock: {entry.currentStock}</span>
                        {entry.dailyAvgOrders > 0 && (
                          <span className="text-[10px] text-muted-foreground/50">Avg: {entry.dailyAvgOrders}/day</span>
                        )}
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
                    <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-red-400">Failed to save</motion.span>
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
            <div className="rounded-xl border border-primary/20 bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"><Box className="h-4 w-4" /></div>
                <h2 className="text-sm font-semibold text-foreground">New Inventory Item</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label="Product Name" required>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Product name..." className="form-input" autoFocus />
                </FormField>
                <FormField label="Store" required>
                  <select value={formStore} onChange={(e) => setFormStore(e.target.value)} className="form-input">
                    {storeOptions.map((s) => <option key={s} value={s}>{s || 'Select store...'}</option>)}
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
                <FormField label="Cost per Unit (INR)">
                  <input type="number" value={formCost} onChange={(e) => setFormCost(e.target.value)} placeholder="0" className="form-input" />
                </FormField>
                <FormField label="Reorder Qty">
                  <input type="number" value={formReorderQty} onChange={(e) => setFormReorderQty(e.target.value)} placeholder="0" className="form-input" />
                </FormField>
                <FormField label="Status">
                  <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} className="form-input">
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'Select status...'}</option>)}
                  </select>
                </FormField>
                <FormField label="Notes" className="lg:col-span-4">
                  <input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Any notes about this product..." className="form-input" />
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

      {/* Search + Filter Bar */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-lg border border-border/50 bg-card/60 pl-9 pr-4 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none transition"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <select value={filterStore} onChange={(e) => setFilterStore(e.target.value)} className="rounded-lg border border-border/50 bg-card/60 px-2 py-2 text-[11px] text-foreground focus:border-primary/40 focus:outline-none transition">
              <option value="">All Stores</option>
              {storeOptions.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-border/50 bg-card/60 px-2 py-2 text-[11px] text-foreground focus:border-primary/40 focus:outline-none transition">
              <option value="">All Status</option>
              {STATUS_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterSourcing} onChange={(e) => setFilterSourcing(e.target.value)} className="rounded-lg border border-border/50 bg-card/60 px-2 py-2 text-[11px] text-foreground focus:border-primary/40 focus:outline-none transition">
              <option value="">All Origins</option>
              {SOURCING_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{SOURCING_CONFIG[s]?.label}</option>)}
            </select>
            {hasFilter && (
              <button onClick={() => { setSearchQuery(''); setFilterStore(''); setFilterStatus(''); setFilterSourcing(''); }} className="rounded-lg border border-border/50 bg-card/60 px-2 py-2 text-[11px] text-muted-foreground hover:text-foreground transition">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Inventory Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : entries.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Box className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No inventory items yet</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Click &quot;Add Item&quot; to get started</p>
        </motion.div>
      ) : filteredEntries.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-10 text-center">
          <Search className="mx-auto h-6 w-6 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No items match your filters</p>
          <button onClick={() => { setSearchQuery(''); setFilterStore(''); setFilterStatus(''); setFilterSourcing(''); }} className="text-[11px] text-primary hover:text-primary/80 mt-1 transition">Clear filters</button>
        </motion.div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_75px_60px_75px_80px_75px_32px] gap-2 px-4 py-2.5 border-b border-border/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 bg-card">
            <span>Product</span>
            <span className="text-right">Stock</span>
            <span className="text-right">Avg/Day</span>
            <span className="text-right">Days Left</span>
            <span className="text-center">Status</span>
            <span className="text-right">Value</span>
            <span />
          </div>

          {/* Table body */}
          <div className="max-h-[700px] overflow-y-auto">
            {filteredEntries.map((entry) => {
              const cfg = STATUS_CONFIG[entry.status];
              const storeCfg = STORE_CONFIG[entry.store];
              const sourcing = SOURCING_CONFIG[entry.sourcingOrigin];
              const timeline = calcTimeline(entry);
              const isExpanded = expandedId === entry.id;
              const status = saveStatus[entry.id] ?? 'idle';
              const stockPct = entry.reorderLevel > 0
                ? Math.min(100, Math.round((entry.currentStock / (entry.reorderLevel * 3)) * 100))
                : entry.currentStock > 0 ? 75 : 0;
              const stockColor = timeline.urgent ? 'bg-red-400' : timeline.warning ? 'bg-amber-400' : 'bg-emerald-400';
              const logs = dispatchLogs[entry.id];

              return (
                <div key={entry.id} className={`border-b border-border/20 last:border-0 ${timeline.urgent ? 'bg-red-500/[0.02]' : timeline.warning ? 'bg-amber-500/[0.02]' : ''}`}>
                  {/* Main row */}
                  <button
                    onClick={() => toggleExpand(entry.id)}
                    className="w-full grid grid-cols-[1fr_75px_60px_75px_80px_75px_32px] gap-2 items-center px-4 py-3 hover:bg-accent/5 transition text-left"
                  >
                    {/* Product */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {cfg && <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />}
                        <span className="text-sm font-semibold text-foreground truncate">{entry.productName || 'Unnamed'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 pl-3.5 flex-wrap">
                        {storeCfg && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${storeCfg.bg} ${storeCfg.color}`}>
                            {entry.store}
                          </span>
                        )}
                        {sourcing && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${sourcing.bg} ${sourcing.color}`}>
                            {sourcing.label}
                          </span>
                        )}
                        {timeline.reorderDate && entry.dailyAvgOrders > 0 && (
                          <span className={`text-[11px] font-bold tracking-tight ${timeline.urgent ? 'text-red-400' : timeline.warning ? 'text-amber-400' : 'text-foreground/50'}`}>
                            {timeline.urgent ? '⚠ Order now' : `Reorder ${timeline.reorderDate}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stock */}
                    <div className="text-right">
                      <span className={`text-sm font-bold tabular-nums ${timeline.urgent ? 'text-red-400' : timeline.warning ? 'text-amber-400' : 'text-foreground'}`}>
                        {entry.currentStock}
                      </span>
                    </div>

                    {/* Avg/Day */}
                    <span className="text-sm font-semibold text-foreground/70 tabular-nums text-right">
                      {entry.dailyAvgOrders > 0 ? entry.dailyAvgOrders : '—'}
                    </span>

                    {/* Days Left */}
                    <div className="text-right">
                      <span className={`text-sm font-bold tabular-nums ${timeline.urgent ? 'text-red-400' : timeline.warning ? 'text-amber-400' : 'text-foreground/80'}`}>
                        {timeline.daysRemaining === Infinity ? '—' : `${timeline.daysRemaining}d`}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="text-center">
                      {entry.status && cfg && (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
                          {entry.status}
                        </span>
                      )}
                    </div>

                    {/* Value */}
                    <span className="text-[12px] font-semibold text-foreground/70 tabular-nums text-right">
                      {entry.costPerUnit > 0 && entry.currentStock > 0 ? formatINR(entry.costPerUnit * entry.currentStock) : '—'}
                    </span>

                    {/* Expand arrow */}
                    <div className="flex items-center justify-end">
                      <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground/40 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                  </button>

                  {/* Stock bar */}
                  {entry.dailyAvgOrders > 0 && (
                    <div className="px-4 pb-1.5">
                      <div className="h-0.5 rounded-full bg-border overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${stockPct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          className={`h-full rounded-full ${stockColor}`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Expanded detail panel */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="border-t border-border/30">
                          {/* Edit fields */}
                          <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            <FormField label="Product Name">
                              <input type="text" value={entry.productName} onChange={(e) => updateField(entry.id, 'productName', e.target.value)} onBlur={() => saveEntry(entry.id)} className="form-input text-[12px]" />
                            </FormField>
                            <FormField label="Store">
                              <select value={entry.store} onChange={(e) => { updateField(entry.id, 'store', e.target.value); setTimeout(() => saveEntry(entry.id), 0); }} className="form-input text-[12px]">
                                {storeOptions.map((s) => <option key={s} value={s}>{s || 'Select...'}</option>)}
                              </select>
                            </FormField>
                            <FormField label="Sourcing">
                              <select value={entry.sourcingOrigin} onChange={(e) => { updateField(entry.id, 'sourcingOrigin', e.target.value); setTimeout(() => saveEntry(entry.id), 0); }} className="form-input text-[12px]">
                                {SOURCING_OPTIONS.map((s) => <option key={s} value={s}>{s ? SOURCING_CONFIG[s]?.label : 'Select...'}</option>)}
                              </select>
                            </FormField>
                            <FormField label="Status">
                              <select value={entry.status} onChange={(e) => { updateField(entry.id, 'status', e.target.value); setTimeout(() => saveEntry(entry.id), 0); }} className={`form-input text-[12px] ${cfg?.color ?? ''}`}>
                                {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="bg-card text-foreground">{s || 'Select...'}</option>)}
                              </select>
                            </FormField>
                            <FormField label="Current Stock">
                              <input type="number" value={entry.currentStock || ''} onChange={(e) => updateField(entry.id, 'currentStock', e.target.value === '' ? 0 : Number(e.target.value))} onBlur={() => saveEntry(entry.id)} className="form-input text-[12px]" />
                            </FormField>
                            <FormField label="Cost/Unit">
                              <input type="number" value={entry.costPerUnit || ''} onChange={(e) => updateField(entry.id, 'costPerUnit', e.target.value === '' ? 0 : Number(e.target.value))} onBlur={() => saveEntry(entry.id)} className="form-input text-[12px]" />
                            </FormField>
                            <FormField label="Reorder Qty">
                              <input type="number" value={entry.reorderQty || ''} onChange={(e) => updateField(entry.id, 'reorderQty', e.target.value === '' ? 0 : Number(e.target.value))} onBlur={() => saveEntry(entry.id)} className="form-input text-[12px]" />
                            </FormField>
                            <FormField label="SKU">
                              <input type="text" value={entry.sku} onChange={(e) => updateField(entry.id, 'sku', e.target.value)} onBlur={() => saveEntry(entry.id)} className="form-input text-[12px]" />
                            </FormField>
                            <FormField label="Notes" className="lg:col-span-4">
                              <input type="text" value={entry.notes ?? ''} onChange={(e) => updateField(entry.id, 'notes', e.target.value)} onBlur={() => saveEntry(entry.id)} placeholder="Any notes..." className="form-input text-[12px]" />
                            </FormField>
                          </div>

                          {/* Save status + restock action */}
                          <div className="px-4 pb-2 flex items-center gap-3 flex-wrap">
                            {status !== 'idle' && (
                              <div className="flex items-center gap-1.5">
                                {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                                {status === 'saved' && <Check className="h-3 w-3 text-emerald-400" />}
                                {status === 'error' && <AlertTriangle className="h-3 w-3 text-red-400" />}
                                <span className="text-[10px] text-muted-foreground">{status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : 'Error saving'}</span>
                              </div>
                            )}
                            <button
                              onClick={() => { setRestockId(entry.id); setRestockQty(String(entry.reorderQty || '')); setRestockDate(getISTDate()); }}
                              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-medium text-emerald-400 transition hover:bg-emerald-500/20"
                            >
                              <ArrowUp className="h-3 w-3" />
                              Log Restock
                            </button>
                            {entry.lastRestockedDate && (
                              <span className="text-[10px] text-muted-foreground/50">Last restocked: {new Date(entry.lastRestockedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            )}
                          </div>

                          {/* Timeline info */}
                          {entry.dailyAvgOrders > 0 && (
                            <div className="border-t border-border/30 px-4 py-2.5 flex items-center gap-4 flex-wrap">
                              <InfoPill icon={<Package className="h-3 w-3" />} label="Avg daily" value={String(entry.dailyAvgOrders)} />
                              <InfoPill icon={<Clock className="h-3 w-3" />} label="Days left" value={timeline.daysRemaining === Infinity ? '--' : `${timeline.daysRemaining}d`} color={timeline.urgent ? 'text-red-400' : timeline.warning ? 'text-amber-400' : undefined} />
                              {sourcing && <InfoPill icon={<Ship className="h-3 w-3" />} label="Lead" value={`${sourcing.leadDays}d (${sourcing.label})`} />}
                              {timeline.reorderDate && <InfoPill icon={<CalendarClock className="h-3 w-3" />} label="Reorder by" value={timeline.reorderDate} color={timeline.urgent ? 'text-red-400' : undefined} />}
                              {entry.reorderQty > 0 && <InfoPill icon={<ArrowUp className="h-3 w-3" />} label="Reorder qty" value={`${entry.reorderQty} units`} />}
                            </div>
                          )}

                          {/* Dispatch Log */}
                          <div className="border-t border-border/30 px-4 py-3">
                            <div className="flex items-center gap-2 mb-3">
                              <History className="h-3.5 w-3.5 text-muted-foreground" />
                              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Dispatch History</p>
                            </div>

                            {loadingLogs[entry.id] ? (
                              <div className="flex items-center gap-2 py-3">
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                <span className="text-[11px] text-muted-foreground">Loading...</span>
                              </div>
                            ) : logs && logs.length > 0 ? (
                              <div className="rounded-lg border border-border/30 overflow-hidden max-h-48 overflow-y-auto">
                                <div className="grid grid-cols-[1fr_80px_120px] gap-2 px-3 py-1.5 bg-accent/5 text-[8px] font-medium uppercase tracking-wider text-muted-foreground/40 border-b border-border/20">
                                  <span>Date</span>
                                  <span className="text-right">Qty</span>
                                  <span className="text-right">Logged At</span>
                                </div>
                                {logs.map((log) => (
                                  <div key={log.id} className="grid grid-cols-[1fr_80px_120px] gap-2 px-3 py-2 border-b border-border/10 last:border-0">
                                    <span className="text-[11px] text-foreground tabular-nums">{log.date}</span>
                                    <span className="text-[11px] font-semibold text-foreground tabular-nums text-right">{log.quantity} units</span>
                                    <span className="text-[10px] text-muted-foreground/50 text-right">
                                      {new Date(log.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-muted-foreground/40 py-2">No dispatches logged yet</p>
                            )}
                          </div>

                          {/* Notes display */}
                          {entry.notes && (
                            <div className="border-t border-border/30 px-4 py-2.5 flex items-start gap-2">
                              <FileText className="h-3 w-3 text-muted-foreground/50 mt-0.5 shrink-0" />
                              <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{entry.notes}</p>
                            </div>
                          )}

                          {/* Delete */}
                          <div className="border-t border-border/30 px-4 py-2 flex justify-end">
                            <button onClick={() => deleteEntry(entry.id)} disabled={deletingIds.has(entry.id)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                              {deletingIds.has(entry.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Delete
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {hasFilter ? `${filteredEntries.length} of ${totalProducts}` : totalProducts} item{totalProducts !== 1 ? 's' : ''} · Click a row to expand · Auto-saves
      </p>
    </PageTransition>
  );
}

function FormField({ label, children, required, className }: { label: string; children: React.ReactNode; required?: boolean; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}{required && <span className="text-primary ml-0.5">*</span>}</label>
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
