'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Loader2, Check, AlertTriangle,
  X, Box, ChevronDown,
} from 'lucide-react';
import type { InventoryEntry } from '@/types/shopify';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const STATUS_OPTIONS = ['', 'In Stock', 'Low Stock', 'Out of Stock', 'Ordered', 'Discontinued'];

const STATUS_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  'In Stock': { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
  'Low Stock': { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400' },
  'Out of Stock': { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', dot: 'bg-red-400' },
  'Ordered': { color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30', dot: 'bg-sky-400' },
  'Discontinued': { color: 'text-muted-foreground', bg: 'bg-border/30 border-border', dot: 'bg-muted-foreground' },
};

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

export default function InventoryPage() {
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const saveTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formReorder, setFormReorder] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formStatus, setFormStatus] = useState('');

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
    setFormName(''); setFormSku(''); setFormStock(''); setFormReorder(''); setFormSupplier(''); setFormCost(''); setFormStatus('');
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

  // Stats
  const totalProducts = entries.length;
  const inStockCount = entries.filter((e) => e.status === 'In Stock').length;
  const lowStockCount = entries.filter((e) => e.status === 'Low Stock').length;
  const outOfStockCount = entries.filter((e) => e.status === 'Out of Stock').length;
  const totalValue = entries.reduce((s, e) => s + (e.costPerUnit || 0) * (e.currentStock || 0), 0);
  const isLowStockWarning = (entry: InventoryEntry) => entry.reorderLevel > 0 && entry.currentStock <= entry.reorderLevel;

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Inventory</h1>
          <p className="text-[11px] text-muted-foreground">Stock levels and reorder points</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition hover:bg-primary/90">
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? 'Cancel' : 'Add Item'}
        </button>
      </div>

      {/* Summary stats */}
      <StaggerContainer className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {[
          { label: 'Total Items', value: totalProducts, color: 'text-foreground' },
          { label: 'In Stock', value: inStockCount, color: 'text-emerald-400' },
          { label: 'Low Stock', value: lowStockCount, color: 'text-amber-400' },
          { label: 'Out of Stock', value: outOfStockCount, color: 'text-red-400' },
          { label: 'Total Value', value: formatINR(totalValue), color: 'text-foreground', isString: true },
        ].map((stat) => (
          <StaggerItem key={stat.label}>
            <motion.div whileHover={{ y: -1 }} className="rounded-lg border border-border bg-card px-3 py-2 transition-shadow hover:shadow-[0_0_15px_rgba(167,139,250,0.04)]">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p>
              <p className={`mt-0.5 text-xl font-semibold ${stat.color}`}>{stat.isString ? stat.value : stat.value}</p>
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerContainer>

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
            const isEditing = editingId === entry.id;
            const isWarning = isLowStockWarning(entry);
            const status = saveStatus[entry.id] ?? 'idle';

            return (
              <StaggerItem key={entry.id}>
                <motion.div layout className={`group rounded-xl border bg-card transition-all hover:shadow-[0_0_20px_rgba(167,139,250,0.04)] ${isWarning ? 'border-amber-500/30 bg-amber-500/[0.02]' : 'border-border hover:border-border/80'} ${isEditing ? 'ring-1 ring-primary/20' : ''}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    {cfg && <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />}
                    {isWarning && !cfg && <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-foreground truncate">{entry.productName || <span className="text-muted-foreground/40 italic">Unnamed item</span>}</p>
                      {entry.sku && <p className="text-[11px] text-muted-foreground">{entry.sku}</p>}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 flex-wrap justify-end">
                      {/* Stock count */}
                      <div className="text-right">
                        <p className={`text-[14px] font-semibold ${isWarning ? 'text-amber-400' : 'text-foreground'}`}>{entry.currentStock}</p>
                        <p className="text-[9px] text-muted-foreground uppercase">in stock</p>
                      </div>

                      {/* Value */}
                      {entry.costPerUnit > 0 && entry.currentStock > 0 && (
                        <span className="text-[11px] font-medium text-muted-foreground">{formatINR(entry.costPerUnit * entry.currentStock)}</span>
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

                  <AnimatePresence>
                    {isEditing && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="border-t border-border px-4 py-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <FormField label="Product Name">
                            <input type="text" value={entry.productName} onChange={(e) => updateField(entry.id, 'productName', e.target.value)} onBlur={() => saveEntry(entry.id)} className="form-input" />
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
