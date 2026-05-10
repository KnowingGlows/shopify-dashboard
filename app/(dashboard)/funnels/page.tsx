'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Funnel as FunnelIcon, Plus, Trash2, Check, X, Loader2,
  AlertTriangle, ChevronDown, ChevronRight, Globe,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { DatePicker } from '@/components/date-picker';
import { cn } from '@/lib/utils';
import { MARKETS, getLanguagesForCountry, getCountries } from '@/lib/markets';
import { beroasFor, marginFor, isWinning, aggregateLogs, hitRate } from '@/lib/funnels';
import { formatFromUSD, type SupportedCurrency, type UsdRates } from '@/lib/currency-converter';
import type { Funnel, FunnelDailyLog, FunnelStatus } from '@/types/funnel';
import type { FxRates } from '@/lib/fx-rates';

const STATUS_OPTIONS: Array<{ value: FunnelStatus; label: string }> = [
  { value: 'draft',   label: 'Draft' },
  { value: 'testing', label: 'Testing' },
  { value: 'live',    label: 'Live' },
  { value: 'paused',  label: 'Paused' },
  { value: 'killed',  label: 'Killed' },
];

function getISTDate(date?: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date ?? new Date());
}

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

export default function FunnelsPage() {
  const { user } = useAuth();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [logsByFunnel, setLogsByFunnel] = useState<Record<string, FunnelDailyLog[]>>({});
  const [fx, setFx] = useState<FxRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');

  // Filters
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'product' | 'country' | 'flat'>('product');

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Initial load
  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [funnelsRes, fxRes] = await Promise.all([
        fetch('/api/funnels').then((r) => r.json()),
        fetch('/api/fx').then((r) => r.json()),
      ]);
      const list: Funnel[] = funnelsRes.funnels ?? [];
      setFunnels(list);
      setFx(fxRes ?? null);

      // Eager-load logs for each funnel so KPIs and Win badges render immediately.
      // For now this is N+1 but fine for the expected funnel count.
      const logsRes = await Promise.all(
        list.map((f) => fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(f.id)}`).then((r) => r.json()))
      );
      const map: Record<string, FunnelDailyLog[]> = {};
      list.forEach((f, i) => { map[f.id] = logsRes[i]?.logs ?? []; });
      setLogsByFunnel(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load funnels.');
    } finally {
      setLoading(false);
    }
  };

  const refreshLogs = async (funnelId: string) => {
    try {
      const res = await fetch(`/api/funnels/logs?funnelId=${encodeURIComponent(funnelId)}`);
      const data = await res.json();
      setLogsByFunnel((prev) => ({ ...prev, [funnelId]: data.logs ?? [] }));
    } catch { /* ignore */ }
  };

  const rates: UsdRates = fx?.rates ?? { USD: 1, EUR: 0.92, INR: 83.5 };
  const fmt = (usd: number) => formatFromUSD(usd, currency, rates);

  // ── Derived data ─────────────────────────────────────────────────────────
  const productOptions = useMemo(() => {
    return Array.from(new Set(funnels.map((f) => f.productName).filter(Boolean))).sort();
  }, [funnels]);

  const filtered = useMemo(() => {
    return funnels.filter((f) => {
      if (filterProduct !== 'all' && f.productName !== filterProduct) return false;
      if (filterCountry !== 'all' && f.country !== filterCountry) return false;
      if (filterStatus !== 'all' && f.status !== filterStatus) return false;
      return true;
    });
  }, [funnels, filterProduct, filterCountry, filterStatus]);

  // Grouping
  const grouped = useMemo<Array<{ key: string; label: string; rows: Funnel[] }>>(() => {
    if (groupBy === 'flat') return [{ key: 'all', label: '', rows: filtered }];
    const map = new Map<string, Funnel[]>();
    filtered.forEach((f) => {
      const key = groupBy === 'product' ? f.productName : f.country;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => ({ key, label: key || '(unspecified)', rows }));
  }, [filtered, groupBy]);

  // KPIs across visible (filtered) funnels
  const liveCount = filtered.filter((f) => f.status === 'live').length;
  const summary = useMemo(() => {
    let totalSpend = 0, totalRevenue = 0;
    const winRows: Array<{ roas: number; beroas: number }> = [];
    filtered.forEach((f) => {
      const logs = logsByFunnel[f.id] ?? [];
      const agg = aggregateLogs(logs);
      totalSpend += agg.totalSpend;
      totalRevenue += agg.totalRevenue;
      winRows.push({ roas: agg.blendedRoas, beroas: beroasFor(f) });
    });
    const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    return {
      totalSpend,
      totalRevenue,
      blendedRoas,
      hitRate: hitRate(winRows),
    };
  }, [filtered, logsByFunnel]);

  const animatedSpend = useCountUp(summary.totalSpend);
  const animatedRoas = useCountUp(summary.blendedRoas, 500);
  const animatedHit = useCountUp(summary.hitRate, 500);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleAddFunnel = async (input: NewFunnelInput) => {
    try {
      const res = await fetch('/api/funnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setFunnels((prev) => [data.funnel, ...prev]);
      setLogsByFunnel((prev) => ({ ...prev, [data.funnel.id]: [] }));
      setShowAddModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add funnel.');
    }
  };

  const updateFunnel = async (id: string, patch: Partial<Funnel>) => {
    try {
      const res = await fetch('/api/funnels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setFunnels((prev) => prev.map((f) => (f.id === id ? { ...f, ...data.funnel } : f)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update funnel.');
    }
  };

  const deleteFunnel = async (id: string) => {
    if (!confirm('Delete this funnel and all its logs?')) return;
    try {
      const res = await fetch('/api/funnels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setFunnels((prev) => prev.filter((f) => f.id !== id));
      setLogsByFunnel((prev) => {
        const next = { ...prev }; delete next[id]; return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete funnel.');
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <FunnelIcon className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Funnels</h1>
            <p className="text-[11px] text-muted-foreground">
              International funnel tracking · {liveCount} live
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Currency toggle */}
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
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/25"
          >
            <Plus className="h-3.5 w-3.5" /> Add Funnel
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <KpiTile label="Live funnels" value={liveCount.toLocaleString('en-IN')} accent="emerald" delay={0} />
        <KpiTile label="Hit rate" value={`${animatedHit.toFixed(0)}%`} hint="ROAS ≥ BEROAS+1" accent="violet" delay={0.06} />
        <KpiTile label="Blended ROAS" value={animatedRoas.toFixed(2) + 'x'} accent="sky" delay={0.12} />
        <KpiTile label="Total spend" value={fmt(animatedSpend)} accent="amber" delay={0.18} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterProduct}
          onChange={(e) => setFilterProduct(e.target.value)}
          className="form-input py-1.5 text-[12px] w-44"
        >
          <option value="all">All products</option>
          {productOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filterCountry}
          onChange={(e) => setFilterCountry(e.target.value)}
          className="form-input py-1.5 text-[12px] w-44"
        >
          <option value="all">All countries</option>
          {getCountries().map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="form-input py-1.5 text-[12px] w-36"
        >
          <option value="all">All status</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div className="ml-auto inline-flex items-center rounded-md border border-border bg-card p-0.5">
          {(['product', 'country', 'flat'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupBy(g)}
              className={cn(
                'rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors',
                groupBy === g ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {g === 'product' ? 'By product' : g === 'country' ? 'By country' : 'Flat'}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/70 hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <FunnelIcon className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-[13px] font-medium text-foreground">
            {funnels.length === 0 ? 'No funnels yet' : 'No funnels match your filters'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {funnels.length === 0
              ? 'Click "Add Funnel" to register your first funnel.'
              : 'Try adjusting the filters above.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.key} className="space-y-2">
              {group.label && (
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                  {group.label} · {group.rows.length}
                </p>
              )}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="tracker-table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}></th>
                      <th>Product</th>
                      <th style={{ width: 160 }}>Market</th>
                      <th style={{ width: 110 }}>Status</th>
                      <th style={{ width: 90, textAlign: 'right' }}>BEROAS</th>
                      <th style={{ width: 90, textAlign: 'right' }}>ROAS</th>
                      <th style={{ width: 100 }}>Win</th>
                      <th style={{ width: 110 }}>Last log</th>
                      <th style={{ width: 90, textAlign: 'right' }}>&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((f) => {
                      const logs = logsByFunnel[f.id] ?? [];
                      const agg = aggregateLogs(logs);
                      const beroas = beroasFor(f);
                      const winning = isWinning(agg.blendedRoas, beroas);
                      const isOpen = expanded.has(f.id);
                      return (
                        <FunnelRow
                          key={f.id}
                          funnel={f}
                          logs={logs}
                          agg={agg}
                          beroas={beroas}
                          winning={winning}
                          isOpen={isOpen}
                          onToggle={() => toggleExpand(f.id)}
                          onDelete={() => deleteFunnel(f.id)}
                          onUpdate={(patch) => updateFunnel(f.id, patch)}
                          onLogsChanged={() => refreshLogs(f.id)}
                          fmt={fmt}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Logged in as {user?.email ?? '—'} · {fx?.source === 'live' ? 'live FX' : fx?.source === 'cache' ? 'cached FX' : fx?.source === 'fallback' ? 'fallback FX' : 'FX loading'} · stored in USD, displayed in {currency}
      </p>

      {showAddModal && (
        <AddFunnelModal
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddFunnel}
        />
      )}
    </PageTransition>
  );
}

// ── KPI tile ────────────────────────────────────────────────────────────────

function KpiTile({
  label, value, hint, accent, delay = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: 'emerald' | 'amber' | 'sky' | 'violet';
  delay?: number;
}) {
  const map = {
    emerald: { text: 'text-emerald-400', border: 'border-emerald-500/30', glow: '#34d399', dot: 'bg-emerald-400' },
    amber:   { text: 'text-amber-400',   border: 'border-amber-500/30',   glow: '#fbbf24', dot: 'bg-amber-400' },
    sky:     { text: 'text-sky-400',     border: 'border-sky-500/30',     glow: '#38bdf8', dot: 'bg-sky-400' },
    violet:  { text: 'text-violet-400',  border: 'border-violet-500/30',  glow: '#a78bfa', dot: 'bg-violet-400' },
  };
  const c = map[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3, boxShadow: `0 14px 40px -16px ${c.glow}55, 0 0 0 1px ${c.glow}33` }}
      className={cn('group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors', c.border)}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: `radial-gradient(circle, ${c.glow}66, transparent 70%)` }}
        aria-hidden
      />
      <div className="relative z-10 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} aria-hidden />
      </div>
      <p className={cn('relative z-10 mt-2 text-[26px] font-semibold leading-none tabular-nums tracking-tight', c.text)}>
        {value}
      </p>
      {hint && <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </motion.div>
  );
}

// ── Funnel row + expanded daily log ─────────────────────────────────────────

function FunnelRow({
  funnel: f,
  logs,
  agg,
  beroas,
  winning,
  isOpen,
  onToggle,
  onDelete,
  onUpdate,
  onLogsChanged,
  fmt,
}: {
  funnel: Funnel;
  logs: FunnelDailyLog[];
  agg: ReturnType<typeof aggregateLogs>;
  beroas: number;
  winning: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<Funnel>) => void;
  onLogsChanged: () => void;
  fmt: (usd: number) => string;
}) {
  return (
    <>
      <tr>
        <td>
          <button onClick={onToggle} className="px-2 py-2 text-muted-foreground transition hover:text-foreground">
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>
        <td>
          <div className="px-3 py-2">
            <p className="text-[13px] font-medium text-foreground">{f.productName}</p>
            {f.funnelishUrl && (
              <a
                href={f.funnelishUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
              >
                <Globe className="h-3 w-3" /> Funnelish ↗
              </a>
            )}
          </div>
        </td>
        <td>
          <div className="px-3 py-2 text-[12px]">
            <p className="text-foreground">{f.country}</p>
            <p className="text-[10px] text-muted-foreground">{f.language}</p>
          </div>
        </td>
        <td>
          <select
            value={f.status}
            onChange={(e) => onUpdate({ status: e.target.value as FunnelStatus })}
            className="tracker-select text-[12px]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </td>
        <td>
          <div className="px-3 py-2 text-right tabular-nums text-[12px] text-foreground">
            {Number.isFinite(beroas) ? `${beroas.toFixed(2)}x` : '—'}
          </div>
        </td>
        <td>
          <div className="px-3 py-2 text-right tabular-nums text-[12px] text-foreground">
            {agg.blendedRoas > 0 ? `${agg.blendedRoas.toFixed(2)}x` : '—'}
          </div>
        </td>
        <td>
          <div className="px-3 py-2">
            {agg.totalSpend === 0 ? (
              <span className="text-[10px] text-muted-foreground/60">no logs</span>
            ) : winning ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Winning
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Below
              </span>
            )}
          </div>
        </td>
        <td>
          <div className="px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
            {agg.lastLogDate || '—'}
          </div>
        </td>
        <td>
          <div className="flex items-center justify-end gap-1 px-3 py-1.5">
            <button onClick={onDelete}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      <AnimatePresence initial={false}>
        {isOpen && (
          <tr>
            <td colSpan={9} style={{ padding: 0 }}>
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden border-t border-border bg-background/40"
              >
                <DailyLogsSection funnel={f} logs={logs} onLogsChanged={onLogsChanged} fmt={fmt} />
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Daily logs section (inside expanded row) ────────────────────────────────

function DailyLogsSection({
  funnel,
  logs,
  onLogsChanged,
  fmt,
}: {
  funnel: Funnel;
  logs: FunnelDailyLog[];
  onLogsChanged: () => void;
  fmt: (usd: number) => string;
}) {
  const [date, setDate] = useState(getISTDate());
  const [spend, setSpend] = useState('');
  const [revenue, setRevenue] = useState('');
  const [profit, setProfit] = useState('');
  const [orders, setOrders] = useState('');
  const [roas, setRoas] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Auto-compute ROAS when spend & revenue both present
  useEffect(() => {
    const s = parseFloat(spend);
    const r = parseFloat(revenue);
    if (Number.isFinite(s) && s > 0 && Number.isFinite(r)) {
      setRoas((r / s).toFixed(2));
    }
  }, [spend, revenue]);

  const margin = marginFor(funnel);
  const beroas = beroasFor(funnel);

  const addLog = async () => {
    if (!date) { setErr('Date is required.'); return; }
    if (!spend && !revenue && !profit && !orders) { setErr('Enter at least one metric.'); return; }
    try {
      setSaving(true);
      setErr(null);
      const res = await fetch('/api/funnels/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnelId: funnel.id,
          date,
          spend: parseFloat(spend) || 0,
          revenue: parseFloat(revenue) || 0,
          profit: parseFloat(profit) || 0,
          orders: parseInt(orders, 10) || 0,
          roas: parseFloat(roas) || 0,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSpend(''); setRevenue(''); setProfit(''); setOrders(''); setRoas(''); setNotes('');
      onLogsChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add log.');
    } finally {
      setSaving(false);
    }
  };

  const removeLog = async (id: string) => {
    if (!confirm('Delete this log entry?')) return;
    try {
      const res = await fetch('/api/funnels/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      onLogsChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete log.');
    }
  };

  return (
    <div className="space-y-3 px-5 py-4">
      {/* Pricing summary */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-[11px]">
        <PricingCell label="Selling price" value={fmt(funnel.sellingPrice)} />
        <PricingCell label="Cost" value={fmt(funnel.costPrice)} />
        <PricingCell label="Margin" value={`${(margin * 100).toFixed(1)}%`} />
        <PricingCell label="BEROAS" value={Number.isFinite(beroas) ? `${beroas.toFixed(2)}x` : '—'} />
      </div>

      {/* Add log inline form */}
      <div className="rounded-lg border border-border bg-card/60 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Plus className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-medium text-foreground">Log a day</span>
          {err && <span className="ml-auto text-[10px] text-destructive">{err}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
          <div className="md:col-span-1">
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground">Date</label>
            <DatePicker value={date} onChange={(d) => setDate(d || getISTDate())} max={getISTDate()} compact />
          </div>
          <FormCell label="Spend (USD)">
            <input type="number" min="0" inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} className="form-input tabular-nums" placeholder="0" />
          </FormCell>
          <FormCell label="Revenue (USD)">
            <input type="number" min="0" inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} className="form-input tabular-nums" placeholder="0" />
          </FormCell>
          <FormCell label="Profit (USD)">
            <input type="number" inputMode="decimal" value={profit} onChange={(e) => setProfit(e.target.value)} className="form-input tabular-nums" placeholder="0" />
          </FormCell>
          <FormCell label="Orders">
            <input type="number" min="0" inputMode="numeric" value={orders} onChange={(e) => setOrders(e.target.value)} className="form-input tabular-nums" placeholder="0" />
          </FormCell>
          <FormCell label="ROAS (Meta)">
            <input type="number" min="0" inputMode="decimal" step="0.01" value={roas} onChange={(e) => setRoas(e.target.value)} className="form-input tabular-nums" placeholder="auto" />
          </FormCell>
          <div className="flex items-end">
            <button
              onClick={addLog}
              disabled={saving}
              className="inline-flex h-[34px] w-full items-center justify-center gap-1 rounded-lg bg-primary/15 text-[12px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
            </button>
          </div>
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)…"
          className="form-input mt-2 text-[11px]"
        />
      </div>

      {/* Logs table */}
      {logs.length === 0 ? (
        <p className="px-1 py-3 text-[11px] text-muted-foreground/60">No logs yet — add the first day above.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="tracker-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Date</th>
                <th style={{ textAlign: 'right' }}>Spend</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
                <th style={{ textAlign: 'right' }}>Profit</th>
                <th style={{ textAlign: 'right', width: 70 }}>Orders</th>
                <th style={{ textAlign: 'right', width: 80 }}>ROAS</th>
                <th style={{ width: 60 }}>Win</th>
                <th>Notes</th>
                <th style={{ width: 50, textAlign: 'right' }}>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const win = isWinning(l.roas, beroas);
                return (
                  <tr key={l.id}>
                    <td><div className="px-3 py-2 text-[11px] tabular-nums text-foreground">{l.date}</div></td>
                    <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-foreground">{fmt(l.spend)}</div></td>
                    <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-foreground">{fmt(l.revenue)}</div></td>
                    <td>
                      <div className={cn('px-3 py-2 text-right text-[11px] tabular-nums', l.profit < 0 ? 'text-rose-400' : 'text-emerald-400')}>
                        {fmt(l.profit)}
                      </div>
                    </td>
                    <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-foreground">{l.orders}</div></td>
                    <td><div className="px-3 py-2 text-right text-[11px] tabular-nums text-foreground">{l.roas > 0 ? `${l.roas.toFixed(2)}x` : '—'}</div></td>
                    <td>
                      <div className="px-3 py-2">
                        {l.spend === 0 ? <span className="text-[10px] text-muted-foreground/60">—</span> : win
                          ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" title="Winning" />
                          : <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" title="Below threshold" />}
                      </div>
                    </td>
                    <td><div className="px-3 py-2 text-[11px] text-muted-foreground truncate max-w-[200px]">{l.notes || '—'}</div></td>
                    <td>
                      <div className="flex items-center justify-end px-3 py-1.5">
                        <button onClick={() => removeLog(l.id)} className="rounded-md p-1 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {funnel.notes && (
        <p className="text-[10px] text-muted-foreground/70">Funnel notes: {funnel.notes}</p>
      )}
    </div>
  );
}

function FormCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function PricingCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/60 px-3 py-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

// ── Add Funnel modal ────────────────────────────────────────────────────────

type NewFunnelInput = {
  productName: string;
  country: string;
  language: string;
  funnelishUrl: string;
  status: FunnelStatus;
  launchDate: string;
  sellingPrice: number;
  costPrice: number;
  deliveryRate: number;
  notes: string;
};

function AddFunnelModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: NewFunnelInput) => Promise<void>;
}) {
  const [productName, setProductName] = useState('');
  const [country, setCountry] = useState('Ireland');
  const [language, setLanguage] = useState('English');
  const [funnelishUrl, setFunnelishUrl] = useState('');
  const [status, setStatus] = useState<FunnelStatus>('draft');
  const [launchDate, setLaunchDate] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [deliveryRate, setDeliveryRate] = useState('95');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const langs = getLanguagesForCountry(country);
  useEffect(() => {
    if (langs.length > 0 && !langs.includes(language)) setLanguage(langs[0]);
  }, [country, langs, language]);

  // Live preview of margin & BEROAS
  const sp = parseFloat(sellingPrice) || 0;
  const cp = parseFloat(costPrice) || 0;
  const dr = parseFloat(deliveryRate) || 0;
  const margin = sp > 0 ? ((sp - cp) / sp) * (dr / 100) : 0;
  const beroas = margin > 0 ? 1 / margin : 0;

  const submit = async () => {
    if (!productName.trim()) { setErr('Product name is required.'); return; }
    if (!country) { setErr('Country is required.'); return; }
    if (!language) { setErr('Language is required.'); return; }
    setErr(null);
    setSaving(true);
    try {
      await onSubmit({
        productName: productName.trim(),
        country,
        language,
        funnelishUrl: funnelishUrl.trim(),
        status,
        launchDate,
        sellingPrice: sp,
        costPrice: cp,
        deliveryRate: dr,
        notes: notes.trim(),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add funnel.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 w-full max-w-xl mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Add Funnel</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          <FormCell label="Product name">
            <input value={productName} onChange={(e) => setProductName(e.target.value)} className="form-input" placeholder="e.g. EMS Booty Trainer" autoFocus />
          </FormCell>

          <div className="grid grid-cols-2 gap-3">
            <FormCell label="Country">
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="form-input">
                {[1, 2, 3, 4].map((phase) => (
                  <optgroup key={phase} label={`Phase ${phase}`}>
                    {MARKETS.filter((m) => m.phase === phase).map((m) => (
                      <option key={m.country} value={m.country}>{m.country}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </FormCell>
            <FormCell label="Language">
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="form-input">
                {langs.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormCell>
          </div>

          <FormCell label="Funnelish URL (optional)">
            <input value={funnelishUrl} onChange={(e) => setFunnelishUrl(e.target.value)} className="form-input" placeholder="https://…" />
          </FormCell>

          <div className="grid grid-cols-2 gap-3">
            <FormCell label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as FunnelStatus)} className="form-input">
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </FormCell>
            <FormCell label="Launch date (optional)">
              <DatePicker value={launchDate} onChange={(d) => setLaunchDate(d)} />
            </FormCell>
          </div>

          {/* Pricing for BEROAS */}
          <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-primary/80">
              Pricing (USD) — drives BEROAS
            </p>
            <div className="grid grid-cols-3 gap-2">
              <FormCell label="Selling price">
                <input type="number" min="0" inputMode="decimal" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="form-input tabular-nums" placeholder="0" />
              </FormCell>
              <FormCell label="Cost price">
                <input type="number" min="0" inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="form-input tabular-nums" placeholder="0" />
              </FormCell>
              <FormCell label="Delivery rate %">
                <input type="number" min="0" max="100" inputMode="decimal" value={deliveryRate} onChange={(e) => setDeliveryRate(e.target.value)} className="form-input tabular-nums" />
              </FormCell>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-md border border-border bg-background/40 px-3 py-1.5">
                <span className="text-muted-foreground">Margin: </span>
                <span className="font-semibold tabular-nums text-foreground">{(margin * 100).toFixed(1)}%</span>
              </div>
              <div className="rounded-md border border-border bg-background/40 px-3 py-1.5">
                <span className="text-muted-foreground">BEROAS: </span>
                <span className="font-semibold tabular-nums text-primary">{beroas > 0 ? `${beroas.toFixed(2)}x` : '—'}</span>
              </div>
            </div>
          </div>

          <FormCell label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="form-input" />
          </FormCell>

          {err && <p className="text-[11px] text-destructive">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/50 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-1.5 text-[12px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Create funnel
          </button>
        </div>
      </motion.div>
    </div>
  );
}
