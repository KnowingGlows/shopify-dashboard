import { NextResponse } from 'next/server';
import { getFinanceStores, getDelhiveryToken, getAllStoreMeta } from '@/lib/finance/stores';
import { fetchOrders, rangeFromDates } from '@/lib/finance/shopify';
import { trackAll, type TrackedRow } from '@/lib/finance/delhivery';
import { compute, computeCombined, type FinanceMetrics } from '@/lib/finance/compute';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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

    const perStore = await Promise.all(stores.map(async (store) => {
      try {
        const { orders, rows } = await fetchOrders(store, range);
        const tracked = await trackAll(delhiveryToken, rows);
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
