'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Boxes, Plus, Trash2, Receipt, Bookmark, X, Pencil } from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { formatINR, formatUSD } from '@/lib/currency-converter';

// ── Fixed 3PL rates (from your plan — these don't change) ──────────────────
const FEES = {
  fwdShip: 55, rtoShip: 55, codFlat: 35, codPct: 1.7,
  inward: 5, storagePerDay: 0.1, rtoHandling: 5, reversePickup: 5, rtvHandling: 0,
  outbound: 8, printing: 2, packaging: 10,
  convPct: 3, convMin: 30, convCap: 120, gstRate: 18,
};

const RATE_REFERENCE: { label: string; value: string }[] = [
  { label: 'Forward shipping / 500g', value: '₹55' },
  { label: 'RTO shipping / 500g', value: '₹55' },
  { label: 'COD fee', value: '₹35 or 1.7%' },
  { label: 'Inward / unit', value: '₹5' },
  { label: 'Storage / unit / day', value: '₹0.10' },
  { label: 'RTO handling / unit', value: '₹5' },
  { label: 'Reverse pickup / unit', value: '₹5' },
  { label: 'Outbound / unit', value: '₹8' },
  { label: 'Printing / order', value: '₹2' },
  { label: 'Packaging / order', value: '₹10' },
  { label: 'Platform fee', value: '3% · min ₹30 · cap ₹120' },
  { label: 'GST', value: '18%' },
];

type Tranche = { pct: string; days: string };

const DEFAULTS = {
  sellingPrice: '0',
  cogsPerUnit: '0',
  deliveryRate: '0',
  roas: '0',
  orders: '0',
  unitsPerOrder: '1',
  weightGrams: '500',
  storageDays: '20',
  rtoCogsLossPct: '0',
  financingFeePct: '0',
  spGstInclusive: true,
  chargeOutputGst: true,
};

export default function ThreePLCalculatorPage() {
  const [v, setV] = useState<typeof DEFAULTS>(DEFAULTS);
  const [tranches, setTranches] = useState<Tranche[]>([
    { pct: '50', days: '7' },
    { pct: '50', days: '15' },
  ]);

  // Saved presets (per brand/product) — same system as the profit calculator
  type Preset = { id: string; name: string; kind: '3pl'; data: typeof DEFAULTS; tranches: Tranche[] };
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState('');

  // Display currency — values are computed in ₹, optionally shown in $ at the
  // latest live FX rate (USD-base, so INR rate = ₹ per $1).
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  // Rate is prefilled from the live FX feed but fully editable — override it
  // if the fetched rate looks off.
  const [rateStr, setRateStr] = useState('83.5');
  useEffect(() => {
    fetch('/api/fx')
      .then((r) => r.json())
      .then((d) => { if (d?.rates?.INR) setRateStr(String(Number(d.rates.INR).toFixed(2))); })
      .catch(() => {});
  }, []);
  const inrPerUsd = parseFloat(rateStr) || 83.5;

  useEffect(() => {
    fetch('/api/finance?action=presets&kind=3pl')
      .then((r) => r.json())
      .then((d) => setPresets(d.presets ?? []))
      .catch(() => {});
  }, []);

  const applyPreset = (p: Preset) => {
    if (p.data) setV({ ...DEFAULTS, ...p.data });
    if (Array.isArray(p.tranches) && p.tranches.length > 0) setTranches(p.tranches);
    setShowPresets(false);
  };

  const saveCurrentAsPreset = async () => {
    if (!presetName.trim()) return;
    const preset = { name: presetName.trim(), kind: '3pl', data: v, tranches };
    try {
      const res = await fetch('/api/finance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-preset', preset }),
      });
      const data = await res.json();
      if (data.preset) setPresets((prev) => [...prev, data.preset]);
      setPresetName('');
    } catch { /* ignore */ }
  };

  const deletePreset = async (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch('/api/finance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-preset', id }),
      });
    } catch { /* ignore */ }
  };

  const renamePreset = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, name: newName.trim() } : p)));
    setEditingPresetId(null);
    try {
      await fetch('/api/finance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename-preset', id, name: newName.trim() }),
      });
    } catch { /* ignore */ }
  };

  const set = <K extends keyof typeof DEFAULTS>(k: K, val: (typeof DEFAULTS)[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const num = (s: string) => parseFloat(s) || 0;
  const fmt = (a: number) =>
    currency === 'USD' ? formatUSD(inrPerUsd > 0 ? a / inrPerUsd : 0) : formatINR(a);

  // ── Inputs ────────────────────────────────────────────────────────────
  const sp = num(v.sellingPrice);
  const cogs = num(v.cogsPerUnit) * Math.max(1, num(v.unitsPerOrder));
  const units = Math.max(1, num(v.unitsPerOrder));
  const slabs = Math.max(1, Math.ceil(num(v.weightGrams) / 500));
  const d = Math.min(1, Math.max(0, num(v.deliveryRate) / 100));
  const rto = 1 - d;
  const roas = num(v.roas);
  const ad = roas > 0 ? sp / roas : 0; // ad spend / order = order value ÷ ROAS
  const gstRate = FEES.gstRate / 100;

  const fwdShip = FEES.fwdShip * slabs;
  const rtoShip = FEES.rtoShip * slabs;
  const codFee = Math.max(FEES.codFlat, sp * FEES.codPct / 100);
  const inward = FEES.inward * units;
  const storage = FEES.storagePerDay * units * num(v.storageDays);
  const outbound = FEES.outbound * units;
  const printing = FEES.printing;
  const packaging = FEES.packaging;
  const convenience = Math.min(FEES.convCap, Math.max(FEES.convMin, sp * FEES.convPct / 100));
  const rtoHandling = FEES.rtoHandling * units;
  const reversePickup = FEES.reversePickup * units;
  const rtvHandling = FEES.rtvHandling * units;
  const rtoCogsLoss = cogs * (num(v.rtoCogsLossPct) / 100);

  const commonCost = inward + storage + outbound + printing + packaging + fwdShip;
  const deliveredExtra = codFee + convenience;
  const rtoExtra = rtoShip + rtoHandling + reversePickup + rtvHandling;

  const deliveredProfitPre = sp - cogs - commonCost - deliveredExtra;
  const rtoProfitPre = -(rtoCogsLoss) - commonCost - rtoExtra;
  const blendedPre = d * deliveredProfitPre + rto * rtoProfitPre;

  // ── GST ───────────────────────────────────────────────────────────────
  // You ALWAYS pay 18% GST on COGS (pre-GST) + the excl-GST 3PL fees.
  //  • Registered  : owe output GST on sales, reclaim that input GST →
  //                   net cost = output − input.
  //  • Not registered: no output GST, but the input GST you paid is
  //                   UNRECOVERABLE → it's a real sunk cost.
  const gstActive = v.chargeOutputGst;
  const outputGstPerDelivered = !gstActive
    ? 0
    : v.spGstInclusive
      ? sp * gstRate / (1 + gstRate)
      : sp * gstRate;
  // GST physically paid on each order's inputs (independent of registration).
  const inputGstDeliveredOrder = (commonCost + deliveredExtra + cogs) * gstRate;
  const inputGstRtoOrder = (commonCost + rtoExtra + rtoCogsLoss) * gstRate;
  // Registered → input is reclaimed (credit); not registered → it's a cost.
  const netGstDeliveredOrder = gstActive
    ? outputGstPerDelivered - inputGstDeliveredOrder
    : inputGstDeliveredOrder;
  const netGstRtoOrder = gstActive ? -inputGstRtoOrder : inputGstRtoOrder;
  const netGstBlended = d * netGstDeliveredOrder + rto * netGstRtoOrder;

  const netPerShipped = blendedPre - ad - netGstBlended;
  const simpleNet = deliveredProfitPre - ad - netGstDeliveredOrder;

  // ── Batch totals (for the order count you enter — no time frame) ──────
  const qty = Math.max(0, num(v.orders));
  const shipped = qty;
  const delivered = qty * d;
  const rtoOrders = qty * rto;
  const totalRevenue = delivered * sp;

  // Cash you must float = costs you pay GST-inclusive (you front the 18% on
  // COGS even though you reclaim it later) + any net GST owed.
  const financedPerShipped =
    d * (cogs * (1 + gstRate) + commonCost + deliveredExtra) +
    rto * (rtoCogsLoss * (1 + gstRate) + commonCost + rtoExtra) +
    Math.max(0, netGstBlended);
  const financed = shipped * financedPerShipped;
  const financingFee = financed * (num(v.financingFeePct) / 100);
  const cashUpfront = shipped * ad;

  const outCOGS = delivered * cogs + rtoOrders * rtoCogsLoss;
  const outForward = shipped * fwdShip;
  const outRTO = rtoOrders * (rtoShip + rtoHandling + reversePickup + rtvHandling);
  const outFulfilment = shipped * (outbound + printing + packaging);
  const outStorage = shipped * (inward + storage);
  const outCOD = delivered * codFee;
  const outPlatform = delivered * convenience;
  const outGst = shipped * netGstBlended;
  const outputGstOwed = delivered * outputGstPerDelivered;                                  // GST owed on sales (0 if not registered)
  const inputGstPaid = delivered * inputGstDeliveredOrder + rtoOrders * inputGstRtoOrder;   // GST you actually pay on inputs
  const inputGstClaimed = gstActive ? inputGstPaid : 0;                                      // reclaimed only if registered
  const inputGstSunk = gstActive ? 0 : inputGstPaid;                                         // unrecoverable if not registered
  const outAds = cashUpfront;
  const outFinancing = financingFee;
  const total3PL = outForward + outRTO + outFulfilment + outStorage + outCOD + outPlatform;
  const moneyOut = outCOGS + total3PL + outGst + outAds + outFinancing;
  const moneyIn = totalRevenue;
  // Profit-before-GST is the anchor. Registered: − output owed + input claimed.
  // Not registered: − input GST paid (unrecoverable, no output, no claim).
  const profitBeforeGst = moneyIn - outCOGS - total3PL - outAds - outFinancing;
  const netProfit = moneyIn - moneyOut;
  const netMarginPct = moneyIn > 0 ? (netProfit / moneyIn) * 100 : 0;
  // Gross profit = revenue − product cost only (before 3PL fees, ads, GST).
  const grossProfit = moneyIn - outCOGS;
  const grossMarginPct = moneyIn > 0 ? (grossProfit / moneyIn) * 100 : 0;

  const flowRows = [
    { label: 'Product cost (COGS)', amount: outCOGS },
    { label: 'Ad spend', amount: outAds },
    { label: 'Forward shipping', amount: outForward },
    { label: 'RTO shipping & handling', amount: outRTO },
    { label: 'Fulfilment (pick/pack/print)', amount: outFulfilment },
    { label: 'Storage & inward', amount: outStorage },
    { label: 'COD collection fees', amount: outCOD },
    { label: 'Platform fee', amount: outPlatform },
    { label: 'Output GST on sales', amount: outputGstOwed },
    { label: 'Input GST credit (reclaimed)', amount: -inputGstClaimed },
    { label: 'Input GST paid (unrecoverable)', amount: inputGstSunk },
    { label: 'Financing fee', amount: outFinancing },
  ].filter((r) => Math.abs(r.amount) > 0.5).sort((a, b) => b.amount - a.amount);

  const profitBeforeAdPerShipped = blendedPre - netGstBlended;
  const beroas = profitBeforeAdPerShipped > 0 ? sp / profitBeforeAdPerShipped : NaN;

  const trancheTotalPct = tranches.reduce((s, t) => s + num(t.pct), 0);
  const addTranche = () => setTranches((t) => [...t, { pct: '', days: '' }]);
  const removeTranche = (i: number) => setTranches((t) => t.filter((_, idx) => idx !== i));
  const setTranche = (i: number, key: keyof Tranche, val: string) =>
    setTranches((t) => t.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));

  const reset = () => {
    setV(DEFAULTS);
    setTranches([{ pct: '50', days: '7' }, { pct: '50', days: '15' }]);
  };

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header — same as the Profit Calculator page */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">3PL Calculator</h1>
          <p className="text-[11px] text-muted-foreground">COD fulfilment profit, GST offset &amp; credit line</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
            <button
              onClick={() => setCurrency('INR')}
              className={`px-3 py-1.5 text-[11px] font-semibold transition ${currency === 'INR' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              ₹ INR
            </button>
            <button
              onClick={() => setCurrency('USD')}
              className={`px-3 py-1.5 text-[11px] font-semibold transition ${currency === 'USD' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              $ USD
            </button>
          </div>
          {currency === 'USD' && (
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5" title="₹ per $1 — edit if the live rate is off">
              <span className="text-[11px] text-muted-foreground">₹</span>
              <input
                type="text"
                inputMode="decimal"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
                className="w-14 bg-transparent text-[11px] font-semibold tabular-nums text-foreground outline-none"
              />
              <span className="text-[11px] text-muted-foreground">/ $</span>
            </div>
          )}
          <button
            onClick={() => setShowPresets(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground hover:bg-accent/30"
          >
            <Bookmark className="h-3.5 w-3.5" />
            Presets {presets.length > 0 && <span className="text-primary">({presets.length})</span>}
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground hover:bg-accent/30"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Calculator card — identical structure to the ROI card ────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Boxes className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">3PL Calculator</h2>
              <p className="text-[10px] text-muted-foreground">Enter your numbers — rates are fixed per your plan</p>
            </div>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CalcField label="Selling Price (incl. shipping) — ₹">
                <input type="text" inputMode="decimal" value={v.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="Cost of Product — ₹">
                <input type="text" inputMode="decimal" value={v.cogsPerUnit} onChange={(e) => set('cogsPerUnit', e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="ROAS" hint="ad spend = price ÷ ROAS">
                <input type="text" inputMode="decimal" value={v.roas} onChange={(e) => set('roas', e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="Delivery Rate %" hint="rest is RTO">
                <input type="text" inputMode="decimal" value={v.deliveryRate} onChange={(e) => set('deliveryRate', e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="Orders">
                <input type="text" inputMode="decimal" value={v.orders} onChange={(e) => set('orders', e.target.value)} className="form-input" />
              </CalcField>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-1.5">
              <ResultRow label="Breakeven ROAS (BEROAS)" value={Number.isFinite(beroas) ? `${beroas.toFixed(2)}x` : '—'} />
              <ResultRow label="Ad spend / order" value={fmt(ad)} />
              <ResultRow label="Revenue" value={fmt(moneyIn)} />
              <ResultRow label="Gross profit" value={`${fmt(grossProfit)} · ${grossMarginPct.toFixed(1)}%`} />
              <ResultRow label="Profit before GST" value={fmt(profitBeforeGst)} />
              {gstActive ? (
                <>
                  <ResultRow label="− Output GST owed" value={`− ${fmt(outputGstOwed)}`} />
                  <ResultRow label="+ Input GST claimed" value={`+ ${fmt(inputGstClaimed)}`} />
                </>
              ) : (
                <ResultRow label="− Input GST paid (unrecoverable)" value={`− ${fmt(inputGstSunk)}`} />
              )}
              <ResultRow label="Net profit / order" value={fmt(netPerShipped)} highlight="primary" />
              <ResultRow label="Net profit (final)" value={`${fmt(netProfit)} · ${netMarginPct.toFixed(1)}%`} highlight="success" />
            </div>

            <div
              className="stat-shimmer glow-pulse rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center"
              style={{ '--glow-color': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}
            >
              <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Net Profit
              </p>
              <p className={`relative z-10 text-4xl font-bold font-mono ${netProfit >= 0 ? 'gradient-text-emerald' : 'text-rose-400'}`}>
                {fmt(netProfit)}
              </p>
              <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">
                {grossMarginPct.toFixed(1)}% gross · <span className="text-foreground font-medium">{netMarginPct.toFixed(1)}% net</span> — final, after all costs, ads &amp; GST
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Breakdown card — identical structure to the Margin card ──── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Receipt className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Cost Breakdown</h2>
              <p className="text-[10px] text-muted-foreground">Where every rupee goes</p>
            </div>
          </div>
          <div className="relative z-10 p-4 space-y-4">
            <div className="space-y-1.5">
              {flowRows.map((r) => {
                const credit = r.amount < 0;
                const share = moneyOut > 0 ? (Math.abs(r.amount) / moneyOut) * 100 : 0;
                return (
                  <ResultRow
                    key={r.label}
                    label={`${r.label} · ${share.toFixed(0)}%`}
                    value={`${credit ? '+ ' : ''}${fmt(Math.abs(r.amount))}`}
                  />
                );
              })}
              <ResultRow label="Total money out" value={fmt(moneyOut)} highlight="primary" />
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-1.5">
              <ResultRow label="Cash you fund upfront — ads" value={fmt(cashUpfront)} />
              <ResultRow label="Financed on credit — everything else" value={fmt(financed)} highlight="primary" />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Credit repayment
                  <span className={`ml-1.5 normal-case tracking-normal ${trancheTotalPct === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    ({trancheTotalPct}% scheduled)
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
                      <input type="text" inputMode="decimal" value={t.pct} onChange={(e) => setTranche(i, 'pct', e.target.value)} placeholder="50" className="form-input pr-6 tabular-nums" />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">due in</span>
                    <div className="relative flex-1">
                      <input type="text" inputMode="decimal" value={t.days} onChange={(e) => setTranche(i, 'days', e.target.value)} placeholder="7" className="form-input pr-9 tabular-nums" />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">days</span>
                    </div>
                    <button onClick={() => removeTranche(i)} className="rounded-md p-2 text-muted-foreground/40 transition hover:bg-rose-500/10 hover:text-rose-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {financed > 0 && (
                <div className="mt-2 overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border bg-background/40 text-left text-muted-foreground">
                        <th className="px-3 py-1.5 font-medium">Repay within</th>
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
                            <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums text-foreground">{fmt(financed * pct / 100)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="h-px bg-border" />

            <div className="grid grid-cols-2 gap-3">
              <CalcField label="Units / Order">
                <input type="text" inputMode="decimal" value={v.unitsPerOrder} onChange={(e) => set('unitsPerOrder', e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="Package Weight — g" hint={`${slabs} slab${slabs === 1 ? '' : 's'}`}>
                <input type="text" inputMode="decimal" value={v.weightGrams} onChange={(e) => set('weightGrams', e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="Avg Storage Days">
                <input type="text" inputMode="decimal" value={v.storageDays} onChange={(e) => set('storageDays', e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="RTO Damage %" hint="COGS lost on returns">
                <input type="text" inputMode="decimal" value={v.rtoCogsLossPct} onChange={(e) => set('rtoCogsLossPct', e.target.value)} className="form-input" />
              </CalcField>
              <CalcField label="Financing Fee %">
                <input type="text" inputMode="decimal" value={v.financingFeePct} onChange={(e) => set('financingFeePct', e.target.value)} className="form-input" />
              </CalcField>
            </div>

            <div className="flex flex-wrap gap-2">
              <Toggle on={v.spGstInclusive} onClick={() => set('spGstInclusive', !v.spGstInclusive)} label="Selling price is GST-inclusive" />
              <Toggle on={v.chargeOutputGst} onClick={() => set('chargeOutputGst', !v.chargeOutputGst)} label="GST registered — pay output & claim input" />
            </div>

            <div className="h-px bg-border" />

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground">
                3PL rates <span className="normal-case tracking-normal font-normal text-muted-foreground/60">(fixed)</span>
              </p>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 rounded-lg border border-border bg-background/40 p-4">
                {RATE_REFERENCE.map((r) => (
                  <div key={r.label} className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-mono font-semibold tabular-nums text-foreground">{r.value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-[11px] text-muted-foreground/70">
                Net / order @ 100% delivery would be <span className="font-medium text-foreground">{fmt(simpleNet)}</span>.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Presets Modal — same as the Profit Calculator */}
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
                  <h2 className="text-sm font-semibold text-foreground">Saved Calculations</h2>
                </div>
                <button onClick={() => setShowPresets(false)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">Save Current Values</p>
                  <div className="flex gap-2">
                    <input
                      type="text" value={presetName} onChange={(e) => setPresetName(e.target.value)}
                      placeholder="e.g. Booty Trainer, FitPro..."
                      onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsPreset()}
                      className="flex-1 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none transition"
                    />
                    <button onClick={saveCurrentAsPreset} disabled={!presetName.trim()}
                      className="rounded-lg bg-primary/15 px-3 py-2 text-[11px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-40"
                    ><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                {presets.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">Saved</p>
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
                                SP ₹{p.data?.sellingPrice} · CP ₹{p.data?.cogsPerUnit} · ROAS {p.data?.roas} · DR {p.data?.deliveryRate}% · {p.data?.orders} orders
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
                    <p className="text-[12px] text-muted-foreground/50">No saved calculations yet</p>
                    <p className="text-[10px] text-muted-foreground/30 mt-1">Set your values and save them per product</p>
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
