'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Globe, Loader2, AlertTriangle, Package, Layers, Trophy,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { cn } from '@/lib/utils';
import type { ProductTrackerEntry } from '@/types/shopify';
import type { Funnel, Creative, CreativeResult, CreativeStatus } from '@/types/funnel';

const RESULT_TONE: Record<CreativeResult, { text: string; bg: string; border: string }> = {
  winner:       { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  loser:        { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
  inconclusive: { text: 'text-muted-foreground', bg: 'bg-border/40', border: 'border-border' },
};

const STATUS_TONE: Record<CreativeStatus, { text: string; bg: string; border: string; dot: string }> = {
  testing: { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  live:    { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  killed:  { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    dot: 'bg-rose-400' },
};

export default function ProductCreativesDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user } = useAuth();

  const [product, setProduct] = useState<ProductTrackerEntry | null>(null);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<CreativeResult | 'all'>('all');

  const loadAll = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [productsRes, funnelsRes, creativesRes] = await Promise.all([
        fetch('/api/product-tracker').then((r) => r.json()),
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/creatives-intl').then((r) => r.json()),
      ]);
      const p: ProductTrackerEntry | undefined = (productsRes.entries ?? []).find((x: ProductTrackerEntry) => x.id === id);
      if (!p) { setError('Product not found.'); return; }
      setProduct(p);
      const allFunnels: Funnel[] = funnelsRes.funnels ?? [];
      const myFunnels = allFunnels.filter((f) => (f.productId ? f.productId === p.id : f.productName === p.productName));
      setFunnels(myFunnels);
      const myFunnelIds = new Set(myFunnels.map((f) => f.id));
      const myCreatives: Creative[] = (creativesRes.creatives ?? []).filter((c: Creative) => myFunnelIds.has(c.funnelId));
      setCreatives(myCreatives);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) loadAll(); }, [id, loadAll]);

  const funnelById = useMemo(() => {
    const m = new Map<string, Funnel>();
    funnels.forEach((f) => m.set(f.id, f));
    return m;
  }, [funnels]);

  const filtered = useMemo(() => {
    if (resultFilter === 'all') return creatives;
    return creatives.filter((c) => c.result === resultFilter);
  }, [creatives, resultFilter]);

  // Group by batch
  const byBatch = useMemo(() => {
    const map = new Map<string, Creative[]>();
    for (const c of filtered) {
      const key = c.batchName || '(unbatched)';
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([batch, items]) => ({ batch, items: items.sort((a, b) => (b.launchDate || '').localeCompare(a.launchDate || '')) }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [filtered]);

  const totals = useMemo(() => {
    const total = creatives.length;
    const winners = creatives.filter((c) => c.result === 'winner').length;
    const killed = creatives.filter((c) => c.status === 'killed').length;
    const decided = winners + killed;
    return {
      total,
      winners,
      killed,
      decided,
      hitRate: decided > 0 ? (winners / decided) * 100 : 0,
      batches: byBatch.length,
    };
  }, [creatives, byBatch]);

  if (loading) {
    return (
      <PageTransition className="mx-auto max-w-7xl p-5">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </PageTransition>
    );
  }

  if (error || !product) {
    return (
      <PageTransition className="mx-auto max-w-7xl p-5">
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> <span>{error ?? 'Product not found.'}</span>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Back + header */}
      <Link
        href={`/product-tracker/${id}`}
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to {product.productName || 'product'}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Creatives — {product.productName || 'Unnamed product'}</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {totals.total} creative{totals.total === 1 ? '' : 's'} across {totals.batches} batch{totals.batches === 1 ? '' : 'es'}
            </p>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total" value={totals.total} tone="violet" />
        <Kpi label="Winners" value={totals.winners} tone="emerald" />
        <Kpi label="Killed" value={totals.killed} tone="rose" />
        <Kpi
          label="Hit rate"
          value={totals.decided > 0 ? `${totals.hitRate.toFixed(0)}%` : '—'}
          tone={totals.hitRate >= 50 ? 'emerald' : 'amber'}
          hint={totals.decided > 0 ? `${totals.winners} of ${totals.decided} decided` : 'no decisions yet'}
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="mr-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Show</p>
        {[
          { key: 'all' as const, label: 'All' },
          { key: 'winner' as const, label: 'Winners' },
          { key: 'loser' as const, label: 'Losers' },
          { key: 'inconclusive' as const, label: 'Inconclusive' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setResultFilter(f.key)}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium transition',
              resultFilter === f.key ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Batches */}
      {totals.total === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Layers className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-[13px] font-medium text-foreground">No creatives logged yet.</p>
          <Link href="/ads-international" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/25">
            Add one <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ) : byBatch.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-[12px] text-muted-foreground">No creatives match the current filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {byBatch.map(({ batch, items }, idx) => {
            const bWinners = items.filter((c) => c.result === 'winner').length;
            const bKilled = items.filter((c) => c.status === 'killed').length;
            const bDecided = bWinners + bKilled;
            const bHit = bDecided > 0 ? (bWinners / bDecided) * 100 : 0;
            return (
              <motion.div
                key={batch}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.3) }}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    <h3 className="text-[13px] font-semibold text-foreground">{batch}</h3>
                    <span className="text-[10px] text-muted-foreground">{items.length} creative{items.length === 1 ? '' : 's'}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Trophy className="h-3 w-3" /> <span className="tabular-nums font-semibold text-foreground">{bWinners}W</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="tabular-nums text-rose-400">{bKilled}K</span>
                    {bDecided > 0 && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="tabular-nums">{bHit.toFixed(0)}% hit</span>
                      </>
                    )}
                  </span>
                </div>

                <table className="tracker-table">
                  <thead>
                    <tr>
                      <th style={{ width: 200 }}>LP</th>
                      <th style={{ width: 90 }}>Type</th>
                      <th style={{ width: 110 }}>Status</th>
                      <th style={{ width: 130 }}>Result</th>
                      <th style={{ width: 120 }}>Launch</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => {
                      const rTone = RESULT_TONE[c.result];
                      const sTone = STATUS_TONE[c.status];
                      const f = funnelById.get(c.funnelId);
                      return (
                        <tr key={c.id}>
                          <td>
                            <div className="px-3 py-2 text-[11px]">
                              <span className="font-medium text-foreground">
                                {f?.funnelishUrl ? f.funnelishUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : (c.batchName || 'LP')}
                              </span>
                              {f && (
                                <Link href={`/funnels/${f.id}`} className="ml-2 text-[10px] text-primary hover:text-primary/80">LP →</Link>
                              )}
                            </div>
                          </td>
                          <td><div className="px-3 py-2 text-[11px] text-muted-foreground">{c.creativeType || '—'}</div></td>
                          <td>
                            <div className="px-3 py-2">
                              <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize', sTone.bg, sTone.border, sTone.text)}>
                                <span className={cn('h-1 w-1 rounded-full', sTone.dot)} />
                                {c.status}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="px-3 py-2">
                              <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium capitalize', rTone.bg, rTone.border, rTone.text)}>
                                {c.result}
                              </span>
                            </div>
                          </td>
                          <td><div className="px-3 py-2 text-[11px] tabular-nums text-muted-foreground">{c.launchDate || '—'}</div></td>
                          <td><div className="px-3 py-2 text-[11px] text-muted-foreground/80 truncate max-w-[260px]">{c.notes || '—'}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </motion.div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'}
      </p>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/60">
        <Link href="/ads-international" className="inline-flex items-center gap-1 text-primary hover:text-primary/80">
          <Globe className="h-3 w-3" /> All ads
        </Link>
        <Link href={`/product-tracker/${id}`} className="inline-flex items-center gap-1 text-primary hover:text-primary/80">
          <Package className="h-3 w-3" /> Product dossier
        </Link>
      </div>
    </PageTransition>
  );
}

function Kpi({ label, value, tone, hint }: {
  label: string;
  value: string | number;
  tone: 'violet' | 'emerald' | 'rose' | 'amber' | 'sky';
  hint?: string;
}) {
  const c = {
    violet:  { text: 'text-violet-400',  border: 'border-violet-500/30',  glow: '#a78bfa' },
    emerald: { text: 'text-emerald-400', border: 'border-emerald-500/30', glow: '#34d399' },
    rose:    { text: 'text-rose-400',    border: 'border-rose-500/30',    glow: '#fb7185' },
    amber:   { text: 'text-amber-400',   border: 'border-amber-500/30',   glow: '#fbbf24' },
    sky:     { text: 'text-sky-400',     border: 'border-sky-500/30',     glow: '#38bdf8' },
  }[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: `0 14px 40px -16px ${c.glow}55, 0 0 0 1px ${c.glow}33` }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn('group relative overflow-hidden rounded-xl border bg-card p-4', c.border)}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: `radial-gradient(circle, ${c.glow}66, transparent 70%)` }}
        aria-hidden
      />
      <p className="relative z-10 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn('relative z-10 mt-2 text-[22px] font-semibold leading-none tabular-nums tracking-tight', c.text)}>
        {value}
      </p>
      {hint && <p className="relative z-10 mt-1.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </motion.div>
  );
}
