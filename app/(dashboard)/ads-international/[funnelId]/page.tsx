'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, ArrowLeft, Plus, Trash2, Pencil, Check, X, Loader2, AlertTriangle,
  ExternalLink, Layers, Trophy, TrendingDown, Sparkles, Funnel as FunnelIcon,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import type { Creative, CreativeStatus, CreativeResult, Funnel, FunnelStatus } from '@/types/funnel';
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

const FUNNEL_STATUS_TONE: Record<FunnelStatus, { text: string; bg: string; border: string; bar: string; glow: string }> = {
  live:    { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'bg-emerald-400',           glow: '#34d399' },
  testing: { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   bar: 'bg-amber-400',             glow: '#fbbf24' },
  paused:  { text: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     bar: 'bg-sky-400',               glow: '#38bdf8' },
  draft:   { text: 'text-muted-foreground', bg: 'bg-border/40', border: 'border-border',         bar: 'bg-muted-foreground/40',  glow: '#71717a' },
  killed:  { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    bar: 'bg-rose-400',             glow: '#fb7185' },
};

const TONE: Record<'gray' | 'amber' | 'emerald' | 'rose', { text: string; bg: string; border: string; dot: string }> = {
  gray:    { text: 'text-muted-foreground', bg: 'bg-border/40',     border: 'border-border',         dot: 'bg-muted-foreground' },
  amber:   { text: 'text-amber-400',        bg: 'bg-amber-500/10',  border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  emerald: { text: 'text-emerald-400',      bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  rose:    { text: 'text-rose-400',         bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    dot: 'bg-rose-400' },
};

const CREATIVE_TYPES = ['Video', 'Image', 'UGC', 'Carousel', 'Static', 'Other'];

function useCountUp(value: number, duration = 600) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(0);
  useEffect(() => { ref.current = display; });
  useEffect(() => {
    const from = ref.current;
    const to = Number.isFinite(value) ? value : 0;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

export default function AdsFunnelDetailPage() {
  const params = useParams<{ funnelId: string }>();
  const funnelId = params?.funnelId;
  const { user } = useAuth();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [product, setProduct] = useState<ProductTrackerEntry | null>(null);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<CreativeStatus | 'all'>('all');
  const [filterResult, setFilterResult] = useState<CreativeResult | 'all'>('all');
  const [filterDate, setFilterDate] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Inline-edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBatch, setEditBatch] = useState('');
  const [editType, setEditType] = useState('');
  const [editFolder, setEditFolder] = useState('');
  const [editLaunchDate, setEditLaunchDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const loadAll = useCallback(async () => {
    if (!funnelId) return;
    try {
      setLoading(true);
      setError(null);
      const [funnelsRes, productsRes, creativesRes] = await Promise.all([
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/product-tracker').then((r) => r.json()),
        fetch(`/api/creatives-intl?funnelId=${encodeURIComponent(funnelId)}`).then((r) => r.json()),
      ]);
      const f: Funnel | undefined = (funnelsRes.funnels ?? []).find((x: Funnel) => x.id === funnelId);
      if (!f) { setError('Funnel not found.'); setFunnel(null); return; }
      setFunnel(f);
      const p: ProductTrackerEntry | undefined = (productsRes.entries ?? []).find((e: ProductTrackerEntry) =>
        (f.productId && e.id === f.productId) || (!f.productId && e.productName === f.productName)
      );
      setProduct(p ?? null);
      setCreatives(creativesRes.creatives ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [funnelId]);

  useEffect(() => { if (funnelId) loadAll(); }, [funnelId, loadAll]);

  const refreshCreatives = async () => {
    if (!funnelId) return;
    try {
      const r = await fetch(`/api/creatives-intl?funnelId=${encodeURIComponent(funnelId)}`).then((r) => r.json());
      setCreatives(r.creatives ?? []);
    } catch { /* ignore */ }
  };

  // ── Filtered + grouped ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return creatives.filter((c) => {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (filterResult !== 'all' && c.result !== filterResult) return false;
      if (filterDate && c.launchDate !== filterDate) return false;
      return true;
    });
  }, [creatives, filterStatus, filterResult, filterDate]);

  // Group by batch — within each batch keep launch-date sort
  const byBatch = useMemo(() => {
    const map = new Map<string, Creative[]>();
    [...filtered]
      .sort((a, b) => (b.launchDate || '').localeCompare(a.launchDate || ''))
      .forEach((c) => {
        const key = c.batchName || '(no batch)';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
      });
    return Array.from(map.entries()).map(([batch, items]) => ({ batch, items }));
  }, [filtered]);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const total = creatives.length;
    // Live = still spending (live + testing + winners) — winners stay "live"
    // until explicitly killed.
    const live = creatives.filter((c) => c.status === 'live' || c.status === 'testing' || c.result === 'winner').length;
    const testing = creatives.filter((c) => c.status === 'testing').length;
    const killed = creatives.filter((c) => c.status === 'killed').length;
    const winners = creatives.filter((c) => c.result === 'winner').length;
    const losers = creatives.filter((c) => c.result === 'loser').length;
    // Hit rate = winners / (winners + killed). A creative being killed is the
    // signal it didn't pan out.
    const decided = winners + killed;
    const hitRate = decided > 0 ? (winners / decided) * 100 : 0;
    const batches = new Set(creatives.map((c) => c.batchName).filter(Boolean)).size;
    const lastLaunch = creatives.map((c) => c.launchDate).filter(Boolean).sort().pop() || '';
    return { total, live, testing, killed, winners, losers, hitRate, batches, lastLaunch };
  }, [creatives]);

  const animTotal = useCountUp(summary.total, 500);
  const animLive = useCountUp(summary.live, 500);
  const animWinners = useCountUp(summary.winners, 500);
  const animHit = useCountUp(summary.hitRate, 500);
  const animBatches = useCountUp(summary.batches, 500);

  // Status counts for pills
  const statusCounts = useMemo(() => {
    const c: Record<CreativeStatus | 'all', number> = { all: creatives.length, testing: 0, live: 0, killed: 0 };
    creatives.forEach((x) => { c[x.status]++; });
    return c;
  }, [creatives]);

  // Date chips
  const { today, yest } = useMemo(() => {
    const now = new Date();
    const fmtIST = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    return { today: fmtIST(now), yest: fmtIST(new Date(now.getTime() - 86_400_000)) };
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update creative.');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete creative.');
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

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </PageTransition>
    );
  }

  if (error || !funnel) {
    return (
      <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
        <Link href="/ads-international" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to Ads
        </Link>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
          <p className="mt-2 text-[13px] text-foreground">{error ?? 'Funnel not found.'}</p>
        </div>
      </PageTransition>
    );
  }

  const tone = FUNNEL_STATUS_TONE[funnel.status];
  const productId = product?.id;

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      <Link href="/ads-international" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to Ads
      </Link>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="group relative overflow-hidden rounded-2xl border border-border bg-card"
      >
        <div className={cn('absolute inset-x-0 top-0 h-[3px]', tone.bar)} aria-hidden />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl transition-opacity duration-700 group-hover:opacity-40"
          style={{ background: `radial-gradient(circle, ${tone.glow}55, transparent 70%)` }}
          aria-hidden
        />
        <div className="relative z-10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-lg shadow-primary/10">
                <Globe className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Ad creatives for</p>
                </div>
                {productId ? (
                  <Link href={`/product-tracker/${productId}`} className="inline-flex items-center gap-1.5 text-2xl font-semibold tracking-tight text-foreground hover:text-primary">
                    <span className="truncate">{funnel.productName}</span>
                  </Link>
                ) : (
                  <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{funnel.productName}</h1>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/25 bg-sky-500/10 px-2.5 py-1">
                    <Globe className="h-3.5 w-3.5 text-sky-400" aria-hidden />
                    <span className="text-[13px] font-semibold tracking-tight text-foreground">{funnel.country}</span>
                    <span className="text-sky-500/40">·</span>
                    <span className="text-[13px] font-medium text-sky-300/90">{funnel.language}</span>
                  </span>
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', tone.bg, tone.border, tone.text)}>
                    {funnel.status}
                  </span>
                  <Link href={`/funnels/${funnel.id}`} className="inline-flex items-center gap-0.5 text-[12px] text-primary hover:text-primary/80">
                    <FunnelIcon className="h-3 w-3" /> Funnel
                  </Link>
                </div>
              </div>
            </div>

            <motion.button
              onClick={() => setShowAddForm((v) => !v)}
              whileHover={{ y: -2, boxShadow: showAddForm ? '0 12px 30px -10px #fb718577, 0 0 0 1px #fb718544' : '0 12px 30px -10px #a78bfa88, 0 0 0 1px #a78bfa66' }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'group relative inline-flex items-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 text-[13px] font-semibold shadow-lg transition-all',
                showAddForm
                  ? 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/40'
                  : 'bg-gradient-to-r from-violet-500 via-violet-400 to-fuchsia-500 text-white ring-1 ring-violet-300/30'
              )}
            >
              {!showAddForm && (
                <span
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                  aria-hidden
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
                <span className="tracking-tight">{showAddForm ? 'Cancel' : 'Add Creative'}</span>
              </span>
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* KPI tiles — creative-specific */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile icon={<Layers className="h-3.5 w-3.5" />}    label="Creatives"  value={Math.round(animTotal).toLocaleString('en-IN')}  accent="violet" delay={0} hint={`${summary.testing} testing`} />
        <KpiTile icon={<Sparkles className="h-3.5 w-3.5" />}  label="Live"       value={Math.round(animLive).toLocaleString('en-IN')}   accent="emerald" delay={0.04} />
        <KpiTile icon={<Trophy className="h-3.5 w-3.5" />}    label="Winners"    value={Math.round(animWinners).toLocaleString('en-IN')} accent="sky" delay={0.08} hint={`${summary.losers} losers`} />
        <KpiTile icon={animHit < 50 ? <TrendingDown className="h-3.5 w-3.5" /> : <Trophy className="h-3.5 w-3.5" />} label="Hit rate" value={summary.winners + summary.losers > 0 ? `${animHit.toFixed(0)}%` : '—'} accent={summary.hitRate >= 50 ? 'emerald' : 'rose'} delay={0.12} hint="winners / decided" />
        <KpiTile icon={<Layers className="h-3.5 w-3.5" />}    label="Batches"    value={Math.round(animBatches).toLocaleString('en-IN')} accent="amber" delay={0.16} hint={summary.lastLaunch ? `last ${summary.lastLaunch}` : 'none yet'} />
      </div>

      {/* Date filter */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.18 }}
        className="flex flex-wrap items-center gap-2"
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Launched on</p>
        <DateChip active={filterDate === ''} onClick={() => setFilterDate('')}>Any day</DateChip>
        <DateChip active={filterDate === today} onClick={() => setFilterDate(today)}>Today</DateChip>
        <DateChip active={filterDate === yest} onClick={() => setFilterDate(yest)}>Yesterday</DateChip>
        <DatePicker value={filterDate} onChange={setFilterDate} placeholder="Pick a day" compact />
        {filterDate && <span className="text-[10px] text-emerald-400">{filterDate} only</span>}
      </motion.div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <FilterPill label="All" count={statusCounts.all} active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} />
          {STATUS_OPTIONS.map((s) => (
            <FilterPill key={s.value} label={s.label} count={statusCounts[s.value]} active={filterStatus === s.value} onClick={() => setFilterStatus(s.value)} tone={s.tone} />
          ))}
        </div>
        <div className="ml-auto">
          <select
            value={filterResult}
            onChange={(e) => setFilterResult(e.target.value as CreativeResult | 'all')}
            className="form-input py-1.5 text-[12px] w-40"
          >
            <option value="all">All results</option>
            {RESULT_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {/* Inline Add form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <InlineAddCreative
              funnel={funnel}
              today={today}
              onAdded={() => { setShowAddForm(false); refreshCreatives(); }}
              onCancel={() => setShowAddForm(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* Batches & creatives */}
      {creatives.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Layers className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-[13px] font-medium text-foreground">No creatives logged yet</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Click &ldquo;Add Creative&rdquo; to log your first batch.</p>
        </div>
      ) : byBatch.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-[12px] text-muted-foreground">No creatives match your filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {byBatch.map(({ batch, items }, idx) => {
            const bWinners = items.filter((c) => c.result === 'winner').length;
            const bKilled = items.filter((c) => c.status === 'killed').length;
            const bDecided = bWinners + bKilled;
            const bHit = bDecided > 0 ? (bWinners / bDecided) * 100 : 0;
            const bLive = items.filter((c) => c.status === 'live' || c.status === 'testing' || c.result === 'winner').length;
            const hotBatch = bWinners > 0 && bHit >= 50;
            return (
              <motion.div
                key={batch}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.3) }}
                className={cn(
                  'group relative overflow-hidden rounded-2xl border bg-card transition-colors',
                  hotBatch ? 'border-emerald-500/30' : 'border-border hover:border-border/80'
                )}
              >
                {/* Top accent */}
                <div className={cn('absolute inset-x-0 top-0 h-[3px]', hotBatch ? 'bg-gradient-to-r from-emerald-500/60 via-emerald-400 to-emerald-500/60' : 'bg-gradient-to-r from-violet-500/40 via-violet-400/60 to-violet-500/40')} aria-hidden />

                {/* Ambient corner glow when hot */}
                {hotBatch && (
                  <div
                    className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-25 blur-3xl transition-opacity duration-500 group-hover:opacity-50"
                    style={{ background: 'radial-gradient(circle, #34d39966, transparent 70%)' }}
                    aria-hidden
                  />
                )}

                {/* Batch header */}
                <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', hotBatch ? 'bg-emerald-500/15 text-emerald-400' : 'bg-violet-500/15 text-violet-400')}>
                      <Layers className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[14px] font-semibold tracking-tight text-foreground">{batch}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {items.length} creative{items.length === 1 ? '' : 's'} <span className="text-muted-foreground/40">·</span> last activity {(items.map((c) => c.launchDate).filter(Boolean).sort().pop() || '—')}
                      </p>
                    </div>
                  </div>

                  {/* Right-side stat chips */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-400">
                      <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" /> {bLive} live
                    </span>
                    {bWinners > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-400">
                        <Trophy className="h-2.5 w-2.5" /> {bWinners}W
                      </span>
                    )}
                    {bKilled > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 font-medium text-rose-400">
                        {bKilled}K
                      </span>
                    )}
                    {bDecided > 0 && (
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold tabular-nums',
                        bHit >= 50 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                      )}>
                        {bHit.toFixed(0)}% hit
                      </span>
                    )}
                  </div>
                </div>

                {/* Hit-rate progress bar — wins / killed */}
                {bDecided > 0 && (
                  <div className="relative z-10 px-5 pt-3">
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-border/50">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${bHit}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        className={cn('h-full rounded-full', bHit >= 50 ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : 'bg-rose-400/70')}
                      />
                    </div>
                  </div>
                )}

                {/* Creative rows — card style, no table */}
                <div className="relative z-10 divide-y divide-border/60 px-3 py-3">
                  {items.map((c, ci) => {
                    const sTone = TONE[STATUS_OPTIONS.find((s) => s.value === c.status)?.tone ?? 'amber'];
                    const rTone = TONE[RESULT_OPTIONS.find((r) => r.value === c.result)?.tone ?? 'gray'];
                    const isEditing = editingId === c.id;
                    const isWinner = c.result === 'winner';
                    return (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: Math.min(ci * 0.03, 0.2) }}
                        className={cn(
                          'group/row relative grid grid-cols-12 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                          isEditing ? 'bg-primary/[0.04] ring-1 ring-primary/30' : 'hover:bg-white/[0.025]'
                        )}
                      >
                        {/* Left winner accent */}
                        {isWinner && (
                          <span className="absolute inset-y-2 left-0 w-[2px] rounded-r bg-gradient-to-b from-amber-400 to-amber-300 shadow-[0_0_8px_#fbbf24]" aria-hidden />
                        )}

                        {/* Creative name + meta */}
                        <div className="col-span-12 min-w-0 md:col-span-4">
                          {isEditing ? (
                            <input
                              value={editBatch}
                              onChange={(e) => setEditBatch(e.target.value)}
                              placeholder="Batch / creative name"
                              className="w-full rounded-md border border-border bg-background/40 px-2.5 py-1.5 text-[12px] text-foreground outline-none transition focus:border-primary/50"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold uppercase',
                                isWinner ? 'bg-amber-500/15 text-amber-400' : 'bg-border/40 text-muted-foreground')}>
                                {isWinner ? <Trophy className="h-3.5 w-3.5" /> : c.creativeType?.[0] ?? '·'}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-[12.5px] font-medium text-foreground">{c.batchName || batch}</p>
                                {c.notes && <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">{c.notes}</p>}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Type chip */}
                        <div className="col-span-4 md:col-span-2">
                          {isEditing ? (
                            <select
                              value={editType}
                              onChange={(e) => setEditType(e.target.value)}
                              className="w-full rounded-md border border-border bg-background/40 px-2 py-1.5 text-[11px] outline-none focus:border-primary/50"
                            >
                              <option value="">—</option>
                              {CREATIVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          ) : (
                            <span className="inline-flex items-center rounded-md border border-border bg-background/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {c.creativeType || 'video'}
                            </span>
                          )}
                        </div>

                        {/* Status pill */}
                        <div className="col-span-4 md:col-span-2">
                          <select
                            value={c.status}
                            onChange={(e) => updateCreative(c.id, { status: e.target.value as CreativeStatus })}
                            className={cn(
                              'w-full cursor-pointer rounded-full border bg-no-repeat px-3 py-1 pr-7 text-[11px] font-semibold appearance-none outline-none transition',
                              sTone.bg, sTone.border, sTone.text
                            )}
                            style={{
                              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                              backgroundPosition: 'right 8px center',
                            }}
                          >
                            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value} className="bg-card text-foreground">{s.label}</option>)}
                          </select>
                        </div>

                        {/* Result pill */}
                        <div className="col-span-4 md:col-span-2">
                          <select
                            value={c.result}
                            onChange={(e) => updateCreative(c.id, { result: e.target.value as CreativeResult })}
                            className={cn(
                              'w-full cursor-pointer rounded-full border bg-no-repeat px-3 py-1 pr-7 text-[11px] font-semibold appearance-none outline-none transition',
                              rTone.bg, rTone.border, rTone.text
                            )}
                            style={{
                              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                              backgroundPosition: 'right 8px center',
                            }}
                          >
                            {RESULT_OPTIONS.map((r) => <option key={r.value} value={r.value} className="bg-card text-foreground">{r.label}</option>)}
                          </select>
                        </div>

                        {/* Launch + folder */}
                        <div className="col-span-8 md:col-span-1">
                          {isEditing ? (
                            <DatePicker value={editLaunchDate} onChange={setEditLaunchDate} compact />
                          ) : (
                            <span className="text-[10px] tabular-nums text-muted-foreground/80">{c.launchDate || '—'}</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="col-span-4 flex items-center justify-end gap-1 md:col-span-1">
                          {!isEditing && c.folderLink && (
                            <a
                              href={c.folderLink}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                              title="Open folder"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {isEditing ? (
                            <>
                              <input
                                value={editFolder}
                                onChange={(e) => setEditFolder(e.target.value)}
                                placeholder="folder url…"
                                className="hidden w-32 rounded-md border border-border bg-background/40 px-2 py-1 text-[10px] outline-none lg:inline-block"
                              />
                              <button onClick={() => saveEdit(c.id)} disabled={saving} className="rounded-md p-1.5 text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-40" title="Save">
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={cancelEdit} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/30 hover:text-foreground" title="Cancel">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => beginEdit(c)} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/30 hover:text-foreground" title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => deleteCreative(c.id)} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-400" title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · ad spend lives at the funnel level in{' '}
        <Link href={`/finance/funnels/${funnel.id}`} className="text-primary hover:text-primary/80">Finance →</Link>
      </p>
    </PageTransition>
  );
}

// ── Inline Add Creative form (instead of modal) ─────────────────────────────

function InlineAddCreative({ funnel, today, onAdded, onCancel }: {
  funnel: Funnel;
  today: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [batchName, setBatchName] = useState('');
  const [creativeType, setCreativeType] = useState('Video');
  const [folderLink, setFolderLink] = useState('');
  const [launchDate, setLaunchDate] = useState(today);
  const [status, setStatus] = useState<CreativeStatus>('testing');
  const [result, setResult] = useState<CreativeResult>('inconclusive');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!batchName.trim()) { setErr('Batch name is required.'); return; }
    try {
      setSaving(true);
      setErr(null);
      const res = await fetch('/api/creatives-intl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnelId: funnel.id,
          productName: funnel.productName,
          country: funnel.country,
          language: funnel.language,
          batchName: batchName.trim(),
          creativeType,
          folderLink: folderLink.trim(),
          launchDate,
          status,
          result,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add creative.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.03]">
      <div className="flex items-center gap-2 border-b border-primary/15 px-5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Plus className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">Log a new creative</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
        <FormCell label="Batch name" required>
          <input value={batchName} onChange={(e) => setBatchName(e.target.value)} className="form-input" placeholder="e.g. Batch 03 — UGC remix" autoFocus />
        </FormCell>
        <FormCell label="Creative type">
          <select value={creativeType} onChange={(e) => setCreativeType(e.target.value)} className="form-input">
            {CREATIVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormCell>
        <FormCell label="Launch date">
          <DatePicker value={launchDate} onChange={(d) => setLaunchDate(d)} />
        </FormCell>
        <FormCell label="Folder link (optional)">
          <input value={folderLink} onChange={(e) => setFolderLink(e.target.value)} className="form-input" placeholder="https://drive.google.com/…" />
        </FormCell>
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
      <div className="px-5 pb-4">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)…"
          className="form-input"
        />
      </div>
      {err && <p className="px-5 pb-2 text-[11px] text-destructive">{err}</p>}
      <div className="flex items-center justify-end gap-2 border-t border-primary/15 px-5 py-3">
        <button onClick={onCancel} className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving || !batchName.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-1.5 text-[12px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Create
        </button>
      </div>
    </div>
  );
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({ icon, label, value, hint, accent, delay = 0 }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent: 'amber' | 'sky' | 'emerald' | 'rose' | 'violet';
  delay?: number;
}) {
  const text = { amber: 'text-amber-400', sky: 'text-sky-400', emerald: 'text-emerald-400', rose: 'text-rose-400', violet: 'text-violet-400' }[accent];
  const border = { amber: 'border-amber-500/30', sky: 'border-sky-500/30', emerald: 'border-emerald-500/30', rose: 'border-rose-500/30', violet: 'border-violet-500/30' }[accent];
  const glow = { amber: '#fbbf24', sky: '#38bdf8', emerald: '#34d399', rose: '#fb7185', violet: '#a78bfa' }[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: `0 14px 40px -16px ${glow}55, 0 0 0 1px ${glow}33` }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn('group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors', border)}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: `radial-gradient(circle, ${glow}66, transparent 70%)` }}
        aria-hidden
      />
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={cn(text, 'opacity-70')}>{icon}</span>
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        </div>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: glow }} aria-hidden />
      </div>
      <p className={cn('relative z-10 mt-2 text-[22px] font-semibold leading-none tabular-nums tracking-tight', text)}>{value}</p>
      {hint && <p className="relative z-10 mt-1.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </motion.div>
  );
}

function FilterPill({ label, count, active, onClick, tone = 'gray' }: {
  label: string; count: number; active: boolean; onClick: () => void;
  tone?: 'gray' | 'amber' | 'emerald' | 'rose';
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

function DateChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium transition',
        active ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function FormCell({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}{required && <span className="text-primary ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
