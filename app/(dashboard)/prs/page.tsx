'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { BackgroundDecor } from '@/components/background-decor';
import { Button } from '@/components/ui/button';
import {
  Search,
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
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-8">
        {/* Header card */}
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Search className="h-3.5 w-3.5 text-primary" />
            Product Research
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Product Research Sheet
              </h1>
              <p className="mt-2 text-muted-foreground">
                Track and manage products from discovery to launch.
              </p>
            </div>
            <Button
              onClick={addEntry}
              disabled={adding}
              className="shrink-0 gap-2"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add Product
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-card/60 p-12 text-center text-sm text-muted-foreground backdrop-blur">
            No products yet. Click &quot;Add Product&quot; to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Table header */}
            <div className="hidden grid-cols-[1fr_1fr_1fr_180px_44px_28px] gap-3 px-5 md:grid">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Product Name
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Ad Link
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Website Link
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Status
              </span>
              <span />
              <span />
            </div>

            {/* Rows */}
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="group grid grid-cols-1 gap-3 rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur transition-colors hover:bg-card/80 md:grid-cols-[1fr_1fr_1fr_180px_44px_28px] md:items-center md:p-3 md:px-5"
              >
                {/* Product Name */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Product Name
                  </span>
                  <input
                    type="text"
                    defaultValue={entry.productName}
                    placeholder="Product name..."
                    onBlur={(e) =>
                      e.target.value !== entry.productName &&
                      patchEntry(entry.id, 'productName', e.target.value)
                    }
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                </div>

                {/* Ad Link */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Ad Link
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      defaultValue={entry.adLink}
                      placeholder="https://..."
                      onBlur={(e) =>
                        e.target.value !== entry.adLink &&
                        patchEntry(entry.id, 'adLink', e.target.value)
                      }
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                    />
                    {entry.adLink && (
                      <a
                        href={entry.adLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground transition hover:text-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Website Link */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Website Link
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      defaultValue={entry.websiteLink}
                      placeholder="https://..."
                      onBlur={(e) =>
                        e.target.value !== entry.websiteLink &&
                        patchEntry(entry.id, 'websiteLink', e.target.value)
                      }
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                    />
                    {entry.websiteLink && (
                      <a
                        href={entry.websiteLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground transition hover:text-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Status
                  </span>
                  <select
                    value={entry.status}
                    onChange={(e) =>
                      patchEntry(entry.id, 'status', e.target.value)
                    }
                    className={`w-full cursor-pointer rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5 text-xs font-medium outline-none transition hover:border-border/60 ${STATUS_COLORS[entry.status] ?? 'text-muted-foreground/40'}`}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt || '— Select —'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Save indicator */}
                <div className="flex items-center justify-center">
                  {saveState[entry.id] === 'saving' && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  {saveState[entry.id] === 'saved' && (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                </div>

                {/* Delete */}
                <div className="flex items-center justify-center">
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    disabled={deletingId === entry.id}
                    className="rounded-lg p-1 text-muted-foreground/40 transition hover:bg-destructive/10 hover:text-destructive"
                  >
                    {deletingId === entry.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="rounded-3xl border border-border/50 bg-card/60 p-6 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          {entries.length} product{entries.length !== 1 ? 's' : ''} tracked
          &middot; Changes auto-save on blur
        </div>
      </div>
    </div>
  );
}
