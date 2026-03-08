'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  Check,
} from 'lucide-react';
import type { PRSEntry } from '@/types/shopify';

const STATUS_OPTIONS = [
  '',
  'Researching',
  'Approved',
  'Rejected',
  'Ordered Sample',
  'Sample Received',
  'Ready to Launch',
] as const;

const STATUS_COLORS: Record<string, string> = {
  '': 'text-muted-foreground/40',
  Researching: 'text-blue-400',
  Approved: 'text-emerald-400',
  Rejected: 'text-red-400',
  'Ordered Sample': 'text-amber-400',
  'Sample Received': 'text-violet-400',
  'Ready to Launch': 'text-emerald-300',
};

type SaveState = Record<string, 'idle' | 'saving' | 'saved'>;

export default function PRSPage() {
  const [entries, setEntries] = useState<PRSEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({});
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Fetch ──────────────────────────────────────────────────────────
  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/prs');
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

  // ── Add Row ────────────────────────────────────────────────────────
  const addEntry = async () => {
    setAdding(true);
    try {
      const res = await fetch('/api/prs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: '',
          adLink: '',
          websiteLink: '',
          status: '',
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

  // ── Patch (auto-save on blur) ──────────────────────────────────────
  const patchEntry = async (id: string, field: string, value: string) => {
    // Update local state immediately
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );

    setSaveState((prev) => ({ ...prev, [id]: 'saving' }));

    // Clear any existing saved timer for this entry
    if (savedTimers.current[id]) {
      clearTimeout(savedTimers.current[id]);
    }

    try {
      await fetch('/api/prs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: value }),
      });
      setSaveState((prev) => ({ ...prev, [id]: 'saved' }));
      savedTimers.current[id] = setTimeout(() => {
        setSaveState((prev) => ({ ...prev, [id]: 'idle' }));
      }, 1500);
    } catch {
      setSaveState((prev) => ({ ...prev, [id]: 'idle' }));
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────
  const deleteEntry = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/prs?id=${id}`, { method: 'DELETE' });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Product Research</h1>
          <p className="text-[12px] text-muted-foreground">Discover and validate products</p>
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
          Add Product
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No products yet. Click &quot;Add Product&quot; to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="tracker-table">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Product Name
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Ad Link
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Website Link
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-t border-border/50 transition-colors hover:bg-secondary/30"
                >
                  {/* Product Name */}
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      defaultValue={entry.productName}
                      placeholder="Product name..."
                      onBlur={(e) =>
                        e.target.value !== entry.productName &&
                        patchEntry(entry.id, 'productName', e.target.value)
                      }
                      className="tracker-input"
                    />
                  </td>

                  {/* Ad Link */}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        defaultValue={entry.adLink}
                        placeholder="https://..."
                        onBlur={(e) =>
                          e.target.value !== entry.adLink &&
                          patchEntry(entry.id, 'adLink', e.target.value)
                        }
                        className="tracker-input"
                      />
                      {entry.adLink && (
                        <a
                          href={entry.adLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground transition hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Website Link */}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        defaultValue={entry.websiteLink}
                        placeholder="https://..."
                        onBlur={(e) =>
                          e.target.value !== entry.websiteLink &&
                          patchEntry(entry.id, 'websiteLink', e.target.value)
                        }
                        className="tracker-input"
                      />
                      {entry.websiteLink && (
                        <a
                          href={entry.websiteLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground transition hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-1.5">
                    <select
                      value={entry.status}
                      onChange={(e) =>
                        patchEntry(entry.id, 'status', e.target.value)
                      }
                      className={`tracker-select ${STATUS_COLORS[entry.status] ?? 'text-muted-foreground/40'}`}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt || '— Select —'}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-2">
                      {saveState[entry.id] === 'saving' && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                      {saveState[entry.id] === 'saved' && (
                        <Check className="h-3 w-3 text-emerald-400" />
                      )}
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        disabled={deletingId === entry.id}
                        className="rounded p-1 text-muted-foreground/40 transition hover:bg-destructive/10 hover:text-destructive"
                      >
                        {deletingId === entry.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
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
        {entries.length} product{entries.length !== 1 ? 's' : ''} tracked
        &middot; Changes auto-save on blur
      </p>
    </div>
  );
}
