'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Plus, Trash2, Loader2, ExternalLink, Check,
  X, Search, ChevronDown, Ban,
} from 'lucide-react';
import type { PRSEntry } from '@/types/shopify';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';

const STATUS_OPTIONS = ['', 'Researching', 'Approved', 'Rejected', 'Ordered Sample', 'Sample Received', 'Ready to Launch'] as const;

const STATUS_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  Researching: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', dot: 'bg-blue-400' },
  Approved: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
  Rejected: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', dot: 'bg-red-400' },
  'Ordered Sample': { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400' },
  'Sample Received': { color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30', dot: 'bg-violet-400' },
  'Ready to Launch': { color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-300' },
};

type SaveState = Record<string, 'idle' | 'saving' | 'saved'>;

export default function PRSPage() {
  const [entries, setEntries] = useState<PRSEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formAdLink, setFormAdLink] = useState('');
  const [formWebLink, setFormWebLink] = useState('');
  const [formDriveLink, setFormDriveLink] = useState('');
  const [formStatus, setFormStatus] = useState('');

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/prs');
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Cmd+N shortcut to open add form
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

  const resetForm = () => { setFormName(''); setFormAdLink(''); setFormWebLink(''); setFormDriveLink(''); setFormStatus(''); };

  // Search/filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // Rejected products live on their own page — keep the research board clean.
  const activeEntries = useMemo(() => entries.filter((e) => e.status !== 'Rejected'), [entries]);
  const rejectedCount = entries.length - activeEntries.length;
  const filteredEntries = useMemo(() => {
    let list = activeEntries;
    if (statusFilter) list = list.filter((e) => e.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => e.productName.toLowerCase().includes(q));
    }
    return list;
  }, [activeEntries, statusFilter, searchQuery]);

  const addEntry = async () => {
    if (!formName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/prs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: formName, adLink: formAdLink, websiteLink: formWebLink, driveLink: formDriveLink, status: formStatus }),
      });
      const data = await res.json();
      if (data.entry) { setEntries((prev) => [data.entry, ...prev]); resetForm(); setShowForm(false); }
    } catch { /* silently fail */ }
    finally { setAdding(false); }
  };

  const patchEntry = async (id: string, field: string, value: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
    setSaveState((prev) => ({ ...prev, [id]: 'saving' }));
    if (savedTimers.current[id]) clearTimeout(savedTimers.current[id]);
    try {
      await fetch('/api/prs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, [field]: value }) });
      setSaveState((prev) => ({ ...prev, [id]: 'saved' }));
      savedTimers.current[id] = setTimeout(() => setSaveState((prev) => ({ ...prev, [id]: 'idle' })), 1500);
    } catch { setSaveState((prev) => ({ ...prev, [id]: 'idle' })); }
  };

  const deleteEntry = async (id: string) => {
    setDeletingId(id);
    try { await fetch(`/api/prs?id=${id}`, { method: 'DELETE' }); setEntries((prev) => prev.filter((e) => e.id !== id)); }
    catch { /* silently fail */ }
    finally { setDeletingId(null); }
  };

  const [approvingId, setApprovingId] = useState<string | null>(null);
  // Approve → create the product in the Products tracker, then drop it from
  // the research board (a true "move", not a duplicate).
  const approveEntry = async (entry: PRSEntry) => {
    if (!entry.productName.trim()) return;
    setApprovingId(entry.id);
    try {
      const res = await fetch('/api/product-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: entry.productName,
          productFileLink: entry.driveLink || '',
          adLink: entry.adLink || '',
          websiteLink: entry.websiteLink || '',
          productStage: 'Research Phase',
          remarks: '',
        }),
      });
      if (!res.ok) throw new Error('Failed to create product');
      await fetch(`/api/prs?id=${entry.id}`, { method: 'DELETE' });
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch { /* silently fail — entry stays so it can be retried */ }
    finally { setApprovingId(null); }
  };

  // Stats (exclude Rejected — those have a dedicated page)
  const statusStats = STATUS_OPTIONS.filter((s) => s && s !== 'Rejected').map((s) => ({
    status: s, count: activeEntries.filter((e) => e.status === s).length, config: STATUS_CONFIG[s],
  }));

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Product Research</h1>
          <p className="text-[11px] text-muted-foreground">Discover and validate products</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="h-9 w-40 rounded-lg border border-border bg-card pl-8 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none transition"
            />
          </div>
          <Link
            href="/prs/rejected"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-medium text-muted-foreground transition hover:text-rose-400 hover:border-rose-500/30"
          >
            <Ban className="h-3.5 w-3.5" />
            Rejected{rejectedCount > 0 && <span className="text-rose-400">({rejectedCount})</span>}
          </Link>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition hover:bg-primary/90">
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? 'Cancel' : 'Add'}
          </button>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border bg-card/80 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/50">
            ⌘N
          </kbd>
        </div>
      </div>

      {/* Status pills — clickable filters */}
      <div className="flex flex-wrap gap-2">
        {statusFilter && (
          <button onClick={() => setStatusFilter('')} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition">
            <X className="h-2.5 w-2.5" /> Clear
          </button>
        )}
        {statusStats.filter((s) => s.count > 0).map(({ status, count, config }) => (
          <button
            key={status}
            onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
              statusFilter === status ? config.bg + ' ring-1 ring-primary/30' : statusFilter ? 'border-border/30 opacity-50 hover:opacity-100' : config.bg
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
            <span className={config.color}>{status}</span>
            <span className="text-muted-foreground">{count}</span>
          </button>
        ))}
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl border border-primary/20 bg-card p-5 shadow-[0_0_30px_rgba(167,139,250,0.06)]">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"><Search className="h-4 w-4" /></div>
                <h2 className="text-sm font-semibold text-foreground">New Research Entry</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Product Name" required>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Product name..." className="form-input" autoFocus />
                </FormField>
                <FormField label="Status">
                  <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} className="form-input">
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'Select status...'}</option>)}
                  </select>
                </FormField>
                <FormField label="Ad Link">
                  <input type="text" value={formAdLink} onChange={(e) => setFormAdLink(e.target.value)} placeholder="https://..." className="form-input" />
                </FormField>
                <FormField label="Website Link">
                  <input type="text" value={formWebLink} onChange={(e) => setFormWebLink(e.target.value)} placeholder="https://..." className="form-input" />
                </FormField>
                <FormField label="Drive Link">
                  <input type="text" value={formDriveLink} onChange={(e) => setFormDriveLink(e.target.value)} placeholder="https://drive..." className="form-input" />
                </FormField>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button onClick={addEntry} disabled={adding || !formName.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50">
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Add Product
                </button>
                <button onClick={() => { resetForm(); setShowForm(false); }} className="rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : activeEntries.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{entries.length === 0 ? 'No products researched yet' : 'No active products'}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            {entries.length === 0
              ? 'Click "Add Product" to get started'
              : <>All products are rejected — <Link href="/prs/rejected" className="text-rose-400 hover:underline">view rejected</Link></>}
          </p>
        </motion.div>
      ) : (
        <StaggerContainer className="space-y-2">
          {filteredEntries.map((entry) => {
            const cfg = STATUS_CONFIG[entry.status];
            const isEditing = editingId === entry.id;

            return (
              <StaggerItem key={entry.id}>
                <motion.div layout className={`group rounded-xl border border-border bg-card transition-all hover:border-border/80 hover:shadow-[0_0_20px_rgba(167,139,250,0.04)] ${isEditing ? 'ring-1 ring-primary/20' : ''}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    {cfg && <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input type="text" defaultValue={entry.productName} onBlur={(e) => e.target.value !== entry.productName && patchEntry(entry.id, 'productName', e.target.value)} className="w-full bg-transparent text-[14px] font-medium text-foreground outline-none" autoFocus />
                      ) : (
                        <p className="text-[14px] font-medium text-foreground truncate">{entry.productName || <span className="text-muted-foreground/40 italic">Unnamed</span>}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.status && cfg && (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>{entry.status}</span>
                      )}
                      {saveState[entry.id] === 'saving' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      {saveState[entry.id] === 'saved' && <Check className="h-3 w-3 text-emerald-400" />}
                      {entry.adLink && <a href={entry.adLink} target="_blank" rel="noopener noreferrer" title="Ad link" className="text-muted-foreground/40 hover:text-primary transition"><ExternalLink className="h-3.5 w-3.5" /></a>}
                      {entry.websiteLink && <a href={entry.websiteLink} target="_blank" rel="noopener noreferrer" title="Website link" className="text-muted-foreground/40 hover:text-blue-400 transition"><ExternalLink className="h-3.5 w-3.5" /></a>}
                      {entry.driveLink && <a href={entry.driveLink} target="_blank" rel="noopener noreferrer" title="Drive link" className="text-muted-foreground/40 hover:text-amber-400 transition"><ExternalLink className="h-3.5 w-3.5" /></a>}
                      <button
                        onClick={() => approveEntry(entry)}
                        disabled={approvingId === entry.id}
                        title="Approve → move to Products"
                        className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[10px] font-medium text-muted-foreground/50 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-50"
                      >
                        {approvingId === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                      </button>
                      <button
                        onClick={() => patchEntry(entry.id, 'status', 'Rejected')}
                        title="Reject product"
                        className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[10px] font-medium text-muted-foreground/50 transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <Ban className="h-3.5 w-3.5" /> Reject
                      </button>
                      <button onClick={() => setEditingId(isEditing ? null : entry.id)} className="rounded-md p-1 text-muted-foreground/40 hover:text-foreground transition">
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isEditing ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isEditing && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="border-t border-border px-4 py-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <FormField label="Ad Link">
                            <input type="text" defaultValue={entry.adLink} onBlur={(e) => e.target.value !== entry.adLink && patchEntry(entry.id, 'adLink', e.target.value)} placeholder="https://..." className="form-input" />
                          </FormField>
                          <FormField label="Website Link">
                            <input type="text" defaultValue={entry.websiteLink} onBlur={(e) => e.target.value !== entry.websiteLink && patchEntry(entry.id, 'websiteLink', e.target.value)} placeholder="https://..." className="form-input" />
                          </FormField>
                          <FormField label="Drive Link">
                            <input type="text" defaultValue={entry.driveLink} onBlur={(e) => e.target.value !== entry.driveLink && patchEntry(entry.id, 'driveLink', e.target.value)} placeholder="https://drive..." className="form-input" />
                          </FormField>
                          <FormField label="Status">
                            <select value={entry.status} onChange={(e) => patchEntry(entry.id, 'status', e.target.value)} className={`form-input ${cfg?.color ?? ''}`}>
                              {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="bg-card text-foreground">{s || 'Select...'}</option>)}
                            </select>
                          </FormField>
                        </div>
                        <div className="border-t border-border px-4 py-2 flex justify-end">
                          <button onClick={() => deleteEntry(entry.id)} disabled={deletingId === entry.id} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                            {deletingId === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Delete
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

      <p className="text-[11px] text-muted-foreground">
        {filteredEntries.length} of {entries.length} product{entries.length !== 1 ? 's' : ''} · Click a row to edit · Auto-saves · <kbd className="rounded border border-border px-1 py-0.5 text-[8px]">⌘N</kbd> to add
      </p>
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
