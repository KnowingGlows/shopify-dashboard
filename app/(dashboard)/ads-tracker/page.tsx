'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { AdsTrackerEntry } from '@/types/shopify';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const CREATIVE_TYPES = ['', 'UGC', 'Static', 'Video', 'Carousel', 'Story'];

const CREATIVE_BATCH_RESULTS = ['', 'Winner', 'Loser', 'Testing', 'Scaled'];

const CREATIVE_TYPE_COLORS: Record<string, string> = {
  UGC: 'text-violet-400',
  Static: 'text-blue-400',
  Video: 'text-amber-400',
  Carousel: 'text-emerald-400',
  Story: 'text-pink-400',
};

const BATCH_RESULT_COLORS: Record<string, string> = {
  Winner: 'text-emerald-400',
  Loser: 'text-red-400',
  Testing: 'text-amber-400',
  Scaled: 'text-blue-400',
};

export default function AdsTrackerPage() {
  const [entries, setEntries] = useState<AdsTrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const saveTimeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ads-tracker');
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
      const res = await fetch('/api/ads-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: '',
          creativeFolderLink: '',
          batchName: '',
          creativeType: '',
          dailyAdSpend: 0,
          weeklyRoas: 0,
          creativeBatchResult: '',
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
    field: keyof AdsTrackerEntry,
    value: string | number
  ) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const saveEntry = useCallback(
    async (id: string, field: keyof AdsTrackerEntry, value: string | number) => {
      setSaveStatus((prev) => ({ ...prev, [id]: 'saving' }));
      try {
        const res = await fetch('/api/ads-tracker', {
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
    field: keyof AdsTrackerEntry,
    value: string | number
  ) => {
    saveEntry(id, field, value);
  };

  const handleSelectChange = (
    id: string,
    field: keyof AdsTrackerEntry,
    value: string
  ) => {
    updateLocalField(id, field, value);
    saveEntry(id, field, value);
  };

  const deleteEntry = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch('/api/ads-tracker', {
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
          <h1 className="text-lg font-semibold text-foreground">Ads Tracker</h1>
          <p className="text-[11px] text-muted-foreground">Track creative batches and performance</p>
        </div>
        <button
          onClick={addEntry}
          disabled={adding}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition hover:bg-secondary"
        >
          {adding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add Entry
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-xs text-muted-foreground">
          No ads tracked yet. Click &quot;Add Entry&quot; to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="tracker-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Creative Folder</th>
                <th>Batch Name</th>
                <th>Type</th>
                <th>Daily Spend</th>
                <th>Weekly ROAS</th>
                <th>Result</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
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

                  {/* Creative Folder Link */}
                  <td>
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={entry.creativeFolderLink}
                        onChange={(e) => updateLocalField(entry.id, 'creativeFolderLink', e.target.value)}
                        onBlur={(e) => handleBlur(entry.id, 'creativeFolderLink', e.target.value)}
                        placeholder="https://..."
                        className="tracker-input min-w-0 flex-1"
                      />
                      {entry.creativeFolderLink && (
                        <a
                          href={entry.creativeFolderLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 px-2 text-primary/60 transition-colors hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Batch Name */}
                  <td>
                    <input
                      type="text"
                      value={entry.batchName}
                      onChange={(e) => updateLocalField(entry.id, 'batchName', e.target.value)}
                      onBlur={(e) => handleBlur(entry.id, 'batchName', e.target.value)}
                      placeholder="Batch name..."
                      className="tracker-input"
                    />
                  </td>

                  {/* Creative Type */}
                  <td>
                    <select
                      value={entry.creativeType}
                      onChange={(e) => handleSelectChange(entry.id, 'creativeType', e.target.value)}
                      className={`tracker-select ${CREATIVE_TYPE_COLORS[entry.creativeType] ?? ''}`}
                    >
                      {CREATIVE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type || '-- Select --'}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Daily Spend */}
                  <td>
                    <input
                      type="number"
                      value={entry.dailyAdSpend || ''}
                      onChange={(e) =>
                        updateLocalField(
                          entry.id,
                          'dailyAdSpend',
                          e.target.value === '' ? 0 : Number(e.target.value)
                        )
                      }
                      onBlur={(e) =>
                        handleBlur(
                          entry.id,
                          'dailyAdSpend',
                          e.target.value === '' ? 0 : Number(e.target.value)
                        )
                      }
                      placeholder="0"
                      className="tracker-input text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </td>

                  {/* Weekly ROAS */}
                  <td>
                    <input
                      type="number"
                      value={entry.weeklyRoas || ''}
                      onChange={(e) =>
                        updateLocalField(
                          entry.id,
                          'weeklyRoas',
                          e.target.value === '' ? 0 : Number(e.target.value)
                        )
                      }
                      onBlur={(e) =>
                        handleBlur(
                          entry.id,
                          'weeklyRoas',
                          e.target.value === '' ? 0 : Number(e.target.value)
                        )
                      }
                      placeholder="0.00"
                      step="0.01"
                      className="tracker-input text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </td>

                  {/* Batch Result */}
                  <td>
                    <select
                      value={entry.creativeBatchResult}
                      onChange={(e) => handleSelectChange(entry.id, 'creativeBatchResult', e.target.value)}
                      className={`tracker-select ${BATCH_RESULT_COLORS[entry.creativeBatchResult] ?? ''}`}
                    >
                      {CREATIVE_BATCH_RESULTS.map((result) => (
                        <option key={result} value={result}>
                          {result || '-- Select --'}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Actions */}
                  <td>
                    <div className="flex items-center justify-center gap-2 px-2">
                      {getStatusIcon(entry.id)}
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        disabled={deletingIds.has(entry.id)}
                        className="text-muted-foreground/40 transition-colors hover:text-destructive disabled:opacity-50"
                        title="Delete entry"
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
        </div>
      )}

      {/* Footer */}
      <p className="text-[11px] text-muted-foreground">
        {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'} tracked. Changes auto-save on blur.
      </p>
    </div>
  );
}
