'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Package, ArrowLeft, ArrowRight, ExternalLink, Loader2, AlertTriangle,
  Globe, Funnel as FunnelIcon, Wallet, Pencil, Check, Trophy,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import { isWinning, effectiveBeroas } from '@/lib/funnels';
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

const PRODUCT_STAGES = [
  '',
  'Research Phase',
  'Testing Store Page Done',
  'Testing Ads',
  'Winner - Moved To OPS',
  'Dropped',
];

const STAGE_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string; gradient: string }> = {
  'Research Phase':         { color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  dot: 'bg-violet-400',  gradient: 'from-violet-500/40 via-violet-400/60 to-violet-500/40' },
  'Testing Store Page Done':{ color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    dot: 'bg-blue-400',    gradient: 'from-blue-500/40 via-blue-400/60 to-blue-500/40' },
  'Testing Ads':            { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   dot: 'bg-amber-400',   gradient: 'from-amber-500/40 via-amber-400/60 to-amber-500/40' },
  'Winner - Moved To OPS':  { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400', gradient: 'from-emerald-500/50 via-emerald-400/70 to-emerald-500/50' },
  'Dropped':                { color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    dot: 'bg-rose-400',    gradient: 'from-rose-500/40 via-rose-400/60 to-rose-500/40' },
};

const STAGE_FALLBACK = { color: 'text-muted-foreground', bg: 'bg-border/40', border: 'border-border', dot: 'bg-muted-foreground', gradient: 'from-muted-foreground/30 via-muted-foreground/40 to-muted-foreground/30' };

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
  // Date filter: '' = all-time, otherwise YYYY-MM-DD limits all log aggregation to that date
  const [filterDate, setFilterDate] = useState<string>('');
  // Inline-edit state for the product fields
  const [editingName, setEditingName] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);

  useEffect(() => { if (id) loadAll(); }, [id]);

  // Field save — patches the product on the server, optimistic local update,
  // flashes a green tick on the field that just saved.
  const saveProductField = async <K extends keyof ProductTrackerEntry>(field: K, value: ProductTrackerEntry[K]) => {
    if (!product) return;
    if (product[field] === value) return;
    setProduct({ ...product, [field]: value });
    try {
      await fetch('/api/product-tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, [field]: value }),
      });
      setSavedField(field as string);
      setTimeout(() => setSavedField((cur) => (cur === field ? null : cur)), 1200);
    } catch {
      setError('Failed to save change.');
    }
  };

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

      // Match by productId first (the FK). Fall back to productName for legacy funnels.
      const allFunnels: Funnel[] = funnelsRes.funnels ?? [];
      const myFunnels = allFunnels.filter((f) => {
        if (f.productId) return f.productId === p.id;
        return f.productName === p.productName;
      });
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

  // Aggregates per funnel — honors filterDate (single-day view when set)
  const funnelAggs = useMemo(() => {
    return funnels.map((f) => {
      const allLogs = logsByFunnel[f.id] ?? [];
      const logs = filterDate ? allLogs.filter((l) => l.date === filterDate) : allLogs;
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
  }, [funnels, logsByFunnel, filterDate]);

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
    const winners = withData.filter((a) => isWinning(Math.max(a.blendedRoas, a.latestRoas), effectiveBeroas(a.funnel, product ?? undefined))).length;
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

  // IST today/yesterday for the date filter — computed once per mount
  const dateChips = useMemo(() => {
    const now = new Date();
    const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    return { today: fmt(now), yest: fmt(new Date(now.getTime() - 86_400_000)) };
  }, []);

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

      {/* Hero — gradient border, inline-editable */}
      {(() => {
        const stageCfg = STAGE_CONFIG[product.productStage] ?? STAGE_FALLBACK;
        const isWinner = product.productStage === 'Winner - Moved To OPS';
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card"
          >
            {/* Animated gradient top accent — colored by stage */}
            <div className={cn('absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r', stageCfg.gradient)} aria-hidden />
            {/* Ambient corner glow */}
            <div
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl transition-opacity duration-700 group-hover:opacity-50"
              style={{ background: isWinner ? 'radial-gradient(circle, #34d39966, transparent 70%)' : 'radial-gradient(circle, #a78bfa55, transparent 70%)' }}
              aria-hidden
            />

            <div className="relative z-10 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-lg',
                    isWinner ? 'bg-emerald-500/15 text-emerald-400 shadow-emerald-500/20' : 'bg-primary/15 text-primary shadow-primary/10'
                  )}>
                    {isWinner ? <Trophy className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* Editable name */}
                    {editingName ? (
                      <input
                        autoFocus
                        defaultValue={product.productName}
                        onBlur={(e) => { saveProductField('productName', e.target.value); setEditingName(false); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { saveProductField('productName', e.currentTarget.value); setEditingName(false); }
                          if (e.key === 'Escape') setEditingName(false);
                        }}
                        className="w-full bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none border-b border-primary/40"
                      />
                    ) : (
                      <h1
                        onClick={() => setEditingName(true)}
                        className="group/title inline-flex cursor-text items-center gap-2 text-2xl font-semibold tracking-tight text-foreground"
                      >
                        <span>{product.productName || 'Unnamed product'}</span>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground/30 opacity-0 transition group-hover/title:opacity-100" />
                        {savedField === 'productName' && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                      </h1>
                    )}

                    {/* Stage + File */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={product.productStage}
                        onChange={(e) => saveProductField('productStage', e.target.value)}
                        className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold cursor-pointer outline-none transition appearance-none pr-6 bg-no-repeat',
                          stageCfg.bg, stageCfg.border, stageCfg.color
                        )}
                        style={{
                          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                          backgroundPosition: 'right 6px center',
                        }}
                      >
                        {PRODUCT_STAGES.map((s) => (
                          <option key={s} value={s} className="bg-card text-foreground">{s || 'Select stage…'}</option>
                        ))}
                      </select>

                      {product.productFileLink ? (
                        <a
                          href={product.productFileLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-primary hover:border-primary/30"
                        >
                          <ExternalLink className="h-3 w-3" /> File
                        </a>
                      ) : null}
                      {savedField === 'productStage' && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                          <Check className="h-3 w-3" /> saved
                        </span>
                      )}
                    </div>

                    {/* Editable file link + remarks (compact inline) */}
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <InlineField
                        label="File link"
                        value={product.productFileLink}
                        placeholder="https://…"
                        saved={savedField === 'productFileLink'}
                        onSave={(v) => saveProductField('productFileLink', v)}
                      />
                      <InlineField
                        label="Remarks"
                        value={product.remarks}
                        placeholder="Notes about this product…"
                        saved={savedField === 'remarks'}
                        onSave={(v) => saveProductField('remarks', v)}
                      />
                    </div>
                  </div>
                </div>

                {/* Currency toggle */}
                <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
                  {(['USD', 'EUR', 'INR'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                        currency === c ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editable cost grid */}
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <EditableMoneyCell
                  label="COGS / unit"
                  hint="supplier cost"
                  value={product.cogs}
                  saved={savedField === 'cogs'}
                  onSave={(v) => saveProductField('cogs', v)}
                  fmt={fmt}
                  tone="violet"
                />
                <EditableMoneyCell
                  label="Shipping / unit"
                  hint="per-unit shipping"
                  value={product.shipping}
                  saved={savedField === 'shipping'}
                  onSave={(v) => saveProductField('shipping', v)}
                  fmt={fmt}
                  tone="sky"
                />
                <ReadOnlyCell
                  label="Total cost / unit"
                  value={totalCost > 0 ? fmt(totalCost) : '—'}
                  tone={totalCost > 0 ? 'amber' : 'neutral'}
                  hint="cogs + shipping"
                />
                <ReadOnlyCell
                  label="Funnels"
                  value={`${liveCount} live · ${funnels.length} total`}
                  tone={liveCount > 0 ? 'emerald' : 'neutral'}
                />
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* Date filter — defaults to all-time, single-day view when set */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.04 }}
        className="flex flex-wrap items-center gap-2"
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Performance for</p>
        <button
          onClick={() => setFilterDate('')}
          className={cn(
            'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium transition',
            filterDate === '' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
          )}
        >
          All time
        </button>
        <button
          onClick={() => setFilterDate(dateChips.today)}
          className={cn(
            'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium transition',
            filterDate === dateChips.today ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
          )}
        >
          Today
        </button>
        <button
          onClick={() => setFilterDate(dateChips.yest)}
          className={cn(
            'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium transition',
            filterDate === dateChips.yest ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
          )}
        >
          Yesterday
        </button>
        <DatePicker value={filterDate} onChange={(d) => setFilterDate(d)} placeholder="Pick a day" compact />
        {filterDate && (
          <span className="text-[10px] text-emerald-400">
            Viewing {filterDate} only
          </span>
        )}
      </motion.div>

      {/* Performance KPIs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06 }}
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <KpiTile label="Total spend"   value={fmt(animatedSpend)} accent="amber" />
        <KpiTile label="Total profit"  value={fmt(animatedProfit)} accent={totals.profit < 0 ? 'rose' : 'emerald'} hint={totals.revenue > 0 ? `${totals.profitMargin.toFixed(1)}% margin` : undefined} />
        <KpiTile label="Blended ROAS"  value={animatedRoas > 0 ? `${animatedRoas.toFixed(2)}x` : '—'} accent="sky" />
        <KpiTile label="Funnel hit"    value={`${animatedFunnelHit.toFixed(0)}%`} hint={`${hitRates.creativeWinners} winning creatives`} accent="violet" />
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
          <div className="px-4 py-10 text-center">
            <FunnelIcon className="mx-auto h-7 w-7 text-muted-foreground/30" />
            <p className="mt-2 text-[12px] text-muted-foreground">No funnels for this product yet.</p>
            <Link href="/funnels" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/25">
              Create one <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {funnelAggs.map(({ funnel: f, spend, profit, blendedRoas, latestRoas, lastLogDate }, idx) => {
              const tone = STATUS_TONE[f.status];
              const roasShown = latestRoas > 0 ? latestRoas : blendedRoas;
              const fb = effectiveBeroas(f, product ?? undefined);
              const winning = isWinning(roasShown, fb);
              const hasData = roasShown > 0 || spend > 0;
              const winThreshold = fb > 0 ? fb + 1 : 0;
              const progress = winThreshold > 0 && roasShown > 0
                ? Math.min(1, roasShown / (winThreshold * 1.1))
                : 0;
              return (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.3) }}
                  className="group relative px-5 py-3 transition-colors hover:bg-foreground/[0.02]"
                >
                  {/* Left status accent bar */}
                  <div className={cn('absolute inset-y-2 left-0 w-[2px] rounded-r', tone.dot)} aria-hidden />

                  <div className="grid grid-cols-12 items-center gap-3">
                    {/* Market */}
                    <div className="col-span-3">
                      <p className="text-[13px] font-medium text-foreground">{f.country}</p>
                      <p className="text-[10px] text-muted-foreground">{f.language}</p>
                    </div>

                    {/* Status */}
                    <div className="col-span-2">
                      <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', tone.bg, tone.border, tone.text)}>
                        <span className={cn('h-1 w-1 rounded-full', tone.dot)} />
                        {STATUS_LABEL[f.status]}
                      </span>
                    </div>

                    {/* ROAS + threshold bar */}
                    <div className="col-span-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn('text-[14px] font-semibold tabular-nums', !hasData ? 'text-muted-foreground/40' : winning ? 'text-emerald-400' : 'text-foreground')}>
                          {roasShown > 0 ? `${roasShown.toFixed(2)}x` : '—'}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                          BEROAS {fb > 0 ? `${fb.toFixed(2)}x` : '—'}
                        </span>
                      </div>
                      {hasData && winThreshold > 0 ? (
                        <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-border/60">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress * 100}%` }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                            className={cn('h-full rounded-full', winning ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : 'bg-rose-400/70')}
                          />
                          <span className="absolute top-0 h-full w-px bg-foreground/40" style={{ left: `${(1 / 1.1) * 100}%` }} aria-hidden />
                        </div>
                      ) : (
                        <div className="mt-1 h-1 rounded-full bg-border/30" />
                      )}
                    </div>

                    {/* Win badge + numbers */}
                    <div className="col-span-3 flex items-center justify-end gap-3">
                      {!hasData ? (
                        <span className="text-[10px] text-muted-foreground/60">no data</span>
                      ) : winning ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                          <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" /> Win
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
                          <span className="h-1 w-1 rounded-full bg-rose-400" /> Below
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Secondary row: $ + last log */}
                  {(spend > 0 || lastLogDate) && (
                    <div className="mt-1 flex items-center gap-3 pl-0 text-[10px] text-muted-foreground">
                      {spend > 0 && (
                        <>
                          <span>Spend <span className="font-semibold tabular-nums text-foreground">{fmt(spend)}</span></span>
                          <span className="text-muted-foreground/40">·</span>
                          <span>Profit <span className={cn('font-semibold tabular-nums', profit < 0 ? 'text-rose-400' : profit > 0 ? 'text-emerald-400' : 'text-foreground')}>{fmt(profit)}</span></span>
                        </>
                      )}
                      {lastLogDate && (
                        <span className="ml-auto tabular-nums">{lastLogDate}</span>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
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

const TONE_TEXT = {
  amber:   'text-amber-400',
  sky:     'text-sky-400',
  emerald: 'text-emerald-400',
  rose:    'text-rose-400',
  violet:  'text-violet-400',
  neutral: 'text-foreground',
} as const;

const TONE_GLOW = {
  amber:   '#fbbf24',
  sky:     '#38bdf8',
  emerald: '#34d399',
  rose:    '#fb7185',
  violet:  '#a78bfa',
  neutral: '#71717a',
} as const;

const TONE_BORDER = {
  amber:   'border-amber-500/30',
  sky:     'border-sky-500/30',
  emerald: 'border-emerald-500/30',
  rose:    'border-rose-500/30',
  violet:  'border-violet-500/30',
  neutral: 'border-border',
} as const;

type Tone = keyof typeof TONE_TEXT;

// Editable money input shown as a stat-like cell. Click into it like an input.
function EditableMoneyCell({
  label, hint, value, onSave, fmt, saved, tone,
}: {
  label: string;
  hint?: string;
  value: number;
  onSave: (v: number) => void;
  fmt: (usd: number) => string;
  saved: boolean;
  tone: Tone;
}) {
  // Controlled-uncontrolled toggle: when focused use local draft, when not focused
  // we display the prop value directly so external updates flow through cleanly.
  const [draft, setDraft] = useState<string>('');
  const [focused, setFocused] = useState(false);
  const displayString = focused ? draft : (value > 0 ? String(value) : '');

  const flush = () => {
    const n = parseFloat(draft);
    onSave(Number.isFinite(n) && n >= 0 ? n : 0);
    setFocused(false);
  };

  return (
    <div className={cn(
      'group relative overflow-hidden rounded-xl border bg-card p-3 transition-colors',
      focused ? TONE_BORDER[tone] : 'border-border hover:border-border/80'
    )}>
      <div
        className={cn('pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity duration-500', focused ? 'opacity-50' : 'opacity-0 group-hover:opacity-25')}
        style={{ background: `radial-gradient(circle, ${TONE_GLOW[tone]}66, transparent 70%)` }}
        aria-hidden
      />
      <div className="relative z-10">
        <div className="flex items-baseline justify-between">
          <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          {saved && <Check className="h-3 w-3 text-emerald-400" />}
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className={cn('text-base font-semibold leading-none', TONE_TEXT[tone])}>$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={displayString}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => { setDraft(value > 0 ? String(value) : ''); setFocused(true); }}
            onBlur={flush}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setFocused(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="0"
            className="w-full bg-transparent text-[20px] font-semibold leading-none tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
        {hint && !focused && <p className="mt-1 text-[9px] text-muted-foreground/60">{hint}</p>}
        {focused && <p className="mt-1 text-[9px] text-muted-foreground/60">Press Enter to save · Esc to cancel</p>}
        {/* Show the formatted display value as a sub-line if the converted currency differs from raw USD */}
        {value > 0 && !focused && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/60">{fmt(value)} display</p>
        )}
      </div>
    </div>
  );
}

function ReadOnlyCell({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone: Tone }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-[20px] font-semibold leading-none tabular-nums', TONE_TEXT[tone])}>{value}</p>
      {hint && <p className="mt-1 text-[9px] text-muted-foreground/60">{hint}</p>}
    </div>
  );
}

// Animated KPI tile (replaces old StatCell)
function KpiTile({ label, value, hint, accent }: {
  label: string; value: string; hint?: string;
  accent: 'emerald' | 'amber' | 'sky' | 'violet' | 'rose';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: `0 14px 40px -16px ${TONE_GLOW[accent]}55, 0 0 0 1px ${TONE_GLOW[accent]}33` }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn('group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors', TONE_BORDER[accent])}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: `radial-gradient(circle, ${TONE_GLOW[accent]}66, transparent 70%)` }}
        aria-hidden
      />
      <div className="relative z-10 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_GLOW[accent] }} aria-hidden />
      </div>
      <p className={cn('relative z-10 mt-2 text-[24px] font-semibold leading-none tabular-nums tracking-tight', TONE_TEXT[accent])}>
        {value}
      </p>
      {hint && <p className="relative z-10 mt-1.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </motion.div>
  );
}

// Inline single-line editable text (used for File link and Remarks in the hero)
function InlineField({
  label, value, placeholder, onSave, saved,
}: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
  saved: boolean;
}) {
  // Controlled-uncontrolled toggle: when focused use local draft; when not focused
  // we display the prop directly so external updates flow through.
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const display = focused ? draft : value;
  return (
    <div className={cn(
      'group relative rounded-lg border bg-background/40 px-3 py-2 transition-colors',
      focused ? 'border-primary/40 bg-primary/[0.04]' : 'border-border hover:border-border/80'
    )}>
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {saved && <Check className="h-3 w-3 text-emerald-400" />}
      </div>
      <input
        value={display}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => { setDraft(value); setFocused(true); }}
        onBlur={() => { onSave(draft); setFocused(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setFocused(false); (e.target as HTMLInputElement).blur(); }
        }}
        placeholder={placeholder}
        className="mt-0.5 w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/40"
      />
    </div>
  );
}
