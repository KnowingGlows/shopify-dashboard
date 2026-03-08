'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { BackgroundDecor } from '@/components/background-decor';
import { Button } from '@/components/ui/button';
import {
  Box,
  Plus,
  Trash2,
  Loader2,
  Check,
  AlertTriangle,
  Package,
} from 'lucide-react';
import type { InventoryEntry } from '@/types/shopify';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const STATUS_OPTIONS = ['', 'In Stock', 'Low Stock', 'Out of Stock', 'Ordered', 'Discontinued'];

const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);

export default function InventoryPage() {
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [addingItem, setAddingItem] = useState(false);
  const saveTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const addItem = async () => {
    setAddingItem(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.entry) {
        setEntries((prev) => [data.entry, ...prev]);
      }
    } catch {
      // silently fail
    } finally {
      setAddingItem(false);
    }
  };

  const updateField = (id: string, field: keyof InventoryEntry, value: string | number) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    );
  };

  const saveEntry = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;

    setSaveStatus((prev) => ({ ...prev, [id]: 'saving' }));
    try {
      const res = await fetch('/api/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          productName: entry.productName,
          sku: entry.sku,
          currentStock: entry.currentStock,
          reorderLevel: entry.reorderLevel,
          supplier: entry.supplier,
          costPerUnit: entry.costPerUnit,
          status: entry.status,
        }),
      });
      if (!res.ok) throw new Error();
      setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }));

      // Clear any existing timeout for this id
      if (saveTimeouts.current[id]) {
        clearTimeout(saveTimeouts.current[id]);
      }
      saveTimeouts.current[id] = setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [id]: 'idle' }));
      }, 2000);
    } catch {
      setSaveStatus((prev) => ({ ...prev, [id]: 'error' }));
    }
  };

  const deleteEntry = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch('/api/inventory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // silently fail
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleBlur = (id: string) => {
    saveEntry(id);
  };

  // Summary stats
  const totalProducts = entries.length;
  const inStockCount = entries.filter((e) => e.status === 'In Stock').length;
  const lowStockCount = entries.filter((e) => e.status === 'Low Stock').length;
  const outOfStockCount = entries.filter((e) => e.status === 'Out of Stock').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'In Stock':
        return 'text-emerald-400';
      case 'Low Stock':
        return 'text-amber-400';
      case 'Out of Stock':
        return 'text-red-400';
      case 'Ordered':
        return 'text-sky-400';
      case 'Discontinued':
        return 'text-muted-foreground';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'In Stock':
        return 'bg-emerald-400';
      case 'Low Stock':
        return 'bg-amber-400';
      case 'Out of Stock':
        return 'bg-red-400';
      case 'Ordered':
        return 'bg-sky-400';
      case 'Discontinued':
        return 'bg-muted-foreground';
      default:
        return 'bg-muted-foreground/40';
    }
  };

  const isLowStockWarning = (entry: InventoryEntry) =>
    entry.reorderLevel > 0 && entry.currentStock <= entry.reorderLevel;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-8">
        {/* Header card */}
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Box className="h-3.5 w-3.5 text-primary" />
            Inventory Tracker
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Inventory
              </h1>
              <p className="mt-2 text-muted-foreground">
                Track stock levels, reorder points, and supplier details.
              </p>
            </div>
            <Button
              onClick={addItem}
              disabled={addingItem}
              variant="outline"
              className="border-border/60 bg-background/60"
            >
              {addingItem ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-2 text-[10px] uppercase tracking-[0.2em]">
                Add Item
              </span>
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-border/50 bg-card/60 px-4 py-4 backdrop-blur">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <Package className="h-3.5 w-3.5 text-primary" />
              Total Products
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{totalProducts}</div>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card/60 px-4 py-4 backdrop-blur">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              In Stock
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{inStockCount}</div>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card/60 px-4 py-4 backdrop-blur">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              Low Stock
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{lowStockCount}</div>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card/60 px-4 py-4 backdrop-blur">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
              Out of Stock
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{outOfStockCount}</div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-card/60 p-12 text-center text-sm text-muted-foreground backdrop-blur">
            No inventory items yet. Click &quot;Add Item&quot; to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Table header */}
            <div className="hidden items-center gap-3 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground md:grid md:grid-cols-[1.5fr_1fr_0.8fr_0.8fr_1.2fr_0.8fr_1fr_auto_auto]">
              <span>Product Name</span>
              <span>SKU</span>
              <span>Current Stock</span>
              <span>Reorder Level</span>
              <span>Supplier</span>
              <span>Cost/Unit</span>
              <span>Status</span>
              <span className="w-8" />
              <span className="w-8" />
            </div>

            {/* Table rows */}
            {entries.map((entry) => {
              const status = saveStatus[entry.id] ?? 'idle';
              const isWarning = isLowStockWarning(entry);

              return (
                <div
                  key={entry.id}
                  className={`rounded-2xl border bg-card/60 backdrop-blur transition-all ${
                    isWarning
                      ? 'border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.08)]'
                      : 'border-border/50'
                  }`}
                >
                  <div className="grid items-center gap-3 p-4 md:grid-cols-[1.5fr_1fr_0.8fr_0.8fr_1.2fr_0.8fr_1fr_auto_auto]">
                    {/* Product Name */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                        Product Name
                      </span>
                      <input
                        type="text"
                        value={entry.productName}
                        onChange={(e) => updateField(entry.id, 'productName', e.target.value)}
                        onBlur={() => handleBlur(entry.id)}
                        placeholder="Product name"
                        className="bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                    </div>

                    {/* SKU */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                        SKU
                      </span>
                      <input
                        type="text"
                        value={entry.sku}
                        onChange={(e) => updateField(entry.id, 'sku', e.target.value)}
                        onBlur={() => handleBlur(entry.id)}
                        placeholder="SKU"
                        className="bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                    </div>

                    {/* Current Stock */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                        Current Stock
                      </span>
                      <input
                        type="number"
                        value={entry.currentStock || ''}
                        onChange={(e) =>
                          updateField(entry.id, 'currentStock', e.target.value === '' ? 0 : Number(e.target.value))
                        }
                        onBlur={() => handleBlur(entry.id)}
                        placeholder="0"
                        className="bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>

                    {/* Reorder Level */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                        Reorder Level
                      </span>
                      <input
                        type="number"
                        value={entry.reorderLevel || ''}
                        onChange={(e) =>
                          updateField(entry.id, 'reorderLevel', e.target.value === '' ? 0 : Number(e.target.value))
                        }
                        onBlur={() => handleBlur(entry.id)}
                        placeholder="0"
                        className="bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>

                    {/* Supplier */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                        Supplier
                      </span>
                      <input
                        type="text"
                        value={entry.supplier}
                        onChange={(e) => updateField(entry.id, 'supplier', e.target.value)}
                        onBlur={() => handleBlur(entry.id)}
                        placeholder="Supplier"
                        className="bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                    </div>

                    {/* Cost/Unit */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                        Cost/Unit
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={entry.costPerUnit || ''}
                          onChange={(e) =>
                            updateField(entry.id, 'costPerUnit', e.target.value === '' ? 0 : Number(e.target.value))
                          }
                          onBlur={() => handleBlur(entry.id)}
                          placeholder="0"
                          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        {entry.costPerUnit > 0 && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatINR(entry.costPerUnit)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                        Status
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${getStatusDot(entry.status)}`} />
                        <select
                          value={entry.status}
                          onChange={(e) => {
                            updateField(entry.id, 'status', e.target.value);
                            // Save immediately on status change
                            setTimeout(() => saveEntry(entry.id), 0);
                          }}
                          className={`w-full cursor-pointer bg-transparent text-sm outline-none ${getStatusColor(entry.status)}`}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt} className="bg-card text-foreground">
                              {opt || '-- Select --'}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Save indicator */}
                    <div className="flex h-8 w-8 items-center justify-center">
                      {status === 'saving' && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                      {status === 'saved' && (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                      {status === 'error' && (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                      )}
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      disabled={deletingIds.has(entry.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-red-400 disabled:opacity-30"
                    >
                      {deletingIds.has(entry.id) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Low stock warning bar */}
                  {isWarning && (
                    <div className="flex items-center gap-2 border-t border-amber-500/20 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      Stock at or below reorder level
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="rounded-3xl border border-border/50 bg-card/60 p-6 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          Edit fields inline. Changes auto-save on blur. Stock at or below reorder level is highlighted.
        </div>
      </div>
    </div>
  );
}
