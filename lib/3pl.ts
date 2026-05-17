// Shared 3PL economics engine.
//
// This is the single source of truth for COD fulfilment profit, GST offset and
// BEROAS. Both the 3PL Calculator page and the Product page (which derives a
// product's BEROAS + gross margin from its COGS / selling price / delivery
// rate) compute through here, so the numbers stay woven together everywhere.
//
// All money is ₹ INR. Rates below are fixed per the ops plan.

export const FEES = {
  fwdShip: 55, rtoShip: 55, codFlat: 35, codPct: 1.7,
  inward: 5, storagePerDay: 0.1, rtoHandling: 5, reversePickup: 5, rtvHandling: 0,
  outbound: 8, printing: 2, packaging: 10,
  convPct: 3, convMin: 30, convCap: 120, paymentPct: 3, gstRate: 18,
};

export const RATE_REFERENCE: { label: string; value: string }[] = [
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
  { label: 'Payment processing', value: '3%' },
  { label: 'GST', value: '18%' },
];

export interface ThreePLInput {
  sellingPrice: number;
  cogsPerUnit: number;     // ₹ per unit
  deliveryRate: number;    // 0–100 percent
  roas: number;
  orders: number;
  unitsPerOrder: number;
  weightGrams: number;
  storageDays: number;
  financingFeePct: number;
  spGstInclusive: boolean;
  chargeOutputGst: boolean;
}

export interface ThreePLResult {
  sp: number;
  cogs: number;
  units: number;
  slabs: number;
  d: number;
  rto: number;
  roas: number;
  ad: number;
  gstRate: number;
  commonCost: number;
  deliveredExtra: number;
  rtoExtra: number;
  payment: number;
  outPayment: number;
  deliveredProfitPre: number;
  rtoProfitPre: number;
  blendedPre: number;
  outputGstPerDelivered: number;
  inputGstDeliveredOrder: number;
  inputGstRtoOrder: number;
  netGstDeliveredOrder: number;
  netGstRtoOrder: number;
  netGstBlended: number;
  netPerShipped: number;
  simpleNet: number;
  shipped: number;
  delivered: number;
  rtoOrders: number;
  shopifyRevenue: number;
  totalRevenue: number;
  financedPerShipped: number;
  financed: number;
  financingFee: number;
  cashUpfront: number;
  outCOGS: number;
  stockRecovered: number;
  procurementCost: number;
  outForward: number;
  outRTO: number;
  outFulfilment: number;
  outStorage: number;
  outCOD: number;
  outPlatform: number;
  outGst: number;
  outputGstOwed: number;
  inputGstPaid: number;
  inputGstClaimed: number;
  inputGstSunk: number;
  outAds: number;
  outFinancing: number;
  total3PL: number;
  moneyOut: number;
  moneyIn: number;
  profitBeforeGst: number;
  netProfit: number;
  netMarginPct: number;
  grossProfit: number;
  grossMarginPct: number;
  beroas: number;
}

const n = (x: number) => (Number.isFinite(x) ? x : 0);

/**
 * The full 3PL model. Inputs are already-parsed numbers; every derived value
 * the calculator (and the product economics block) renders is returned here.
 */
export function compute3PL(i: ThreePLInput): ThreePLResult {
  const sp = n(i.sellingPrice);
  const units = Math.max(1, n(i.unitsPerOrder));
  const cogs = n(i.cogsPerUnit) * units;
  const slabs = Math.max(1, Math.ceil(n(i.weightGrams) / 500));
  const d = Math.min(1, Math.max(0, n(i.deliveryRate) / 100));
  const rto = 1 - d;
  const roas = n(i.roas);
  const ad = roas > 0 ? sp / roas : 0; // ad spend / order = order value ÷ ROAS
  const gstRate = FEES.gstRate / 100;

  const fwdShip = FEES.fwdShip * slabs;
  const rtoShip = FEES.rtoShip * slabs;
  const codFee = Math.max(FEES.codFlat, sp * FEES.codPct / 100);
  const inward = FEES.inward * units;
  const storage = FEES.storagePerDay * units * n(i.storageDays);
  const outbound = FEES.outbound * units;
  const printing = FEES.printing;
  const packaging = FEES.packaging;
  const convenience = Math.min(FEES.convCap, Math.max(FEES.convMin, sp * FEES.convPct / 100));
  // Payment processing — flat 3% of total revenue (every booked order). No
  // GST treatment: a straight deduction from the order value.
  const payment = sp * FEES.paymentPct / 100;
  const rtoHandling = FEES.rtoHandling * units;
  const reversePickup = FEES.reversePickup * units;
  const rtvHandling = FEES.rtvHandling * units;

  const commonCost = inward + storage + outbound + printing + packaging + fwdShip;
  const deliveredExtra = codFee + convenience;
  const rtoExtra = rtoShip + rtoHandling + reversePickup + rtvHandling;

  // You pay the FULL COGS up front for every unit procured/shipped. A
  // delivered order consumes its unit (real COGS). An RTO order's unit comes
  // back as reusable stock → that COGS is recovered, so the only true RTO
  // losses are shipping + handling (commonCost + rtoExtra).
  // Payment processing: flat 3% of revenue on EVERY booked order (delivered or
  // RTO), no GST treatment — a straight deduction from the order value.
  const deliveredProfitPre = sp - cogs - commonCost - deliveredExtra - payment;
  const rtoProfitPre = -commonCost - rtoExtra - payment;
  const blendedPre = d * deliveredProfitPre + rto * rtoProfitPre;

  // ── GST ───────────────────────────────────────────────────────────────
  const gstActive = i.chargeOutputGst;
  const outputGstPerDelivered = !gstActive
    ? 0
    : i.spGstInclusive
      ? sp * gstRate / (1 + gstRate)
      : sp * gstRate;
  const inputGstDeliveredOrder = (commonCost + deliveredExtra + cogs) * gstRate;
  const inputGstRtoOrder = (commonCost + rtoExtra + cogs) * gstRate;
  const netGstDeliveredOrder = gstActive
    ? outputGstPerDelivered - inputGstDeliveredOrder
    : inputGstDeliveredOrder;
  const netGstRtoOrder = gstActive ? -inputGstRtoOrder : inputGstRtoOrder;
  const netGstBlended = d * netGstDeliveredOrder + rto * netGstRtoOrder;

  const netPerShipped = blendedPre - ad - netGstBlended;
  const simpleNet = deliveredProfitPre - ad - netGstDeliveredOrder;

  // ── Batch totals (for the order count entered — no time frame) ──────────
  const qty = Math.max(0, n(i.orders));
  const shipped = qty;
  const delivered = qty * d;
  const rtoOrders = qty * rto;
  const shopifyRevenue = shipped * sp;   // gross booked on Shopify (all orders)
  const totalRevenue = delivered * sp;   // actually collected — COD, delivered only

  const financedPerShipped =
    d * (cogs * (1 + gstRate) + commonCost + deliveredExtra) +
    rto * (cogs * (1 + gstRate) + commonCost + rtoExtra) +
    Math.max(0, netGstBlended);
  const financed = shipped * financedPerShipped;
  const financingFee = financed * (n(i.financingFeePct) / 100);
  const cashUpfront = shipped * ad;

  const outCOGS = shipped * cogs;                 // full product cost paid procuring all units
  const stockRecovered = rtoOrders * cogs;        // RTO units returned to inventory (added back)

  // Procurement cost (display only — what cash it takes to get stock in).
  const procurementCost = (outCOGS + shipped * inward) * (1 + gstRate);
  const outForward = shipped * fwdShip;
  const outRTO = rtoOrders * (rtoShip + rtoHandling + reversePickup + rtvHandling);
  const outFulfilment = shipped * (outbound + printing + packaging);
  const outStorage = shipped * (inward + storage);
  const outCOD = delivered * codFee;
  const outPlatform = delivered * convenience;
  const outPayment = shipped * payment; // 3% on every booked order
  const outGst = shipped * netGstBlended;
  const outputGstOwed = delivered * outputGstPerDelivered;
  const inputGstPaid = delivered * inputGstDeliveredOrder + rtoOrders * inputGstRtoOrder;
  const inputGstClaimed = gstActive ? inputGstPaid : 0;
  const inputGstSunk = gstActive ? 0 : inputGstPaid;
  const outAds = cashUpfront;
  const outFinancing = financingFee;
  const total3PL = outForward + outRTO + outFulfilment + outStorage + outCOD + outPlatform + outPayment;
  const moneyOut = outCOGS - stockRecovered + total3PL + outGst + outAds + outFinancing;
  const moneyIn = totalRevenue;
  const profitBeforeGst = moneyIn - outCOGS + stockRecovered - total3PL - outAds - outFinancing;
  const netProfit = moneyIn - moneyOut;
  const netMarginPct = moneyIn > 0 ? (netProfit / moneyIn) * 100 : 0;
  const grossProfit = netProfit + outAds;
  const grossMarginPct = moneyIn > 0 ? (grossProfit / moneyIn) * 100 : 0;

  const profitBeforeAdPerShipped = blendedPre - netGstBlended;
  const beroas = profitBeforeAdPerShipped > 0 ? sp / profitBeforeAdPerShipped : NaN;

  return {
    sp, cogs, units, slabs, d, rto, roas, ad, gstRate,
    commonCost, deliveredExtra, rtoExtra, payment, outPayment,
    deliveredProfitPre, rtoProfitPre, blendedPre,
    outputGstPerDelivered, inputGstDeliveredOrder, inputGstRtoOrder,
    netGstDeliveredOrder, netGstRtoOrder, netGstBlended,
    netPerShipped, simpleNet,
    shipped, delivered, rtoOrders, shopifyRevenue, totalRevenue,
    financedPerShipped, financed, financingFee, cashUpfront,
    outCOGS, stockRecovered, procurementCost,
    outForward, outRTO, outFulfilment, outStorage, outCOD, outPlatform,
    outGst, outputGstOwed, inputGstPaid, inputGstClaimed, inputGstSunk,
    outAds, outFinancing, total3PL,
    moneyOut, moneyIn, profitBeforeGst, netProfit, netMarginPct,
    grossProfit, grossMarginPct, beroas,
  };
}

export interface ProductEconomics {
  beroas: number;          // breakeven ROAS (NaN if SP can't cover costs)
  grossMarginPct: number;  // % of delivered revenue kept before ad spend
  netMarginPct: number;    // % kept after ads (at the given ROAS, 0 = no ads)
}

/**
 * A product's economics, independent of any single campaign. Selling price,
 * COGS (₹) and delivery rate are the only product-level inputs; everything
 * else uses the fixed 3PL assumptions (1 unit / 500g / 20 storage days /
 * GST-inclusive price / GST registered). BEROAS and gross margin are
 * ROAS-independent, so this holds across all of the product's LPs and ads.
 */
export function productEconomics(
  sellingPrice: number,
  cogsPerUnitINR: number,
  deliveryRate: number,
): ProductEconomics {
  const r = compute3PL({
    sellingPrice,
    cogsPerUnit: cogsPerUnitINR,
    deliveryRate,
    roas: 0,
    orders: 1,
    unitsPerOrder: 1,
    weightGrams: 500,
    storageDays: 20,
    financingFeePct: 0,
    spGstInclusive: true,
    chargeOutputGst: true,
  });
  return {
    beroas: r.beroas,
    grossMarginPct: r.grossMarginPct,
    netMarginPct: r.netMarginPct,
  };
}

/** Breakeven ROAS for a product. Returns 0 when it can't be computed. */
export function productBeroas(
  sellingPrice: number,
  cogsPerUnitINR: number,
  deliveryRate: number,
): number {
  const b = productEconomics(sellingPrice, cogsPerUnitINR, deliveryRate).beroas;
  return Number.isFinite(b) && b > 0 ? b : 0;
}

export type FulfilmentMode = '3pl' | 'own';

/**
 * Own-warehouse economics — when you fulfil from your own warehouse instead of
 * the 3PL. No 3PL shipping / COD / storage / inward fees. Only:
 *   • COGS (₹ per order)
 *   • a fixed packing + warehousing cost per order
 *   • flat 3% payment processing on every booked order (no GST on it)
 * GST handled the same way as the product 3PL path (price GST-inclusive, GST
 * registered → output GST owed, input GST on COGS + packing reclaimed). RTO
 * recovers the unit (COGS back to stock); packing/warehousing and the 3% are
 * still incurred.
 */
export function ownWarehouseEconomics(
  sellingPrice: number,
  cogsPerUnitINR: number,
  deliveryRate: number,
  packingPerOrder: number,
): ProductEconomics {
  const sp = Number.isFinite(sellingPrice) ? sellingPrice : 0;
  const cogs = Number.isFinite(cogsPerUnitINR) ? cogsPerUnitINR : 0;
  const packing = Number.isFinite(packingPerOrder) ? Math.max(0, packingPerOrder) : 0;
  const d = Math.min(1, Math.max(0, (Number(deliveryRate) || 0) / 100));
  const rto = 1 - d;
  const gstRate = FEES.gstRate / 100;
  const payment = sp * FEES.paymentPct / 100;

  // Payment processing: flat 3% of revenue on every booked order, NO GST.
  const deliveredProfitPre = sp - cogs - packing - payment;
  const rtoProfitPre = -packing - payment; // COGS recovered; packing + 3% still incurred
  const blendedPre = d * deliveredProfitPre + rto * rtoProfitPre;

  // Price is GST-inclusive, GST registered (mirrors productEconomics).
  // Payment processing is NOT in the GST base.
  const outputGstPerDelivered = sp * gstRate / (1 + gstRate);
  const inputGstDeliveredOrder = (cogs + packing) * gstRate;
  const inputGstRtoOrder = (cogs + packing) * gstRate;
  const netGstDeliveredOrder = outputGstPerDelivered - inputGstDeliveredOrder;
  const netGstRtoOrder = -inputGstRtoOrder;
  const netGstBlended = d * netGstDeliveredOrder + rto * netGstRtoOrder;

  const profitBeforeAdPerShipped = blendedPre - netGstBlended;
  const beroas = profitBeforeAdPerShipped > 0 ? sp / profitBeforeAdPerShipped : NaN;

  // No ads (ROAS-independent), 1 shipped order basis — matches productEconomics.
  const moneyIn = d * sp;
  const moneyOut = d * cogs            // net COGS (RTO recovered)
    + packing                          // packing incurred on the shipped order
    + payment                          // 3% on every booked order
    + netGstBlended;                   // net GST (owed − reclaimed)
  const net = moneyIn - moneyOut;
  const marginPct = moneyIn > 0 ? (net / moneyIn) * 100 : 0;
  return { beroas, grossMarginPct: marginPct, netMarginPct: marginPct };
}

interface ProductLike {
  sellingPrice?: number;
  cogs?: number;
  deliveryRate?: number;
  fulfilmentMode?: FulfilmentMode;
  ownPackingCost?: number;
}

/** Economics for a product, picking the 3PL or own-warehouse model by its
 *  fulfilmentMode. */
export function productEconomicsOf(p: ProductLike): ProductEconomics {
  const sp = Number(p.sellingPrice) || 0;
  const cogs = Number(p.cogs) || 0;
  const dr = Number(p.deliveryRate) || 0;
  if (p.fulfilmentMode === 'own') {
    return ownWarehouseEconomics(sp, cogs, dr, Number(p.ownPackingCost) || 0);
  }
  return productEconomics(sp, cogs, dr);
}

/** Breakeven ROAS for a product (mode-aware). 0 when not computable. */
export function productBeroasOf(p: ProductLike): number {
  const b = productEconomicsOf(p).beroas;
  return Number.isFinite(b) && b > 0 ? b : 0;
}
