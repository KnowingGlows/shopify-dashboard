'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, Percent, Bookmark, Plus, X, Trash2, Pencil, Package } from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { formatINR, formatUSD } from '@/lib/currency-converter';

const USD_TO_INR = 90.7;

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
