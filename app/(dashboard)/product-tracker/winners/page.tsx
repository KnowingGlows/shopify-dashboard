'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Trophy, ArrowRight, Link2, AlertTriangle,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import { effectiveBeroas, isWinning, lpLabel } from '@/lib/funnels';
import { formatMoney, type SupportedCurrency, type UsdRates } from '@/lib/currency-converter';
import type { ProductTrackerEntry } from '@/types/shopify';
import type { Funnel, FunnelDailyLog, Creative } from '@/types/funnel';
import type { FxRates } from '@/lib/fx-rates';

function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  useEffect(() => { displayRef.current = display; });
  useEffect(() => {
    const from = displayRef.current;
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

interface PerFunnelMetrics {
  funnel: Funnel;
  spend: number;
  revenue: number;
  profit: number;
  blendedRoas: number;
  winning: boolean;
  hasData: boolean;
}

interface ProductSummary {
  product: ProductTrackerEntry;
  funnels: Funnel[];
  perFunnel: PerFunnelMetrics[];
  liveCount: number;
  totalSpend: number;
  totalRevenue: number;
  totalProfit: number;
  blendedRoas: number;
  bestFunnel?: PerFunnelMetrics;
  worstFunnel?: PerFunnelMetrics;
  markets: string[];
  funnelsWithData: number;
  winningFunnels: number;
  hitRate: number;
  lastActivity: string;
}

export default function WinnersPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductTrackerEntry[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [logsByFunnel, setLogsByFunnel] = useState<Record<string, FunnelDailyLog[]>>({});
  const [fx, setFx] = useState<FxRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<SupportedCurrency>('INR');
  const [filterDate, setFilterDate] = useState<string>('');
  const [activeOnly, setActiveOnly] = useState(true);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [productsRes, funnelsRes, fxRes, creativesRes] = await Promise.all([
        fetch('/api/product-tracker').then((r) => r.json()),
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/fx').then((r) => r.json()),
        fetch('/api/creatives-intl').then((r) => r.json()),
      ]);
      const all: ProductTrackerEntry[] = productsRes.entries ?? [];
      const winners = all.filter((p) => p.productStage === 'Winner - Moved To OPS');
      setProducts(winners);

      const allFunnels: Funnel[] = funnelsRes.funnels ?? [];
      const winnerIds = new Set(winners.map((p) => p.id));
      const winnerNames = new Set(winners.map((p) => p.productName));
      const myFunnels = allFunnels.filter((f) =>
        (f.productId && winnerIds.has(f.productId)) ||
        (!f.productId && winnerNames.has(f.productName))
      );
      setFunnels(myFunnels);
      setFx(fxRes ?? null);
      const myFunnelIds = new Set(myFunnels.map((f) => f.id));
      setCreatives((creativesRes.creatives ?? []).filter((c: Creative) => myFunnelIds.has(c.funnelId)));

      const logsRes = await Promise.all(
        myFunnels.map((f) => fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(f.id)}`).then((r) => r.json()))
      );
      const map: Record<string, FunnelDailyLog[]> = {};
      myFunnels.forEach((f, i) => { map[f.id] = logsRes[i]?.logs ?? []; });
      setLogsByFunnel(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load winners.');
    } finally {
      setLoading(false);
    }
  };

  const rates: UsdRates = fx?.rates ?? { USD: 1, INR: 95 };
  const fmt = (inr: number) => formatMoney(inr, currency, rates.INR || 95);

  // Per-product roll-up
  const summaries = useMemo<ProductSummary[]>(() => {
    return products.map((p) => {
      const myFunnels = funnels.filter((f) =>
        (f.productId && f.productId === p.id) || (!f.productId && f.productName === p.productName)
      );

      let totalSpend = 0, totalRevenue = 0, totalProfit = 0;
      let lastActivity = '';
      const perFunnel: PerFunnelMetrics[] = myFunnels.map((f) => {
        const allLogs = logsByFunnel[f.id] ?? [];
        const logs = filterDate ? allLogs.filter((l) => l.date === filterDate) : allLogs;
        let spend = 0, revenue = 0, profit = 0, lastDate = '';
        for (const l of logs) {
          spend += Number(l.spend) || 0;
          revenue += Number(l.revenue) || 0;
          profit += Number(l.profit) || 0;
          if (l.date > lastDate) lastDate = l.date;
        }
        const sortedLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date));
        const latestRoas = Number(sortedLogs[0]?.roas) || 0;
        const blendedRoas = spend > 0 ? revenue / spend : latestRoas;
        const beroas = effectiveBeroas(f, p);
        const hasData = spend > 0 || latestRoas > 0;
        const winning = hasData && isWinning(blendedRoas > 0 ? blendedRoas : latestRoas, beroas);

        totalSpend += spend;
        totalRevenue += revenue;
        totalProfit += profit;
        if (lastDate > lastActivity) lastActivity = lastDate;

        return { funnel: f, spend, revenue, profit, blendedRoas, winning, hasData };
      });

      const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
      // Testing funnels count as live for "active" tally
      const liveCount = myFunnels.filter((f) => f.status === 'live' || f.status === 'testing').length;
      const withData = perFunnel.filter((x) => x.hasData);
      const winningFunnels = perFunnel.filter((x) => x.winning).length;
      const hitRate = withData.length > 0 ? (winningFunnels / withData.length) * 100 : 0;

      const sortedByRoas = [...withData].sort((a, b) => b.blendedRoas - a.blendedRoas);
      const bestFunnel = sortedByRoas[0];
      const worstFunnel = sortedByRoas.length > 1 ? sortedByRoas[sortedByRoas.length - 1] : undefined;

      const markets = Array.from(new Set(
        myFunnels.map((f) => f.funnelishUrl).filter(Boolean)
          .map((u) => u.replace(/^https?:\/\//, '').replace(/\/$/, ''))
      ));

      return {
        product: p,
        funnels: myFunnels,
        perFunnel,
        liveCount,
        totalSpend,
        totalRevenue,
        totalProfit,
        blendedRoas,
        bestFunnel,
        worstFunnel,
        markets,
        funnelsWithData: withData.length,
        winningFunnels,
        hitRate,
        lastActivity,
      };
    }).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [products, funnels, logsByFunnel, filterDate]);

  // Grand totals across all winners
  const grand = useMemo(() => {
    let spend = 0, revenue = 0, profit = 0;
    let activeFunnels = 0;
    let totalFunnels = 0;
    let activeProducts = 0;
    summaries.forEach((s) => {
      spend += s.totalSpend;
      revenue += s.totalRevenue;
      profit += s.totalProfit;
      activeFunnels += s.liveCount;
      totalFunnels += s.funnels.length;
      if (s.totalSpend > 0) activeProducts++;
    });
    // Hit rate: creatives marked as winner divided by (winners + killed).
    // A creative being killed (status === 'killed') counts as a "decided loss".
    const creativeWinners = creatives.filter((c) => c.result === 'winner').length;
    const creativeKilled = creatives.filter((c) => c.status === 'killed').length;
    const decided = creativeWinners + creativeKilled;
    const creativeHitRate = decided > 0 ? (creativeWinners / decided) * 100 : 0;
    return {
      spend, revenue, profit,
      blendedRoas: spend > 0 ? revenue / spend : 0,
      profitMargin: revenue > 0 ? (profit / revenue) * 100 : 0,
      activeFunnels,
      totalFunnels,
      activeProducts,
      totalProducts: summaries.length,
      creativeHitRate,
      creativeWinners,
      creativeDecided: decided,
    };
  }, [summaries, creatives]);

  const animatedProfit = useCountUp(grand.profit);
  const animatedRoas = useCountUp(grand.blendedRoas, 500);
  const animatedActive = useCountUp(grand.activeProducts, 400);
  const animatedHit = useCountUp(grand.creativeHitRate, 500);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Winners</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {summaries.length} winning product{summaries.length === 1 ? '' : 's'} ·
              {' '}{grand.activeFunnels} live LP{grand.activeFunnels === 1 ? '' : 's'} across {grand.totalFunnels} total
            </p>
          </div>
        </div>

        <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
          {(['USD', 'INR'] as const).map((c) => (
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

      {/* Date filter */}
      <DateFilterStrip filterDate={filterDate} onChange={setFilterDate} />

      {/* Grand-total KPIs — modern card-style instead of rigid grid-px */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Active products" value={Math.round(animatedActive).toLocaleString('en-IN')} accent="emerald" hint={`of ${grand.totalProducts}`} delay={0} />
        <KpiTile
          label="Total profit"
          value={fmt(animatedProfit)}
          accent={grand.profit < 0 ? 'rose' : 'emerald'}
          hint={grand.revenue > 0 ? `${grand.profitMargin.toFixed(1)}% margin` : undefined}
          delay={0.05}
        />
        <KpiTile label="Blended ROAS" value={animatedRoas > 0 ? `${animatedRoas.toFixed(2)}x` : '—'} accent="sky" delay={0.1} />
        <KpiTile
          label="Funnel hit"
          value={grand.creativeDecided > 0 ? `${Math.round(animatedHit)}%` : '—'}
          accent="violet"
          hint={grand.creativeWinners > 0 ? `${grand.creativeWinners} winning creative${grand.creativeWinners === 1 ? '' : 's'}` : 'no decided creatives'}
          delay={0.15}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading / Empty / Cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[280px] rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : summaries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Trophy className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-[13px] font-medium text-foreground">No winning products yet</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Mark a product as <em>Winner - Moved To OPS</em> in{' '}
            <Link href="/product-tracker" className="text-primary hover:text-primary/80">Products</Link> to see it here.
          </p>
        </div>
      ) : (
        <>
          {/* Active-only filter toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Show</p>
            <button
              onClick={() => setActiveOnly(true)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition',
                activeOnly ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', activeOnly ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-muted-foreground/40')} />
              Actively spending
            </button>
            <button
              onClick={() => setActiveOnly(false)}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium transition',
                !activeOnly ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              All winners
            </button>
            <span className="text-[10px] text-muted-foreground/60">
              {(() => {
                const shown = activeOnly ? summaries.filter((s) => s.totalSpend > 0).length : summaries.length;
                return `${shown} of ${summaries.length}`;
              })()}
            </span>
          </div>

          {(() => {
            const visible = activeOnly ? summaries.filter((s) => s.totalSpend > 0) : summaries;
            if (visible.length === 0) {
              return (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
                  <p className="text-[12px] text-muted-foreground">
                    {activeOnly
                      ? 'No winners currently spending. Toggle "All winners" to see all.'
                      : 'No winners match.'}
                  </p>
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {visible.map((s, idx) => (
                  <WinnerCard key={s.product.id} summary={s} fmt={fmt} index={idx} />
                ))}
              </div>
            );
          })()}
        </>
      )}

      <p className="pt-1 text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · stored USD, displayed in {currency}
      </p>
    </PageTransition>
  );
}

// ── Card per winner product — mini-dashboard ─────────────────────────────────

function WinnerCard({
  summary, fmt, index,
}: {
  summary: ProductSummary;
  fmt: (usd: number) => string;
  index: number;
}) {
  const { product, perFunnel, liveCount, funnels, totalSpend, totalRevenue, totalProfit, blendedRoas, bestFunnel, worstFunnel, markets, funnelsWithData, winningFunnels, hitRate, lastActivity } = summary;
  const hasData = totalSpend > 0;
  const profitTone = totalProfit < 0 ? 'rose' : totalProfit > 0 ? 'emerald' : 'neutral';
  const roasIsWinning = bestFunnel ? bestFunnel.winning : false;
  const roasTone = !hasData ? 'neutral' : roasIsWinning ? 'emerald' : 'rose';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.4), ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-emerald-500/20 bg-card transition-colors hover:border-emerald-500/40"
    >
      {/* Full-card click target */}
      <Link
        href={`/product-tracker/${product.id}`}
        aria-label={`Open ${product.productName || 'product'} dossier`}
        className="absolute inset-0 z-20 rounded-xl"
      />
      {/* Top accent + winner ribbon */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-500/60 via-emerald-400 to-emerald-500/60" aria-hidden />

      {/* Ambient glow on hover */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-20 blur-3xl transition-opacity duration-500 group-hover:opacity-50"
        style={{ background: 'radial-gradient(circle, #34d39966, transparent 70%)' }}
        aria-hidden
      />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <h2 className="truncate text-[15px] font-semibold text-foreground">
              {product.productName || '(unnamed)'}
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {liveCount > 0 ? `${liveCount} live` : 'no live LPs'}
            {' · '}{funnels.length} total
            {markets.length > 0 && <> · {markets.length} LP link{markets.length === 1 ? '' : 's'}</>}
            {lastActivity && <> · last log {lastActivity}</>}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-400 transition group-hover:bg-emerald-500/25">
          Open <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </span>
      </div>

      {/* Mini KPI grid inside card */}
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border/60 md:grid-cols-4">
        <MiniStat label="Spend"   value={hasData ? fmt(totalSpend) : '—'}    tone="amber" />
        <MiniStat label="Revenue" value={hasData ? fmt(totalRevenue) : '—'} tone="sky" />
        <MiniStat label="Profit"  value={hasData ? fmt(totalProfit) : '—'}  tone={profitTone} />
        <MiniStat label="ROAS"    value={blendedRoas > 0 ? `${blendedRoas.toFixed(2)}x` : '—'} tone={roasTone} />
      </div>

      {/* Per-funnel mini chart + best/worst */}
      <div className="relative z-10 flex flex-col gap-3 px-5 py-4">
        {/* Per-funnel ROAS bars */}
        {perFunnel.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Funnels by ROAS
              </span>
              <span className="text-[10px] text-muted-foreground">
                {funnelsWithData > 0 && (
                  <>
                    Hit rate <span className="font-semibold tabular-nums text-foreground">{hitRate.toFixed(0)}%</span>
                    {' '}({winningFunnels}/{funnelsWithData})
                  </>
                )}
              </span>
            </div>
            <FunnelBars perFunnel={perFunnel} />
          </div>
        )}

        {/* Best / worst summary chips */}
        {(bestFunnel || worstFunnel) && (
          <div className="flex flex-wrap items-center gap-2">
            {bestFunnel && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
                <TrendingUp className="h-3 w-3" />
                <span className="font-medium">Best:</span>
                <span className="max-w-[160px] truncate">{lpLabel(bestFunnel.funnel)}</span>
                <span className="font-semibold tabular-nums">{bestFunnel.blendedRoas.toFixed(2)}x</span>
              </span>
            )}
            {worstFunnel && worstFunnel !== bestFunnel && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-400">
                <TrendingDown className="h-3 w-3" />
                <span className="font-medium">Worst:</span>
                <span className="max-w-[160px] truncate">{lpLabel(worstFunnel.funnel)}</span>
                <span className="font-semibold tabular-nums">{worstFunnel.blendedRoas.toFixed(2)}x</span>
              </span>
            )}
          </div>
        )}

        {/* LP links */}
        {markets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <Link2 className="mr-0.5 h-3 w-3 text-muted-foreground" />
            {markets.slice(0, 6).map((m) => (
              <span key={m} className="inline-block rounded-full border border-border bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                {m}
              </span>
            ))}
            {markets.length > 6 && (
              <span className="text-[10px] text-muted-foreground/70">+{markets.length - 6}</span>
            )}
          </div>
        )}

        {!hasData && (
          <p className="text-[11px] text-muted-foreground/60">
            No performance logs yet — log ROAS/orders from the LP.
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Mini stat cell inside the card ───────────────────────────────────────────

function MiniStat({ label, value, tone }: {
  label: string;
  value: string;
  tone: 'amber' | 'sky' | 'emerald' | 'rose' | 'neutral';
}) {
  const map = {
    amber:   'text-amber-400',
    sky:     'text-sky-400',
    emerald: 'text-emerald-400',
    rose:    'text-rose-400',
    neutral: 'text-muted-foreground',
  };
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-[16px] font-semibold leading-none tabular-nums tracking-tight', map[tone])}>
        {value}
      </p>
    </div>
  );
}

// ── Per-funnel ROAS bars (lightweight horizontal viz) ────────────────────────

function FunnelBars({ perFunnel }: { perFunnel: PerFunnelMetrics[] }) {
  const withData = perFunnel.filter((f) => f.hasData);
  const max = withData.length > 0 ? Math.max(...withData.map((f) => f.blendedRoas)) : 0;
  return (
    <div className="space-y-1.5">
      {perFunnel.slice(0, 5).map(({ funnel: f, blendedRoas, winning, hasData }) => {
        const pct = max > 0 ? (blendedRoas / max) * 100 : 0;
        return (
          <div key={f.id}>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-muted-foreground">
                {lpLabel(f)}
              </span>
              <span className={cn('shrink-0 tabular-nums', !hasData ? 'text-muted-foreground/50' : winning ? 'text-emerald-400 font-semibold' : 'text-foreground')}>
                {hasData ? `${blendedRoas.toFixed(2)}x` : 'no data'}
              </span>
            </div>
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-border/50">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className={cn('h-full rounded-full', winning ? 'bg-emerald-400' : hasData ? 'bg-rose-400/70' : 'bg-muted-foreground/30')}
              />
            </div>
          </div>
        );
      })}
      {perFunnel.length > 5 && (
        <p className="text-[10px] text-muted-foreground/70">+ {perFunnel.length - 5} more LP{perFunnel.length - 5 === 1 ? '' : 's'}</p>
      )}
    </div>
  );
}

// ── Top-level KPI tile ───────────────────────────────────────────────────────

function KpiTile({ label, value, hint, accent, delay = 0 }: {
  label: string;
  value: string;
  hint?: string;
  accent: 'amber' | 'sky' | 'emerald' | 'violet' | 'rose';
  delay?: number;
}) {
  const text = {
    amber:   'text-amber-400',
    sky:     'text-sky-400',
    emerald: 'text-emerald-400',
    violet:  'text-violet-400',
    rose:    'text-rose-400',
  }[accent];
  const border = {
    amber:   'border-amber-500/30',
    sky:     'border-sky-500/30',
    emerald: 'border-emerald-500/30',
    violet:  'border-violet-500/30',
    rose:    'border-rose-500/30',
  }[accent];
  const glow = {
    amber:   '#fbbf24',
    sky:     '#38bdf8',
    emerald: '#34d399',
    violet:  '#a78bfa',
    rose:    '#fb7185',
  }[accent];
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
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: glow }} aria-hidden />
      </div>
      <p className={cn('relative z-10 mt-2 text-[24px] font-semibold leading-none tabular-nums tracking-tight', text)}>{value}</p>
      {hint && <p className="relative z-10 mt-1.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </motion.div>
  );
}

function DateFilterStrip({ filterDate, onChange }: { filterDate: string; onChange: (d: string) => void }) {
  // Compute once per mount — stable for the user's session.
  const { today, yest } = useMemo(() => {
    const now = new Date();
    const fmtIST = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    return { today: fmtIST(now), yest: fmtIST(new Date(now.getTime() - 86_400_000)) };
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-wrap items-center gap-2"
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Performance for</p>
      <FilterChip active={filterDate === ''} onClick={() => onChange('')}>All time</FilterChip>
      <FilterChip active={filterDate === today} onClick={() => onChange(today)}>Today</FilterChip>
      <FilterChip active={filterDate === yest} onClick={() => onChange(yest)}>Yesterday</FilterChip>
      <DatePicker value={filterDate} onChange={onChange} placeholder="Pick a day" compact />
      {filterDate && (
        <span className="text-[10px] text-emerald-400">Viewing {filterDate} only</span>
      )}
    </motion.div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
