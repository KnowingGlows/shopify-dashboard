'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, Receipt, Bookmark, Plus, X, Trash2, Pencil } from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { formatINR, formatUSD } from '@/lib/currency-converter';

interface CalcPreset {
  id: string;
  name: string;
  currency: 'USD' | 'INR';
  sellingPrice: string;
  costPrice: string;
  roas: string;
  deliveryRate: string;
  orders: string;
  // legacy fields tolerated when loading old presets
  margin?: string;
  adSpend?: string;
  numDays?: string;
  aov?: string;
}

const DEFAULTS = {
  sellingPrice: '0',
  costPrice: '0',
  roas: '0',
  deliveryRate: '0',
  orders: '0',
};
type State = typeof DEFAULTS;

export default function ProfitCalculatorPage() {
  const [currency, setCurrency] = useState<'USD' | 'INR'>('INR');
  const [presets, setPresets] = useState<CalcPreset[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState('');

  const [v, setV] = useState<State>(DEFAULTS);
  const set = <K extends keyof State>(k: K, val: State[K]) => setV((s) => ({ ...s, [k]: val }));

  useEffect(() => {
    fetch('/api/finance?action=presets')
      .then((r) => r.json())
      .then((d) => setPresets(d.presets ?? []))
      .catch(() => {});
  }, []);

  const applyPreset = useCallback((p: CalcPreset) => {
    if (p.currency) setCurrency(p.currency);
    setV({
      sellingPrice: String(p.sellingPrice ?? p.aov ?? DEFAULTS.sellingPrice),
      costPrice: String(p.costPrice ?? DEFAULTS.costPrice),
      roas: String(p.roas ?? DEFAULTS.roas),
      deliveryRate: String(p.deliveryRate ?? DEFAULTS.deliveryRate),
      orders: String(p.orders ?? DEFAULTS.orders),
    });
    setShowPresets(false);
  }, []);

  const saveCurrentAsPreset = async () => {
    if (!presetName.trim()) return;
    const preset = { name: presetName.trim(), currency, ...v };
    try {
      const res = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-preset', preset }) });
      const data = await res.json();
      if (data.preset) setPresets((prev) => [...prev, data.preset]);
      setPresetName('');
    } catch { /* ignore */ }
  };

  const deletePreset = async (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    try { await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-preset', id }) }); } catch { /* ignore */ }
  };

  const renamePreset = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    setPresets((prev) => prev.map((p) => p.id === id ? { ...p, name: newName.trim() } : p));
    setEditingPresetId(null);
    try { await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rename-preset', id, name: newName.trim() }) }); } catch { /* ignore */ }
  };

  const reset = () => setV(DEFAULTS);

  const fmt = (amount: number) => currency === 'USD' ? formatUSD(amount) : formatINR(amount);
  const sym = currency === 'INR' ? '₹' : '$';
  const num = (s: string) => parseFloat(s) || 0;

  // ── Per-order economics (generic model — no 3PL fees/GST) ──────────────
  const sp = num(v.sellingPrice);
  const cogs = num(v.costPrice);
  const roasVal = num(v.roas);
  const d = Math.min(1, Math.max(0, num(v.deliveryRate) / 100));
  const rto = 1 - d;
  const ad = roasVal > 0 ? sp / roasVal : 0;        // ad spend / order = price ÷ ROAS

  // A delivered order earns its margin; an undelivered (RTO) order returns its
  // unit to stock (COGS recovered) but the ad spend on it is gone regardless.
  const deliveredProfitPre = sp - cogs;             // per delivered order, before ads
  const blendedPre = d * deliveredProfitPre;        // RTO contributes 0 pre-ad
  const netPerShipped = blendedPre - ad;            // net / shipped order, after ads
  const simpleNet = deliveredProfitPre - ad;        // net / order @ 100% delivery
  const rtoDragPerOrder = rto * deliveredProfitPre; // margin lost to undelivered orders

  const baseMargin = sp > 0 ? (sp - cogs) / sp : 0;
  const effMargin = baseMargin * d;
  const beroas = blendedPre > 0 ? sp / blendedPre : NaN;

  // ── Batch totals (for the order count you enter) ───────────────────────
  const qty = Math.max(0, num(v.orders));
  const shipped = qty;
  const delivered = qty * d;
  const rtoOrders = qty * rto;
  const shopifyRevenue = shipped * sp;              // booked on Shopify (all orders)
  const moneyIn = delivered * sp;                   // collected — delivered only
  const outCOGS = shipped * cogs;                   // product cost on every unit shipped
  const stockRecovered = rtoOrders * cogs;          // RTO units back to inventory
  const outAds = shipped * ad;
  const moneyOut = outCOGS - stockRecovered + outAds;
  const netProfit = moneyIn - moneyOut;
  const netMarginPct = moneyIn > 0 ? (netProfit / moneyIn) * 100 : 0;
  const grossProfit = netProfit + outAds;           // everything except ad spend
  const grossMarginPct = moneyIn > 0 ? (grossProfit / moneyIn) * 100 : 0;
  const roiOnAd = outAds > 0 ? (netProfit / outAds) * 100 : 0;

  const flowRows = [
    { label: 'Product cost (COGS) — all units', amount: outCOGS },
    { label: 'RTO stock recovered (back to inventory)', amount: -stockRecovered },
    { label: 'Ad spend', amount: outAds },
  ].filter((r) => Math.abs(r.amount) > 0.5).sort((a, b) => b.amount - a.amount);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header — same as the 3PL Calculator */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Profit Calculator</h1>
          <p className="text-[11px] text-muted-foreground">Per-order profit, margins &amp; ROI on ad spend</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
            <button onClick={() => setCurrency('INR')} className={`px-3 py-1.5 text-[11px] font-semibold transition ${currency === 'INR' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>₹ INR</button>
            <button onClick={() => setCurrency('USD')} className={`px-3 py-1.5 text-[11px] font-semibold transition ${currency === 'USD' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>$ USD</button>
          </div>
          <button onClick={() => setShowPresets(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground hover:bg-accent/30">
            <Bookmark className="h-3.5 w-3.5" /> Presets {presets.length > 0 && <span className="text-primary">({presets.length})</span>}
          </button>
          <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground hover:bg-accent/30">Reset</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Calculator card ───────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Calculator className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Profit Calculator</h2>
              <p className="text-[10px] text-muted-foreground">Enter your numbers — per-order &amp; batch profit</p>
            </div>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CalcField label={`Selling Price (incl. shipping) — ${sym}`}>
                <input type="text" inputMode="decimal" value={v.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} onFocus={(e) => e.currentTarget.select()} className="form-input" />
              </CalcField>
              <CalcField label={`Cost of Product — ${sym}`}>
                <input type="text" inputMode="decimal" value={v.costPrice} onChange={(e) => set('costPrice', e.target.value)} onFocus={(e) => e.currentTarget.select()} className="form-input" />
              </CalcField>
              <CalcField label="ROAS" hint="ad spend = price ÷ ROAS">
                <input type="text" inputMode="decimal" value={v.roas} onChange={(e) => set('roas', e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="Delivery Rate %" hint="rest is RTO">
                <input type="text" inputMode="decimal" value={v.deliveryRate} onChange={(e) => set('deliveryRate', e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="Orders">
                <input type="text" inputMode="decimal" value={v.orders} onChange={(e) => set('orders', e.target.value)} onFocus={(e) => e.currentTarget.select()} className="form-input" />
              </CalcField>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-1.5">
              <ResultRow label="Breakeven ROAS (BEROAS)" value={Number.isFinite(beroas) ? `${beroas.toFixed(2)}x` : '—'} />
              <ResultRow label="Ad spend / order" value={fmt(ad)} />
              <ResultRow label="Shopify revenue (all orders booked)" value={fmt(shopifyRevenue)} />
              <ResultRow label="Delivered revenue (collected)" value={fmt(moneyIn)} />
              <ResultRow label="Gross profit (excl. ad spend)" value={`${fmt(grossProfit)} · ${grossMarginPct.toFixed(1)}%`} />
              <ResultRow label="ROI on ad spend" value={`${roiOnAd.toFixed(0)}%`} />
              <ResultRow label="Net profit / order" value={fmt(netPerShipped)} highlight="primary" />
              <ResultRow label="Net profit (final)" value={`${fmt(netProfit)} · ${netMarginPct.toFixed(1)}%`} highlight="success" />
            </div>

            <div className="stat-shimmer glow-pulse rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center"
              style={{ '--glow-color': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}>
              <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Net Profit</p>
              <p className={`relative z-10 text-4xl font-bold font-mono ${netProfit >= 0 ? 'gradient-text-emerald' : 'text-rose-400'}`}>{fmt(netProfit)}</p>
              <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">{grossMarginPct.toFixed(1)}% gross margin</p>
            </div>
          </div>
        </motion.div>

        {/* ── Breakdown card ────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Receipt className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Cost Breakdown</h2>
              <p className="text-[10px] text-muted-foreground">Where every rupee goes &amp; per-order economics</p>
            </div>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            {/* Net profit / order — prominent */}
            <div className="rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Net profit / order</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">delivery-blended, after ad spend</p>
                </div>
                <p className={`font-mono text-[22px] font-bold tabular-nums ${netPerShipped >= 0 ? 'text-primary' : 'text-rose-400'}`}>{fmt(netPerShipped)}</p>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-1.5">
              {flowRows.map((r) => {
                const credit = r.amount < 0;
                const share = moneyOut > 0 ? (Math.abs(r.amount) / moneyOut) * 100 : 0;
                return (
                  <ResultRow key={r.label} label={`${r.label} · ${share.toFixed(0)}%`} value={`${credit ? '+ ' : ''}${fmt(Math.abs(r.amount))}`} />
                );
              })}
              <ResultRow label="Total money out" value={fmt(moneyOut)} highlight="primary" />
            </div>

            <div className="h-px bg-border" />

            {/* Per-order economics */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground">Per order <span className="normal-case tracking-normal font-normal text-muted-foreground/60">(one shipped order)</span></p>
              <div className="space-y-1.5">
                <ResultRow label="Selling price" value={fmt(sp)} />
                <ResultRow label="− Product cost (COGS)" value={`− ${fmt(cogs)}`} />
                <ResultRow label="− Ad spend (price ÷ ROAS)" value={`− ${fmt(ad)}`} />
                <ResultRow label="− RTO drag (margin lost to undelivered)" value={`− ${fmt(rtoDragPerOrder)}`} />
                <ResultRow label="Net / order @ 100% delivery" value={fmt(simpleNet)} />
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Margin reference */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground">Margin</p>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 rounded-lg border border-border bg-background/40 p-4 text-[13px]">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Product margin</span><span className="font-mono font-semibold tabular-nums text-foreground">{(baseMargin * 100).toFixed(1)}%</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">After delivery rate</span><span className="font-mono font-semibold tabular-nums text-foreground">{(effMargin * 100).toFixed(1)}%</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Delivered orders</span><span className="font-mono font-semibold tabular-nums text-foreground">{Math.round(delivered).toLocaleString('en-IN')}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">RTO orders</span><span className="font-mono font-semibold tabular-nums text-foreground">{Math.round(rtoOrders).toLocaleString('en-IN')}</span></div>
              </div>
              <p className="mt-2.5 text-[11px] text-muted-foreground/70">
                Net / order @ 100% delivery would be <span className="font-medium text-foreground">{fmt(simpleNet)}</span>.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Presets Modal — same as the 3PL Calculator */}
      <AnimatePresence>
        {showPresets && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPresets(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
                <div className="flex items-center gap-2"><Bookmark className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Brand Presets</h2></div>
                <button onClick={() => setShowPresets(false)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition"><X className="h-4 w-4" /></button>
              </div>

              <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">Save Current Values</p>
                  <div className="flex gap-2">
                    <input type="text" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. Kairova, Mavric..." onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsPreset()}
                      className="flex-1 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none transition" />
                    <button onClick={saveCurrentAsPreset} disabled={!presetName.trim()} className="rounded-lg bg-primary/15 px-3 py-2 text-[11px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                {presets.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">Saved Presets</p>
                    <div className="space-y-1.5">
                      {presets.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2.5 group">
                          {editingPresetId === p.id ? (
                            <input autoFocus value={editingPresetName} onChange={(e) => setEditingPresetName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') renamePreset(p.id, editingPresetName); if (e.key === 'Escape') setEditingPresetId(null); }}
                              onBlur={() => renamePreset(p.id, editingPresetName)}
                              className="flex-1 rounded border border-primary/30 bg-transparent px-2 py-0.5 text-[12px] text-foreground focus:outline-none" />
                          ) : (
                            <button onClick={() => applyPreset(p)} className="flex-1 text-left min-w-0">
                              <p className="text-[12px] font-medium text-foreground truncate">{p.name}</p>
                              <p className="text-[10px] text-muted-foreground/60">
                                SP {p.currency === 'INR' ? '₹' : '$'}{p.sellingPrice ?? p.aov} · CP {p.currency === 'INR' ? '₹' : '$'}{p.costPrice} · ROAS {p.roas} · DR {p.deliveryRate}%{p.orders ? ` · ${p.orders} orders` : ''}
                              </p>
                            </button>
                          )}
                          {editingPresetId !== p.id && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); setEditingPresetId(p.id); setEditingPresetName(p.name); }} className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:text-primary transition"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deletePreset(p.id)} className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:text-red-400 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {presets.length === 0 && (
                  <div className="text-center py-6">
                    <Bookmark className="h-6 w-6 mx-auto text-muted-foreground/20 mb-2" />
                    <p className="text-[12px] text-muted-foreground/50">No presets saved yet</p>
                    <p className="text-[10px] text-muted-foreground/30 mt-1">Set your calculator values and save them as a brand preset</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

function CalcField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {hint && <span className="ml-1 normal-case tracking-normal text-muted-foreground/50">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: 'primary' | 'success' }) {
  return (
    <div className={`result-row-glow flex items-center justify-between rounded-lg px-3 py-2.5 ${
      highlight === 'primary' ? 'bg-primary/5 border border-primary/15' :
      highlight === 'success' ? 'bg-emerald-500/5 border border-emerald-500/15' :
      ''
    }`}>
      <span className="relative z-10 text-[12px] text-muted-foreground">{label}</span>
      <span className={`relative z-10 text-[13px] font-semibold font-mono ${
        highlight === 'primary' ? 'text-primary' :
        highlight === 'success' ? 'text-emerald-400' :
        'text-foreground'
      }`}>{value}</span>
    </div>
  );
}
