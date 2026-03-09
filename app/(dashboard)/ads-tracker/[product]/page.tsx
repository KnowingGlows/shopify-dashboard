'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Trash2, ExternalLink, Loader2, Check, AlertCircle,
  X, Megaphone, ChevronDown, Target,
} from 'lucide-react';
import { AdsTrackerEntry } from '@/types/shopify';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';

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

const RESULT_CONFIG: Record<string, { color: string; bg: string }> = {
  Winner: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  Loser: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
  Testing: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  Scaled: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
};

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

export default function ProductAdsPage() {
  const params = useParams();
  const productName = decodeURIComponent(params.product as string);

  const [entries, setEntries] = useState<AdsTrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const saveTimeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Form state
  const [formBatch, setFormBatch] = useState('');
  const [formFolder, setFormFolder] = useState('');
  const [formType, setFormType] = useState('');
  const [formSpend, setFormSpend] = useState('');
  const [formRoas, setFormRoas] = useState('');
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

  const resetForm = () => {
    setFormBatch(''); setFormFolder(''); setFormType('');
    setFormSpend(''); setFormRoas(''); setFormResult('');
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
          dailyAdSpend: Number(formSpend) || 0,
          weeklyRoas: Number(formRoas) || 0,
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

  const getStatusIcon = (id: string) => {
    const s = saveStatus[id] ?? 'idle';
    if (s === 'saving') return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
    if (s === 'saved') return <Check className="h-3 w-3 text-emerald-400" />;
    if (s === 'error') return <AlertCircle className="h-3 w-3 text-destructive" />;
    return null;
  };

  // Stats
  const totalSpend = entries.reduce((s, e) => s + (e.dailyAdSpend ?? 0), 0);
  const roasBatches = entries.filter((e) => e.weeklyRoas > 0);
  const avgRoas = roasBatches.length > 0 ? roasBatches.reduce((s, e) => s + e.weeklyRoas, 0) / roasBatches.length : 0;
  const winners = entries.filter((e) => e.creativeBatchResult === 'Winner').length;
  const losers = entries.filter((e) => e.creativeBatchResult === 'Loser').length;
  const testing = entries.filter((e) => e.creativeBatchResult === 'Testing').length;
  const scaled = entries.filter((e) => e.creativeBatchResult === 'Scaled').length;
  const decided = winners + losers;
  const hitRate = decided > 0 ? Math.round((winners / decided) * 100) : 0;

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/ads-tracker" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{productName}</h1>
            <p className="text-[11px] text-muted-foreground">{entries.length} batch{entries.length !== 1 ? 'es' : ''} · Ad performance tracking</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? 'Cancel' : 'New Batch'}
        </button>
      </div>

      {/* Performance Stats */}
      {entries.length > 0 && (
        <StaggerContainer className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StaggerItem>
            <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Spend</p>
              <p className="text-lg font-semibold text-amber-400 tabular-nums">{formatINR(totalSpend)}</p>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Avg ROAS</p>
              <p className={`text-lg font-semibold tabular-nums ${avgRoas >= 2 ? 'text-emerald-400' : avgRoas >= 1 ? 'text-amber-400' : avgRoas > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                {avgRoas > 0 ? `${avgRoas.toFixed(2)}x` : '—'}
              </p>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Hit Rate</p>
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-primary" />
                <p className={`text-lg font-semibold ${hitRate >= 30 ? 'text-emerald-400' : hitRate > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                  {decided > 0 ? `${hitRate}%` : '—'}
                </p>
              </div>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Results</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {winners > 0 && <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{winners}W</span>}
                {losers > 0 && <span className="text-[11px] font-medium text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">{losers}L</span>}
                {testing > 0 && <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">{testing}T</span>}
                {scaled > 0 && <span className="text-[11px] font-medium text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{scaled}S</span>}
                {decided === 0 && testing === 0 && scaled === 0 && <span className="text-muted-foreground text-[13px]">—</span>}
              </div>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Batches</p>
              <p className="text-lg font-semibold text-foreground">{entries.length}</p>
            </div>
          </StaggerItem>
        </StaggerContainer>
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
                <h2 className="text-sm font-semibold text-foreground">New Batch</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="Batch Name">
                  <input type="text" value={formBatch} onChange={(e) => setFormBatch(e.target.value)} placeholder={`Batch ${entries.length + 1}`} className="form-input" autoFocus />
                </FormField>
                <FormField label="Creative Folder">
                  <input type="text" value={formFolder} onChange={(e) => setFormFolder(e.target.value)} placeholder="https://drive.google.com/..." className="form-input" />
                </FormField>
                <FormField label="Creative Type">
                  <select value={formType} onChange={(e) => setFormType(e.target.value)} className="form-input">
                    {CREATIVE_TYPES.map((t) => <option key={t} value={t}>{t || 'Select type...'}</option>)}
                  </select>
                </FormField>
                <FormField label="Daily Ad Spend (INR)">
                  <input type="number" value={formSpend} onChange={(e) => setFormSpend(e.target.value)} placeholder="0" className="form-input" />
                </FormField>
                <FormField label="Weekly ROAS">
                  <input type="number" value={formRoas} onChange={(e) => setFormRoas(e.target.value)} placeholder="0.00" step="0.01" className="form-input" />
                </FormField>
                <FormField label="Result">
                  <select value={formResult} onChange={(e) => setFormResult(e.target.value)} className="form-input">
                    {CREATIVE_BATCH_RESULTS.map((r) => <option key={r} value={r}>{r || 'Select result...'}</option>)}
                  </select>
                </FormField>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button onClick={addBatch} disabled={adding} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50">
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
          <p className="text-[11px] text-muted-foreground/60 mt-1">Click &quot;New Batch&quot; to launch your first ad batch</p>
        </motion.div>
      ) : (
        <StaggerContainer className="space-y-2">
          {entries.map((entry, i) => {
            const typeCfg = TYPE_CONFIG[entry.creativeType];
            const resultCfg = RESULT_CONFIG[entry.creativeBatchResult];
            const isEditing = editingId === entry.id;

            return (
              <StaggerItem key={entry.id}>
                <motion.div layout className={`group rounded-xl border border-border bg-card transition-all hover:border-border/80 ${isEditing ? 'ring-1 ring-primary/20' : ''}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Batch number */}
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary shrink-0">
                      {entries.length - i}
                    </div>

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input type="text" value={entry.batchName} onChange={(e) => updateLocalField(entry.id, 'batchName', e.target.value)} onBlur={(e) => handleBlur(entry.id, 'batchName', e.target.value)} className="w-full bg-transparent text-[14px] font-medium text-foreground outline-none" autoFocus />
                      ) : (
                        <p className="text-[14px] font-medium text-foreground truncate">{entry.batchName || <span className="text-muted-foreground/40 italic">Untitled batch</span>}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/50">{new Date(entry.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {entry.creativeType && typeCfg && (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${typeCfg.bg} ${typeCfg.color}`}>{entry.creativeType}</span>
                      )}
                      {entry.dailyAdSpend > 0 && <span className="text-[12px] font-medium text-amber-400 tabular-nums">{formatINR(entry.dailyAdSpend)}/d</span>}
                      {entry.weeklyRoas > 0 && (
                        <span className={`text-[12px] font-semibold tabular-nums ${entry.weeklyRoas >= 2 ? 'text-emerald-400' : entry.weeklyRoas >= 1 ? 'text-amber-400' : 'text-red-400'}`}>{entry.weeklyRoas.toFixed(2)}x</span>
                      )}
                      {entry.creativeBatchResult && resultCfg && (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${resultCfg.bg} ${resultCfg.color}`}>{entry.creativeBatchResult}</span>
                      )}
                      <span className="w-4">{getStatusIcon(entry.id)}</span>
                      {entry.creativeFolderLink && (
                        <a href={entry.creativeFolderLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/40 hover:text-primary transition"><ExternalLink className="h-3.5 w-3.5" /></a>
                      )}
                      <button onClick={() => setEditingId(isEditing ? null : entry.id)} className="rounded-md p-1 text-muted-foreground/40 hover:text-foreground transition">
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isEditing ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isEditing && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="border-t border-border px-4 py-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <FormField label="Creative Folder">
                            <input type="text" value={entry.creativeFolderLink} onChange={(e) => updateLocalField(entry.id, 'creativeFolderLink', e.target.value)} onBlur={(e) => handleBlur(entry.id, 'creativeFolderLink', e.target.value)} placeholder="https://..." className="form-input" />
                          </FormField>
                          <FormField label="Creative Type">
                            <select value={entry.creativeType} onChange={(e) => handleSelectChange(entry.id, 'creativeType', e.target.value)} className={`form-input ${typeCfg?.color ?? ''}`}>
                              {CREATIVE_TYPES.map((t) => <option key={t} value={t} className="bg-card text-foreground">{t || 'Select...'}</option>)}
                            </select>
                          </FormField>
                          <FormField label="Daily Spend">
                            <input type="number" value={entry.dailyAdSpend || ''} onChange={(e) => updateLocalField(entry.id, 'dailyAdSpend', e.target.value === '' ? 0 : Number(e.target.value))} onBlur={(e) => handleBlur(entry.id, 'dailyAdSpend', e.target.value === '' ? 0 : Number(e.target.value))} placeholder="0" className="form-input" />
                          </FormField>
                          <FormField label="Weekly ROAS">
                            <input type="number" value={entry.weeklyRoas || ''} onChange={(e) => updateLocalField(entry.id, 'weeklyRoas', e.target.value === '' ? 0 : Number(e.target.value))} onBlur={(e) => handleBlur(entry.id, 'weeklyRoas', e.target.value === '' ? 0 : Number(e.target.value))} placeholder="0.00" step="0.01" className="form-input" />
                          </FormField>
                          <FormField label="Batch Result">
                            <select value={entry.creativeBatchResult} onChange={(e) => handleSelectChange(entry.id, 'creativeBatchResult', e.target.value)} className={`form-input ${resultCfg?.color ?? ''}`}>
                              {CREATIVE_BATCH_RESULTS.map((r) => <option key={r} value={r} className="bg-card text-foreground">{r || 'Select...'}</option>)}
                            </select>
                          </FormField>
                        </div>
                        <div className="border-t border-border px-4 py-2 flex justify-end">
                          <button onClick={() => deleteEntry(entry.id)} disabled={deletingIds.has(entry.id)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                            {deletingIds.has(entry.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Delete
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
