'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { BackgroundDecor } from '@/components/background-decor';
import { Button } from '@/components/ui/button';
import {
  Megaphone,
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
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-8">
        {/* Header card */}
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Megaphone className="h-3.5 w-3.5 text-primary" />
            Ads Tracker
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Ads Tracker
              </h1>
              <p className="mt-2 text-muted-foreground">
                Track ad creatives, spend, and performance. Auto-saves on edit.
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
                Add Entry
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
            No ads tracked yet. Click &quot;Add Entry&quot; to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Column headers */}
            <div className="hidden gap-3 px-4 text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:grid md:grid-cols-[1fr_1fr_0.8fr_140px_100px_100px_140px_40px_24px]">
              <span>Product Name</span>
              <span>Creative Folder Link</span>
              <span>Batch Name</span>
              <span>Creative Type</span>
              <span>Daily Ad Spend</span>
              <span>Weekly ROAS</span>
              <span>Batch Result</span>
              <span />
              <span />
            </div>

            {/* Rows */}
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="group grid gap-3 rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur transition-colors hover:bg-card/80 md:grid-cols-[1fr_1fr_0.8fr_140px_100px_100px_140px_40px_24px] md:items-center"
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

                {/* Creative Folder Link */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Creative Folder Link
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={entry.creativeFolderLink}
                      onChange={(e) => updateLocalField(entry.id, 'creativeFolderLink', e.target.value)}
                      onBlur={(e) => handleBlur(entry.id, 'creativeFolderLink', e.target.value)}
                      placeholder="https://..."
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                    />
                    {entry.creativeFolderLink && (
                      <a
                        href={entry.creativeFolderLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-primary/60 transition-colors hover:text-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Batch Name */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Batch Name
                  </span>
                  <input
                    type="text"
                    value={entry.batchName}
                    onChange={(e) => updateLocalField(entry.id, 'batchName', e.target.value)}
                    onBlur={(e) => handleBlur(entry.id, 'batchName', e.target.value)}
                    placeholder="Batch name..."
                    className="bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                </div>

                {/* Creative Type */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Creative Type
                  </span>
                  <select
                    value={entry.creativeType}
                    onChange={(e) => handleSelectChange(entry.id, 'creativeType', e.target.value)}
                    className="cursor-pointer rounded-lg border border-border/40 bg-transparent px-2 py-1 text-xs text-foreground outline-none transition-colors hover:border-border/80 focus:border-primary/50"
                  >
                    {CREATIVE_TYPES.map((type) => (
                      <option key={type} value={type} className="bg-card text-foreground">
                        {type || '— Select —'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Daily Ad Spend */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Daily Ad Spend
                  </span>
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
                    className="bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>

                {/* Weekly ROAS */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Weekly ROAS
                  </span>
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
                    className="bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>

                {/* Creative Batch Result */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                    Batch Result
                  </span>
                  <select
                    value={entry.creativeBatchResult}
                    onChange={(e) => handleSelectChange(entry.id, 'creativeBatchResult', e.target.value)}
                    className="cursor-pointer rounded-lg border border-border/40 bg-transparent px-2 py-1 text-xs text-foreground outline-none transition-colors hover:border-border/80 focus:border-primary/50"
                  >
                    {CREATIVE_BATCH_RESULTS.map((result) => (
                      <option key={result} value={result} className="bg-card text-foreground">
                        {result || '— Select —'}
                      </option>
                    ))}
                  </select>
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
                    title="Delete entry"
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
          {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'} tracked. Changes auto-save on blur.
        </div>
      </div>
    </div>
  );
}
