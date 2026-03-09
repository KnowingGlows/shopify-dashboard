'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Plus, Loader2, X, Megaphone, ArrowRight,
  Target,
} from 'lucide-react';
import { AdsTrackerEntry } from '@/types/shopify';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

interface ProductSummary {
  name: string;
  batches: AdsTrackerEntry[];
  totalSpend: number;
  avgRoas: number;
  winners: number;
  losers: number;
  testing: number;
  hitRate: number;
  lastUpdated: string;
}

function groupByProduct(entries: AdsTrackerEntry[]): ProductSummary[] {
  const groups: Record<string, AdsTrackerEntry[]> = {};
  for (const e of entries) {
    const key = e.productName || 'Unnamed';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }

  return Object.entries(groups).map(([name, batches]) => {
    const totalSpend = batches.reduce((s, b) => s + (b.dailyAdSpend ?? 0), 0);
    const roasBatches = batches.filter((b) => b.weeklyRoas > 0);
    const avgRoas = roasBatches.length > 0 ? roasBatches.reduce((s, b) => s + b.weeklyRoas, 0) / roasBatches.length : 0;
    const winners = batches.filter((b) => b.creativeBatchResult === 'Winner').length;
    const losers = batches.filter((b) => b.creativeBatchResult === 'Loser').length;
    const testing = batches.filter((b) => b.creativeBatchResult === 'Testing').length;
    const decided = winners + losers;
    const hitRate = decided > 0 ? Math.round((winners / decided) * 100) : 0;
    const lastUpdated = batches.reduce((latest, b) => b.updatedAt > latest ? b.updatedAt : latest, '');

    return { name, batches, totalSpend, avgRoas, winners, losers, testing, hitRate, lastUpdated };
  }).sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
}

export default function OpsAdsPage() {
  const [entries, setEntries] = useState<AdsTrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formProduct, setFormProduct] = useState('');

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/ads-tracker');
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

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
      if (data.entry) {
        setEntries((prev) => [data.entry, ...prev]);
        setFormProduct('');
        setShowForm(false);
      }
    } catch { /* silently fail */ }
    finally { setAdding(false); }
  };

  const products = groupByProduct(entries);

  // Global stats
  const totalProducts = products.length;
  const totalBatches = entries.length;
  const totalSpend = entries.reduce((s, e) => s + (e.dailyAdSpend ?? 0), 0);
  const allWinners = entries.filter((e) => e.creativeBatchResult === 'Winner').length;
  const allLosers = entries.filter((e) => e.creativeBatchResult === 'Loser').length;
  const globalHitRate = (allWinners + allLosers) > 0 ? Math.round((allWinners / (allWinners + allLosers)) * 100) : 0;

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">OPS Ads</h1>
          <p className="text-[11px] text-muted-foreground">Ad performance by product</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? 'Cancel' : 'New Product'}
        </button>
      </div>

      {/* Global Stats */}
      {totalProducts > 0 && (
        <StaggerContainer className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StaggerItem>
            <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Products</p>
              <p className="text-xl font-semibold text-foreground">{totalProducts}</p>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Batches</p>
              <p className="text-xl font-semibold text-foreground">{totalBatches}</p>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Spend</p>
              <p className="text-xl font-semibold text-amber-400">{formatINR(totalSpend)}</p>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Hit Rate</p>
              <p className={`text-xl font-semibold ${globalHitRate >= 30 ? 'text-emerald-400' : globalHitRate > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                {globalHitRate > 0 ? `${globalHitRate}%` : '—'}
              </p>
            </div>
          </StaggerItem>
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
                <h2 className="text-sm font-semibold text-foreground">New Product</h2>
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create
                </button>
              </div>
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
          <p className="text-[11px] text-muted-foreground/60 mt-1">Add a product to start tracking ad batches</p>
        </motion.div>
      ) : (
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map((product) => (
            <StaggerItem key={product.name}>
              <Link href={`/ads-tracker/${encodeURIComponent(product.name)}`}>
                <motion.div
                  whileHover={{ y: -2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="card-hover-glow group rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[14px] font-semibold text-foreground truncate pr-2">{product.name}</h3>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition shrink-0" />
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Batches</p>
                      <p className="text-[15px] font-semibold text-foreground">{product.batches.length}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Spend</p>
                      <p className="text-[15px] font-semibold text-amber-400 tabular-nums">{formatINR(product.totalSpend)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Avg ROAS</p>
                      <p className={`text-[15px] font-semibold tabular-nums ${product.avgRoas >= 2 ? 'text-emerald-400' : product.avgRoas >= 1 ? 'text-amber-400' : product.avgRoas > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {product.avgRoas > 0 ? `${product.avgRoas.toFixed(1)}x` : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Hit rate bar + badges */}
                  <div className="flex items-center gap-2">
                    {(product.winners > 0 || product.losers > 0) && (
                      <div className="flex items-center gap-1.5">
                        <Target className="h-3 w-3 text-primary" />
                        <span className={`text-[11px] font-semibold ${product.hitRate >= 30 ? 'text-emerald-400' : 'text-amber-400'}`}>{product.hitRate}%</span>
                      </div>
                    )}
                    {product.winners > 0 && (
                      <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{product.winners}W</span>
                    )}
                    {product.losers > 0 && (
                      <span className="text-[10px] font-medium text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">{product.losers}L</span>
                    )}
                    {product.testing > 0 && (
                      <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">{product.testing}T</span>
                    )}
                  </div>
                </motion.div>
              </Link>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}
    </PageTransition>
  );
}
