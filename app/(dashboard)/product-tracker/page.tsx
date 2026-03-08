'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
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

const stageColorClass = (stage: string) => {
  switch (stage) {
    case 'Testing Store Page Done': return 'text-blue-400';
    case 'Winner - Moved To OPS': return 'text-emerald-400';
    case 'Testing Ads': return 'text-amber-400';
    case 'Dropped': return 'text-red-400';
    case 'Research Phase': return 'text-violet-400';
    default: return '';
  }
};

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
    <div className="mx-auto max-w-7xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Product Tracker</h1>
          <p className="text-[11px] text-muted-foreground">Track products from research to launch</p>
        </div>
        <button
          onClick={addEntry}
          disabled={adding}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition hover:bg-secondary"
        >
          {adding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span>+</span>
          )}
          Add Product
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          {entries.length === 0 ? (
            <div className="py-12 text-center text-[12px] text-muted-foreground">
              No products yet. Click &quot;+ Add Product&quot; to get started.
            </div>
          ) : (
            <table className="tracker-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>File Link</th>
                  <th>Stage</th>
                  <th>Total Spent</th>
                  <th>Remarks</th>
                  <th className="w-[52px]" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="group">
                    {/* Product Name */}
                    <td>
                      <input
                        type="text"
                        value={entry.productName}
                        onChange={(e) => updateLocalField(entry.id, 'productName', e.target.value)}
                        onBlur={(e) => handleBlur(entry.id, 'productName', e.target.value)}
                        placeholder="Product name..."
                        className="tracker-input"
                      />
                    </td>

                    {/* File Link */}
                    <td>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={entry.productFileLink}
                          onChange={(e) => updateLocalField(entry.id, 'productFileLink', e.target.value)}
                          onBlur={(e) => handleBlur(entry.id, 'productFileLink', e.target.value)}
                          placeholder="https://..."
                          className="tracker-input min-w-0 flex-1"
                        />
                        {entry.productFileLink && (
                          <a
                            href={entry.productFileLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 text-muted-foreground transition-colors hover:text-primary"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Stage */}
                    <td>
                      <select
                        value={entry.productStage}
                        onChange={(e) => handleSelectChange(entry.id, e.target.value)}
                        className={`tracker-select ${stageColorClass(entry.productStage)}`}
                      >
                        {PRODUCT_STAGES.map((stage) => (
                          <option key={stage} value={stage} className="bg-card text-foreground">
                            {stage || '-- Select --'}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Total Spent */}
                    <td>
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
                        className="tracker-input [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </td>

                    {/* Remarks */}
                    <td>
                      <input
                        type="text"
                        value={entry.remarks}
                        onChange={(e) => updateLocalField(entry.id, 'remarks', e.target.value)}
                        onBlur={(e) => handleBlur(entry.id, 'remarks', e.target.value)}
                        placeholder="Notes..."
                        className="tracker-input"
                      />
                    </td>

                    {/* Actions: status + delete */}
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        {getStatusIcon(entry.id)}
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          disabled={deletingIds.has(entry.id)}
                          className="text-muted-foreground/30 transition-colors hover:text-destructive group-hover:text-muted-foreground disabled:opacity-50"
                          title="Delete product"
                        >
                          {deletingIds.has(entry.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-[11px] text-muted-foreground">
        {entries.length} product{entries.length !== 1 ? 's' : ''} · Auto-saves on edit
      </p>
    </div>
  );
}
