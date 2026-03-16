import { NextResponse } from 'next/server';
import { getShopifyStores } from '@/lib/shopify-config';
import { fetchAllStoresOrders } from '@/lib/shopify-api';
import { trackShipments, getDelhiveryToken, type DelhiveryShipment } from '@/lib/delhivery';

/**
 * COD Cashflow Projection API
 *
 * Uses real Delhivery tracking data to project exactly when COD money
 * will hit the bank account. Per-store and per-day granularity.
 *
 * Logic:
 * - Delivered COD → deposit = deliveryDate + REMITTANCE_DAYS
 * - In Transit COD → est. delivery = orderDate + avgDeliveryDays, then + REMITTANCE_DAYS
 * - Out for Delivery → est. delivery = today/tomorrow, then + REMITTANCE_DAYS
 * - NDR/Attempted → apply ndrResolutionRate probability
 * - RTO/Cancelled → ₹0
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REMITTANCE_DAYS = 2; // COD remittance: money credited on D+2 from delivery

function toISTDateStr(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

function parseISTDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - IST_OFFSET_MS);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00+05:30');
  d.setDate(d.getDate() + days);
  return toISTDateStr(d);
}

/**
 * Calculate remittance (bank deposit) date from delivery date.
 * Based on actual Delhivery remittance data:
 * - Mon delivery → Wed (D+2)
 * - Tue delivery → Thu (D+2)
 * - Wed delivery → Fri (D+2)
 * - Thu delivery → Sat (D+2)
 * - Fri delivery → Mon (D+3, no Sunday deposits)
 * - Sat delivery → Tue (D+3, Sat+Sun combined on Tue)
 * - Sun delivery → Tue (D+2, Sat+Sun combined on Tue)
 * No deposits ever land on Sunday.
 */
function getRemittanceDate(deliveryDateStr: string): string {
  const d = new Date(deliveryDateStr + 'T00:00:00+05:30');
  const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

  if (dow === 5) return addDays(deliveryDateStr, 3);      // Fri → Mon
  if (dow === 6) return addDays(deliveryDateStr, 3);      // Sat → Tue
  if (dow === 0) return addDays(deliveryDateStr, 2);      // Sun → Tue
  return addDays(deliveryDateStr, REMITTANCE_DAYS);        // Mon-Thu → D+2
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00+05:30').getTime();
  const b = new Date(to + 'T00:00:00+05:30').getTime();
  return Math.round((b - a) / DAY_MS);
}

type Confidence = 'confirmed' | 'high' | 'medium' | 'low';

interface ProjectedDeposit {
  depositDate: string;
  amount: number;          // weighted by confidence
  rawAmount: number;       // actual order value
  confidence: Confidence;
  orderId: string;
  orderName: string;
  storeName: string;
  deliveryDate: string;    // actual or estimated
  status: string;
  customerName?: string;
  awb?: string;
}

interface DailyProjection {
  date: string;
  confirmed: number;    // already delivered, waiting for remittance
  highConf: number;     // out for delivery
  mediumConf: number;   // in transit
  lowConf: number;      // NDR with some chance of delivery
  total: number;        // weighted sum
  orderCount: number;
  deposits: ProjectedDeposit[];
}

interface StoreProjection {
  storeName: string;
  dailyProjections: Record<string, DailyProjection>;
  summary: {
    totalConfirmed: number;
    totalProjected: number;
    totalOrders: number;
    avgDeliveryDays: number | null;
    deliveryRate: number;
    ndrResolutionRate: number;
  };
}

export async function GET(request: Request) {
  try {
    const stores = await getShopifyStores();
    if (stores.length === 0) {
      return NextResponse.json({ error: 'No stores configured' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const projectionDays = parseInt(searchParams.get('days') ?? '30', 10);

    const now = new Date();
    const todayStr = toISTDateStr(now);

    // Fetch last 45 days of orders (need historical delivered orders for remittance pipeline)
    const todayStart = parseISTDate(todayStr);
    const createdAtMin = new Date(todayStart.getTime() - 44 * DAY_MS).toISOString();
    const createdAtMax = now.toISOString();

    const { ordersData } = await fetchAllStoresOrders(stores, { createdAtMin, createdAtMax });

    // ── Collect AWBs ──────────────────────────────────────────────────
    const awbMap = new Map<string, { storeName: string; orderId: string }>();
    for (const { storeName, orders } of ordersData) {
      for (const order of orders) {
        const awb = order.fulfillments?.[0]?.tracking_number;
        if (awb && order.fulfillment_status === 'fulfilled') {
          awbMap.set(awb, { storeName, orderId: order.id });
        }
      }
    }

    // ── Fetch Delhivery tracking ──────────────────────────────────────
    let delhiveryData = new Map<string, DelhiveryShipment>();
    const token = await getDelhiveryToken();
    if (token && awbMap.size > 0) {
      try {
        delhiveryData = await trackShipments(Array.from(awbMap.keys()));
      } catch (e) {
        console.error('Delhivery tracking failed:', e);
      }
    }

    // ── Debug stats ────────────────────────────────────────────────────
    const debugStats = {
      totalOrders: ordersData.reduce((s, d) => s + d.orders.length, 0),
      codOrders: ordersData.reduce((s, d) => s + d.orders.filter(o => o.financial_status === 'pending').length, 0),
      fulfilledCod: ordersData.reduce((s, d) => s + d.orders.filter(o => o.financial_status === 'pending' && o.fulfillment_status === 'fulfilled').length, 0),
      awbCount: awbMap.size,
      delhiveryTracked: delhiveryData.size,
      delhiveryDelivered: Array.from(delhiveryData.values()).filter(s => s.deliveryDate).length,
      delhiveryDeliveredDL: Array.from(delhiveryData.values()).filter(s => s.statusType === 'DL').length,
      sampleDelivered: Array.from(delhiveryData.values()).filter(s => s.deliveryDate).slice(0, 3).map(s => ({
        awb: s.awb, status: s.status, deliveryDate: s.deliveryDate?.substring(0, 10), cod: s.codAmount, ref: s.referenceNo,
      })),
    };
    console.log('COD Projection Debug:', JSON.stringify(debugStats));

    // ── Per-store historical metrics ──────────────────────────────────
    // Calculate avg delivery days and delivery rate per store
    const storeMetrics: Record<string, {
      deliveryDays: number[];
      totalFulfilled: number;
      totalDelivered: number;
      totalNdr: number;
      ndrResolved: number;
    }> = {};

    for (const { storeName, orders } of ordersData) {
      if (!storeMetrics[storeName]) {
        storeMetrics[storeName] = { deliveryDays: [], totalFulfilled: 0, totalDelivered: 0, totalNdr: 0, ndrResolved: 0 };
      }
      const m = storeMetrics[storeName];

      for (const order of orders) {
        if (order.financial_status !== 'pending') continue; // COD only
        if (order.cancelled_at) continue;
        const awb = order.fulfillments?.[0]?.tracking_number;
        if (!awb) continue;

        const dShip = delhiveryData.get(awb);
        if (!dShip) continue;

        // RTO check
        if (dShip.rtoStartedDate || dShip.returnedDate || dShip.reverseInTransit) {
          m.totalFulfilled++;
          continue;
        }

        m.totalFulfilled++;

        if (dShip.deliveryDate) {
          m.totalDelivered++;
          const orderDate = toISTDateStr(new Date(order.created_at));
          const delivDate = toISTDateStr(new Date(dShip.deliveryDate));
          const days = daysBetween(orderDate, delivDate);
          if (days >= 0 && days <= 30) m.deliveryDays.push(days);
        }

        if (dShip.ndrCount > 0) {
          m.totalNdr++;
          if (dShip.deliveryDate) m.ndrResolved++;
        }
      }
    }

    // ── Build projections per store ───────────────────────────────────
    const storeProjections: Record<string, StoreProjection> = {};

    for (const { storeName, orders } of ordersData) {
      const m = storeMetrics[storeName] ?? { deliveryDays: [], totalFulfilled: 0, totalDelivered: 0, totalNdr: 0, ndrResolved: 0 };
      const avgDelivDays = m.deliveryDays.length > 0
        ? Math.round(m.deliveryDays.reduce((a, b) => a + b, 0) / m.deliveryDays.length * 10) / 10
        : 5; // default 5 days if no data
      const deliveryRate = m.totalFulfilled > 0 ? m.totalDelivered / m.totalFulfilled : 0.7;
      const ndrRate = m.totalNdr > 0 ? m.ndrResolved / m.totalNdr : 0.3;

      const dailyProjections: Record<string, DailyProjection> = {};
      const ensureDay = (date: string) => {
        if (!dailyProjections[date]) {
          dailyProjections[date] = {
            date, confirmed: 0, highConf: 0, mediumConf: 0, lowConf: 0,
            total: 0, orderCount: 0, deposits: [],
          };
        }
        return dailyProjections[date];
      };

      for (const order of orders) {
        // COD only
        if (order.financial_status !== 'pending') continue;
        if (order.cancelled_at) continue;

        const amount = parseFloat(order.total_price) || 0;
        if (amount <= 0) continue;

        const awb = order.fulfillments?.[0]?.tracking_number;
        const dShip = awb ? delhiveryData.get(awb) : undefined;
        const orderDate = toISTDateStr(new Date(order.created_at));
        const customerName = order.customer
          ? `${order.customer.first_name ?? ''} ${order.customer.last_name ?? ''}`.trim()
          : undefined;

        // Use Delhivery's CODAmount (actual collection amount) when available
        const codAmount = (dShip && dShip.codAmount > 0) ? dShip.codAmount : amount;

        let depositDate: string | null = null;
        let deliveryDate: string;
        let confidence: Confidence;
        let weightedAmount: number;
        let status: string;

        if (dShip?.returnedDate || dShip?.reverseInTransit || dShip?.rtoStartedDate) {
          // RTO — no money coming
          continue;
        }

        if (dShip?.deliveryDate) {
          // ── CONFIRMED: Already delivered, just waiting for remittance ──
          deliveryDate = toISTDateStr(new Date(dShip.deliveryDate));
          depositDate = getRemittanceDate(deliveryDate);
          confidence = 'confirmed';
          weightedAmount = codAmount; // 100%
          status = 'Delivered';
        } else if (!order.fulfillment_status || order.fulfillment_status === 'null') {
          // Unfulfilled — skip, not shipped yet
          continue;
        } else if (dShip) {
          // Has Delhivery data but not yet delivered
          const inst = (dShip.instructions ?? '').toLowerCase();
          const scanStatus = (dShip.statusRaw ?? '').toLowerCase();

          if (scanStatus === 'dispatched' || inst.includes('out for delivery')) {
            // ── HIGH: Out for delivery ──
            deliveryDate = todayStr;
            depositDate = getRemittanceDate(deliveryDate);
            confidence = 'high';
            weightedAmount = Math.round(codAmount * 0.9); // 90%
            status = 'Out for Delivery';
          } else if (dShip.ndrCount > 0) {
            // ── LOW: NDR — apply resolution rate ──
            const estDays = Math.ceil(avgDelivDays + 2); // NDR adds ~2 days
            deliveryDate = addDays(orderDate, estDays);
            if (deliveryDate < todayStr) deliveryDate = addDays(todayStr, 2);
            depositDate = getRemittanceDate(deliveryDate);
            confidence = 'low';
            weightedAmount = Math.round(codAmount * ndrRate); // ndrResolutionRate
            status = `NDR (${dShip.ndrCount} attempts)`;
          } else {
            // ── MEDIUM: In transit ──
            const estDays = Math.ceil(avgDelivDays);
            deliveryDate = addDays(orderDate, estDays);
            if (deliveryDate < todayStr) deliveryDate = addDays(todayStr, 1);
            depositDate = getRemittanceDate(deliveryDate);
            confidence = 'medium';
            weightedAmount = Math.round(codAmount * deliveryRate); // delivery rate
            status = 'In Transit';
          }
        } else {
          // Fulfilled but no Delhivery data — estimate
          const estDays = Math.ceil(avgDelivDays);
          deliveryDate = addDays(orderDate, estDays);
          if (deliveryDate < todayStr) deliveryDate = addDays(todayStr, 1);
          depositDate = getRemittanceDate(deliveryDate);
          confidence = 'medium';
          weightedAmount = Math.round(amount * deliveryRate);
          status = 'In Transit (est.)';
        }

        if (!depositDate) continue;

        // Only include deposits within the projection window
        const daysFromToday = daysBetween(todayStr, depositDate);
        if (daysFromToday < 0 || daysFromToday > projectionDays) continue;

        const day = ensureDay(depositDate);
        day.orderCount++;
        day.total += weightedAmount;

        if (confidence === 'confirmed') day.confirmed += weightedAmount;
        else if (confidence === 'high') day.highConf += weightedAmount;
        else if (confidence === 'medium') day.mediumConf += weightedAmount;
        else day.lowConf += weightedAmount;

        day.deposits.push({
          depositDate,
          amount: weightedAmount,
          rawAmount: codAmount,
          confidence,
          orderId: order.id,
          orderName: order.name,
          storeName,
          deliveryDate,
          status,
          customerName,
          awb: awb ?? undefined,
        });
      }

      storeProjections[storeName] = {
        storeName,
        dailyProjections,
        summary: {
          totalConfirmed: Object.values(dailyProjections).reduce((s, d) => s + d.confirmed, 0),
          totalProjected: Object.values(dailyProjections).reduce((s, d) => s + d.total, 0),
          totalOrders: Object.values(dailyProjections).reduce((s, d) => s + d.orderCount, 0),
          avgDeliveryDays: m.deliveryDays.length > 0
            ? Math.round(m.deliveryDays.reduce((a, b) => a + b, 0) / m.deliveryDays.length * 10) / 10
            : null,
          deliveryRate: Math.round(deliveryRate * 1000) / 10,
          ndrResolutionRate: Math.round(ndrRate * 1000) / 10,
        },
      };
    }

    // ── Combined daily projections ────────────────────────────────────
    const combinedDaily: Record<string, DailyProjection> = {};
    for (const store of Object.values(storeProjections)) {
      for (const [date, day] of Object.entries(store.dailyProjections)) {
        if (!combinedDaily[date]) {
          combinedDaily[date] = {
            date, confirmed: 0, highConf: 0, mediumConf: 0, lowConf: 0,
            total: 0, orderCount: 0, deposits: [],
          };
        }
        const c = combinedDaily[date];
        c.confirmed += day.confirmed;
        c.highConf += day.highConf;
        c.mediumConf += day.mediumConf;
        c.lowConf += day.lowConf;
        c.total += day.total;
        c.orderCount += day.orderCount;
        c.deposits.push(...day.deposits);
      }
    }

    // Fill empty days in the projection window
    for (let i = 0; i <= projectionDays; i++) {
      const date = addDays(todayStr, i);
      if (!combinedDaily[date]) {
        combinedDaily[date] = {
          date, confirmed: 0, highConf: 0, mediumConf: 0, lowConf: 0,
          total: 0, orderCount: 0, deposits: [],
        };
      }
    }

    const combinedSummary = {
      totalConfirmed: Object.values(combinedDaily).reduce((s, d) => s + d.confirmed, 0),
      totalProjected: Object.values(combinedDaily).reduce((s, d) => s + d.total, 0),
      totalOrders: Object.values(combinedDaily).reduce((s, d) => s + d.orderCount, 0),
    };

    return NextResponse.json({
      success: true,
      today: todayStr,
      projectionDays,
      remittanceDays: REMITTANCE_DAYS,
      debug: debugStats,
      stores: storeProjections,
      combined: {
        dailyProjections: combinedDaily,
        summary: combinedSummary,
      },
    });
  } catch (error) {
    console.error('COD projection error:', error);
    return NextResponse.json(
      { error: 'Failed to generate projection', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
