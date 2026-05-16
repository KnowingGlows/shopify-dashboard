'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Package, Truck, CreditCard, Receipt, Boxes, Landmark } from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { formatINR } from '@/lib/currency-converter';

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

export default function ThreePLCalculatorPage() {
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

  // ── Credit line — everything except ads is financed ───────────────────
  const financedPerShipped =
    d * (cogs + commonCost + deliveredExtra) +
    rto * (rtoCogsLoss + commonCost + rtoExtra) +
    Math.max(0, netGstBlended);
  const monthlyFinanced = monthlyShipped * financedPerShipped;
  const financingFee = monthlyFinanced * (num(v.financingFeePct) / 100);
  const monthlyCashUpfront = monthlyShipped * ad;

  const monthlyRTO = opm * rto;

  // ── Bird's-eye money flow (monthly) — every rupee in vs out ───────────
  const outCOGS = monthlyDelivered * cogs + monthlyRTO * rtoCogsLoss;
  const outForward = monthlyShipped * fwdShip;
  const outRTO = monthlyRTO * (rtoShip + rtoHandling + reversePickup + rtvHandling);
  const outFulfilment = monthlyShipped * (outbound + printing + packaging);
  const outStorage = monthlyShipped * (inward + storage);
  const outCOD = monthlyDelivered * codFee;
  const outPlatform = monthlyDelivered * convenience;
  const outGst = monthlyShipped * netGstBlended; // signed (negative = credit)
  const outAds = monthlyCashUpfront;
  const outFinancing = financingFee;
  const moneyOut =
    outCOGS + outForward + outRTO + outFulfilment + outStorage +
    outCOD + outPlatform + outGst + outAds + outFinancing;
  const moneyIn = monthlyRevenue;
  const netProfit = moneyIn - moneyOut;
  const netMarginPct = moneyIn > 0 ? (netProfit / moneyIn) * 100 : 0;

  const flowRows: { label: string; amount: number }[] = [
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
  const maxFlow = Math.max(1, ...flowRows.map((r) => Math.abs(r.amount)));

  // ── BEROAS & ad-efficiency (carried over from the simple calculator) ──
  const profitBeforeAdPerShipped = blendedPre - netGstBlended; // after every cost except ads
  const blendedRevenuePerShipped = d * sp;
  const beroas = profitBeforeAdPerShipped > 0
    ? blendedRevenuePerShipped / profitBeforeAdPerShipped
    : NaN;
  const currentRoas = ad > 0 ? blendedRevenuePerShipped / ad : NaN;
  const roiPct = ad > 0 ? (netPerShipped / ad) * 100 : NaN;

  const trancheTotalPct = tranches.reduce((s, t) => s + num(t.pct), 0);

  const addTranche = () => setTranches((t) => [...t, { pct: '', days: '' }]);
  const removeTranche = (i: number) => setTranches((t) => t.filter((_, idx) => idx !== i));
  const setTranche = (i: number, key: keyof Tranche, val: string) =>
    setTranches((t) => t.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">3PL Calculator</h1>
            <p className="text-[11px] text-muted-foreground">
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

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-border bg-card overflow-hidden"
      >
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

          {/* ── RIGHT: bird's-eye ────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Money in / out / net — the whole picture in one glance */}
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Monthly · {opm.toLocaleString('en-IN')} orders shipped · {Math.round(monthlyDelivered).toLocaleString('en-IN')} delivered
              </p>
              <div className="grid grid-cols-3 gap-3">
                <MoneyTile label="Money in" value={fmt(moneyIn)} tone="sky" sub="delivered revenue" />
                <MoneyTile label="Money out" value={fmt(moneyOut)} tone="amber" sub="all costs + ads + GST" />
                <MoneyTile
                  label="Net profit"
                  value={fmt(netProfit)}
                  tone={netProfit >= 0 ? 'emerald' : 'rose'}
                  sub={`${netMarginPct.toFixed(1)}% net margin`}
                  big
                />
              </div>
            </div>

            {/* Where every rupee goes */}
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Where the money goes
                </p>
                <p className="text-[10px] text-muted-foreground">total out <span className="font-semibold tabular-nums text-foreground">{fmt(moneyOut)}</span></p>
              </div>
              <div className="space-y-2">
                {flowRows.map((r) => {
                  const share = moneyOut > 0 ? (r.amount / moneyOut) * 100 : 0;
                  const credit = r.amount < 0;
                  return (
                    <div key={r.label}>
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="tabular-nums">
                          <span className={`font-semibold ${credit ? 'text-emerald-400' : 'text-foreground'}`}>
                            {credit ? '+' : ''}{fmt(Math.abs(r.amount))}
                          </span>
                          <span className="ml-1.5 text-[10px] text-muted-foreground/60">{Math.abs(share).toFixed(0)}%</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/50">
                        <div
                          className={`h-full rounded-full ${credit ? 'bg-emerald-400/70' : 'bg-gradient-to-r from-amber-500/70 to-amber-400'}`}
                          style={{ width: `${Math.min(100, (Math.abs(r.amount) / maxFlow) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-[12px]">
                <span className="font-medium text-foreground">Net profit / month</span>
                <span className={`font-mono text-[15px] font-bold tabular-nums ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {fmt(netProfit)}
                </span>
              </div>
            </div>

            {/* Key ratios — BEROAS & ad efficiency (from the simple calculator) */}
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Ad efficiency & break-even
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Ratio label="BEROAS" value={Number.isFinite(beroas) ? `${beroas.toFixed(2)}x` : '—'} hint="break-even ROAS" tone="violet" />
                <Ratio label="Current ROAS" value={Number.isFinite(currentRoas) ? `${currentRoas.toFixed(2)}x` : '—'} hint="rev ÷ ad spend" tone={Number.isFinite(currentRoas) && Number.isFinite(beroas) && currentRoas >= beroas ? 'emerald' : 'rose'} />
                <Ratio label="ROI" value={Number.isFinite(roiPct) ? `${roiPct.toFixed(0)}%` : '—'} hint="profit ÷ ad spend" tone={Number.isFinite(roiPct) && roiPct >= 0 ? 'emerald' : 'rose'} />
                <Ratio label="Net margin" value={`${netMarginPct.toFixed(1)}%`} hint="profit ÷ revenue" tone={netMarginPct >= 0 ? 'emerald' : 'rose'} />
                <Ratio label="Breakeven delivery" value={Number.isFinite(breakevenPct) ? `${breakevenPct.toFixed(1)}%` : '—'} hint="min delivery rate" tone={Number.isFinite(breakevenPct) && d * 100 >= breakevenPct ? 'emerald' : 'amber'} />
                <Ratio label="Net / order" value={fmt(netPerShipped)} hint="per shipped order" tone={netPerShipped >= 0 ? 'emerald' : 'rose'} />
              </div>
              <p className="mt-2.5 text-[10px] text-muted-foreground/70">
                Keep ROAS above BEROAS to stay profitable. @100% delivery, net/order would be <span className="text-foreground">{fmt(simpleNet)}</span>.
              </p>
            </div>

            {/* Credit line */}
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4">
              <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-sky-300/90">
                <CreditCard className="h-3 w-3" /> Credit line — monthly
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-card/60 p-3">
                  <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Cash upfront (ads)</p>
                  <p className="mt-1 font-mono text-[18px] font-bold tabular-nums text-foreground">{fmt(monthlyCashUpfront)}</p>
                </div>
                <div className="rounded-lg border border-sky-500/25 bg-sky-500/[0.06] p-3">
                  <p className="text-[9px] font-medium uppercase tracking-wider text-sky-300/80">Financed on credit</p>
                  <p className="mt-1 font-mono text-[18px] font-bold tabular-nums text-sky-300">{fmt(monthlyFinanced)}</p>
                </div>
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

function MoneyTile({ label, value, sub, tone, big }: {
  label: string; value: string; sub?: string;
  tone: 'sky' | 'amber' | 'emerald' | 'rose'; big?: boolean;
}) {
  const c = {
    sky:     { text: 'text-sky-400',     border: 'border-sky-500/30',     glow: 'rgba(56,189,248,0.12)' },
    amber:   { text: 'text-amber-400',   border: 'border-amber-500/30',   glow: 'rgba(251,191,36,0.12)' },
    emerald: { text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'rgba(16,185,129,0.14)' },
    rose:    { text: 'text-rose-400',    border: 'border-rose-500/30',    glow: 'rgba(244,63,94,0.14)' },
  }[tone];
  return (
    <div
      className={`stat-shimmer rounded-xl border ${c.border} bg-card/60 p-4 text-center`}
      style={{ '--glow-color': c.glow } as React.CSSProperties}
    >
      <p className="relative z-10 text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={`relative z-10 mt-1.5 font-mono font-bold tabular-nums ${c.text} ${big ? 'text-[26px]' : 'text-[20px]'}`}>{value}</p>
      {sub && <p className="relative z-10 mt-1 text-[9px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
}

function Ratio({ label, value, hint, tone }: {
  label: string; value: string; hint?: string;
  tone: 'violet' | 'emerald' | 'rose' | 'amber';
}) {
  const text = {
    violet: 'text-violet-400', emerald: 'text-emerald-400', rose: 'text-rose-400', amber: 'text-amber-400',
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-card/40 px-3 py-2.5">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-[17px] font-bold tabular-nums ${text}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[9px] text-muted-foreground/60">{hint}</p>}
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
