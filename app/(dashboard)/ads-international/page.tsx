'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Plus, Trash2, Pencil, Check, X, Loader2,
  AlertTriangle, Search, ExternalLink,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import type { Creative, CreativeStatus, CreativeResult, Funnel } from '@/types/funnel';
import type { ProductTrackerEntry } from '@/types/shopify';

const STATUS_OPTIONS: Array<{ value: CreativeStatus; label: string; tone: 'amber' | 'emerald' | 'rose' }> = [
  { value: 'testing', label: 'Testing', tone: 'amber' },
  { value: 'live',    label: 'Live',    tone: 'emerald' },
  { value: 'killed',  label: 'Killed',  tone: 'rose' },
];

const RESULT_OPTIONS: Array<{ value: CreativeResult; label: string; tone: 'gray' | 'emerald' | 'rose' }> = [
  { value: 'inconclusive', label: 'Inconclusive', tone: 'gray' },
  { value: 'winner',       label: 'Winner',       tone: 'emerald' },
  { value: 'loser',        label: 'Loser',        tone: 'rose' },
];

const TONE: Record<'gray' | 'amber' | 'emerald' | 'sky' | 'rose', { text: string; bg: string; border: string; dot: string }> = {
  gray:    { text: 'text-muted-foreground', bg: 'bg-border/40',     border: 'border-border',         dot: 'bg-muted-foreground' },
  amber:   { text: 'text-amber-400',        bg: 'bg-amber-500/10',  border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  emerald: { text: 'text-emerald-400',      bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  sky:     { text: 'text-sky-400',          bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     dot: 'bg-sky-400' },
  rose:    { text: 'text-rose-400',         bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    dot: 'bg-rose-400' },
};

const CREATIVE_TYPES = ['Video', 'Image', 'UGC', 'Carousel', 'Static', 'Other'];

export default function AdsInternationalPage() {
  const { user } = useAuth();
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [products, setProducts] = useState<ProductTrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterFunnel, setFilterFunnel] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<CreativeStatus | 'all'>('all');
  const [filterResult, setFilterResult] = useState<CreativeResult | 'all'>('all');
  const [search, setSearch] = useState('');

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBatch, setEditBatch] = useState('');
  const [editType, setEditType] = useState('');
  const [editFolder, setEditFolder] = useState('');
  const [editLaunchDate, setEditLaunchDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [creativesRes, funnelsRes, productsRes] = await Promise.all([
        fetch('/api/creatives-intl').then((r) => r.json()),
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/product-tracker').then((r) => r.json()),
      ]);
      setCreatives(creativesRes.creatives ?? []);
      setFunnels(funnelsRes.funnels ?? []);
      setProducts(productsRes.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load creatives.');
    } finally {
      setLoading(false);
    }
  };

  const funnelMap = useMemo(() => {
    const map = new Map<string, Funnel>();
    funnels.forEach((f) => map.set(f.id, f));
    return map;
  }, [funnels]);

  const productIdByName = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => { if (p.productName) m.set(p.productName, p.id); });
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return creatives.filter((c) => {
      if (filterFunnel !== 'all' && c.funnelId !== filterFunnel) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (filterResult !== 'all' && c.result !== filterResult) return false;
      if (q) {
        const hay = [c.batchName, c.productName, c.country, c.language, c.creativeType, c.notes].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [creatives, filterFunnel, filterStatus, filterResult, search]);

  // KPIs
  const summary = useMemo(() => {
    const total = creatives.length;
    const winners = creatives.filter((c) => c.result === 'winner').length;
    const live = creatives.filter((c) => c.status === 'live').length;
    const testing = creatives.filter((c) => c.status === 'testing').length;
    const decided = creatives.filter((c) => c.result !== 'inconclusive').length;
    const hitRate = decided > 0 ? (winners / decided) * 100 : 0;
    return { total, winners, live, testing, hitRate };
  }, [creatives]);

  const addCreative = async (input: NewCreativeInput) => {
    try {
      const res = await fetch('/api/creatives-intl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setCreatives((prev) => [data.creative, ...prev]);
      setShowAddModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add creative.');
    }
  };

  const updateCreative = async (id: string, patch: Partial<Creative>) => {
    try {
      setSaving(true);
      const res = await fetch('/api/creatives-intl', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setCreatives((prev) => prev.map((c) => (c.id === id ? { ...c, ...data.creative } : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update creative.');
    } finally {
      setSaving(false);
    }
  };

  const deleteCreative = async (id: string) => {
    if (!confirm('Delete this creative?')) return;
    try {
      setSaving(true);
      const res = await fetch('/api/creatives-intl', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setCreatives((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete creative.');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (c: Creative) => {
    setEditingId(c.id);
    setEditBatch(c.batchName);
    setEditType(c.creativeType);
    setEditFolder(c.folderLink);
    setEditLaunchDate(c.launchDate);
    setEditNotes(c.notes);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (id: string) => {
    await updateCreative(id, {
      batchName: editBatch.trim(),
      creativeType: editType,
      folderLink: editFolder.trim(),
      launchDate: editLaunchDate,
      notes: editNotes.trim(),
    });
    setEditingId(null);
  };

  // Status counts for pills
  const statusCounts = useMemo(() => {
    const c: Record<CreativeStatus | 'all', number> = { all: creatives.length, testing: 0, live: 0, killed: 0 };
    creatives.forEach((cr) => { c[cr.status]++; });
    return c;
  }, [creatives]);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Globe className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Ads — International</h1>
            <p className="text-[11px] text-muted-foreground">
              Creative inventory across funnels · {summary.live} live · {summary.testing} testing
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          disabled={funnels.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"
          title={funnels.length === 0 ? 'Create a funnel first' : 'Add creative'}
        >
          <Plus className="h-3.5 w-3.5" /> Add Creative
        </button>
      </div>

      {/* KPI strip */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4"
      >
        <StatCell label="Total creatives" value={summary.total.toLocaleString('en-IN')} accent="violet" />
        <StatCell label="Live" value={summary.live.toLocaleString('en-IN')} accent="emerald" />
        <StatCell label="Winners" value={summary.winners.toLocaleString('en-IN')} hint="Manually flagged" accent="sky" />
        <StatCell label="Hit rate" value={`${summary.hitRate.toFixed(0)}%`} hint="winners / decided" accent="amber" />
      </motion.div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <FilterPill label="All" count={statusCounts.all} active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} />
          {STATUS_OPTIONS.map((s) => (
            <FilterPill
              key={s.value}
              label={s.label}
              count={statusCounts[s.value]}
              active={filterStatus === s.value}
              onClick={() => setFilterStatus(s.value)}
              tone={s.tone}
            />
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={filterFunnel}
            onChange={(e) => setFilterFunnel(e.target.value)}
            className="form-input py-1.5 text-[12px] w-56"
          >
            <option value="all">All funnels</option>
            {funnels.map((f) => (
              <option key={f.id} value={f.id}>
                {f.productName} · {f.country}
              </option>
            ))}
          </select>
          <select
            value={filterResult}
            onChange={(e) => setFilterResult(e.target.value as CreativeResult | 'all')}
            className="form-input py-1.5 text-[12px] w-36"
          >
            <option value="all">All results</option>
            {RESULT_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="form-input pl-8 py-1.5 text-[12px] w-44"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/70 hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Empty state */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : creatives.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Globe className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-[13px] font-medium text-foreground">No creatives yet</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {funnels.length === 0
              ? 'Create a funnel first, then start logging creatives here.'
              : 'Click "Add Creative" to register your first creative batch.'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-[12px] text-muted-foreground">No creatives match the current filters.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="tracker-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th style={{ width: 200 }}>Funnel</th>
                <th style={{ width: 90 }}>Type</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 130 }}>Result</th>
                <th style={{ width: 110 }}>Launch</th>
                <th style={{ width: 80, textAlign: 'center' }}>Folder</th>
                <th style={{ width: 90, textAlign: 'right' }}>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((c, idx) => {
                  const f = funnelMap.get(c.funnelId);
                  const statusTone = TONE[STATUS_OPTIONS.find((s) => s.value === c.status)?.tone ?? 'amber'];
                  const resultTone = TONE[RESULT_OPTIONS.find((r) => r.value === c.result)?.tone ?? 'gray'];
                  const isEditing = editingId === c.id;
                  return (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2, delay: Math.min(idx * 0.015, 0.15) }}
                    >
                      <td>
                        {isEditing ? (
                          <input value={editBatch} onChange={(e) => setEditBatch(e.target.value)} className="tracker-input" />
                        ) : (
                          <div className="px-3 py-2">
                            <p className="text-[13px] font-medium text-foreground">{c.batchName}</p>
                            {c.notes && <p className="mt-0.5 text-[10px] text-muted-foreground/70 truncate max-w-[300px]">{c.notes}</p>}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="px-3 py-2 text-[12px]">
                          {f ? (
                            <>
                              {(() => {
                                const pid = productIdByName.get(f.productName);
                                return pid ? (
                                  <Link href={`/product-tracker/${pid}`} className="text-foreground truncate max-w-[180px] hover:text-primary inline-block">
                                    {f.productName}
                                  </Link>
                                ) : (
                                  <p className="text-foreground truncate max-w-[180px]">{f.productName}</p>
                                );
                              })()}
                              <p className="text-[10px] text-muted-foreground">{f.country} · {f.language}</p>
                            </>
                          ) : (
                            <span className="text-muted-foreground/60">— deleted funnel —</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {isEditing ? (
                          <select value={editType} onChange={(e) => setEditType(e.target.value)} className="tracker-select">
                            <option value="">—</option>
                            {CREATIVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        ) : (
                          <div className="px-3 py-2 text-[11px] text-muted-foreground">{c.creativeType || '—'}</div>
                        )}
                      </td>
                      <td>
                        <select
                          value={c.status}
                          onChange={(e) => updateCreative(c.id, { status: e.target.value as CreativeStatus })}
                          className={cn('tracker-select text-[11px] font-medium', statusTone.text)}
                        >
                          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="px-3 py-1.5">
                          <select
                            value={c.result}
                            onChange={(e) => updateCreative(c.id, { result: e.target.value as CreativeResult })}
                            className={cn(
                              'w-full rounded-md border bg-card px-2 py-1 text-[11px] font-medium outline-none transition',
                              resultTone.bg, resultTone.border, resultTone.text
                            )}
                          >
                            {RESULT_OPTIONS.map((r) => <option key={r.value} value={r.value} className="bg-card text-foreground">{r.label}</option>)}
                          </select>
                        </div>
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="px-2 py-1.5">
                            <DatePicker value={editLaunchDate} onChange={setEditLaunchDate} compact />
                          </div>
                        ) : (
                          <div className="px-3 py-2 text-[11px] tabular-nums text-muted-foreground">{c.launchDate || '—'}</div>
                        )}
                      </td>
                      <td>
                        <div className="px-3 py-2 text-center">
                          {isEditing ? (
                            <input
                              value={editFolder}
                              onChange={(e) => setEditFolder(e.target.value)}
                              placeholder="https://…"
                              className="tracker-input text-[11px]"
                            />
                          ) : c.folderLink ? (
                            <a
                              href={c.folderLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80"
                            >
                              <ExternalLink className="h-3 w-3" /> open
                            </a>
                          ) : (
                            <span className="text-muted-foreground/40 text-[10px]">—</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1 px-3 py-1.5">
                          {isEditing ? (
                            <>
                              <button onClick={() => saveEdit(c.id)} disabled={saving}
                                className="rounded-md p-1.5 text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-40">
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={cancelEdit}
                                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/30 hover:text-foreground">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => beginEdit(c)}
                                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/30 hover:text-foreground">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => deleteCreative(c.id)}
                                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · ad spend lives at the funnel level (Finance page), not per-creative
      </p>

      {showAddModal && (
        <AddCreativeModal
          funnels={funnels}
          onClose={() => setShowAddModal(false)}
          onSubmit={addCreative}
        />
      )}
    </PageTransition>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function StatCell({ label, value, hint, accent }: {
  label: string; value: string; hint?: string;
  accent: 'emerald' | 'amber' | 'sky' | 'violet';
}) {
  const map = {
    emerald: 'text-emerald-400',
    amber:   'text-amber-400',
    sky:     'text-sky-400',
    violet:  'text-violet-400',
  };
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-[20px] font-semibold leading-none tabular-nums tracking-tight', map[accent])}>{value}</p>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function FilterPill({ label, count, active, onClick, tone = 'gray' }: {
  label: string; count: number; active: boolean; onClick: () => void;
  tone?: 'gray' | 'amber' | 'emerald' | 'sky' | 'rose';
}) {
  const t = TONE[tone];
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition',
        active ? cn(t.bg, t.border, t.text) : 'border-border bg-card text-muted-foreground hover:text-foreground'
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', t.dot, !active && 'opacity-60')} />
      {label}
      <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums', active ? 'bg-black/20' : 'bg-border/50 text-foreground')}>
        {count}
      </span>
    </button>
  );
}

// ── Add Creative modal ──────────────────────────────────────────────────────

type NewCreativeInput = {
  funnelId: string;
  productName: string;
  country: string;
  language: string;
  batchName: string;
  creativeType: string;
  folderLink: string;
  launchDate: string;
  status: CreativeStatus;
  result: CreativeResult;
  notes: string;
};

function AddCreativeModal({
  funnels, onClose, onSubmit,
}: {
  funnels: Funnel[];
  onClose: () => void;
  onSubmit: (input: NewCreativeInput) => Promise<void>;
}) {
  const [funnelId, setFunnelId] = useState(funnels[0]?.id ?? '');
  const [batchName, setBatchName] = useState('');
  const [creativeType, setCreativeType] = useState('Video');
  const [folderLink, setFolderLink] = useState('');
  const [launchDate, setLaunchDate] = useState('');
  const [status, setStatus] = useState<CreativeStatus>('testing');
  const [result, setResult] = useState<CreativeResult>('inconclusive');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = funnels.find((f) => f.id === funnelId);

  const submit = async () => {
    if (!funnelId) { setErr('Pick a funnel.'); return; }
    if (!batchName.trim()) { setErr('Batch name is required.'); return; }
    setErr(null);
    setSaving(true);
    try {
      await onSubmit({
        funnelId,
        productName: selected?.productName ?? '',
        country: selected?.country ?? '',
        language: selected?.language ?? '',
        batchName: batchName.trim(),
        creativeType,
        folderLink: folderLink.trim(),
        launchDate,
        status,
        result,
        notes: notes.trim(),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add creative.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Add Creative</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          <FormCell label="Funnel">
            <select value={funnelId} onChange={(e) => setFunnelId(e.target.value)} className="form-input">
              {funnels.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.productName} · {f.country} ({f.language})
                </option>
              ))}
            </select>
          </FormCell>

          <FormCell label="Batch name">
            <input value={batchName} onChange={(e) => setBatchName(e.target.value)} className="form-input" placeholder="e.g. Batch 03 — UGC remix" autoFocus />
          </FormCell>

          <div className="grid grid-cols-2 gap-3">
            <FormCell label="Creative type">
              <select value={creativeType} onChange={(e) => setCreativeType(e.target.value)} className="form-input">
                {CREATIVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormCell>
            <FormCell label="Launch date (optional)">
              <DatePicker value={launchDate} onChange={(d) => setLaunchDate(d)} />
            </FormCell>
          </div>

          <FormCell label="Folder link (optional)">
            <input value={folderLink} onChange={(e) => setFolderLink(e.target.value)} className="form-input" placeholder="https://drive.google.com/…" />
          </FormCell>

          <div className="grid grid-cols-2 gap-3">
            <FormCell label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as CreativeStatus)} className="form-input">
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </FormCell>
            <FormCell label="Result">
              <select value={result} onChange={(e) => setResult(e.target.value as CreativeResult)} className="form-input">
                {RESULT_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </FormCell>
          </div>

          <FormCell label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="form-input" />
          </FormCell>

          {err && <p className="text-[11px] text-destructive">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/50 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-1.5 text-[12px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Create creative
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function FormCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
