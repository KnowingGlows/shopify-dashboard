'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Wallet, ArrowLeft, Plus, Trash2, Loader2, AlertTriangle, Globe, Pencil,
  TrendingUp, TrendingDown, Receipt, Banknote, DollarSign, CircleDollarSign,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import { isWinning, effectiveBeroas } from '@/lib/funnels';
import { formatFromUSD, type SupportedCurrency, type UsdRates } from '@/lib/currency-converter';
import type { ProductTrackerEntry } from '@/types/shopify';
import type { Funnel, FunnelDailyLog, FunnelStatus } from '@/types/funnel';
import type { FxRates } from '@/lib/fx-rates';

const STATUS_OPTIONS: Array<{ value: FunnelStatus; label: string; tone: 'gray' | 'amber' | 'emerald' | 'sky' | 'rose' }> = [
  { value: 'live',    label: 'Live',    tone: 'emerald' },
  { value: 'testing', label: 'Testing', tone: 'amber' },
  { value: 'paused',  label: 'Paused',  tone: 'sky' },
  { value: 'draft',   label: 'Draft',   tone: 'gray' },
  { value: 'killed',  label: 'Killed',  tone: 'rose' },
];

const TONE: Record<'gray' | 'amber' | 'emerald' | 'sky' | 'rose', { text: string; bg: string; border: string; bar: string; dot: string; glow: string }> = {
  gray:    { text: 'text-muted-foreground', bg: 'bg-border/40',     border: 'border-border',         bar: 'bg-muted-foreground/40', dot: 'bg-muted-foreground', glow: '#71717a' },
  amber:   { text: 'text-amber-400',        bg: 'bg-amber-500/10',  border: 'border-amber-500/30',   bar: 'bg-amber-400',           dot: 'bg-amber-400',          glow: '#fbbf24' },
  emerald: { text: 'text-emerald-400',      bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'bg-emerald-400',         dot: 'bg-emerald-400',        glow: '#34d399' },
  sky:     { text: 'text-sky-400',          bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     bar: 'bg-sky-400',             dot: 'bg-sky-400',            glow: '#38bdf8' },
  rose:    { text: 'text-rose-400',         bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    bar: 'bg-rose-400',            dot: 'bg-rose-400',           glow: '#fb7185' },
};

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

export default function FunnelFinanceDetailPage() {
  const params = useParams<{ id: string }>();
  const funnelId = params?.id;
  const { user } = useAuth();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [product, setProduct] = useState<ProductTrackerEntry | null>(null);
  const [logs, setLogs] = useState<FunnelDailyLog[]>([]);
  const [fx, setFx] = useState<FxRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');
  const [filterDate, setFilterDate] = useState<string>('');

  const loadAll = useCallback(async () => {
    if (!funnelId) return;
    try {
      setLoading(true);
      setError(null);
      const [funnelsRes, productsRes, logsRes, fxRes] = await Promise.all([
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/product-tracker').then((r) => r.json()),
        fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(funnelId)}`).then((r) => r.json()),
        fetch('/api/fx').then((r) => r.json()),
      ]);
      const f: Funnel | undefined = (funnelsRes.funnels ?? []).find((x: Funnel) => x.id === funnelId);
      if (!f) { setError('Funnel not found.'); setFunnel(null); return; }
      setFunnel(f);
      const p: ProductTrackerEntry | undefined = (productsRes.entries ?? []).find((e: ProductTrackerEntry) =>
        (f.productId && e.id === f.productId) || (!f.productId && e.productName === f.productName)
      );
      setProduct(p ?? null);
      setLogs(logsRes.logs ?? []);
      setFx(fxRes ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load funnel.');
    } finally {
      setLoading(false);
    }
  }, [funnelId]);

  useEffect(() => { if (funnelId) loadAll(); }, [funnelId, loadAll]);

  const refreshLogs = async () => {
    if (!funnelId) return;
    try {
      const r = await fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(funnelId)}`).then((r) => r.json());
      setLogs(r.logs ?? []);
    } catch { /* ignore */ }
  };

  const updateFunnel = async (patch: Partial<Funnel>) => {
    if (!funnel) return;
    try {
      const r = await fetch('/api/funnels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: funnel.id, ...patch }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setFunnel({ ...funnel, ...patch });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update funnel.');
    }
  };

  const rates: UsdRates = fx?.rates ?? { USD: 1, EUR: 0.92, INR: 83.5 };
  const fmt = (usd: number) => formatFromUSD(usd, currency, rates);

  // Filtered logs by date
  const scopedLogs = useMemo(() => filterDate ? logs.filter((l) => l.date === filterDate) : logs, [logs, filterDate]);

  // Aggregate
  const agg = useMemo(() => {
    let spend = 0, revenue = 0, expense = 0, profit = 0;
    for (const l of scopedLogs) {
      spend += Number(l.spend) || 0;
      revenue += Number(l.revenue) || 0;
      expense += Number(l.expense) || 0;
      profit += Number(l.profit) || 0;
    }
    const blendedRoas = spend > 0 ? revenue / spend : 0;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { spend, revenue, expense, profit, blendedRoas, margin };
  }, [scopedLogs]);

  const beroas = funnel ? effectiveBeroas(funnel, product ?? undefined) : 0;
  const winning = isWinning(agg.blendedRoas, beroas);
  const profitTone: 'rose' | 'emerald' | 'neutral' = agg.profit < 0 ? 'rose' : agg.profit > 0 ? 'emerald' : 'neutral';
  const roasTone: 'rose' | 'emerald' | 'neutral' = agg.spend === 0 ? 'neutral' : winning ? 'emerald' : 'rose';

  const animSpend = useCountUp(agg.spend);
  const animRevenue = useCountUp(agg.revenue);
  const animExpense = useCountUp(agg.expense);
  const animProfit = useCountUp(agg.profit);
  const animRoas = useCountUp(agg.blendedRoas, 500);
  const animMargin = useCountUp(agg.margin, 500);

  // Date chips computed once
  const { today, yest } = useMemo(() => {
    const now = new Date();
    const fmtIST = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    return { today: fmtIST(now), yest: fmtIST(new Date(now.getTime() - 86_400_000)) };
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

  if (error || !funnel) {
    return (
      <PageTransition className="mx-auto max-w-7xl p-5 space-y-4">
        <Link href="/finance/funnels" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to Funnel Finance
        </Link>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
          <p className="mt-2 text-[13px] text-foreground">{error ?? 'Funnel not found.'}</p>
        </div>
      </PageTransition>
    );
  }

  const tone = TONE[STATUS_OPTIONS.find((s) => s.value === funnel.status)?.tone ?? 'gray'];

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Back */}
      <Link href="/finance/funnels" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to Funnel Finance
      </Link>

      {/* Hero — gradient border, status accent */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="group relative overflow-hidden rounded-2xl border border-border bg-card"
      >
        <div className={cn('absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r', winning
          ? 'from-emerald-500/60 via-emerald-400 to-emerald-500/60'
          : tone.bar)} aria-hidden />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl transition-opacity duration-700 group-hover:opacity-40"
          style={{ background: `radial-gradient(circle, ${winning ? '#34d39966' : tone.glow + '55'}, transparent 70%)` }}
          aria-hidden
        />
        <div className="relative z-10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-lg',
                winning ? 'bg-emerald-500/15 text-emerald-400 shadow-emerald-500/20' : 'bg-primary/15 text-primary shadow-primary/10')}>
                <Wallet className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{funnel.productName}</h1>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {funnel.country} <span className="text-muted-foreground/40">·</span> {funnel.language}
                  {funnel.funnelishUrl && (
                    <>
                      <span className="mx-1.5 text-muted-foreground/40">·</span>
                      <a href={funnel.funnelishUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:text-primary/80">
                        <Globe className="h-3 w-3" /> Funnelish
                      </a>
                    </>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={funnel.status}
                    onChange={(e) => updateFunnel({ status: e.target.value as FunnelStatus })}
                    className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold cursor-pointer outline-none transition appearance-none pr-6 bg-no-repeat',
                      tone.bg, tone.border, tone.text)}
                    style={{
                      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                      backgroundPosition: 'right 6px center',
                    }}
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value} className="bg-card text-foreground">{s.label}</option>)}
                  </select>
                  {beroas > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] text-muted-foreground">
                      BEROAS <span className="font-semibold text-foreground tabular-nums">{beroas.toFixed(2)}x</span>
                    </span>
                  )}
                  {beroas > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[10px] text-emerald-400">
                      Win at <span className="font-semibold tabular-nums">{(beroas + 1).toFixed(2)}x</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
              {(['USD', 'EUR', 'INR'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={cn('rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                    currency === c ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Date filter */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="flex flex-wrap items-center gap-2"
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Money for</p>
        <DateChip active={filterDate === ''} onClick={() => setFilterDate('')}>All time</DateChip>
        <DateChip active={filterDate === today} onClick={() => setFilterDate(today)}>Today</DateChip>
        <DateChip active={filterDate === yest} onClick={() => setFilterDate(yest)}>Yesterday</DateChip>
        <DatePicker value={filterDate} onChange={setFilterDate} placeholder="Pick a day" compact />
        {filterDate && <span className="text-[10px] text-emerald-400">{filterDate} only</span>}
      </motion.div>

      {/* 6 KPI tiles — modern card style */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile icon={<Banknote className="h-3.5 w-3.5" />}     label="Ad spend"   value={fmt(animSpend)}   accent="amber"  delay={0} />
        <KpiTile icon={<CircleDollarSign className="h-3.5 w-3.5" />} label="Revenue" value={fmt(animRevenue)} accent="sky"    delay={0.04} />
        <KpiTile icon={<Receipt className="h-3.5 w-3.5" />}      label="Expense"    value={fmt(animExpense)} accent="rose"   delay={0.08} hint="other ops costs" />
        <KpiTile icon={<DollarSign className="h-3.5 w-3.5" />}   label="Profit"     value={fmt(animProfit)}  accent={profitTone === 'rose' ? 'rose' : profitTone === 'emerald' ? 'emerald' : 'amber'} delay={0.12} hint="rev − spend − exp" />
        <KpiTile icon={<TrendingUp className="h-3.5 w-3.5" />}   label="Blended ROAS" value={animRoas > 0 ? `${animRoas.toFixed(2)}x` : '—'} accent={roasTone === 'rose' ? 'rose' : roasTone === 'emerald' ? 'emerald' : 'violet'} delay={0.16} />
        <KpiTile icon={animMargin < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />} label="Margin" value={agg.revenue > 0 ? `${animMargin.toFixed(0)}%` : '—'} accent={agg.margin < 0 ? 'rose' : 'emerald'} delay={0.2} />
      </div>

      {/* Log entry section */}
      <LogEntrySection
        funnelId={funnel.id}
        beroas={beroas}
        today={today}
        yest={yest}
        onSaved={refreshLogs}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Daily logs table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="rounded-xl border border-border bg-card overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-medium text-foreground">Daily log</h2>
          <span className="text-[11px] text-muted-foreground">{scopedLogs.length} {scopedLogs.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        {scopedLogs.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Wallet className="mx-auto h-7 w-7 text-muted-foreground/30" />
            <p className="mt-2 text-[12px] text-muted-foreground">No money logs {filterDate ? 'on this date' : 'yet'}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tracker-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Date</th>
                  <th style={{ textAlign: 'right' }}>Spend</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Expense</th>
                  <th style={{ textAlign: 'right' }}>Profit</th>
                  <th style={{ textAlign: 'right', width: 80 }}>ROAS</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {[...scopedLogs].sort((a, b) => b.date.localeCompare(a.date)).map((l) => {
                  const dailyRoas = l.spend > 0 ? l.revenue / l.spend : 0;
                  const win = dailyRoas > 0 && isWinning(dailyRoas, beroas);
                  return (
                    <tr key={l.id}>
                      <td><div className="px-3 py-2 text-[11px] tabular-nums text-foreground">{l.date}</div></td>
                      <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-amber-400">{fmt(l.spend)}</div></td>
                      <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-sky-400">{fmt(l.revenue)}</div></td>
                      <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-rose-400">{fmt(l.expense)}</div></td>
                      <td>
                        <div className={cn('px-3 py-2 text-right text-[11px] tabular-nums font-semibold', l.profit < 0 ? 'text-rose-400' : l.profit > 0 ? 'text-emerald-400' : 'text-muted-foreground')}>
                          {fmt(l.profit)}
                        </div>
                      </td>
                      <td>
                        <div className="px-3 py-2 text-right text-[11px] tabular-nums">
                          {dailyRoas > 0 ? (
                            <span className={cn('inline-flex items-center gap-1', win ? 'text-emerald-400 font-semibold' : 'text-foreground')}>
                              {win && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />}
                              {dailyRoas.toFixed(2)}x
                            </span>
                          ) : '—'}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center justify-end px-3 py-1.5">
                          <DeleteLogButton id={l.id} onDeleted={refreshLogs} onError={setError} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · stored USD, displayed in {currency} · performance metrics live in{' '}
        <Link href={`/funnels/${funnel.id}`} className="text-primary hover:text-primary/80">Funnels detail →</Link>
      </p>
    </PageTransition>
  );
}

// ── KPI tile with icon ──────────────────────────────────────────────────────

function KpiTile({ icon, label, value, hint, accent, delay = 0 }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent: 'amber' | 'sky' | 'emerald' | 'rose' | 'violet';
  delay?: number;
}) {
  const text = {
    amber: 'text-amber-400', sky: 'text-sky-400', emerald: 'text-emerald-400', rose: 'text-rose-400', violet: 'text-violet-400',
  }[accent];
  const border = {
    amber: 'border-amber-500/30', sky: 'border-sky-500/30', emerald: 'border-emerald-500/30', rose: 'border-rose-500/30', violet: 'border-violet-500/30',
  }[accent];
  const glow = {
    amber: '#fbbf24', sky: '#38bdf8', emerald: '#34d399', rose: '#fb7185', violet: '#a78bfa',
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

// ── Date chip ───────────────────────────────────────────────────────────────

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

// ── Log entry section — modern inputs with auto-profit ─────────────────────

function LogEntrySection({ funnelId, beroas, today, yest, onSaved }: {
  funnelId: string;
  beroas: number;
  today: string;
  yest: string;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(today);
  const [spend, setSpend] = useState('');
  const [revenue, setRevenue] = useState('');
  const [expense, setExpense] = useState('');
  const [profit, setProfit] = useState('');
  // Track whether user has manually edited profit. While false (and computable),
  // profit is auto-derived from revenue − spend − expense.
  const [profitTouched, setProfitTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const spendNum = parseFloat(spend) || 0;
  const revenueNum = parseFloat(revenue) || 0;
  const expenseNum = parseFloat(expense) || 0;
  const computedProfit = revenueNum - spendNum - expenseNum;
  // The actual profit value sent: user-typed if touched, else computed
  const profitNum = profitTouched ? (parseFloat(profit) || 0) : computedProfit;
  const profitDisplay = profitTouched ? profit : (revenueNum > 0 || spendNum > 0 || expenseNum > 0 ? computedProfit.toFixed(2) : '');

  const liveRoas = spendNum > 0 ? revenueNum / spendNum : 0;
  const liveMargin = revenueNum > 0 ? (profitNum / revenueNum) * 100 : 0;
  const liveWinning = isWinning(liveRoas, beroas);
  const hasInputs = spendNum > 0 || revenueNum > 0 || expenseNum > 0 || profitNum !== 0;

  const submit = async () => {
    if (!date) { setErr('Date is required.'); return; }
    if (!hasInputs) { setErr('Enter at least one money field.'); return; }
    try {
      setSaving(true);
      setErr(null);
      const res = await fetch('/api/funnels/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnelId, date,
          spend: spendNum,
          revenue: revenueNum,
          expense: expenseNum,
          profit: profitNum,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSpend(''); setRevenue(''); setExpense(''); setProfit(''); setNotes(''); setProfitTouched(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add log.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.18 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
            <Plus className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Log a day</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <DateChip active={date === today} onClick={() => setDate(today)}>Today</DateChip>
          <DateChip active={date === yest} onClick={() => setDate(yest)}>Yesterday</DateChip>
          <DatePicker value={date} onChange={(d) => setDate(d || today)} max={today} compact />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 px-5 py-5 md:grid-cols-2 xl:grid-cols-4">
        <MoneyInput label="Ad spend (USD)" value={spend} onChange={setSpend} tone="amber" />
        <MoneyInput label="Revenue (USD)"  value={revenue} onChange={setRevenue} tone="sky" />
        <MoneyInput label="Expense (USD)"  value={expense} onChange={setExpense} tone="rose" hint="other ops costs" />
        <MoneyInput
          label="Profit (USD)"
          value={profitDisplay}
          onChange={(v) => { setProfit(v); setProfitTouched(true); }}
          tone={computedProfit < 0 ? 'rose' : 'emerald'}
          allowNegative
          autoComputed={!profitTouched && (revenueNum > 0 || spendNum > 0 || expenseNum > 0)}
          onClear={() => { setProfit(''); setProfitTouched(false); }}
        />
      </div>

      {/* Live preview strip */}
      <div className="mx-5 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-4 py-2.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Live preview</span>
        <div className="flex flex-wrap items-center gap-3 text-[12px] tabular-nums">
          <span className="text-muted-foreground">
            ROAS{' '}
            <span className={cn('font-semibold', liveRoas > 0 ? (liveWinning ? 'text-emerald-400' : 'text-foreground') : 'text-muted-foreground/50')}>
              {liveRoas > 0 ? `${liveRoas.toFixed(2)}x` : '—'}
            </span>
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-muted-foreground">
            Margin{' '}
            <span className={cn('font-semibold', revenueNum > 0 ? (liveMargin < 0 ? 'text-rose-400' : 'text-foreground') : 'text-muted-foreground/50')}>
              {revenueNum > 0 ? `${liveMargin.toFixed(0)}%` : '—'}
            </span>
          </span>
          <span className="text-muted-foreground/40">·</span>
          {!hasInputs ? (
            <span className="text-[11px] text-muted-foreground/50">Enter values</span>
          ) : liveWinning ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" /> Winning
            </span>
          ) : beroas > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Below {(beroas + 1).toFixed(2)}x
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground/50">No BEROAS set</span>
          )}
        </div>
      </div>

      <div className="px-5 pb-5 space-y-2">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)…"
          className="form-input"
        />
        {err && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> <span>{err}</span>
          </div>
        )}
        <button
          onClick={submit}
          disabled={saving || !hasInputs}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 text-[13px] font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Add money log'}
        </button>
      </div>
    </motion.div>
  );
}

// ── Big money input ─────────────────────────────────────────────────────────

function MoneyInput({ label, value, onChange, tone, allowNegative, hint, autoComputed, onClear }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tone: 'amber' | 'sky' | 'emerald' | 'rose';
  allowNegative?: boolean;
  hint?: string;
  autoComputed?: boolean;
  onClear?: () => void;
}) {
  const accent = {
    amber:   { text: 'text-amber-400',   border: 'hover:border-amber-500/40   focus-within:border-amber-500/60',   bg: 'focus-within:bg-amber-500/[0.04]' },
    sky:     { text: 'text-sky-400',     border: 'hover:border-sky-500/40     focus-within:border-sky-500/60',     bg: 'focus-within:bg-sky-500/[0.04]' },
    emerald: { text: 'text-emerald-400', border: 'hover:border-emerald-500/40 focus-within:border-emerald-500/60', bg: 'focus-within:bg-emerald-500/[0.04]' },
    rose:    { text: 'text-rose-400',    border: 'hover:border-rose-500/40    focus-within:border-rose-500/60',    bg: 'focus-within:bg-rose-500/[0.04]' },
  }[tone];
  return (
    <div className={cn('group rounded-xl border border-border bg-background/40 p-4 transition-colors', accent.border, accent.bg)}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        {autoComputed && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400 hover:bg-emerald-500/20"
            title="Auto-computed from revenue − spend − expense. Click to override."
          >
            <Pencil className="h-2.5 w-2.5" /> auto
          </button>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={cn('text-xl font-semibold leading-none', accent.text)}>$</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={allowNegative ? undefined : 0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full bg-transparent text-[26px] font-semibold leading-none tabular-nums text-foreground outline-none placeholder:text-muted-foreground/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      {hint && <p className="mt-1.5 text-[9px] text-muted-foreground/60">{hint}</p>}
    </div>
  );
}

// ── Delete log button ───────────────────────────────────────────────────────

function DeleteLogButton({ id, onDeleted, onError }: { id: string; onDeleted: () => void; onError: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!confirm('Delete this log entry?')) return;
    try {
      setBusy(true);
      const r = await fetch('/api/funnels/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${r.status}`);
      }
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete log.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={remove} disabled={busy} className="rounded-md p-1 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
    </button>
  );
}
