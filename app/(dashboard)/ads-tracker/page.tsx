'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Plus, Loader2, X, Megaphone, ArrowRight, Target, Clock, Flame,
} from 'lucide-react';
import { AdsTrackerEntry } from '@/types/shopify';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';
import { formatINR } from '@/lib/currency-converter';

interface ProductSummary {
  name: string;
  batches: AdsTrackerEntry[];
  totalSpend: number;
  avgRoas: number;
  winners: number;
  losers: number;
  testing: number;
  scaled: number;
  hitRate: number;
  lastUpdated: string;
  latestBatch: AdsTrackerEntry | null;
  daysSinceLastBatch: number;
  nextBatchDue: boolean;
}

function groupByProduct(entries: AdsTrackerEntry[], registeredProducts: string[]): ProductSummary[] {
  const groups: Record<string, AdsTrackerEntry[]> = {};

  for (const name of registeredProducts) {
    groups[name] = [];
  }

  for (const e of entries) {
    const key = e.productName || 'Unnamed';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }

  const now = Date.now();

  return Object.entries(groups).map(([name, batches]) => {
    const totalSpend = batches.reduce((s, b) => s + (b.dailyAdSpend ?? 0), 0);
    const roasBatches = batches.filter((b) => b.weeklyRoas > 0);
    const avgRoas = roasBatches.length > 0 ? roasBatches.reduce((s, b) => s + b.weeklyRoas, 0) / roasBatches.length : 0;
    const winners = batches.filter((b) => b.creativeBatchResult === 'Winner').length;
    const losers = batches.filter((b) => b.creativeBatchResult === 'Loser').length;
    const testing = batches.filter((b) => b.creativeBatchResult === 'Testing').length;
    const scaled = batches.filter((b) => b.creativeBatchResult === 'Scaled').length;
    const decided = winners + losers;
    const hitRate = decided > 0 ? Math.round((winners / decided) * 100) : 0;
    const lastUpdated = batches.reduce((latest, b) => b.updatedAt > latest ? b.updatedAt : latest, '');

    // Find latest launched batch (Testing or beyond) and compute timeline
    const launchedStatuses = ['Testing', 'Winner', 'Loser', 'Scaled'];
    const launchedBatches = batches.filter((b) => launchedStatuses.includes(b.creativeBatchResult));
    // Sort by updatedAt — when the batch was marked as Testing (launched)
    const sorted = [...launchedBatches].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const latestBatch = sorted[0] || null;
    // daysSince = from when the batch was last updated (marked as Testing), not created
    const daysSinceLastBatch = latestBatch ? Math.floor((now - new Date(latestBatch.updatedAt).getTime()) / 86400000) : -1;
    const nextBatchDue = daysSinceLastBatch >= 7;

    return { name, batches, totalSpend, avgRoas, winners, losers, testing, scaled, hitRate, lastUpdated, latestBatch, daysSinceLastBatch, nextBatchDue };
  }).sort((a, b) => {
    // Products needing attention first (next batch due), then by last updated
    if (a.nextBatchDue && !b.nextBatchDue) return -1;
    if (!a.nextBatchDue && b.nextBatchDue) return 1;
    return b.lastUpdated.localeCompare(a.lastUpdated);
  });
}

export default function OpsAdsPage() {
  const [entries, setEntries] = useState<AdsTrackerEntry[]>([]);
  const [registeredProducts, setRegisteredProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formProduct, setFormProduct] = useState('');

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/ads-tracker');
      const data = await res.json();
      setEntries(data.entries ?? []);
      setRegisteredProducts(data.products ?? []);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, []);

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

  const addProduct = async () => {
    if (!formProduct.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/ads-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: formProduct.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setRegisteredProducts((prev) => [...new Set([...prev, formProduct.trim()])]);
        setFormProduct('');
        setShowForm(false);
      }
    } catch { /* silently fail */ }
    finally { setAdding(false); }
  };

  const products = useMemo(() => groupByProduct(entries, registeredProducts), [entries, registeredProducts]);

  // Global stats
  const { totalProducts, totalBatches, totalSpend, globalHitRate, activeTesting, needsAttention } = useMemo(() => {
    const allWinners = entries.filter((e) => e.creativeBatchResult === 'Winner').length;
    const allLosers = entries.filter((e) => e.creativeBatchResult === 'Loser').length;
    return {
      totalProducts: products.length,
      totalBatches: entries.length,
      totalSpend: entries.reduce((s, e) => s + (e.dailyAdSpend ?? 0), 0),
      globalHitRate: (allWinners + allLosers) > 0 ? Math.round((allWinners / (allWinners + allLosers)) * 100) : 0,
      activeTesting: entries.filter((e) => e.creativeBatchResult === 'Testing').length,
      needsAttention: products.filter((p) => p.nextBatchDue).length,
    };
  }, [entries, products]);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">OPS Ads</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Creative batch performance by product</p>
        </div>
        <div className="flex items-center gap-2">
          {needsAttention > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1.5"
            >
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[11px] font-medium text-amber-400">{needsAttention} need{needsAttention === 1 ? 's' : ''} new batch</span>
            </motion.div>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] shadow-lg shadow-primary/20"
          >
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? 'Cancel' : 'New Product'}
          </button>
        </div>
      </div>

      {/* Global Stats */}
      {totalProducts > 0 && (
        <StaggerContainer className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Products', value: totalProducts, color: 'text-foreground' },
            { label: 'Batches', value: totalBatches, color: 'text-foreground' },
            { label: 'Total Spend', value: formatINR(totalSpend), color: 'text-amber-400' },
            { label: 'Hit Rate', value: globalHitRate > 0 ? `${globalHitRate}%` : '—', color: globalHitRate >= 30 ? 'text-emerald-400' : globalHitRate > 0 ? 'text-amber-400' : 'text-muted-foreground' },
            { label: 'Testing', value: activeTesting, color: 'text-amber-400' },
            { label: 'Needs Batch', value: needsAttention, color: needsAttention > 0 ? 'text-red-400' : 'text-muted-foreground' },
          ].map((stat, i) => (
            <StaggerItem key={i}>
              <div className="rounded-xl border border-border bg-card/80 backdrop-blur px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1">{stat.label}</p>
                <p className={`text-lg font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}

      {/* Add Product Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl border border-primary/20 bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Megaphone className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">New Product</h2>
                  <p className="text-[10px] text-muted-foreground">Add a product to track ad batches</p>
                </div>
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={formProduct}
                  onChange={(e) => setFormProduct(e.target.value)}
                  placeholder="Product name..."
                  className="form-input flex-1"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') addProduct(); }}
                />
                <button
                  onClick={addProduct}
                  disabled={adding || !formProduct.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 active:scale-[0.97]"
                >
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-2">Tip: ⌘N to open this form anytime</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Products Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : products.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No products yet</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Press ⌘N to add your first product</p>
        </motion.div>
      ) : (
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => {
            const daysProgress = product.daysSinceLastBatch >= 0 ? Math.min(product.daysSinceLastBatch / 7, 1) : 0;
            const isUrgent = product.nextBatchDue && product.batches.length > 0;

            return (
              <StaggerItem key={product.name}>
                <Link href={`/ads-tracker/${encodeURIComponent(product.name)}`}>
                  <motion.div
                    whileHover={{ y: -3, scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className={`group rounded-xl border bg-card p-5 transition-all cursor-pointer flex flex-col h-full min-h-[200px] ${
                      isUrgent ? 'border-amber-500/30 shadow-lg shadow-amber-500/5' : 'border-border hover:border-primary/30'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${
                          isUrgent ? 'bg-amber-500/15 text-amber-400' : 'bg-primary/10 text-primary'
                        }`}>
                          <Megaphone className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-foreground truncate">{product.name}</h3>
                          <p className="text-[10px] text-muted-foreground/60">{product.batches.length} batch{product.batches.length !== 1 ? 'es' : ''}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div>
                        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">Launch</p>
                        <p className="text-sm font-semibold text-foreground tabular-nums mt-0.5">
                          {product.latestBatch
                            ? new Date(product.latestBatch.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">Next Batch</p>
                        <p className={`text-sm font-semibold tabular-nums mt-0.5 ${product.nextBatchDue ? 'text-amber-400' : 'text-muted-foreground/70'}`}>
                          {product.latestBatch ? (() => {
                            const d = new Date(product.latestBatch.updatedAt);
                            d.setDate(d.getDate() + 7);
                            return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                          })() : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">Hit Rate</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {(product.winners > 0 || product.losers > 0) && <Target className="h-3 w-3 text-primary/60" />}
                          <p className={`text-sm font-semibold ${product.hitRate >= 30 ? 'text-emerald-400' : product.hitRate > 0 ? 'text-amber-400' : 'text-muted-foreground/40'}`}>
                            {(product.winners > 0 || product.losers > 0) ? `${product.hitRate}%` : '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Result Badges */}
                    <div className="flex items-center gap-1.5 mb-3 flex-1">
                      {product.winners > 0 && <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">{product.winners}W</span>}
                      {product.losers > 0 && <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-md">{product.losers}L</span>}
                      {product.testing > 0 && <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">{product.testing}T</span>}
                      {product.scaled > 0 && <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md">{product.scaled}S</span>}
                    </div>

                    {/* 7-Day Batch Timeline */}
                    {product.batches.length > 0 && product.daysSinceLastBatch >= 0 && (
                      <div className="mt-auto pt-3 border-t border-border/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-muted-foreground/50" />
                            <span className="text-[10px] text-muted-foreground/70">
                              {product.daysSinceLastBatch === 0 ? 'Launched today' :
                               product.daysSinceLastBatch === 1 ? '1 day ago' :
                               `${product.daysSinceLastBatch} days ago`}
                            </span>
                          </div>
                          {isUrgent && (
                            <span className="text-[10px] font-semibold text-amber-400 flex items-center gap-1">
                              <Flame className="h-3 w-3" />
                              New batch due
                            </span>
                          )}
                          {!isUrgent && product.daysSinceLastBatch > 0 && (
                            <span className="text-[10px] text-muted-foreground/50">
                              {7 - product.daysSinceLastBatch}d left
                            </span>
                          )}
                        </div>
                        {/* Progress bar */}
                        <div className="h-1 rounded-full bg-border/50 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${daysProgress * 100}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className={`h-full rounded-full ${
                              isUrgent ? 'bg-amber-400' : daysProgress > 0.7 ? 'bg-amber-400/70' : 'bg-primary/50'
                            }`}
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>
                </Link>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}

      {/* Footer hint */}
      {!loading && products.length > 0 && (
        <p className="text-center text-[10px] text-muted-foreground/40">
          {products.length} product{products.length !== 1 ? 's' : ''} · Press ⌘N to add new
        </p>
      )}
    </PageTransition>
  );
}
