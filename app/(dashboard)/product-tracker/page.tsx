'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { BackgroundDecor } from '@/components/background-decor';
import { Button } from '@/components/ui/button';
import {
  Package,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { ProductTrackerEntry } from '@/types/shopify';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const PRODUCT_STAGES = [
  '',
  'Testing Store Page Done',
  'Winner - Moved To OPS',
  'Testing Ads',
  'Dropped',
  'Research Phase',
];

export default function ProductTrackerPage() {
  const [entries, setEntries] = useState<ProductTrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const saveTimeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/product-tracker');
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

  const addEntry = async () => {
    setAdding(true);
    try {
      const res = await fetch('/api/product-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: '',
          productFileLink: '',
          productStage: '',
          totalSpent: 0,
          remarks: '',
        }),
      });
      const data = await res.json();
      if (data.entry) {
        setEntries((prev) => [data.entry, ...prev]);
      }
    } catch {
      // silently fail
    } finally {
      setAdding(false);
    }
  };

  const updateLocalField = (
    id: string,
    field: keyof ProductTrackerEntry,
    value: string | number
  ) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const saveEntry = useCallback(
    async (id: string, field: keyof ProductTrackerEntry, value: string | number) => {
      setSaveStatus((prev) => ({ ...prev, [id]: 'saving' }));
      try {
        const res = await fetch('/api/product-tracker', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, [field]: value }),
        });
        if (!res.ok) throw new Error();
        setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }));

        // Clear any existing timeout for this entry
        if (saveTimeoutRefs.current[id]) {
          clearTimeout(saveTimeoutRefs.current[id]);
        }
        saveTimeoutRefs.current[id] = setTimeout(() => {
          setSaveStatus((prev) => ({ ...prev, [id]: 'idle' }));
        }, 1500);
      } catch {
        setSaveStatus((prev) => ({ ...prev, [id]: 'error' }));
      }
    },
    []
  );

  const handleBlur = (
    id: string,
    field: keyof ProductTrackerEntry,
    value: string | number
  ) => {
    saveEntry(id, field, value);
  };

  const handleSelectChange = (
    id: string,
    value: string
  ) => {
    updateLocalField(id, 'productStage', value);
    saveEntry(id, 'productStage', value);
  };

  const deleteEntry = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch('/api/product-tracker', {
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

  const getStatusIcon = (id: string) => {
    const status = saveStatus[id] ?? 'idle';
    if (status === 'saving') return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
    if (status === 'saved') return <Check className="h-3 w-3 text-emerald-400" />;
    if (status === 'error') return <AlertCircle className="h-3 w-3 text-destructive" />;
    return null;
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-8">
        {/* Header card */}
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Package className="h-3.5 w-3.5 text-primary" />
            Product Tracker
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Product Tracker
              </h1>
              <p className="mt-2 text-muted-foreground">
                Track products from research to launch. Auto-saves on edit.
              </p>
            </div>
            <Button
              onClick={addEntry}
              disabled={adding}
              variant="outline"
              className="border-border/60 bg-background/60"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-2 text-[10px] uppercase tracking-[0.2em]">
                Add Product
              </span>
            </Button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-3xl border border-border/50 bg-card/60 p-12 text-center text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
            No products yet. Click &quot;Add Product&quot; to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Column headers */}
            <div className="hidden gap-3 px-4 text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:grid md:grid-cols-[1fr_1fr_180px_100px_1fr_40px_24px]">
              <span>Product Name</span>
              <span>Product File Link</span>
              <span>Product Stage</span>
              <span>Total Spent</span>
              <span>Remarks</span>
              <span />
              <span />
            </div>

            {/* Rows */}
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="group grid gap-3 rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur transition-colors hover:bg-card/80 md:grid-cols-[1fr_1fr_180px_100px_1fr_40px_24px] md:items-center"
              >
                {/* Product Name */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Product Name
                  </span>
                  <input
                    type="text"
                    value={entry.productName}
                    onChange={(e) => updateLocalField(entry.id, 'productName', e.target.value)}
                    onBlur={(e) => handleBlur(entry.id, 'productName', e.target.value)}
                    placeholder="Product name..."
                    className="bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                </div>

                {/* Product File Link */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Product File Link
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={entry.productFileLink}
                      onChange={(e) => updateLocalField(entry.id, 'productFileLink', e.target.value)}
                      onBlur={(e) => handleBlur(entry.id, 'productFileLink', e.target.value)}
                      placeholder="https://..."
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                    />
                    {entry.productFileLink && (
                      <a
                        href={entry.productFileLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-primary/60 transition-colors hover:text-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Product Stage */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Product Stage
                  </span>
                  <select
                    value={entry.productStage}
                    onChange={(e) => handleSelectChange(entry.id, e.target.value)}
                    className="cursor-pointer rounded-lg border border-border/40 bg-transparent px-2 py-1 text-xs text-foreground outline-none transition-colors hover:border-border/80 focus:border-primary/50"
                  >
                    {PRODUCT_STAGES.map((stage) => (
                      <option key={stage} value={stage} className="bg-card text-foreground">
                        {stage || '— Select —'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Total Spent */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Total Spent
                  </span>
                  <input
                    type="number"
                    value={entry.totalSpent || ''}
                    onChange={(e) =>
                      updateLocalField(
                        entry.id,
                        'totalSpent',
                        e.target.value === '' ? 0 : Number(e.target.value)
                      )
                    }
                    onBlur={(e) =>
                      handleBlur(
                        entry.id,
                        'totalSpent',
                        e.target.value === '' ? 0 : Number(e.target.value)
                      )
                    }
                    placeholder="0"
                    className="bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>

                {/* Remarks */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Remarks
                  </span>
                  <input
                    type="text"
                    value={entry.remarks}
                    onChange={(e) => updateLocalField(entry.id, 'remarks', e.target.value)}
                    onBlur={(e) => handleBlur(entry.id, 'remarks', e.target.value)}
                    placeholder="Notes..."
                    className="bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                </div>

                {/* Save status indicator */}
                <div className="flex items-center justify-center">
                  {getStatusIcon(entry.id)}
                </div>

                {/* Delete button */}
                <div className="flex items-center justify-center">
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    disabled={deletingIds.has(entry.id)}
                    className="text-muted-foreground/40 transition-colors hover:text-destructive disabled:opacity-50"
                    title="Delete product"
                  >
                    {deletingIds.has(entry.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="rounded-3xl border border-border/50 bg-card/60 p-6 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          {entries.length} product{entries.length !== 1 ? 's' : ''} tracked. Changes auto-save on blur.
        </div>
      </div>
    </div>
  );
}
