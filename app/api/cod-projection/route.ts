import { NextResponse } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase';

/**
 * COD Cashflow Projection — reads cached logistics data from Firestore.
 *
 * The order-tracking API (Logistics page) caches per-store daily
 * delivered COD amounts + analytics. This API just reads that cache
 * and applies remittance rules to project bank deposits.
 *
 * Remittance: Mon-Thu D+2, Fri→Mon, Sat→Tue, Sun→Tue
 */

function toISTDateStr(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00+05:30');
  d.setDate(d.getDate() + days);
  return toISTDateStr(d);
}

function getRemittanceDate(deliveryDateStr: string): string {
  const dow = new Date(deliveryDateStr + 'T00:00:00+05:30').getDay();
  if (dow === 5) return addDays(deliveryDateStr, 3);  // Fri → Mon
  if (dow === 6) return addDays(deliveryDateStr, 3);  // Sat → Tue
  if (dow === 0) return addDays(deliveryDateStr, 2);  // Sun → Tue
  return addDays(deliveryDateStr, 2);                  // Mon-Thu → D+2
}

export async function GET(request: Request) {
  try {
    const db = getFirestore();
    if (!db) return NextResponse.json({ error: 'Database not available' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const projectionDays = parseInt(searchParams.get('days') ?? '14', 10);
    const todayStr = toISTDateStr(new Date());

    // Read cached logistics data
    const doc = await db.collection(COLLECTIONS.LOGISTICS_CACHE).doc('latest').get();
    if (!doc.exists) {
      return NextResponse.json({
        success: true,
        today: todayStr,
        noCache: true,
        message: 'Open the Logistics page first to sync data.',
        stores: {},
        combined: { dailyProjections: {}, summary: { totalConfirmed: 0, totalProjected: 0 } },
      });
    }

    const cache = doc.data()!;
    const perStoreDailyDelivered: Record<string, Record<string, number>> = cache.perStoreDailyDelivered ?? {};

    // ── Build projections per store ───────────────────────────────────
    const storeProjections: Record<string, {
      storeName: string;
      avgDailyDelivered: number;
      projectedDeposits: Record<string, { confirmed: number; projected: number; total: number }>;
      totalConfirmed: number;
      totalProjected: number;
    }> = {};

    for (const [storeName, dailyDelivered] of Object.entries(perStoreDailyDelivered)) {
      const deposits: Record<string, { confirmed: number; projected: number; total: number }> = {};

      const ensureDay = (date: string) => {
        if (!deposits[date]) deposits[date] = { confirmed: 0, projected: 0, total: 0 };
        return deposits[date];
      };

      // CONFIRMED: actual deliveries → apply remittance date
      for (const [deliveryDate, amount] of Object.entries(dailyDelivered)) {
        if (amount <= 0) continue;
        const remDate = getRemittanceDate(deliveryDate);
        const daysOut = Math.round(
          (new Date(remDate + 'T00:00:00+05:30').getTime() - new Date(todayStr + 'T00:00:00+05:30').getTime()) / 86400000
        );
        if (daysOut >= 0 && daysOut <= projectionDays) {
          const day = ensureDay(remDate);
          day.confirmed += amount;
          day.total += amount;
        }
      }

      // Calculate 7-day avg daily delivered for projection
      const last7Days: string[] = [];
      for (let i = 7; i >= 1; i--) last7Days.push(addDays(todayStr, -i));

      const recentAmounts = last7Days
        .map(d => dailyDelivered[d] ?? 0)
        .filter(v => v > 0);
      const avgDaily = recentAmounts.length > 0
        ? Math.round(recentAmounts.reduce((a, b) => a + b, 0) / recentAmounts.length)
        : 0;

      // PROJECTED: avg daily for future delivery days → remittance
      for (let i = 1; i <= projectionDays; i++) {
        const futureDeliveryDate = addDays(todayStr, i);
        const remDate = getRemittanceDate(futureDeliveryDate);
        const daysOut = Math.round(
          (new Date(remDate + 'T00:00:00+05:30').getTime() - new Date(todayStr + 'T00:00:00+05:30').getTime()) / 86400000
        );
        if (daysOut >= 0 && daysOut <= projectionDays) {
          const day = ensureDay(remDate);
          day.projected += avgDaily;
          day.total += avgDaily;
        }
      }

      const totalConfirmed = Object.values(deposits).reduce((s, d) => s + d.confirmed, 0);
      const totalProjected = Object.values(deposits).reduce((s, d) => s + d.total, 0);

      storeProjections[storeName] = {
        storeName,
        avgDailyDelivered: avgDaily,
        projectedDeposits: deposits,
        totalConfirmed,
        totalProjected,
      };
    }

    // ── Combined ──────────────────────────────────────────────────────
    const combinedDeposits: Record<string, { confirmed: number; projected: number; total: number }> = {};
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

    return NextResponse.json({
      success: true,
      today: todayStr,
      projectionDays,
      cachedAt: cache.updatedAt,
      stores: storeProjections,
      combined: {
        dailyProjections: combinedDeposits,
        summary: {
          totalConfirmed: Object.values(combinedDeposits).reduce((s, d) => s + d.confirmed, 0),
          totalProjected: Object.values(combinedDeposits).reduce((s, d) => s + d.total, 0),
        },
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
