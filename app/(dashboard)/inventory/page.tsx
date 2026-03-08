'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus,
  Trash2,
  Loader2,
  Check,
  AlertTriangle,
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
    <div className="mx-auto max-w-7xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Inventory</h1>
          <p className="text-[12px] text-muted-foreground">Stock levels and reorder points</p>
        </div>
        <button
          onClick={addItem}
          disabled={addingItem}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition hover:bg-secondary"
        >
          {addingItem ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add Item
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Items</p>
          <p className="mt-0.5 text-xl font-semibold text-foreground">{totalProducts}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">In Stock</p>
          <p className="mt-0.5 text-xl font-semibold text-emerald-400">{inStockCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Low Stock</p>
          <p className="mt-0.5 text-xl font-semibold text-amber-400">{lowStockCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Out of Stock</p>
          <p className="mt-0.5 text-xl font-semibold text-red-400">{outOfStockCount}</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No inventory items yet. Click &quot;Add Item&quot; to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="tracker-table">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Product Name</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Stock</th>
                <th className="px-3 py-2">Reorder</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Cost/Unit</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 w-16">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const status = saveStatus[entry.id] ?? 'idle';
                const isWarning = isLowStockWarning(entry);

                return (
                  <tr
                    key={entry.id}
                    className={`border-b border-border last:border-b-0 text-sm ${
                      isWarning ? 'bg-amber-500/[0.03]' : ''
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={entry.productName}
                        onChange={(e) => updateField(entry.id, 'productName', e.target.value)}
                        onBlur={() => handleBlur(entry.id)}
                        placeholder="Product name"
                        className="tracker-input"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={entry.sku}
                        onChange={(e) => updateField(entry.id, 'sku', e.target.value)}
                        onBlur={() => handleBlur(entry.id)}
                        placeholder="SKU"
                        className="tracker-input"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        value={entry.currentStock || ''}
                        onChange={(e) =>
                          updateField(entry.id, 'currentStock', e.target.value === '' ? 0 : Number(e.target.value))
                        }
                        onBlur={() => handleBlur(entry.id)}
                        placeholder="0"
                        className="tracker-input [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        value={entry.reorderLevel || ''}
                        onChange={(e) =>
                          updateField(entry.id, 'reorderLevel', e.target.value === '' ? 0 : Number(e.target.value))
                        }
                        onBlur={() => handleBlur(entry.id)}
                        placeholder="0"
                        className="tracker-input [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={entry.supplier}
                        onChange={(e) => updateField(entry.id, 'supplier', e.target.value)}
                        onBlur={() => handleBlur(entry.id)}
                        placeholder="Supplier"
                        className="tracker-input"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={entry.costPerUnit || ''}
                          onChange={(e) =>
                            updateField(entry.id, 'costPerUnit', e.target.value === '' ? 0 : Number(e.target.value))
                          }
                          onBlur={() => handleBlur(entry.id)}
                          placeholder="0"
                          className="tracker-input w-16 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        {entry.costPerUnit > 0 && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatINR(entry.costPerUnit)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getStatusDot(entry.status)}`} />
                        <select
                          value={entry.status}
                          onChange={(e) => {
                            updateField(entry.id, 'status', e.target.value);
                            // Save immediately on status change
                            setTimeout(() => saveEntry(entry.id), 0);
                          }}
                          className={`tracker-select ${getStatusColor(entry.status)}`}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt} className="bg-card text-foreground">
                              {opt || '-- Select --'}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <div className="flex h-6 w-6 items-center justify-center">
                          {status === 'saving' && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                          {status === 'saved' && (
                            <Check className="h-3 w-3 text-emerald-400" />
                          )}
                          {status === 'error' && (
                            <AlertTriangle className="h-3 w-3 text-red-400" />
                          )}
                        </div>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          disabled={deletingIds.has(entry.id)}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-destructive/10 hover:text-red-400 disabled:opacity-30"
                        >
                          {deletingIds.has(entry.id) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span>{totalProducts} item{totalProducts !== 1 ? 's' : ''}</span>
        <span>Rows highlighted in amber indicate stock at or below reorder level</span>
      </div>
    </div>
  );
}
