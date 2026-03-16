import { NextResponse } from 'next/server';
import { getShopifyStores } from '@/lib/shopify-config';
import { fetchAllStoresOrders } from '@/lib/shopify-api';
import { trackShipments, getDelhiveryToken } from '@/lib/delhivery';

export const maxDuration = 60;

/**
 * Simple COD Cashflow Projection
 *
 * Uses last 7 days of actual Delhivery delivery data per store:
 * 1. Calculate avg daily COD delivered amount per store
 * 2. Project that forward for next 14 days
 * 3. Apply D+2 remittance with weekend rules:
 *    - Mon-Thu delivery → D+2
 *    - Fri delivery → Mon
 *    - Sat delivery → Tue
 *    - Sun delivery → Tue
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00+05:30').getDay();
}

/**
 * Remittance date from delivery date:
 * Mon-Thu → D+2, Fri → Mon, Sat → Tue, Sun → Tue
 */
function getRemittanceDate(deliveryDateStr: string): string {
  const dow = getDayOfWeek(deliveryDateStr);
  if (dow === 5) return addDays(deliveryDateStr, 3);  // Fri → Mon
  if (dow === 6) return addDays(deliveryDateStr, 3);  // Sat → Tue
  if (dow === 0) return addDays(deliveryDateStr, 2);  // Sun → Tue
  return addDays(deliveryDateStr, 2);                  // Mon-Thu → D+2
}

export async function GET(request: Request) {
  try {
    const stores = await getShopifyStores();
    if (stores.length === 0) {
      return NextResponse.json({ error: 'No stores configured' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const projectionDays = parseInt(searchParams.get('days') ?? '14', 10);
    const now = new Date();
    const todayStr = toISTDateStr(now);

    // Fetch last 14 days of orders (7 days for baseline + buffer for delivery tracking)
    const todayStart = parseISTDate(todayStr);
    const createdAtMin = new Date(todayStart.getTime() - 13 * DAY_MS).toISOString();
    const createdAtMax = now.toISOString();

    const { ordersData } = await fetchAllStoresOrders(stores, { createdAtMin, createdAtMax });

    // Collect all AWBs for Delhivery tracking
    const allAwbs: string[] = [];
    for (const { orders } of ordersData) {
      for (const order of orders) {
        const awb = order.fulfillments?.[0]?.tracking_number;
        if (awb) allAwbs.push(awb);
      }
    }

    // Track via Delhivery
    let delhiveryData = new Map<string, { deliveryDate: string | null; codAmount: number; orderType: string }>();
    const token = await getDelhiveryToken();
    if (token && allAwbs.length > 0) {
      try {
        const tracked = await trackShipments(allAwbs);
        delhiveryData = new Map(
          Array.from(tracked.entries()).map(([awb, s]) => [awb, {
            deliveryDate: s.deliveryDate,
            codAmount: s.codAmount,
            orderType: s.orderType,
          }])
        );
      } catch { /* silent */ }
    }

    // ── Per-store: calculate daily delivered COD for last 7 days ──────
    const storeProjections: Record<string, {
      storeName: string;
      dailyDelivered: Record<string, number>;  // last 7 days actual
      avgDailyDelivered: number;
      projectedDeposits: Record<string, { confirmed: number; projected: number; total: number }>;
      totalConfirmed: number;
      totalProjected: number;
    }> = {};

    // Generate last 7 day strings
    const last7Days: string[] = [];
    for (let i = 7; i >= 1; i--) {
      last7Days.push(addDays(todayStr, -i));
    }

    for (const { storeName, orders } of ordersData) {
      // Track daily COD delivered amounts
      const dailyDelivered: Record<string, number> = {};
      for (const day of last7Days) dailyDelivered[day] = 0;

      for (const order of orders) {
        const awb = order.fulfillments?.[0]?.tracking_number;
        if (!awb) continue;

        const dShip = delhiveryData.get(awb);
        if (!dShip) continue;

        // COD only
        if (dShip.orderType !== 'COD' && order.financial_status !== 'pending') continue;

        // Check if delivered in last 7 days
        if (dShip.deliveryDate) {
          const delDateStr = toISTDateStr(new Date(dShip.deliveryDate));
          if (delDateStr >= last7Days[0] && delDateStr <= todayStr) {
            const amount = dShip.codAmount > 0 ? dShip.codAmount : (parseFloat(order.total_price) || 0);
            dailyDelivered[delDateStr] = (dailyDelivered[delDateStr] ?? 0) + amount;
          }
        }
      }

      // Calculate average daily delivered COD (only count days with data)
      const daysWithDeliveries = Object.values(dailyDelivered).filter(v => v > 0);
      const avgDaily = daysWithDeliveries.length > 0
        ? Math.round(daysWithDeliveries.reduce((a, b) => a + b, 0) / daysWithDeliveries.length)
        : 0;

      // ── Build projection ────────────────────────────────────────────
      // CONFIRMED: orders already delivered, waiting for remittance
      // PROJECTED: estimated future deliveries based on avg daily amount
      const projectedDeposits: Record<string, { confirmed: number; projected: number; total: number }> = {};

      const ensureDay = (date: string) => {
        if (!projectedDeposits[date]) projectedDeposits[date] = { confirmed: 0, projected: 0, total: 0 };
        return projectedDeposits[date];
      };

      // CONFIRMED: actual delivered orders → remittance date
      for (const order of orders) {
        const awb = order.fulfillments?.[0]?.tracking_number;
        if (!awb) continue;
        const dShip = delhiveryData.get(awb);
        if (!dShip?.deliveryDate) continue;
        if (dShip.orderType !== 'COD' && order.financial_status !== 'pending') continue;

        const delDateStr = toISTDateStr(new Date(dShip.deliveryDate));
        const remDate = getRemittanceDate(delDateStr);
        const daysFromToday = Math.round((new Date(remDate + 'T00:00:00+05:30').getTime() - new Date(todayStr + 'T00:00:00+05:30').getTime()) / DAY_MS);

        if (daysFromToday >= 0 && daysFromToday <= projectionDays) {
          const amount = dShip.codAmount > 0 ? dShip.codAmount : (parseFloat(order.total_price) || 0);
          const day = ensureDay(remDate);
          day.confirmed += amount;
          day.total += amount;
        }
      }

      // PROJECTED: use avg daily delivery → remittance for future days
      for (let i = 0; i <= projectionDays; i++) {
        const futureDeliveryDate = addDays(todayStr, i);
        const remDate = getRemittanceDate(futureDeliveryDate);
        const daysFromToday = Math.round((new Date(remDate + 'T00:00:00+05:30').getTime() - new Date(todayStr + 'T00:00:00+05:30').getTime()) / DAY_MS);

        if (daysFromToday >= 0 && daysFromToday <= projectionDays) {
          const day = ensureDay(remDate);
          // Only add projected if we don't already have confirmed for this delivery date
          // (confirmed data is more accurate for near-term)
          if (i > 2) { // Only project deliveries 3+ days out (near-term use confirmed)
            day.projected += avgDaily;
            day.total += avgDaily;
          }
        }
      }

      const totalConfirmed = Object.values(projectedDeposits).reduce((s, d) => s + d.confirmed, 0);
      const totalProjected = Object.values(projectedDeposits).reduce((s, d) => s + d.total, 0);

      storeProjections[storeName] = {
        storeName,
        dailyDelivered,
        avgDailyDelivered: avgDaily,
        projectedDeposits,
        totalConfirmed,
        totalProjected,
      };
    }

    // ── Combined ──────────────────────────────────────────────────────
    const combinedDeposits: Record<string, { confirmed: number; projected: number; total: number }> = {};

    // Fill all days in projection window
    for (let i = 0; i <= projectionDays; i++) {
      const date = addDays(todayStr, i);
      combinedDeposits[date] = { confirmed: 0, projected: 0, total: 0 };
    }

    for (const store of Object.values(storeProjections)) {
      for (const [date, amounts] of Object.entries(store.projectedDeposits)) {
        if (!combinedDeposits[date]) combinedDeposits[date] = { confirmed: 0, projected: 0, total: 0 };
        combinedDeposits[date].confirmed += amounts.confirmed;
        combinedDeposits[date].projected += amounts.projected;
        combinedDeposits[date].total += amounts.total;
      }
    }

    const combinedSummary = {
      totalConfirmed: Object.values(combinedDeposits).reduce((s, d) => s + d.confirmed, 0),
      totalProjected: Object.values(combinedDeposits).reduce((s, d) => s + d.total, 0),
    };

    return NextResponse.json({
      success: true,
      today: todayStr,
      projectionDays,
      stores: storeProjections,
      combined: {
        dailyProjections: combinedDeposits,
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
