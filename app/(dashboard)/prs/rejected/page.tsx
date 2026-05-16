'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Ban, ArrowLeft, Loader2, ExternalLink, RotateCcw, Trash2, Search,
} from 'lucide-react';
import type { PRSEntry } from '@/types/shopify';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';

export default function RejectedPRSPage() {
  const [entries, setEntries] = useState<PRSEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/prs');
      const data = await res.json();
      setEntries((data.entries ?? []).filter((e: PRSEntry) => e.status === 'Rejected'));
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.productName.toLowerCase().includes(q));
  }, [entries, search]);

  const restore = async (id: string) => {
    setBusyId(id);
    try {
      await fetch('/api/prs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'Researching' }),
      });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch { /* silently fail */ }
    finally { setBusyId(null); }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/prs?id=${id}`, { method: 'DELETE' });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch { /* silently fail */ }
    finally { setBusyId(null); }
  };

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/prs"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to PRS
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
              <Ban className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Rejected Products</h1>
              <p className="text-[11px] text-muted-foreground">{entries.length} rejected · restore to research or delete for good</p>
            </div>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-9 w-44 rounded-lg border border-border bg-card pl-8 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none transition"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Ban className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{entries.length === 0 ? 'No rejected products' : 'No matches'}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            Reject products from <Link href="/prs" className="text-primary hover:underline">Product Research</Link>
          </p>
        </motion.div>
      ) : (
        <StaggerContainer className="space-y-2">
          {filtered.map((entry) => (
            <StaggerItem key={entry.id}>
              <motion.div layout className="group rounded-xl border border-border bg-card transition-all hover:border-rose-500/25">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="h-2 w-2 rounded-full shrink-0 bg-rose-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-foreground truncate">
                      {entry.productName || <span className="text-muted-foreground/40 italic">Unnamed</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.adLink && (
                      <a href={entry.adLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/40 hover:text-primary transition" title="Ad link">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {entry.websiteLink && (
                      <a href={entry.websiteLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/40 hover:text-blue-400 transition" title="Website link">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => restore(entry.id)}
                      disabled={busyId === entry.id}
                      title="Restore to research"
                      className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[10px] font-medium text-muted-foreground/50 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-50"
                    >
                      {busyId === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                    </button>
                    <button
                      onClick={() => remove(entry.id)}
                      disabled={busyId === entry.id}
                      title="Delete permanently"
                      className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[10px] font-medium text-muted-foreground/50 transition hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}

      <p className="text-[11px] text-muted-foreground">
        {filtered.length} of {entries.length} rejected product{entries.length !== 1 ? 's' : ''} · Restore moves it back to Researching
      </p>
    </PageTransition>
  );
}
