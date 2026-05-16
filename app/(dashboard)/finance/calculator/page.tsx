'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, Percent, Bookmark, Plus, X, Trash2, Pencil, Package, Truck, CreditCard, Receipt, Boxes, Landmark } from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { formatINR, formatUSD } from '@/lib/currency-converter';

interface CalcPreset {
  id: string;
  name: string;
  currency: 'USD' | 'INR';
  margin: string;
  adSpend: string;
  roas: string;
  numDays: string;
  sellingPrice: string;
  costPrice: string;
  deliveryRate: string;
  aov?: string;
}

export default function ProfitCalculatorPage() {
  const [currency, setCurrency] = useState<'USD' | 'INR'>('USD');
  const [presets, setPresets] = useState<CalcPreset[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState('');

  // ROI Calculator
  const [margin, setMargin] = useState('0.6');
  const [adSpend, setAdSpend] = useState('250');
  const [roas, setRoas] = useState('6');
  const [numDays, setNumDays] = useState('30');

  // Margin Calculator
  const [sellingPrice, setSellingPrice] = useState('100');
  const [costPrice, setCostPrice] = useState('35');
  const [deliveryRate, setDeliveryRate] = useState('95');

  // Per-Unit Profit Calculator
  const [aov, setAov] = useState('500');
  const [customOrders, setCustomOrders] = useState('');

  useEffect(() => {
    fetch('/api/finance?action=presets')
      .then((r) => r.json())
      .then(async (d) => {
        const serverPresets = d.presets ?? [];
        // Migrate localStorage presets to Firestore (one-time)
        const LOCAL_KEY = 'orbit-calc-presets';
        try {
          const local = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as CalcPreset[];
          if (local.length > 0 && serverPresets.length === 0) {
            const migrated: CalcPreset[] = [];
            for (const p of local) {
              const { id: _id, ...preset } = p;
              const res = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-preset', preset }) });
              const data = await res.json();
              if (data.preset) migrated.push(data.preset);
            }
            localStorage.removeItem(LOCAL_KEY);
            setPresets(migrated);
            return;
          }
          if (serverPresets.length > 0) localStorage.removeItem(LOCAL_KEY);
        } catch { /* ignore */ }
        setPresets(serverPresets);
      })
      .catch(() => {});
  }, []);

  const applyPreset = useCallback((p: CalcPreset) => {
    setCurrency(p.currency);
    setMargin(p.margin); setAdSpend(p.adSpend); setRoas(p.roas); setNumDays(p.numDays);
    setSellingPrice(p.sellingPrice); setCostPrice(p.costPrice); setDeliveryRate(p.deliveryRate);
    if (p.aov != null) setAov(p.aov);
    setShowPresets(false);
  }, []);

  const saveCurrentAsPreset = async () => {
    if (!presetName.trim()) return;
    const preset = { name: presetName.trim(), currency, margin, adSpend, roas, numDays, sellingPrice, costPrice, deliveryRate, aov };
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

  const fmt = (amount: number) => currency === 'USD' ? formatUSD(amount) : formatINR(amount);

  // ROI calculations
  const marginVal = parseFloat(margin) || 0;
  const adSpendVal = parseFloat(adSpend) || 0;
  const roasVal = parseFloat(roas) || 0;
  const daysVal = parseFloat(numDays) || 30;

  const breakevenRoas = marginVal > 0 ? (1 / marginVal).toFixed(2) : '0.00';
  const revenue = adSpendVal * roasVal;
  const profitMargin = revenue * marginVal;
  const profitAdSpend = profitMargin - adSpendVal;
  const roi = adSpendVal > 0 ? ((profitAdSpend / adSpendVal) * 100).toFixed(0) : '0';

  // Margin calculations
  const sellingVal = parseFloat(sellingPrice) || 0;
  const costVal = parseFloat(costPrice) || 0;
  const deliveryVal = (parseFloat(deliveryRate) || 0) / 100;
  const baseMargin = sellingVal > 0 ? (sellingVal - costVal) / sellingVal : 0;
  const finalMargin = baseMargin * deliveryVal;

  // Per-Unit Profit calculations
  // Margin from Margin calc (delivery-rate adjusted), ROAS + Ad Spend from ROI calc.
  const aovVal = parseFloat(aov) || 0;
  const customOrdersVal = parseFloat(customOrders) || 0;
  const estimatedUnits = aovVal > 0 ? revenue / aovVal : 0;
  const marginPerUnit = aovVal * finalMargin;
  const adCostPerUnit = roasVal > 0 ? aovVal / roasVal : 0;
  const perUnitProfit = marginPerUnit - adCostPerUnit;
  const totalOrdersForProfit = customOrdersVal > 0 ? customOrdersVal : estimatedUnits;
  const totalProfitFromUnits = perUnitProfit * totalOrdersForProfit;

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Profit Calculator</h1>
            <p className="text-[11px] text-muted-foreground">Calculate ROI & profit margins for paid advertising</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Presets */}
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground hover:bg-accent/30"
          >
            <Bookmark className="h-3.5 w-3.5" />
            Presets {presets.length > 0 && <span className="text-primary">({presets.length})</span>}
          </button>
          {/* Currency toggle */}
          <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
            <button
              onClick={() => setCurrency('USD')}
              className={`px-3 py-1.5 text-[11px] font-semibold transition ${currency === 'USD' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              $ USD
            </button>
            <button
              onClick={() => setCurrency('INR')}
              className={`px-3 py-1.5 text-[11px] font-semibold transition ${currency === 'INR' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              ₹ INR
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ROI Calculator */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Calculator className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">ROI Calculator</h2>
              <p className="text-[10px] text-muted-foreground">Calculate true profit & return on investment</p>
            </div>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CalcField label="Avg Profit Margin" hint="e.g. 0.6 = 60%">
                <input type="text" value={margin} onChange={(e) => setMargin(e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label={`Ad Spend (${currency})`}>
                <input type="text" value={adSpend} onChange={(e) => setAdSpend(e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="ROAS Multiplier">
                <input type="text" value={roas} onChange={(e) => setRoas(e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="Number of Days">
                <input type="text" value={numDays} onChange={(e) => setNumDays(e.target.value)} className="form-input" />
              </CalcField>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-1.5">
              <ResultRow label="Breakeven ROAS" value={`${breakevenRoas}x`} />
              <ResultRow label="Revenue from Ad Spend" value={fmt(revenue)} />
              <ResultRow label="Profit After Margin" value={fmt(profitMargin)} />
              <ResultRow label="Profit After Ad Spend" value={fmt(profitAdSpend)} highlight="primary" />
              <ResultRow label={`True Profit (${daysVal} days)`} value={fmt(profitAdSpend)} highlight="success" />
            </div>

            {/* Big ROI stat */}
            <div
              className="stat-shimmer glow-pulse rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center"
              style={{ '--glow-color': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}
            >
              <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Return on Investment</p>
              <p className="relative z-10 text-4xl font-bold font-mono gradient-text-emerald">{roi}%</p>
            </div>
          </div>
        </motion.div>

        {/* Margin Calculator */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Percent className="h-4 w-4 text-violet-400" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Margin Calculator</h2>
              <p className="text-[10px] text-muted-foreground">Calculate your product&apos;s profit margin</p>
            </div>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            <CalcField label={`Selling Price (incl. shipping) — ${currency}`}>
              <input type="text" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="form-input" />
            </CalcField>
            <CalcField label={`Cost of Product (incl. shipping) — ${currency}`}>
              <input type="text" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="form-input" />
            </CalcField>
            <CalcField label="Delivery Rate %" hint="Successful delivery rate - multiplied to margin">
              <input type="text" value={deliveryRate} onChange={(e) => setDeliveryRate(e.target.value)} className="form-input" />
            </CalcField>

            {/* Big margin stat */}
            <div
              className="stat-shimmer glow-pulse rounded-xl border border-primary/20 bg-primary/[0.04] p-8 text-center"
              style={{ '--glow-color': 'rgba(167, 139, 250, 0.12)' } as React.CSSProperties}
            >
              <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Your Profit Margin</p>
              <p className="relative z-10 text-5xl font-bold font-mono gradient-text-primary">{finalMargin.toFixed(3)}</p>
              <p className="relative z-10 text-lg text-muted-foreground mt-1">{(finalMargin * 100).toFixed(1)}%</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Per-Unit Profit Calculator */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Package className="h-4 w-4 text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Per-Unit Profit</h2>
            <p className="text-[10px] text-muted-foreground">Estimate units sold &amp; per-unit profit using your ROI &amp; Margin inputs above</p>
          </div>
        </div>
        <div className="relative z-10 p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CalcField label={`Average Order Value (AOV) — ${currency}`}>
              <input type="text" value={aov} onChange={(e) => setAov(e.target.value)} className="form-input" />
            </CalcField>
            <CalcField label="Number of orders" hint="leave blank to use estimated">
              <input type="text" value={customOrders} onChange={(e) => setCustomOrders(e.target.value)} placeholder="auto" className="form-input" />
            </CalcField>
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-1.5">
            <ResultRow
              label="Sourcing"
              value={`margin ${(finalMargin * 100).toFixed(1)}% · ROAS ${roasVal.toFixed(2)}x`}
            />
            <ResultRow
              label="Estimated units sold (Revenue ÷ AOV)"
              value={Math.round(estimatedUnits).toLocaleString('en-IN')}
            />
            <ResultRow label="Margin per unit (AOV × margin)" value={fmt(marginPerUnit)} />
            <ResultRow label="Ad cost per unit (AOV ÷ ROAS)" value={fmt(adCostPerUnit)} />
            <ResultRow label="Per-unit profit" value={fmt(perUnitProfit)} highlight="primary" />
          </div>

          {/* Big total profit stat */}
          <div
            className="stat-shimmer glow-pulse rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center"
            style={{ '--glow-color': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}
          >
            <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Total profit for {Math.round(totalOrdersForProfit).toLocaleString('en-IN')} orders
            </p>
            <p className="relative z-10 text-4xl font-bold font-mono gradient-text-emerald">{fmt(totalProfitFromUnits)}</p>
          </div>
        </div>
      </motion.div>

      {/* ── 3PL Calculator ─────────────────────────────────────────────── */}
      <ThreePLCalculator />

      {/* Presets Modal */}
      <AnimatePresence>
        {showPresets && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPresets(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Brand Presets</h2>
                </div>
                <button onClick={() => setShowPresets(false)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Save current */}
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">Save Current Values</p>
                  <div className="flex gap-2">
                    <input
                      type="text" value={presetName} onChange={(e) => setPresetName(e.target.value)}
                      placeholder="e.g. Kairova, Mavric..."
                      onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsPreset()}
                      className="flex-1 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none transition"
                    />
                    <button onClick={saveCurrentAsPreset} disabled={!presetName.trim()}
                      className="rounded-lg bg-primary/15 px-3 py-2 text-[11px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"
                    ><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                {/* Saved presets */}
                {presets.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">Saved Presets</p>
                    <div className="space-y-1.5">
                      {presets.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2.5 group">
                          {editingPresetId === p.id ? (
                            <input
                              autoFocus
                              value={editingPresetName}
                              onChange={(e) => setEditingPresetName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') renamePreset(p.id, editingPresetName);
                                if (e.key === 'Escape') setEditingPresetId(null);
                              }}
                              onBlur={() => renamePreset(p.id, editingPresetName)}
                              className="flex-1 rounded border border-primary/30 bg-transparent px-2 py-0.5 text-[12px] text-foreground focus:outline-none"
                            />
                          ) : (
                            <button onClick={() => applyPreset(p)} className="flex-1 text-left min-w-0">
                              <p className="text-[12px] font-medium text-foreground truncate">{p.name}</p>
                              <p className="text-[10px] text-muted-foreground/60">
                                Margin {(parseFloat(p.margin) * 100).toFixed(0)}% · SP {p.currency === 'INR' ? '₹' : '$'}{p.sellingPrice} · CP {p.currency === 'INR' ? '₹' : '$'}{p.costPrice} · DR {p.deliveryRate}%{p.aov ? ` · AOV ${p.currency === 'INR' ? '₹' : '$'}${p.aov}` : ''}
                              </p>
                            </button>
                          )}
                          {editingPresetId !== p.id && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingPresetId(p.id); setEditingPresetName(p.name); }}
                                className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:text-primary transition"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => deletePreset(p.id)}
                                className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:text-red-400 transition"
                              ><Trash2 className="h-3.5 w-3.5" /></button>
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

// ── 3PL Calculator ─────────────────────────────────────────────────────────
// COD fulfilment economics for an Indian 3PL: forward+RTO shipping, storage,
// fulfilment, platform fee, GST input-credit offset, and a working-capital
// credit line (everything except ad spend is floated on credit).

type Tranche = { pct: string; days: string };

const THREEPL_DEFAULTS = {
  sellingPrice: '999', cogsPerUnit: '250', unitsPerOrder: '1', weightGrams: '500',
  deliveryRate: '65', adSpendPerOrder: '300',
  fwdShip: '55', rtoShip: '55', codFlat: '35', codPct: '1.7',
  inward: '5', storagePerDay: '0.1', storageDays: '20',
  rtoHandling: '5', reversePickup: '5', rtvHandling: '0', rtoCogsLossPct: '0',
  outbound: '8', printing: '2', packaging: '10',
  convPct: '3', convMin: '30', convCap: '120',
  gstRate: '18', spGstInclusive: true, claimGstOnCogs: false,
  financingFeePct: '0', ordersPerMonth: '1000',
};

function ThreePLCalculator() {
  const [v, setV] = useState<typeof THREEPL_DEFAULTS>(THREEPL_DEFAULTS);
  const [tranches, setTranches] = useState<Tranche[]>([
    { pct: '50', days: '7' },
    { pct: '50', days: '15' },
  ]);

  const set = <K extends keyof typeof THREEPL_DEFAULTS>(k: K, val: (typeof THREEPL_DEFAULTS)[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const num = (s: string) => parseFloat(s) || 0;
  const fmt = (a: number) => formatINR(a);

  // ── Inputs ────────────────────────────────────────────────────────────
  const sp = num(v.sellingPrice);
  const cogs = num(v.cogsPerUnit) * Math.max(1, num(v.unitsPerOrder));
  const units = Math.max(1, num(v.unitsPerOrder));
  const slabs = Math.max(1, Math.ceil(num(v.weightGrams) / 500));
  const d = Math.min(1, Math.max(0, num(v.deliveryRate) / 100));
  const rto = 1 - d;
  const ad = num(v.adSpendPerOrder);
  const gstRate = num(v.gstRate) / 100;

  // ── Per-shipped-order cost components ─────────────────────────────────
  const fwdShip = num(v.fwdShip) * slabs;
  const rtoShip = num(v.rtoShip) * slabs;
  const codFee = Math.max(num(v.codFlat), sp * num(v.codPct) / 100);
  const inward = num(v.inward) * units;
  const storage = num(v.storagePerDay) * units * num(v.storageDays);
  const outbound = num(v.outbound) * units;
  const printing = num(v.printing);
  const packaging = num(v.packaging);
  const convenience = Math.min(num(v.convCap), Math.max(num(v.convMin), sp * num(v.convPct) / 100));
  const rtoHandling = num(v.rtoHandling) * units;
  const reversePickup = num(v.reversePickup) * units;
  const rtvHandling = num(v.rtvHandling) * units;
  const rtoCogsLoss = cogs * (num(v.rtoCogsLossPct) / 100);

  // Costs incurred on EVERY shipped order (delivered or RTO)
  const commonCost = inward + storage + outbound + printing + packaging + fwdShip;
  // Delivered-only
  const deliveredExtra = codFee + convenience;
  // RTO-only
  const rtoExtra = rtoShip + rtoHandling + reversePickup + rtvHandling;

  const deliveredProfitPre = sp - cogs - commonCost - deliveredExtra;
  const rtoProfitPre = -(rtoCogsLoss) - commonCost - rtoExtra;
  const blendedPre = d * deliveredProfitPre + rto * rtoProfitPre;

  // ── GST: output on sales, input credit on fulfilment/storage/platform ──
  const outputGstPerDelivered = v.spGstInclusive
    ? sp * gstRate / (1 + gstRate)
    : sp * gstRate;
  const gstBaseCommon = inward + storage + outbound + printing + packaging; // GST-applicable
  const inputGstCommon = gstBaseCommon * gstRate;
  const inputGstDelivered = convenience * gstRate + (v.claimGstOnCogs ? cogs * gstRate : 0);
  const netGstBlended =
    d * outputGstPerDelivered - inputGstCommon - d * inputGstDelivered;

  // ── Blended net per shipped order ─────────────────────────────────────
  const netPerShipped = blendedPre - ad - netGstBlended;
  const blendedMarginPct = sp > 0 ? (netPerShipped / (d * sp)) * 100 : 0;

  // Simple model — assume 100% delivery
  const simpleNet = deliveredProfitPre - ad - (outputGstPerDelivered - inputGstCommon - inputGstDelivered);

  // Breakeven delivery rate: solve net(d)=0
  const kSlope = deliveredProfitPre - rtoProfitPre - outputGstPerDelivered + inputGstDelivered;
  const kConst = rtoProfitPre - ad + inputGstCommon;
  const breakevenD = kSlope !== 0 ? -kConst / kSlope : NaN;
  const breakevenPct = Number.isFinite(breakevenD) ? Math.min(100, Math.max(0, breakevenD * 100)) : NaN;

  // ── Monthly batch ─────────────────────────────────────────────────────
  const opm = Math.max(0, num(v.ordersPerMonth));
  const monthlyShipped = opm;
  const monthlyDelivered = opm * d;
  const monthlyRevenue = monthlyDelivered * sp;
  const monthlyNet = monthlyShipped * netPerShipped;

  // ── Credit line — everything except ads is financed ───────────────────
  const financedPerShipped =
    d * (cogs + commonCost + deliveredExtra) +
    rto * (rtoCogsLoss + commonCost + rtoExtra) +
    Math.max(0, netGstBlended);
  const monthlyFinanced = monthlyShipped * financedPerShipped;
  const financingFee = monthlyFinanced * (num(v.financingFeePct) / 100);
  const monthlyCashUpfront = monthlyShipped * ad;
  const monthlyNetAfterFinancing = monthlyNet - financingFee;

  const trancheTotalPct = tranches.reduce((s, t) => s + num(t.pct), 0);

  const addTranche = () => setTranches((t) => [...t, { pct: '', days: '' }]);
  const removeTranche = (i: number) => setTranches((t) => t.filter((_, idx) => idx !== i));
  const setTranche = (i: number, key: keyof Tranche, val: string) =>
    setTranches((t) => t.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));


  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">3PL Calculator</h2>
            <p className="text-[10px] text-muted-foreground">
              COD fulfilment unit economics with RTO split, GST offset &amp; credit line · all values ₹ INR
            </p>
          </div>
        </div>
        <button
          onClick={() => { setV(THREEPL_DEFAULTS); setTranches([{ pct: '50', days: '7' }, { pct: '50', days: '15' }]); }}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 p-4 lg:grid-cols-2">
        {/* ── LEFT: inputs ─────────────────────────────────────────────── */}
        <div className="space-y-5">
          <Section icon={<Package className="h-3.5 w-3.5" />} title="Order & product">
            <div className="grid grid-cols-2 gap-3">
              <CalcField label="Selling price" hint="order value ₹"><NumInput value={String(v.sellingPrice)} onChange={(val) => set('sellingPrice', val)} suffix="₹" /></CalcField>
              <CalcField label="COGS / unit" hint="₹"><NumInput value={String(v.cogsPerUnit)} onChange={(val) => set('cogsPerUnit', val)} suffix="₹" /></CalcField>
              <CalcField label="Units / order"><NumInput value={String(v.unitsPerOrder)} onChange={(val) => set('unitsPerOrder', val)} /></CalcField>
              <CalcField label="Pkg weight" hint="grams"><NumInput value={String(v.weightGrams)} onChange={(val) => set('weightGrams', val)} suffix="g" /></CalcField>
              <CalcField label="Delivery rate" hint="rest = RTO"><NumInput value={String(v.deliveryRate)} onChange={(val) => set('deliveryRate', val)} suffix="%" /></CalcField>
              <CalcField label="Ad spend / order" hint="cash, not credit"><NumInput value={String(v.adSpendPerOrder)} onChange={(val) => set('adSpendPerOrder', val)} suffix="₹" /></CalcField>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              {slabs} shipping slab{slabs === 1 ? '' : 's'} ({num(v.weightGrams)}g ÷ 500g)
            </p>
          </Section>

          <Section icon={<Truck className="h-3.5 w-3.5" />} title="Shipping & COD">
            <div className="grid grid-cols-2 gap-3">
              <CalcField label="Forward / slab" hint="all-zone ₹55"><NumInput value={String(v.fwdShip)} onChange={(val) => set('fwdShip', val)} suffix="₹" /></CalcField>
              <CalcField label="RTO ship / slab" hint="= forward"><NumInput value={String(v.rtoShip)} onChange={(val) => set('rtoShip', val)} suffix="₹" /></CalcField>
              <CalcField label="COD fee flat"><NumInput value={String(v.codFlat)} onChange={(val) => set('codFlat', val)} suffix="₹" /></CalcField>
              <CalcField label="COD fee %" hint="whichever higher"><NumInput value={String(v.codPct)} onChange={(val) => set('codPct', val)} suffix="%" /></CalcField>
            </div>
          </Section>

          <Section icon={<Boxes className="h-3.5 w-3.5" />} title="Storage & handling" note="excl GST">
            <div className="grid grid-cols-2 gap-3">
              <CalcField label="Inward / unit"><NumInput value={String(v.inward)} onChange={(val) => set('inward', val)} suffix="₹" /></CalcField>
              <CalcField label="Storage / unit / day"><NumInput value={String(v.storagePerDay)} onChange={(val) => set('storagePerDay', val)} suffix="₹" /></CalcField>
              <CalcField label="Avg storage days"><NumInput value={String(v.storageDays)} onChange={(val) => set('storageDays', val)} suffix="d" /></CalcField>
              <CalcField label="RTO handling / unit"><NumInput value={String(v.rtoHandling)} onChange={(val) => set('rtoHandling', val)} suffix="₹" /></CalcField>
              <CalcField label="Reverse pickup / unit"><NumInput value={String(v.reversePickup)} onChange={(val) => set('reversePickup', val)} suffix="₹" /></CalcField>
              <CalcField label="RTV handling / unit" hint="0 if n/a"><NumInput value={String(v.rtvHandling)} onChange={(val) => set('rtvHandling', val)} suffix="₹" /></CalcField>
              <CalcField label="RTO COGS loss %" hint="damage on return"><NumInput value={String(v.rtoCogsLossPct)} onChange={(val) => set('rtoCogsLossPct', val)} suffix="%" /></CalcField>
            </div>
          </Section>

          <Section icon={<Package className="h-3.5 w-3.5" />} title="Fulfilment" note="excl GST">
            <div className="grid grid-cols-2 gap-3">
              <CalcField label="Outbound / unit"><NumInput value={String(v.outbound)} onChange={(val) => set('outbound', val)} suffix="₹" /></CalcField>
              <CalcField label="Printing / order"><NumInput value={String(v.printing)} onChange={(val) => set('printing', val)} suffix="₹" /></CalcField>
              <CalcField label="Packaging / order"><NumInput value={String(v.packaging)} onChange={(val) => set('packaging', val)} suffix="₹" /></CalcField>
            </div>
          </Section>

          <Section icon={<Receipt className="h-3.5 w-3.5" />} title="Platform fee" note="per delivered order, excl GST">
            <div className="grid grid-cols-3 gap-3">
              <CalcField label="Conv. %"><NumInput value={String(v.convPct)} onChange={(val) => set('convPct', val)} suffix="%" /></CalcField>
              <CalcField label="Min ₹"><NumInput value={String(v.convMin)} onChange={(val) => set('convMin', val)} suffix="₹" /></CalcField>
              <CalcField label="Cap ₹"><NumInput value={String(v.convCap)} onChange={(val) => set('convCap', val)} suffix="₹" /></CalcField>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              max({num(v.convPct)}% of order, ₹{num(v.convMin)}) capped at ₹{num(v.convCap)} = <span className="text-foreground">{fmt(convenience)}</span>
            </p>
          </Section>

          <Section icon={<Landmark className="h-3.5 w-3.5" />} title="GST">
            <div className="grid grid-cols-2 gap-3">
              <CalcField label="GST rate"><NumInput value={String(v.gstRate)} onChange={(val) => set('gstRate', val)} suffix="%" /></CalcField>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Toggles</label>
                <div className="flex flex-col gap-1.5">
                  <Toggle on={v.spGstInclusive} onClick={() => set('spGstInclusive', !v.spGstInclusive)} label="SP is GST-inclusive" />
                  <Toggle on={v.claimGstOnCogs} onClick={() => set('claimGstOnCogs', !v.claimGstOnCogs)} label="Claim input GST on COGS" />
                </div>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              Net GST = output GST on sales − input GST credit on fulfilment/storage/platform.
            </p>
          </Section>

          <Section icon={<CreditCard className="h-3.5 w-3.5" />} title="Credit line" note="covers everything except ads">
            <div className="grid grid-cols-2 gap-3">
              <CalcField label="Orders / month"><NumInput value={String(v.ordersPerMonth)} onChange={(val) => set('ordersPerMonth', val)} /></CalcField>
              <CalcField label="Financing fee" hint="flat % on financed"><NumInput value={String(v.financingFeePct)} onChange={(val) => set('financingFeePct', val)} suffix="%" /></CalcField>
            </div>
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Repayment schedule
                  <span className={`ml-1.5 normal-case tracking-normal ${trancheTotalPct === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    ({trancheTotalPct}% of financed)
                  </span>
                </label>
                <button onClick={addTranche} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition hover:text-foreground">
                  <Plus className="h-3 w-3" /> Tranche
                </button>
              </div>
              <div className="space-y-1.5">
                {tranches.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text" inputMode="decimal" value={t.pct}
                        onChange={(e) => setTranche(i, 'pct', e.target.value)}
                        placeholder="50" className="form-input pr-6 text-[12px] tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">due in</span>
                    <div className="relative flex-1">
                      <input
                        type="text" inputMode="decimal" value={t.days}
                        onChange={(e) => setTranche(i, 'days', e.target.value)}
                        placeholder="7" className="form-input pr-7 text-[12px] tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">days</span>
                    </div>
                    <button
                      onClick={() => removeTranche(i)}
                      className="rounded-md p-1.5 text-muted-foreground/40 transition hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </div>

        {/* ── RIGHT: results ───────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Per-shipped-order breakdown */}
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Per shipped order — {(d * 100).toFixed(0)}% delivered / {(rto * 100).toFixed(0)}% RTO
            </p>
            <div className="space-y-1.5">
              <ResultRow label="Delivered-order profit (pre-GST, pre-ad)" value={fmt(deliveredProfitPre)} />
              <ResultRow label="RTO-order loss (pre-GST, pre-ad)" value={fmt(rtoProfitPre)} />
              <ResultRow label="Blended (pre-GST, pre-ad)" value={fmt(blendedPre)} />
              <ResultRow label="− Ad spend / order" value={`− ${fmt(ad)}`} />
              <ResultRow
                label={netGstBlended >= 0 ? '− Net GST payable / order' : '+ Net GST credit / order'}
                value={`${netGstBlended >= 0 ? '− ' : '+ '}${fmt(Math.abs(netGstBlended))}`}
              />
              <ResultRow label="Net profit / shipped order" value={fmt(netPerShipped)} highlight={netPerShipped >= 0 ? 'success' : 'primary'} />
            </div>
          </div>

          {/* Hero */}
          <div
            className="stat-shimmer glow-pulse rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center"
            style={{ '--glow-color': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}
          >
            <p className="relative z-10 mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Net profit / shipped order
            </p>
            <p className={`relative z-10 font-mono text-4xl font-bold ${netPerShipped >= 0 ? 'gradient-text-emerald' : 'text-rose-400'}`}>
              {fmt(netPerShipped)}
            </p>
            <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">
              {blendedMarginPct.toFixed(1)}% margin on delivered revenue ·{' '}
              {Number.isFinite(breakevenPct)
                ? <>breakeven at <span className="font-semibold text-foreground">{breakevenPct.toFixed(1)}%</span> delivery</>
                : 'breakeven n/a'}
            </p>
          </div>

          {/* Simple 100% delivery */}
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">If every order delivered (100%)</p>
            <ResultRow label="Net profit / order @ 100%" value={fmt(simpleNet)} highlight={simpleNet >= 0 ? 'success' : 'primary'} />
          </div>

          {/* Monthly batch */}
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Monthly batch — {opm.toLocaleString('en-IN')} shipped
            </p>
            <div className="space-y-1.5">
              <ResultRow label={`Delivered orders (${(d * 100).toFixed(0)}%)`} value={Math.round(monthlyDelivered).toLocaleString('en-IN')} />
              <ResultRow label="Revenue (delivered)" value={fmt(monthlyRevenue)} />
              <ResultRow label="Net profit (before financing)" value={fmt(monthlyNet)} />
              <ResultRow label={`− Financing fee (${num(v.financingFeePct)}%)`} value={`− ${fmt(financingFee)}`} />
              <ResultRow label="Net profit / month" value={fmt(monthlyNetAfterFinancing)} highlight={monthlyNetAfterFinancing >= 0 ? 'success' : 'primary'} />
            </div>
          </div>

          {/* Credit line */}
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4">
            <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sky-300/90">
              <CreditCard className="h-3 w-3" /> Credit line — monthly
            </p>
            <div className="space-y-1.5">
              <ResultRow label="Cash you fund upfront (ads)" value={fmt(monthlyCashUpfront)} />
              <ResultRow label="Financed on credit (everything else)" value={fmt(monthlyFinanced)} highlight="primary" />
            </div>
            {monthlyFinanced > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Repayment schedule</p>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border bg-background/40 text-left text-muted-foreground">
                        <th className="px-3 py-1.5 font-medium">Within</th>
                        <th className="px-3 py-1.5 font-medium">Share</th>
                        <th className="px-3 py-1.5 text-right font-medium">Amount due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tranches.map((t, i) => {
                        const pct = num(t.pct);
                        return (
                          <tr key={i} className="border-b border-border/40 last:border-0">
                            <td className="px-3 py-1.5 tabular-nums text-foreground">{num(t.days)} days</td>
                            <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{pct}%</td>
                            <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums text-foreground">
                              {fmt(monthlyFinanced * pct / 100)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {trancheTotalPct !== 100 && (
                  <p className="mt-1.5 text-[10px] text-amber-400">
                    Tranches sum to {trancheTotalPct}% — adjust to 100% to fully schedule the financed amount.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function NumInput({ value, onChange, suffix }: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="form-input pr-7 tabular-nums"
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>
      )}
    </div>
  );
}

function Section({ icon, title, note, children }: {
  icon: React.ReactNode; title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-emerald-400">{icon}</span>
        <h3 className="text-[12px] font-semibold tracking-tight text-foreground">{title}</h3>
        {note && <span className="text-[10px] text-muted-foreground/60">· {note}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
        on ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-border bg-card text-muted-foreground hover:text-foreground'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-muted-foreground/40'}`} />
      {label}
    </button>
  );
}
