'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2, ExternalLink, Loader2, Check, AlertCircle,
  Plus, X, Package, ChevronDown, ChevronLeft, ChevronRight,
  Target, Trophy, TrendingUp, Calendar, ArrowRight,
} from 'lucide-react';
import { ProductTrackerEntry } from '@/types/shopify';
import type { Funnel } from '@/types/funnel';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';
import { LinkChip } from '@/components/link-chip';
import { formatINR } from '@/lib/currency-converter';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const PRODUCT_STAGES = [
  '',
  'Research Phase',
  'Testing Store Page Done',
  'Testing Ads',
  'Winner - Moved To OPS',
  'Flop',
  'Dropped',
];

const STAGE_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  'Research Phase': { color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30', dot: 'bg-violet-400' },
  'Testing Store Page Done': { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', dot: 'bg-blue-400' },
  'Testing Ads': { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400' },
  'Winner - Moved To OPS': { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
  'Flop': { color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30', dot: 'bg-rose-400' },
  'Dropped': { color: 'text-muted-foreground', bg: 'bg-border/30 border-border', dot: 'bg-muted-foreground' },
};

type TabKey = 'all' | 'active' | 'winners';

export default function ProductTrackerPage() {
  const [entries, setEntries] = useState<ProductTrackerEntry[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const saveTimeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formStage, setFormStage] = useState('');
  const [formSpent, setFormSpent] = useState('');
  const [formRemarks, setFormRemarks] = useState('');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const [productsRes, funnelsRes] = await Promise.all([
        fetch('/api/product-tracker').then((r) => r.json()),
        fetch('/api/funnels').then((r) => r.json()),
      ]);
      setEntries(productsRes.entries ?? []);
      setFunnels(funnelsRes.funnels ?? []);
    } catch {
      setEntries([]);
      setFunnels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const resetForm = () => {
    setFormName(''); setFormLink(''); setFormStage(''); setFormSpent(''); setFormRemarks('');
  };

  const addEntry = async () => {
    if (!formName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/product-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: formName,
          productFileLink: formLink,
          productStage: formStage,
          totalSpent: Number(formSpent) || 0,
          remarks: formRemarks,
        }),
      });
      const data = await res.json();
      if (data.entry) {
        setEntries((prev) => [data.entry, ...prev]);
        resetForm();
        setShowForm(false);
      }
    } catch { /* silently fail */ }
    finally { setAdding(false); }
  };

  const updateLocalField = (id: string, field: keyof ProductTrackerEntry, value: string | number) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const saveEntry = useCallback(async (id: string, field: keyof ProductTrackerEntry, value: string | number) => {
    setSaveStatus((prev) => ({ ...prev, [id]: 'saving' }));
    try {
      const res = await fetch('/api/product-tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: value }),
      });
      if (!res.ok) throw new Error();
      setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }));
      if (saveTimeoutRefs.current[id]) clearTimeout(saveTimeoutRefs.current[id]);
      saveTimeoutRefs.current[id] = setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [id]: 'idle' }));
      }, 1500);
    } catch {
      setSaveStatus((prev) => ({ ...prev, [id]: 'error' }));
    }
  }, []);

  const handleBlur = (id: string, field: keyof ProductTrackerEntry, value: string | number) => {
    saveEntry(id, field, value);
  };

  const handleSelectChange = (id: string, value: string) => {
    updateLocalField(id, 'productStage', value);
    saveEntry(id, 'productStage', value);
  };

  const deleteEntry = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch('/api/product-tracker', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch { /* silently fail */ }
    finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const getStatusIcon = (id: string) => {
    const status = saveStatus[id] ?? 'idle';
    if (status === 'saving') return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
    if (status === 'saved') return <Check className="h-3 w-3 text-emerald-400" />;
    if (status === 'error') return <AlertCircle className="h-3 w-3 text-destructive" />;
    return null;
  };

  // Stats
  const stageStats = PRODUCT_STAGES.filter(Boolean).map((stage) => ({
    stage,
    count: entries.filter((e) => e.productStage === stage).length,
    config: STAGE_CONFIG[stage],
  }));

  // Hit rate = winners ÷ (winners + flops). Flop = tested & failed (counts);
  // Dropped = never tested (excluded entirely).
  const winnersCount = entries.filter((e) => e.productStage === 'Winner - Moved To OPS').length;
  const flopCount = entries.filter((e) => e.productStage === 'Flop').length;
  const decidedCount = winnersCount + flopCount;
  const hitRate = decidedCount === 0 ? 0 : Math.round((winnersCount / decidedCount) * 100);

  // Products tested = reached an ad-test outcome (Flop is tested, Dropped is not)
  const TESTED_STAGES = ['Testing Ads', 'Winner - Moved To OPS', 'Flop'];
  const testedThisMonth = useMemo(() => {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return entries.filter((e) => (e.createdAt ?? '').startsWith(monthStr) && TESTED_STAGES.includes(e.productStage)).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  // Total spent
  const totalSpent = useMemo(() => entries.reduce((s, e) => s + (e.totalSpent || 0), 0), [entries]);

  // Per-product funnel summary (counts) — drives the continuity chip on each row.
  // Match by productId first, fall back to productName for legacy funnels.
  const funnelSummaryByProduct = useMemo(() => {
    const map = new Map<string, { total: number; live: number }>();
    funnels.forEach((f) => {
      const product = entries.find((e) => (f.productId && e.id === f.productId) || (!f.productId && e.productName === f.productName));
      if (!product) return;
      const cur = map.get(product.id) ?? { total: 0, live: 0 };
      cur.total++;
      if (f.status === 'live') cur.live++;
      map.set(product.id, cur);
    });
    return map;
  }, [funnels, entries]);

  // Tab filter — All / Active / Winners
  const [tab, setTab] = useState<TabKey>('active');
  const ACTIVE_STAGES = ['Research Phase', 'Testing Store Page Done', 'Testing Ads', ''];
  const winnerEntries = entries.filter((e) => e.productStage === 'Winner - Moved To OPS');
  const activeEntries = entries.filter((e) => ACTIVE_STAGES.includes(e.productStage));

  // Pagination
  const ITEMS_PER_PAGE = 10;
  const [page, setPage] = useState(1);
  const displayEntries = tab === 'winners' ? winnerEntries : tab === 'active' ? activeEntries : entries;
  const totalPages = Math.max(1, Math.ceil(displayEntries.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedEntries = displayEntries.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Product Tracker</h1>
          <p className="text-[11px] text-muted-foreground">Track products from research to launch</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? 'Cancel' : 'Add Product'}
        </button>
      </div>

      {/* Metric Cards */}
      <StaggerContainer className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StaggerItem>
          <div className="card-hover-glow rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Hit Rate</p>
              <Target className="h-3.5 w-3.5 text-primary/60" />
            </div>
            <p className={`text-xl font-bold ${hitRate >= 30 ? 'text-emerald-400' : hitRate > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
              {hitRate > 0 ? `${hitRate}%` : '—'}
            </p>
            <p className="text-[9px] text-muted-foreground/40 mt-0.5">{winnersCount}W / {flopCount}F · {decidedCount} decided</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">This Month</p>
              <Calendar className="h-3.5 w-3.5 text-blue-400/60" />
            </div>
            <p className="text-xl font-bold text-foreground">{testedThisMonth}</p>
            <p className="text-[9px] text-muted-foreground/40 mt-0.5">products tested</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Total Products</p>
              <Package className="h-3.5 w-3.5 text-violet-400/60" />
            </div>
            <p className="text-xl font-bold text-foreground">{entries.length}</p>
            <p className="text-[9px] text-muted-foreground/40 mt-0.5">{activeEntries.length} active</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card-hover-glow rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Total Spent</p>
              <TrendingUp className="h-3.5 w-3.5 text-amber-400/60" />
            </div>
            <p className="text-xl font-bold text-amber-400">{formatINR(totalSpent)}</p>
            <p className="text-[9px] text-muted-foreground/40 mt-0.5">across all products</p>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* Stage pills + Winners toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {stageStats.filter((s) => s.stage !== 'Winner - Moved To OPS').map(({ stage, count, config }) => (
          <div key={stage} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium ${config.bg}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
            <span className={config.color}>{stage}</span>
            <span className="text-muted-foreground">{count}</span>
          </div>
        ))}
        <div className="ml-auto inline-flex items-center rounded-full border border-border bg-card p-0.5">
          {([
            { key: 'all',     label: 'All',     count: entries.length,           tone: '' },
            { key: 'active',  label: 'Active',  count: activeEntries.length,     tone: '' },
            { key: 'winners', label: 'Winners', count: winnerEntries.length,     tone: 'emerald' },
          ] as Array<{ key: TabKey; label: string; count: number; tone: string }>).map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => { setTab(t.key); setPage(1); }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition ${
                  active
                    ? t.tone === 'emerald'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.key === 'winners' && <Trophy className="h-3 w-3" />}
                {t.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ${active ? 'bg-black/20' : 'bg-border/50 text-foreground'}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Add Form Panel */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 20 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-primary/20 bg-card p-5 shadow-[0_0_30px_rgba(167,139,250,0.06)]">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Package className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">New Product</h2>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Product Name" required>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Wireless Earbuds V2"
                    className="form-input"
                    autoFocus
                  />
                </FormField>
                <FormField label="File / Drive Link">
                  <LinkChip
                    value={formLink}
                    onChange={setFormLink}
                    placeholder="https://drive.google.com/..."
                  />
                </FormField>
                <FormField label="Stage">
                  <select
                    value={formStage}
                    onChange={(e) => setFormStage(e.target.value)}
                    className="form-input"
                  >
                    {PRODUCT_STAGES.map((s) => (
                      <option key={s} value={s}>{s || 'Select stage...'}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Total Spent (INR)">
                  <input
                    type="number"
                    value={formSpent}
                    onChange={(e) => setFormSpent(e.target.value)}
                    placeholder="0"
                    className="form-input"
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Remarks">
                    <input
                      type="text"
                      value={formRemarks}
                      onChange={(e) => setFormRemarks(e.target.value)}
                      placeholder="Any notes about this product..."
                      className="form-input"
                    />
                  </FormField>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={addEntry}
                  disabled={adding || !formName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add Product
                </button>
                <button
                  onClick={() => { resetForm(); setShowForm(false); }}
                  className="rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center"
        >
          <Package className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No products yet</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Click &quot;Add Product&quot; to get started</p>
        </motion.div>
      ) : (
        <StaggerContainer className="space-y-2">
          {paginatedEntries.map((entry) => {
            const cfg = STAGE_CONFIG[entry.productStage] ?? { color: 'text-muted-foreground', bg: 'bg-border/30 border-border', dot: 'bg-muted-foreground' };
            const isEditing = editingId === entry.id;

            return (
              <StaggerItem key={entry.id}>
                <motion.div
                  layout
                  className={`group relative rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-[0_0_20px_rgba(167,139,250,0.08)] ${isEditing ? 'ring-1 ring-primary/20' : ''}`}
                >
                  {/* Full-card click target — overlay link covers the row; interactive controls escape via z-10 */}
                  {!isEditing && (
                    <Link
                      href={`/product-tracker/${entry.id}`}
                      aria-label={`Open ${entry.productName || 'product'} dossier`}
                      className="absolute inset-0 rounded-xl"
                    />
                  )}
                  {/* Card header - always visible */}
                  <div className={`flex items-center gap-3 px-4 py-3 ${!isEditing ? 'pointer-events-none' : ''}`}>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input
                          type="text"
                          value={entry.productName}
                          onChange={(e) => updateLocalField(entry.id, 'productName', e.target.value)}
                          onBlur={(e) => handleBlur(entry.id, 'productName', e.target.value)}
                          className="w-full bg-transparent text-[14px] font-medium text-foreground outline-none"
                          autoFocus
                        />
                      ) : (
                        <p className="text-[14px] font-medium text-foreground truncate">
                          {entry.productName || <span className="text-muted-foreground/40 italic">Unnamed product</span>}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Funnel continuity chip */}
                      {(() => {
                        const summary = funnelSummaryByProduct.get(entry.id);
                        if (!summary || summary.total === 0) return null;
                        return (
                          <span
                            className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-300"
                            title={`${summary.total} funnel${summary.total === 1 ? '' : 's'} · ${summary.live} live`}
                          >
                            {summary.total} funnel{summary.total === 1 ? '' : 's'}
                            {summary.live > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-emerald-400">
                                <span className="h-1 w-1 rounded-full bg-emerald-400" /> {summary.live} live
                              </span>
                            )}
                          </span>
                        );
                      })()}

                      {/* Stage badge */}
                      {entry.productStage && (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
                          {entry.productStage}
                        </span>
                      )}

                      {/* Spent */}
                      {entry.totalSpent > 0 && (
                        <span className="text-[12px] font-medium text-muted-foreground">{formatINR(entry.totalSpent)}</span>
                      )}

                      {/* Status indicator */}
                      <span className="w-4">{getStatusIcon(entry.id)}</span>

                      {/* External file link */}
                      {entry.productFileLink && (
                        <a
                          href={entry.productFileLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="pointer-events-auto relative z-10 text-muted-foreground/40 hover:text-primary transition"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}

                      {/* Expand/Collapse inline editor */}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingId(isEditing ? null : entry.id); }}
                        className="pointer-events-auto relative z-10 rounded-md p-1 text-muted-foreground/40 hover:text-foreground transition"
                        title={isEditing ? 'Close editor' : 'Quick edit'}
                      >
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isEditing ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Open hint — purely visual, the whole card is clickable */}
                      <span className="text-muted-foreground/30 transition group-hover:text-primary group-hover:translate-x-0.5">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>

                  {/* Expanded edit area */}
                  <AnimatePresence>
                    {isEditing && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border px-4 py-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <FormField label="File Link">
                            <LinkChip
                              value={entry.productFileLink}
                              onChange={(val) => updateLocalField(entry.id, 'productFileLink', val)}
                              onBlur={(val) => handleBlur(entry.id, 'productFileLink', val)}
                              placeholder="https://..."
                            />
                          </FormField>
                          <FormField label="Stage">
                            <select
                              value={entry.productStage}
                              onChange={(e) => handleSelectChange(entry.id, e.target.value)}
                              className={`form-input ${cfg.color}`}
                            >
                              {PRODUCT_STAGES.map((s) => (
                                <option key={s} value={s} className="bg-card text-foreground">{s || 'Select...'}</option>
                              ))}
                            </select>
                          </FormField>
                          <FormField label="Total Spent (INR)">
                            <input
                              type="number"
                              value={entry.totalSpent || ''}
                              onChange={(e) => updateLocalField(entry.id, 'totalSpent', e.target.value === '' ? 0 : Number(e.target.value))}
                              onBlur={(e) => handleBlur(entry.id, 'totalSpent', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0"
                              className="form-input"
                            />
                          </FormField>
                          <FormField label="COGS / unit (USD)" hint="supplier cost per unit">
                            <input
                              type="number"
                              step="0.01"
                              value={entry.cogs || ''}
                              onChange={(e) => updateLocalField(entry.id, 'cogs', e.target.value === '' ? 0 : Number(e.target.value))}
                              onBlur={(e) => handleBlur(entry.id, 'cogs', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0.00"
                              className="form-input tabular-nums"
                            />
                          </FormField>
                          <FormField label="Shipping / unit (USD)" hint="per-unit shipping cost">
                            <input
                              type="number"
                              step="0.01"
                              value={entry.shipping || ''}
                              onChange={(e) => updateLocalField(entry.id, 'shipping', e.target.value === '' ? 0 : Number(e.target.value))}
                              onBlur={(e) => handleBlur(entry.id, 'shipping', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0.00"
                              className="form-input tabular-nums"
                            />
                          </FormField>
                          <FormField label="Remarks">
                            <input
                              type="text"
                              value={entry.remarks}
                              onChange={(e) => updateLocalField(entry.id, 'remarks', e.target.value)}
                              onBlur={(e) => handleBlur(entry.id, 'remarks', e.target.value)}
                              placeholder="Notes..."
                              className="form-input"
                            />
                          </FormField>
                        </div>
                        {(entry.cogs > 0 || entry.shipping > 0) && (
                          <div className="border-t border-border px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span>Total cost / unit</span>
                            <span className="font-semibold tabular-nums text-foreground">${(entry.cogs + entry.shipping).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="border-t border-border px-4 py-2 flex justify-end">
                          <button
                            onClick={() => deleteEntry(entry.id)}
                            disabled={deletingIds.has(entry.id)}
                            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            {deletingIds.has(entry.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            Delete
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, displayEntries.length)} of {displayEntries.length}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => setPage(p)} className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${p === safePage ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {entries.length} product{entries.length !== 1 ? 's' : ''} · Click a row to edit · Auto-saves
      </p>
    </PageTransition>
  );
}

function FormField({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}{required && <span className="text-primary ml-0.5">*</span>}
        {hint && <span className="ml-1.5 normal-case tracking-normal text-[10px] text-muted-foreground/50">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
