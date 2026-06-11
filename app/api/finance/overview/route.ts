import { NextResponse } from 'next/server';
import { getFinanceStores, getDelhiveryToken, getAllStoreMeta } from '@/lib/finance/stores';
import { fetchOrdersEnriched, toTrackingRow, deriveTrackedRow, rangeFromDates } from '@/lib/finance/shopify';
import { trackAll, type TrackedRow } from '@/lib/finance/delhivery';
import { compute, computeCombined, type FinanceMetrics } from '@/lib/finance/compute';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// Delhivery's tracking API only reliably returns recent shipments; older ones are
// purged. So we use live Delhivery only for the last LIVE_WINDOW_DAYS, and derive
// everything older from Shopify (which keeps shipment_status + the RTO note forever).
const LIVE_WINDOW_DAYS = 30;

function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
function monthStartIST(): string {
  const t = todayIST();
  return `${t.slice(0, 7)}-01`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start') || monthStartIST();
    const end = searchParams.get('end') || todayIST();

    const stores = getFinanceStores();
    const delhiveryToken = getDelhiveryToken();
    if (stores.length === 0) {
      return NextResponse.json({ error: 'No finance stores configured (set FIN_*_STORE / FIN_*_TOKEN).' }, { status: 503 });
    }
    if (!delhiveryToken) {
      return NextResponse.json({ error: 'Delhivery token not configured (FIN_DELHIVERY_TOKEN).' }, { status: 503 });
    }

    const range = rangeFromDates(start, end);
    const now = new Date();
    // Orders created on/after this IST date use live Delhivery; older ones use Shopify.
    const cutoff = new Date(now.getTime() - LIVE_WINDOW_DAYS * 86400000);
    const cutoffISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(cutoff);

    const perStore = await Promise.all(stores.map(async (store) => {
      try {
        const { orders, rows } = await fetchOrdersEnriched(store, range);
        const shipped = rows.filter(r => r.shipped && r.waybill);

        // Recent window -> live Delhivery (precise delivery dates + NDR/RTO).
        const recent = shipped.filter(r => r.created.slice(0, 10) >= cutoffISO);
        let live: TrackedRow[] = [];
        if (recent.length > 0) {
          try { live = await trackAll(delhiveryToken, recent.map(toTrackingRow)); }
          catch { live = []; }
        }
        const liveWb = new Set(live.map(t => t.waybill));

        // Everything else (older than the window, or recent waybills Delhivery no
        // longer returns) is derived from Shopify's durable fields.
        const derived = shipped
          .filter(r => !(r.waybill && liveWb.has(r.waybill)))
          .map(deriveTrackedRow);

        const tracked = [...live, ...derived];
        return { slug: store.slug, name: store.name, accent: store.accent, ordersFetched: orders, tracked, error: null as string | null };
      } catch (e) {
        return { slug: store.slug, name: store.name, accent: store.accent, ordersFetched: 0, tracked: [] as TrackedRow[], error: (e as Error).message };
      }
    }));

    const storeMetrics: Record<string, { name: string; accent: string; ordersFetched: number; error: string | null; metrics: FinanceMetrics }> = {};
    for (const s of perStore) {
      storeMetrics[s.slug] = { name: s.name, accent: s.accent, ordersFetched: s.ordersFetched, error: s.error, metrics: compute(s.tracked, now) };
    }
    const combined = computeCombined(perStore.map(s => s.tracked), now);

    return NextResponse.json({
      success: true,
      range: { start, end },
      now: now.toISOString(),
      stores: storeMetrics,
      combined,
      storeMeta: getAllStoreMeta(),
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to build finance overview', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
