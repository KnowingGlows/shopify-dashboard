'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Trash2, ExternalLink, Loader2, Check, AlertCircle,
  X, Megaphone, ChevronDown, Target, Clock, Flame, Calendar,
} from 'lucide-react';
import { AdsTrackerEntry } from '@/types/shopify';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';
import { LinkChip } from '@/components/link-chip';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const CREATIVE_TYPES = ['', 'UGC', 'Static', 'Video', 'Carousel', 'Story'];
const CREATIVE_BATCH_RESULTS = ['', 'Winner', 'Loser', 'Testing', 'Scaled'];

const TYPE_CONFIG: Record<string, { color: string; bg: string }> = {
  UGC: { color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
  Static: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  Video: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  Carousel: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  Story: { color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/30' },
};

const RESULT_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  Winner: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: '🏆' },
  Loser: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: '✕' },
  Testing: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: '⏳' },
  Scaled: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', icon: '🚀' },
};

function getBatchTimeline(startedAt: string) {
  const now = Date.now();
  const started = new Date(startedAt).getTime();
  const daysSince = Math.floor((now - started) / 86400000);
  const progress = Math.min(daysSince / 7, 1);
  const isComplete = daysSince >= 7;
  const nextBatchDate = new Date(started + 7 * 86400000);
  return { daysSince, progress, isComplete, nextBatchDate };
}

export default function ProductAdsPage() {
  const params = useParams();
  const router = useRouter();
  const productName = decodeURIComponent(params.product as string);

  const [entries, setEntries] = useState<AdsTrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deletingProduct, setDeletingProduct] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const saveTimeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Form state
  const [formBatch, setFormBatch] = useState('');
  const [formFolder, setFormFolder] = useState('');
  const [formType, setFormType] = useState('');
  const [formResult, setFormResult] = useState('');

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/ads-tracker');
      const data = await res.json();
      const all: AdsTrackerEntry[] = data.entries ?? [];
      setEntries(all.filter((e) => e.productName === productName));
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, [productName]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Cmd+N shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setShowForm(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const resetForm = () => {
    setFormBatch(''); setFormFolder(''); setFormType(''); setFormResult('');
  };

  const addBatch = async () => {
    setAdding(true);
    try {
      const res = await fetch('/api/ads-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          batchName: formBatch || `Batch ${entries.length + 1}`,
          creativeFolderLink: formFolder,
          creativeType: formType,
          creativeBatchResult: formResult,
        }),
      });
      const data = await res.json();
      if (data.entry) { setEntries((prev) => [data.entry, ...prev]); resetForm(); setShowForm(false); }
    } catch { /* silently fail */ }
    finally { setAdding(false); }
  };

  const updateLocalField = (id: string, field: keyof AdsTrackerEntry, value: string | number) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const saveEntry = useCallback(async (id: string, field: keyof AdsTrackerEntry, value: string | number) => {
    setSaveStatus((prev) => ({ ...prev, [id]: 'saving' }));
    try {
      const res = await fetch('/api/ads-tracker', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: value }),
      });
      if (!res.ok) throw new Error();
      setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }));
      if (saveTimeoutRefs.current[id]) clearTimeout(saveTimeoutRefs.current[id]);
      saveTimeoutRefs.current[id] = setTimeout(() => setSaveStatus((prev) => ({ ...prev, [id]: 'idle' })), 1500);
    } catch { setSaveStatus((prev) => ({ ...prev, [id]: 'error' })); }
  }, []);

  const handleBlur = (id: string, field: keyof AdsTrackerEntry, value: string | number) => saveEntry(id, field, value);
  const handleSelectChange = (id: string, field: keyof AdsTrackerEntry, value: string) => {
    updateLocalField(id, field, value); saveEntry(id, field, value);
  };

  const deleteEntry = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch('/api/ads-tracker', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch { /* silently fail */ }
    finally { setDeletingIds((prev) => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const deleteProduct = async () => {
    if (!confirm(`Delete "${productName}" and all its ${entries.length} batch${entries.length !== 1 ? 'es' : ''}? This cannot be undone.`)) return;
    setDeletingProduct(true);
    try {
      const res = await fetch('/api/ads-tracker', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productName }) });
      if (res.ok) router.push('/ads-tracker');
    } catch { /* silently fail */ }
    finally { setDeletingProduct(false); }
  };

  const getStatusIcon = (id: string) => {
    const s = saveStatus[id] ?? 'idle';
    if (s === 'saving') return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
    if (s === 'saved') return <Check className="h-3 w-3 text-emerald-400" />;
    if (s === 'error') return <AlertCircle className="h-3 w-3 text-destructive" />;
    return null;
  };

  // Stats
  const winners = entries.filter((e) => e.creativeBatchResult === 'Winner').length;
  const losers = entries.filter((e) => e.creativeBatchResult === 'Loser').length;
  const testing = entries.filter((e) => e.creativeBatchResult === 'Testing').length;
  const scaled = entries.filter((e) => e.creativeBatchResult === 'Scaled').length;
  const decided = winners + losers;
  const hitRate = decided > 0 ? Math.round((winners / decided) * 100) : 0;

  // Next batch timeline — only starts counting when a batch is marked as Testing
  const latestTimeline = useMemo(() => {
    // Find most-recently-updated batch that has been marked as Testing (or beyond)
    const activeBatches = entries.filter((e) => ['Testing', 'Winner', 'Loser', 'Scaled'].includes(e.creativeBatchResult));
    if (activeBatches.length === 0) return null;
    const sorted = [...activeBatches].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    // Use updatedAt as the countdown start (when the batch was marked as Testing)
    return getBatchTimeline(sorted[0].updatedAt);
  }, [entries]);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/ads-tracker" className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">{productName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{entries.length} batch{entries.length !== 1 ? 'es' : ''} · Ad performance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={deleteProduct}
            disabled={deletingProduct}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50 active:scale-[0.97]"
          >
            {deletingProduct ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] shadow-lg shadow-primary/20"
          >
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? 'Cancel' : 'New Batch'}
          </button>
        </div>
      </div>

      {/* Next Batch Timeline Card */}
      {latestTimeline && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-xl border p-4 ${
            latestTimeline.isComplete
              ? 'border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-transparent'
              : 'border-border bg-card/80'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {latestTimeline.isComplete ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
                  <Flame className="h-4 w-4 text-amber-400" />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Clock className="h-4 w-4 text-primary" />
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {latestTimeline.isComplete ? 'Next batch is due' : 'Testing in progress'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Latest batch launched {latestTimeline.daysSince === 0 ? 'today' : latestTimeline.daysSince === 1 ? 'yesterday' : `${latestTimeline.daysSince} days ago`}
                </p>
              </div>
            </div>
            <div className="text-right">
              {latestTimeline.isComplete ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-amber-400">
                    {latestTimeline.daysSince - 7}d overdue
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span className="text-[11px]">
                    Due {latestTimeline.nextBatchDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 7-day progress */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 7 }, (_, i) => {
              const filled = i < latestTimeline.daysSince;
              const isCurrent = i === Math.min(latestTimeline.daysSince, 6);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`h-2 w-full rounded-full transition-all ${
                      filled
                        ? latestTimeline.isComplete ? 'bg-amber-400' : 'bg-primary'
                        : isCurrent ? 'bg-primary/40' : 'bg-border/50'
                    }`}
                  />
                  <span className="text-[8px] text-muted-foreground/50">D{i + 1}</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Performance Stats */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Hit Rate', value: decided > 0 ? `${hitRate}%` : '—', color: hitRate >= 30 ? 'text-emerald-400' : hitRate > 0 ? 'text-amber-400' : 'text-muted-foreground', icon: true },
            { label: 'Winners', value: winners, color: 'text-emerald-400' },
            { label: 'Losers', value: losers, color: losers > 0 ? 'text-red-400' : 'text-muted-foreground' },
            { label: 'Testing', value: testing + scaled, color: (testing + scaled) > 0 ? 'text-amber-400' : 'text-muted-foreground' },
          ].map((stat, i) => (
            <div key={i} className="rounded-xl border border-border bg-card/80 px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1">{stat.label}</p>
              <div className="flex items-center gap-1.5">
                {stat.icon && decided > 0 && <Target className="h-3.5 w-3.5 text-primary/60" />}
                <p className={`text-lg font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Batch Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl border border-primary/20 bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Megaphone className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">New Batch</h2>
                  <p className="text-[10px] text-muted-foreground">Launch a new creative batch for {productName}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="Batch Name">
                  <input type="text" value={formBatch} onChange={(e) => setFormBatch(e.target.value)} placeholder={`Batch ${entries.length + 1}`} className="form-input" autoFocus />
                </FormField>
                <FormField label="Creative Folder">
                  <LinkChip value={formFolder} onChange={setFormFolder} placeholder="https://drive.google.com/..." />
                </FormField>
                <FormField label="Creative Type">
                  <select value={formType} onChange={(e) => setFormType(e.target.value)} className="form-input">
                    {CREATIVE_TYPES.map((t) => <option key={t} value={t}>{t || 'Select type...'}</option>)}
                  </select>
                </FormField>
                <FormField label="Result">
                  <select value={formResult} onChange={(e) => setFormResult(e.target.value)} className="form-input">
                    {CREATIVE_BATCH_RESULTS.map((r) => <option key={r} value={r}>{r || 'Select result...'}</option>)}
                  </select>
                </FormField>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button onClick={addBatch} disabled={adding} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 active:scale-[0.97]">
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add Batch
                </button>
                <button onClick={() => { resetForm(); setShowForm(false); }} className="rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batches List */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : entries.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No batches yet</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Press ⌘N to launch your first batch</p>
        </motion.div>
      ) : (
        <StaggerContainer className="space-y-3">
          {entries.map((entry, i) => {
            const typeCfg = TYPE_CONFIG[entry.creativeType];
            const resultCfg = RESULT_CONFIG[entry.creativeBatchResult];
            const isEditing = editingId === entry.id;
            const timeline = getBatchTimeline(entry.createdAt);

            return (
              <StaggerItem key={entry.id}>
                <motion.div
                  layout
                  className={`group rounded-xl border bg-card transition-all ${
                    isEditing ? 'border-primary/30 ring-1 ring-primary/10' : 'border-border hover:border-border/80'
                  }`}
                >
                  {/* Main row */}
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    {/* Batch number */}
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-bold shrink-0 ${
                      entry.creativeBatchResult === 'Winner' ? 'bg-emerald-500/15 text-emerald-400' :
                      entry.creativeBatchResult === 'Loser' ? 'bg-red-500/10 text-red-400' :
                      entry.creativeBatchResult === 'Testing' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-primary/10 text-primary'
                    }`}>
                      {entries.length - i}
                    </div>

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input type="text" value={entry.batchName} onChange={(e) => updateLocalField(entry.id, 'batchName', e.target.value)} onBlur={(e) => handleBlur(entry.id, 'batchName', e.target.value)} className="w-full bg-transparent text-sm font-semibold text-foreground outline-none" autoFocus />
                      ) : (
                        <p className="text-sm font-semibold text-foreground truncate">{entry.batchName || <span className="text-muted-foreground/40 italic">Untitled batch</span>}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground/50">
                          {new Date(entry.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {/* Inline mini timeline */}
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 7 }, (_, d) => (
                            <div
                              key={d}
                              className={`h-1 w-2.5 rounded-full ${
                                d < timeline.daysSince
                                  ? timeline.isComplete ? 'bg-amber-400/70' : 'bg-primary/60'
                                  : 'bg-border/40'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[9px] text-muted-foreground/40">
                          {timeline.daysSince === 0 ? 'Today' : `D${Math.min(timeline.daysSince, 7)}${timeline.isComplete ? '+' : ''}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {entry.creativeType && typeCfg && (
                        <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[10px] font-semibold ${typeCfg.bg} ${typeCfg.color}`}>{entry.creativeType}</span>
                      )}
                      {entry.creativeBatchResult && resultCfg && (
                        <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[10px] font-semibold ${resultCfg.bg} ${resultCfg.color}`}>{entry.creativeBatchResult}</span>
                      )}
                      <span className="w-4">{getStatusIcon(entry.id)}</span>
                      {entry.creativeFolderLink && (
                        <a href={entry.creativeFolderLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/40 hover:text-primary transition"><ExternalLink className="h-3.5 w-3.5" /></a>
                      )}
                      <button onClick={() => setEditingId(isEditing ? null : entry.id)} className="rounded-lg p-1.5 text-muted-foreground/40 hover:text-foreground hover:bg-accent/30 transition">
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isEditing ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded edit panel */}
                  <AnimatePresence>
                    {isEditing && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        {/* Timeline detail */}
                        <div className="border-t border-border/50 px-4 py-3 bg-accent/5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
                              <span className="text-[11px] text-muted-foreground">
                                Launched {timeline.daysSince === 0 ? 'today' : timeline.daysSince === 1 ? 'yesterday' : `${timeline.daysSince} days ago`}
                              </span>
                            </div>
                            {timeline.isComplete ? (
                              <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                                <Flame className="h-3 w-3" />
                                7-day cycle complete · next batch due
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Due {timeline.nextBatchDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                <span className="text-muted-foreground/40">({7 - timeline.daysSince}d left)</span>
                              </span>
                            )}
                          </div>
                          {/* Progress bar */}
                          <div className="flex items-center gap-1 mt-2">
                            {Array.from({ length: 7 }, (_, d) => (
                              <div key={d} className="flex-1 flex flex-col items-center gap-0.5">
                                <div className={`h-1.5 w-full rounded-full ${
                                  d < timeline.daysSince
                                    ? timeline.isComplete ? 'bg-amber-400' : 'bg-primary'
                                    : 'bg-border/40'
                                }`} />
                                <span className="text-[8px] text-muted-foreground/40">D{d + 1}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Edit fields */}
                        <div className="border-t border-border/50 px-4 py-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <FormField label="Creative Folder">
                            <LinkChip value={entry.creativeFolderLink} onChange={(val) => updateLocalField(entry.id, 'creativeFolderLink', val)} onBlur={(val) => handleBlur(entry.id, 'creativeFolderLink', val)} placeholder="https://..." />
                          </FormField>
                          <FormField label="Creative Type">
                            <select value={entry.creativeType} onChange={(e) => handleSelectChange(entry.id, 'creativeType', e.target.value)} className={`form-input ${typeCfg?.color ?? ''}`}>
                              {CREATIVE_TYPES.map((t) => <option key={t} value={t} className="bg-card text-foreground">{t || 'Select...'}</option>)}
                            </select>
                          </FormField>
                          <FormField label="Batch Result">
                            <select value={entry.creativeBatchResult} onChange={(e) => handleSelectChange(entry.id, 'creativeBatchResult', e.target.value)} className={`form-input ${resultCfg?.color ?? ''}`}>
                              {CREATIVE_BATCH_RESULTS.map((r) => <option key={r} value={r} className="bg-card text-foreground">{r || 'Select...'}</option>)}
                            </select>
                          </FormField>
                        </div>
                        <div className="border-t border-border/50 px-4 py-2 flex justify-end">
                          <button onClick={() => deleteEntry(entry.id)} disabled={deletingIds.has(entry.id)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                            {deletingIds.has(entry.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            Delete Batch
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}

      {/* Footer */}
      {!loading && entries.length > 0 && (
        <p className="text-center text-[10px] text-muted-foreground/40">
          {entries.length} batch{entries.length !== 1 ? 'es' : ''} · ⌘N to add new
        </p>
      )}
    </PageTransition>
  );
}

function FormField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}{required && <span className="text-primary ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}
