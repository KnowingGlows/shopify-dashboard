'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Boxes, Plus, Trash2, ChevronDown } from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { formatINR } from '@/lib/currency-converter';

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
  sellingPrice: '999',
  cogsPerUnit: '250',
  deliveryRate: '65',
  adSpendPerOrder: '300',
  ordersPerMonth: '1000',
  unitsPerOrder: '1',
  weightGrams: '500',
  storageDays: '20',
  rtoCogsLossPct: '0',
  financingFeePct: '0',
  spGstInclusive: true,
  claimGstOnCogs: false,
};

export default function ThreePLCalculatorPage() {
  const [v, setV] = useState<typeof DEFAULTS>(DEFAULTS);
  const [tranches, setTranches] = useState<Tranche[]>([
    { pct: '50', days: '7' },
    { pct: '50', days: '15' },
  ]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = <K extends keyof typeof DEFAULTS>(k: K, val: (typeof DEFAULTS)[K]) =>
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
  const outputGstPerDelivered = v.spGstInclusive
    ? sp * gstRate / (1 + gstRate)
    : sp * gstRate;
  const inputGstDeliveredOrder = (commonCost + deliveredExtra + (v.claimGstOnCogs ? cogs : 0)) * gstRate;
  const inputGstRtoOrder = (commonCost + rtoExtra + (v.claimGstOnCogs ? rtoCogsLoss : 0)) * gstRate;
  const netGstDeliveredOrder = outputGstPerDelivered - inputGstDeliveredOrder;
  const netGstRtoOrder = -inputGstRtoOrder;
  const netGstBlended = d * netGstDeliveredOrder + rto * netGstRtoOrder;

  const netPerShipped = blendedPre - ad - netGstBlended;
  const simpleNet = deliveredProfitPre - ad - netGstDeliveredOrder;

  const kSlope = deliveredProfitPre - rtoProfitPre - netGstDeliveredOrder + netGstRtoOrder;
  const kConst = rtoProfitPre - ad - netGstRtoOrder;
  const breakevenD = kSlope !== 0 ? -kConst / kSlope : NaN;
  const breakevenPct = Number.isFinite(breakevenD) ? Math.min(100, Math.max(0, breakevenD * 100)) : NaN;

  // ── Monthly ───────────────────────────────────────────────────────────
  const opm = Math.max(0, num(v.ordersPerMonth));
  const monthlyShipped = opm;
  const monthlyDelivered = opm * d;
  const monthlyRTO = opm * rto;
  const monthlyRevenue = monthlyDelivered * sp;

  const financedPerShipped =
    d * (cogs + commonCost + deliveredExtra) +
    rto * (rtoCogsLoss + commonCost + rtoExtra) +
    Math.max(0, netGstBlended);
  const monthlyFinanced = monthlyShipped * financedPerShipped;
  const financingFee = monthlyFinanced * (num(v.financingFeePct) / 100);
  const monthlyCashUpfront = monthlyShipped * ad;

  const outCOGS = monthlyDelivered * cogs + monthlyRTO * rtoCogsLoss;
  const outForward = monthlyShipped * fwdShip;
  const outRTO = monthlyRTO * (rtoShip + rtoHandling + reversePickup + rtvHandling);
  const outFulfilment = monthlyShipped * (outbound + printing + packaging);
  const outStorage = monthlyShipped * (inward + storage);
  const outCOD = monthlyDelivered * codFee;
  const outPlatform = monthlyDelivered * convenience;
  const outGst = monthlyShipped * netGstBlended;
  const outAds = monthlyCashUpfront;
  const outFinancing = financingFee;
  const total3PL = outForward + outRTO + outFulfilment + outStorage + outCOD + outPlatform;
  const moneyOut =
    outCOGS + total3PL + outGst + outAds + outFinancing;
  const moneyIn = monthlyRevenue;
  const netProfit = moneyIn - moneyOut;
  const netMarginPct = moneyIn > 0 ? (netProfit / moneyIn) * 100 : 0;

  const flowRows = [
    { label: 'Product cost (COGS)', amount: outCOGS },
    { label: 'Ad spend', amount: outAds },
    { label: 'Forward shipping', amount: outForward },
    { label: 'RTO shipping & handling', amount: outRTO },
    { label: 'Fulfilment (pick/pack/print)', amount: outFulfilment },
    { label: 'Storage & inward', amount: outStorage },
    { label: 'COD collection fees', amount: outCOD },
    { label: 'Platform fee', amount: outPlatform },
    { label: netGstBlended >= 0 ? 'Net GST payable' : 'Net GST credit', amount: outGst },
    { label: 'Financing fee', amount: outFinancing },
  ].filter((r) => Math.abs(r.amount) > 0.5).sort((a, b) => b.amount - a.amount);

  const profitBeforeAdPerShipped = blendedPre - netGstBlended;
  const blendedRevenuePerShipped = d * sp;
  const beroas = profitBeforeAdPerShipped > 0 ? blendedRevenuePerShipped / profitBeforeAdPerShipped : NaN;
  const currentRoas = ad > 0 ? blendedRevenuePerShipped / ad : NaN;
  const roiPct = ad > 0 ? (netPerShipped / ad) * 100 : NaN;

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
    <PageTransition className="mx-auto max-w-2xl p-5 space-y-5">
      {/* Header — matches the Profit Calculator page */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">3PL Calculator</h1>
          <p className="text-[11px] text-muted-foreground">COD fulfilment profit, GST offset &amp; credit line</p>
        </div>
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground hover:bg-accent/30"
        >
          Reset
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-border bg-card overflow-hidden card-hover-glow"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Boxes className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">3PL Profit Calculator</h2>
            <p className="text-[10px] text-muted-foreground">Edit the numbers that matter — rates are fixed per your plan</p>
          </div>
        </div>

        <div className="relative z-10 p-4 space-y-4">
          {/* The 5 inputs that matter */}
          <div className="grid grid-cols-2 gap-3">
            <CalcField label="Selling Price (incl. shipping) — ₹">
              <input type="text" inputMode="decimal" value={v.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} className="form-input" />
            </CalcField>
            <CalcField label="Cost of Product — ₹">
              <input type="text" inputMode="decimal" value={v.cogsPerUnit} onChange={(e) => set('cogsPerUnit', e.target.value)} className="form-input" />
            </CalcField>
            <CalcField label="Delivery Rate %" hint="rest is RTO">
              <input type="text" inputMode="decimal" value={v.deliveryRate} onChange={(e) => set('deliveryRate', e.target.value)} className="form-input" />
            </CalcField>
            <CalcField label="Ad Spend / Order — ₹">
              <input type="text" inputMode="decimal" value={v.adSpendPerOrder} onChange={(e) => set('adSpendPerOrder', e.target.value)} className="form-input" />
            </CalcField>
            <CalcField label="Orders / Month">
              <input type="text" inputMode="decimal" value={v.ordersPerMonth} onChange={(e) => set('ordersPerMonth', e.target.value)} className="form-input" />
            </CalcField>
          </div>

          <div className="h-px bg-border" />

          {/* Result rows — important metrics get credence */}
          <div className="space-y-1.5">
            <ResultRow label="Breakeven ROAS (BEROAS)" value={Number.isFinite(beroas) ? `${beroas.toFixed(2)}x` : '—'} />
            <ResultRow label="Current ROAS" value={Number.isFinite(currentRoas) ? `${currentRoas.toFixed(2)}x` : '—'} />
            <ResultRow label="Breakeven delivery rate" value={Number.isFinite(breakevenPct) ? `${breakevenPct.toFixed(1)}%` : '—'} />
            <ResultRow label="Revenue / month" value={fmt(moneyIn)} />
            <ResultRow label="Total 3PL cost / month" value={fmt(total3PL)} />
            <ResultRow label="Ad spend / month" value={fmt(outAds)} />
            <ResultRow label={netGstBlended >= 0 ? 'Net GST / month' : 'Net GST credit / month'} value={fmt(outGst)} />
            <ResultRow label="Net profit / shipped order" value={fmt(netPerShipped)} highlight="primary" />
            <ResultRow label="Net profit / month" value={fmt(netProfit)} highlight="success" />
          </div>

          {/* The single most important number */}
          <div
            className="stat-shimmer glow-pulse rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center"
            style={{ '--glow-color': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}
          >
            <p className="relative z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Net Profit / Month
            </p>
            <p className={`relative z-10 text-4xl font-bold font-mono ${netProfit >= 0 ? 'gradient-text-emerald' : 'text-rose-400'}`}>
              {fmt(netProfit)}
            </p>
            <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">
              {netMarginPct.toFixed(1)}% net margin
              {Number.isFinite(roiPct) && <> · {roiPct.toFixed(0)}% ROI on ads</>}
            </p>
          </div>

          {/* Advanced — everything secondary lives here */}
          <button
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            <span>Advanced — fixed rates · GST · credit line · full breakdown</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence initial={false}>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="space-y-4 pt-1">
                  {/* Secondary inputs */}
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
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">GST treatment</p>
                    <div className="flex flex-wrap gap-2">
                      <Toggle on={v.spGstInclusive} onClick={() => set('spGstInclusive', !v.spGstInclusive)} label="Selling price is GST-inclusive" />
                      <Toggle on={v.claimGstOnCogs} onClick={() => set('claimGstOnCogs', !v.claimGstOnCogs)} label="Claim input GST on COGS" />
                    </div>
                  </div>

                  <div className="h-px bg-border" />

                  {/* Full money breakdown */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Where the money goes · monthly</p>
                      <p className="text-[10px] text-muted-foreground">out <span className="font-semibold tabular-nums text-foreground">{fmt(moneyOut)}</span></p>
                    </div>
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
                    </div>
                  </div>

                  <div className="h-px bg-border" />

                  {/* Credit line */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Credit line
                        <span className={`ml-1.5 normal-case tracking-normal ${trancheTotalPct === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          ({trancheTotalPct}% scheduled)
                        </span>
                      </p>
                      <button onClick={addTranche} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition hover:text-foreground">
                        <Plus className="h-3 w-3" /> Tranche
                      </button>
                    </div>
                    <div className="mb-2 grid grid-cols-2 gap-3">
                      <CalcField label="Financing Fee %">
                        <input type="text" inputMode="decimal" value={v.financingFeePct} onChange={(e) => set('financingFeePct', e.target.value)} className="form-input" />
                      </CalcField>
                    </div>
                    <div className="space-y-1.5">
                      <ResultRow label="Cash you fund upfront — ads" value={fmt(monthlyCashUpfront)} />
                      <ResultRow label="Financed on credit — everything else" value={fmt(monthlyFinanced)} highlight="primary" />
                    </div>
                    <div className="mt-2 space-y-1.5">
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
                    {monthlyFinanced > 0 && (
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
                                  <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums text-foreground">{fmt(monthlyFinanced * pct / 100)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="h-px bg-border" />

                  {/* Fixed rate reference */}
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      3PL rates <span className="normal-case tracking-normal text-muted-foreground/50">(fixed)</span>
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border bg-background/40 p-3">
                      {RATE_REFERENCE.map((r) => (
                        <div key={r.label} className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground/80">{r.label}</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">{r.value}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground/60">
                      Net / order @ 100% delivery would be <span className="text-foreground">{fmt(simpleNet)}</span>.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
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
