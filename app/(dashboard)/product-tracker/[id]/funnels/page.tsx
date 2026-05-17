'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Funnel as FunnelIcon, Loader2, AlertTriangle, Package,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import { isWinning, effectiveBeroas } from '@/lib/funnels';
import { formatMoney, type SupportedCurrency, type UsdRates } from '@/lib/currency-converter';
import type { ProductTrackerEntry } from '@/types/shopify';
import type { Funnel, FunnelDailyLog, FunnelStatus } from '@/types/funnel';
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

export default function ProductFunnelsDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user } = useAuth();

  const [product, setProduct] = useState<ProductTrackerEntry | null>(null);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [logsByFunnel, setLogsByFunnel] = useState<Record<string, FunnelDailyLog[]>>({});
  const [fx, setFx] = useState<FxRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<SupportedCurrency>('INR');
  const [filterDate, setFilterDate] = useState<string>('');

  const loadAll = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [productsRes, funnelsRes, fxRes] = await Promise.all([
        fetch('/api/product-tracker').then((r) => r.json()),
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/fx').then((r) => r.json()),
      ]);
      const p: ProductTrackerEntry | undefined = (productsRes.entries ?? []).find((x: ProductTrackerEntry) => x.id === id);
      if (!p) { setError('Product not found.'); return; }
      setProduct(p);
      const all: Funnel[] = funnelsRes.funnels ?? [];
      const mine = all.filter((f) => (f.productId ? f.productId === p.id : f.productName === p.productName));
      setFunnels(mine);
      setFx(fxRes ?? null);
      const logsArr = await Promise.all(mine.map((f) =>
        fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(f.id)}`).then((r) => r.json())
      ));
      const map: Record<string, FunnelDailyLog[]> = {};
      mine.forEach((f, i) => { map[f.id] = logsArr[i]?.logs ?? []; });
      setLogsByFunnel(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) loadAll(); }, [id, loadAll]);

  const rates: UsdRates = fx?.rates ?? { USD: 1, INR: 95 };
  const fmt = (inr: number) => formatMoney(inr, currency, rates.INR || 95);

  const funnelAggs = useMemo(() => {
    return funnels.map((f) => {
      const allLogs = logsByFunnel[f.id] ?? [];
      const logs = filterDate ? allLogs.filter((l) => l.date === filterDate) : allLogs;
      let spend = 0, revenue = 0, profit = 0;
      let lastLogDate = '';
      const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
      const latestRoas = Number(sorted[0]?.roas) || 0;
      for (const l of logs) {
        spend += Number(l.spend) || 0;
        revenue += Number(l.revenue) || 0;
        profit += Number(l.profit) || 0;
        if (l.date > lastLogDate) lastLogDate = l.date;
      }
      const blendedRoas = spend > 0 ? revenue / spend : 0;
      return { funnel: f, spend, revenue, profit, blendedRoas, latestRoas, lastLogDate, daysLogged: logs.length };
    }).sort((a, b) => {
      // Live first, then testing, then by ROAS desc
      const rank: Record<FunnelStatus, number> = { live: 0, testing: 1, paused: 2, draft: 3, killed: 4 };
      const dr = rank[a.funnel.status] - rank[b.funnel.status];
      if (dr !== 0) return dr;
      const ar = a.latestRoas > 0 ? a.latestRoas : a.blendedRoas;
      const br = b.latestRoas > 0 ? b.latestRoas : b.blendedRoas;
      return br - ar;
    });
  }, [funnels, logsByFunnel, filterDate]);

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
            <FunnelIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">LPs — {product.productName || 'Unnamed product'}</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {funnels.length} LP{funnels.length === 1 ? '' : 's'} · launches &amp; performance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
          <DatePicker value={filterDate} onChange={setFilterDate} placeholder="Pick a day" compact />
          {filterDate && (
            <button
              onClick={() => setFilterDate('')}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Funnel cards */}
      {funnels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <FunnelIcon className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-[13px] font-medium text-foreground">No LPs for this product yet.</p>
          <Link
            href="/funnels"
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/25"
          >
            Create one <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {funnelAggs.map(({ funnel: f, spend, revenue, profit, blendedRoas, latestRoas, lastLogDate }, idx) => {
            const tone = STATUS_TONE[f.status];
            const roasShown = latestRoas > 0 ? latestRoas : blendedRoas;
            const fb = effectiveBeroas(f, product);
            const winning = isWinning(roasShown, fb);
            const hasData = roasShown > 0 || spend > 0;
            const winThreshold = fb > 0 ? fb + 1 : 0;
            const progress = winThreshold > 0 && roasShown > 0
              ? Math.min(1, roasShown / (winThreshold * 1.1))
              : 0;
            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.3) }}
                whileHover={{ y: -2 }}
                className={cn(
                  'group relative overflow-hidden rounded-xl border bg-card transition-colors',
                  winning ? 'border-emerald-500/30 hover:border-emerald-500/50' : 'border-border hover:border-border/80'
                )}
              >
                <Link
                  href={`/funnels/${f.id}`}
                  aria-label="Open LP"
                  className="absolute inset-0 z-10 rounded-xl"
                />
                <div className={cn('absolute inset-x-0 top-0 h-[3px]', winning ? 'bg-gradient-to-r from-emerald-500/60 via-emerald-400 to-emerald-500/60' : tone.dot)} aria-hidden />

                <div className="relative z-20 pointer-events-none flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="truncate text-[13px] font-semibold text-foreground">
                        {f.funnelishUrl ? f.funnelishUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : (f.productName || 'LP')}
                      </p>
                    </div>
                    <span className={cn('mt-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', tone.bg, tone.border, tone.text)}>
                      <span className={cn('h-1 w-1 rounded-full', tone.dot)} aria-hidden />
                      {STATUS_LABEL[f.status]}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn('text-2xl font-semibold leading-none tabular-nums tracking-tight', !hasData ? 'text-muted-foreground/40' : winning ? 'text-emerald-400' : 'text-foreground')}>
                      {roasShown > 0 ? `${roasShown.toFixed(2)}x` : '—'}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">BE {fb > 0 ? `${fb.toFixed(2)}x` : '—'}</p>
                  </div>
                </div>

                {/* Progress bar */}
                {hasData && winThreshold > 0 && (
                  <div className="relative z-20 pointer-events-none px-4">
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-border/60">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress * 100}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        className={cn('h-full rounded-full', winning ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : 'bg-rose-400/70')}
                      />
                      <span className="absolute top-0 h-full w-px bg-foreground/40" style={{ left: `${(1 / 1.1) * 100}%` }} aria-hidden />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground/70">
                      <span>0</span>
                      <span className="tabular-nums">Win {winThreshold.toFixed(2)}x</span>
                    </div>
                  </div>
                )}

                {/* Money + last log */}
                <div className="relative z-20 pointer-events-none flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5 text-[10px] text-muted-foreground">
                  <span>Spend <span className="font-semibold tabular-nums text-foreground">{spend > 0 ? fmt(spend) : '—'}</span></span>
                  <span>Profit <span className={cn('font-semibold tabular-nums', profit < 0 ? 'text-rose-400' : profit > 0 ? 'text-emerald-400' : 'text-foreground')}>{revenue > 0 ? fmt(profit) : '—'}</span></span>
                  <span className="tabular-nums">{lastLogDate || 'no logs'}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · click any card to open the funnel detail
      </p>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/60">
        <Link href="/funnels" className="inline-flex items-center gap-1 text-primary hover:text-primary/80">
          <FunnelIcon className="h-3 w-3" /> All funnels
        </Link>
        <Link href={`/product-tracker/${id}`} className="inline-flex items-center gap-1 text-primary hover:text-primary/80">
          <Package className="h-3 w-3" /> Product dossier
        </Link>
      </div>
    </PageTransition>
  );
}
