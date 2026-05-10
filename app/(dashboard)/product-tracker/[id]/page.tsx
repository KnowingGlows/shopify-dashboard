'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Package, ArrowLeft, ExternalLink, Loader2, AlertTriangle,
  Globe, Funnel as FunnelIcon, Wallet,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { cn } from '@/lib/utils';
import { isWinning } from '@/lib/funnels';
import { formatFromUSD, type SupportedCurrency, type UsdRates } from '@/lib/currency-converter';
import type { ProductTrackerEntry } from '@/types/shopify';
import type { Funnel, FunnelDailyLog, Creative, FunnelStatus, CreativeResult } from '@/types/funnel';
import type { FxRates } from '@/lib/fx-rates';

const STATUS_LABEL: Record<FunnelStatus, string> = {
  draft: 'Draft', testing: 'Testing', live: 'Live', paused: 'Paused', killed: 'Killed',
};

const STATUS_TONE: Record<FunnelStatus, { text: string; bg: string; border: string; dot: string }> = {
  live:    { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  testing: { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  paused:  { text: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     dot: 'bg-sky-400' },
  draft:   { text: 'text-muted-foreground', bg: 'bg-border/40', border: 'border-border', dot: 'bg-muted-foreground' },
  killed:  { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    dot: 'bg-rose-400' },
};

const RESULT_TONE: Record<CreativeResult, { text: string; bg: string; border: string }> = {
  winner:       { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  loser:        { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
  inconclusive: { text: 'text-muted-foreground', bg: 'bg-border/40', border: 'border-border' },
};

function useCountUp(value: number, duration = 600) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    const to = Number.isFinite(value) ? value : 0;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user } = useAuth();

  const [product, setProduct] = useState<ProductTrackerEntry | null>(null);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [logsByFunnel, setLogsByFunnel] = useState<Record<string, FunnelDailyLog[]>>({});
  const [fx, setFx] = useState<FxRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);

      const [productsRes, funnelsRes, creativesRes, fxRes] = await Promise.all([
        fetch('/api/product-tracker').then((r) => r.json()),
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/creatives-intl').then((r) => r.json()),
        fetch('/api/fx').then((r) => r.json()),
      ]);

      const p: ProductTrackerEntry | undefined = (productsRes.entries ?? []).find((e: ProductTrackerEntry) => e.id === id);
      if (!p) {
        setError('Product not found.');
        setProduct(null);
        return;
      }
      setProduct(p);
      setFx(fxRes ?? null);

      const allFunnels: Funnel[] = funnelsRes.funnels ?? [];
      const myFunnels = allFunnels.filter((f) => f.productName === p.productName);
      setFunnels(myFunnels);

      const allCreatives: Creative[] = creativesRes.creatives ?? [];
      const myFunnelIds = new Set(myFunnels.map((f) => f.id));
      setCreatives(allCreatives.filter((c) => myFunnelIds.has(c.funnelId)));

      const logsRes = await Promise.all(
        myFunnels.map((f) => fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(f.id)}`).then((r) => r.json()))
      );
      const map: Record<string, FunnelDailyLog[]> = {};
      myFunnels.forEach((f, i) => { map[f.id] = logsRes[i]?.logs ?? []; });
      setLogsByFunnel(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load product.');
    } finally {
      setLoading(false);
    }
  };

  const rates: UsdRates = fx?.rates ?? { USD: 1, EUR: 0.92, INR: 83.5 };
  const fmt = (usd: number) => formatFromUSD(usd, currency, rates);

  // Aggregates per funnel
  const funnelAggs = useMemo(() => {
    return funnels.map((f) => {
      const logs = logsByFunnel[f.id] ?? [];
      let spend = 0, revenue = 0, profit = 0;
      let lastLogDate = '';
      let latestRoas = 0;
      const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
      latestRoas = Number(sorted[0]?.roas) || 0;
      for (const l of logs) {
        spend += Number(l.spend) || 0;
        revenue += Number(l.revenue) || 0;
        profit += Number(l.profit) || 0;
        if (l.date > lastLogDate) lastLogDate = l.date;
      }
      const blendedRoas = spend > 0 ? revenue / spend : 0;
      return { funnel: f, spend, revenue, profit, blendedRoas, latestRoas, lastLogDate, daysLogged: logs.length };
    });
  }, [funnels, logsByFunnel]);

  // Blended product totals
  const totals = useMemo(() => {
    let spend = 0, revenue = 0, profit = 0;
    funnelAggs.forEach((a) => { spend += a.spend; revenue += a.revenue; profit += a.profit; });
    return {
      spend, revenue, profit,
      blendedRoas: spend > 0 ? revenue / spend : 0,
      profitMargin: revenue > 0 ? (profit / revenue) * 100 : 0,
    };
  }, [funnelAggs]);

  // Hit rates
  const hitRates = useMemo(() => {
    // Funnel hit rate: among funnels with data, % winning
    const withData = funnelAggs.filter((a) => a.spend > 0 || a.latestRoas > 0);
    const winners = withData.filter((a) => isWinning(Math.max(a.blendedRoas, a.latestRoas), a.funnel.beroas)).length;
    const funnelHitRate = withData.length > 0 ? (winners / withData.length) * 100 : 0;

    // Creative hit rate: % flagged as winners (out of decided)
    const decided = creatives.filter((c) => c.result !== 'inconclusive').length;
    const creativeWinners = creatives.filter((c) => c.result === 'winner').length;
    const creativeHitRate = decided > 0 ? (creativeWinners / decided) * 100 : 0;

    return { funnelHitRate, creativeHitRate, decidedCreatives: decided, creativeWinners };
  }, [funnelAggs, creatives]);

  const animatedSpend = useCountUp(totals.spend);
  const animatedProfit = useCountUp(totals.profit);
  const animatedRoas = useCountUp(totals.blendedRoas, 500);
  const animatedFunnelHit = useCountUp(hitRates.funnelHitRate, 500);

  const liveCount = funnels.filter((f) => f.status === 'live').length;
  const totalCost = (product?.cogs ?? 0) + (product?.shipping ?? 0);

  if (loading) {
    return (
      <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </PageTransition>
    );
  }

  if (error || !product) {
    return (
      <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
        <Link href="/product-tracker" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to products
        </Link>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
          <p className="mt-2 text-[13px] text-foreground">{error ?? 'Product not found.'}</p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
      {/* Back */}
      <Link href="/product-tracker" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to products
      </Link>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-xl border border-border bg-card p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{product.productName || 'Unnamed product'}</h1>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {product.productStage || 'No stage'}
                {product.productFileLink && (
                  <>
                    {' · '}
                    <a href={product.productFileLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:text-primary/80">
                      <ExternalLink className="h-3 w-3" /> File
                    </a>
                  </>
                )}
              </p>
              {product.remarks && <p className="mt-1.5 text-[12px] text-muted-foreground/80">{product.remarks}</p>}
            </div>
          </div>

          <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
            {(['USD', 'EUR', 'INR'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={cn(
                  'rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors',
                  currency === c ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Cost + economics */}
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Cell label="COGS / unit"     value={product.cogs > 0 ? fmt(product.cogs) : '—'} />
          <Cell label="Shipping / unit" value={product.shipping > 0 ? fmt(product.shipping) : '—'} />
          <Cell label="Total cost / unit" value={totalCost > 0 ? fmt(totalCost) : '—'} accent={totalCost > 0 ? 'amber' : undefined} />
          <Cell label="Funnels"         value={`${liveCount} live · ${funnels.length} total`} />
        </div>
      </motion.div>

      {/* Performance KPIs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06 }}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4"
      >
        <StatCell label="Total spend"   value={fmt(animatedSpend)} accent="amber" />
        <StatCell label="Total profit"  value={fmt(animatedProfit)} accent={totals.profit < 0 ? 'rose' : 'emerald'} hint={totals.revenue > 0 ? `${totals.profitMargin.toFixed(1)}% margin` : undefined} />
        <StatCell label="Blended ROAS"  value={animatedRoas > 0 ? `${animatedRoas.toFixed(2)}x` : '—'} accent="sky" />
        <StatCell label="Funnel hit"    value={`${animatedFunnelHit.toFixed(0)}%`} hint={`${hitRates.creativeWinners} winning creatives`} accent="violet" />
      </motion.div>

      {/* Funnels for this product */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12 }}
        className="rounded-xl border border-border bg-card overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-medium text-foreground">Funnels across markets</h2>
          </div>
          <span className="text-[11px] text-muted-foreground">{funnels.length}</span>
        </div>

        {funnels.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[12px] text-muted-foreground">No funnels for this product yet.</p>
            <Link href="/funnels" className="mt-2 inline-block text-[11px] text-primary hover:text-primary/80">
              Create one →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tracker-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ textAlign: 'right', width: 80 }}>BEROAS</th>
                  <th style={{ textAlign: 'right', width: 80 }}>ROAS</th>
                  <th style={{ width: 90 }}>Win</th>
                  <th style={{ textAlign: 'right' }}>Spend</th>
                  <th style={{ textAlign: 'right' }}>Profit</th>
                  <th style={{ width: 110 }}>Last log</th>
                </tr>
              </thead>
              <tbody>
                {funnelAggs.map(({ funnel: f, spend, profit, blendedRoas, latestRoas, lastLogDate }) => {
                  const tone = STATUS_TONE[f.status];
                  const roasShown = latestRoas > 0 ? latestRoas : blendedRoas;
                  const winning = isWinning(roasShown, f.beroas);
                  const hasData = roasShown > 0 || spend > 0;
                  return (
                    <tr key={f.id}>
                      <td>
                        <div className="px-3 py-2">
                          <p className="text-[13px] text-foreground">{f.country}</p>
                          <p className="text-[10px] text-muted-foreground">{f.language}</p>
                        </div>
                      </td>
                      <td>
                        <div className="px-3 py-2">
                          <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', tone.bg, tone.border, tone.text)}>
                            <span className={cn('h-1 w-1 rounded-full', tone.dot)} />
                            {STATUS_LABEL[f.status]}
                          </span>
                        </div>
                      </td>
                      <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-muted-foreground">{f.beroas > 0 ? `${f.beroas.toFixed(2)}x` : '—'}</div></td>
                      <td>
                        <div className={cn('px-3 py-2 text-right text-[11px] tabular-nums font-semibold', !hasData ? 'text-muted-foreground/50' : winning ? 'text-emerald-400' : 'text-foreground')}>
                          {roasShown > 0 ? `${roasShown.toFixed(2)}x` : '—'}
                        </div>
                      </td>
                      <td>
                        <div className="px-3 py-2">
                          {!hasData ? (
                            <span className="text-[10px] text-muted-foreground/60">no data</span>
                          ) : winning ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Win
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Below
                            </span>
                          )}
                        </div>
                      </td>
                      <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-foreground">{spend > 0 ? fmt(spend) : '—'}</div></td>
                      <td><div className={cn('px-3 py-2 text-right text-[11px] tabular-nums', profit < 0 ? 'text-rose-400' : profit > 0 ? 'text-emerald-400' : 'text-muted-foreground')}>{spend > 0 ? fmt(profit) : '—'}</div></td>
                      <td><div className="px-3 py-2 text-[11px] text-muted-foreground tabular-nums">{lastLogDate || '—'}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Creatives for this product */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18 }}
        className="rounded-xl border border-border bg-card overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-medium text-foreground">Creatives</h2>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {creatives.length} · {hitRates.decidedCreatives > 0 ? `${hitRates.creativeHitRate.toFixed(0)}% winners` : 'none decided'}
          </span>
        </div>

        {creatives.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[12px] text-muted-foreground">No creatives logged for this product yet.</p>
            <Link href="/ads-international" className="mt-2 inline-block text-[11px] text-primary hover:text-primary/80">
              Add one →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tracker-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th style={{ width: 140 }}>Market</th>
                  <th style={{ width: 90 }}>Type</th>
                  <th style={{ width: 110 }}>Status</th>
                  <th style={{ width: 130 }}>Result</th>
                  <th style={{ width: 110 }}>Launch</th>
                </tr>
              </thead>
              <tbody>
                {creatives.map((c) => {
                  const rTone = RESULT_TONE[c.result];
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="px-3 py-2">
                          <p className="text-[13px] font-medium text-foreground">{c.batchName}</p>
                          {c.notes && <p className="mt-0.5 text-[10px] text-muted-foreground/70 truncate max-w-[280px]">{c.notes}</p>}
                        </div>
                      </td>
                      <td><div className="px-3 py-2 text-[11px] text-muted-foreground">{c.country} · {c.language}</div></td>
                      <td><div className="px-3 py-2 text-[11px] text-muted-foreground">{c.creativeType || '—'}</div></td>
                      <td><div className="px-3 py-2 text-[11px] capitalize text-foreground">{c.status}</div></td>
                      <td>
                        <div className="px-3 py-2">
                          <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium capitalize', rTone.bg, rTone.border, rTone.text)}>
                            {c.result}
                          </span>
                        </div>
                      </td>
                      <td><div className="px-3 py-2 text-[11px] tabular-nums text-muted-foreground">{c.launchDate || '—'}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/60">
        <span>Logged in as {user?.email ?? '—'}</span>
        <span>·</span>
        <Link href="/funnels" className="inline-flex items-center gap-1 text-primary hover:text-primary/80">
          <FunnelIcon className="h-3 w-3" /> Funnels
        </Link>
        <Link href="/finance/funnels" className="inline-flex items-center gap-1 text-primary hover:text-primary/80">
          <Wallet className="h-3 w-3" /> Finance
        </Link>
        <Link href="/ads-international" className="inline-flex items-center gap-1 text-primary hover:text-primary/80">
          <Globe className="h-3 w-3" /> International Ads
        </Link>
      </div>
    </PageTransition>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function Cell({ label, value, accent }: { label: string; value: string; accent?: 'amber' | 'emerald' | 'rose' }) {
  const map = { amber: 'text-amber-400', emerald: 'text-emerald-400', rose: 'text-rose-400' };
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-[14px] font-semibold tabular-nums', accent ? map[accent] : 'text-foreground')}>{value}</p>
    </div>
  );
}

function StatCell({ label, value, hint, accent }: {
  label: string; value: string; hint?: string;
  accent: 'emerald' | 'amber' | 'sky' | 'violet' | 'rose';
}) {
  const map = {
    emerald: 'text-emerald-400',
    amber:   'text-amber-400',
    sky:     'text-sky-400',
    violet:  'text-violet-400',
    rose:    'text-rose-400',
  };
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-[20px] font-semibold leading-none tabular-nums tracking-tight', map[accent])}>{value}</p>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
