import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getShopifyStores } from '@/lib/shopify-config';
import { fetchAllStoresOrders } from '@/lib/shopify-api';
import { getDelhiveryToken, trackShipments, mapDelhiveryToOrderStatus, type DelhiveryShipment } from '@/lib/delhivery';

export const maxDuration = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 35;

// Diagnostic: dumps the raw Delhivery fields + computed status for each order,
// so we can see exactly why orders classify the way they do.
// Usage: /api/rto/debug?product=<name substring>&store=<name substring>
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token0 = cookieStore.get(COOKIE_NAME)?.value;
  if (!token0 || !verifySessionToken(token0)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const productQ = (url.searchParams.get('product') ?? '').toLowerCase();
  const storeQ = (url.searchParams.get('store') ?? '').toLowerCase();

  const stores = await getShopifyStores();
  if (!stores.length) return NextResponse.json({ error: 'No stores configured.' }, { status: 400 });

  const now = new Date();
  const { ordersData } = await fetchAllStoresOrders(stores, {
    createdAtMin: new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS).toISOString(),
    createdAtMax: now.toISOString(),
  });

  // Collect AWBs from fulfilled, non-cancelled orders
  const awbToRef = new Map<string, { storeName: string; orderId: string }>();
  for (const { storeName, orders } of ordersData) {
    for (const order of orders) {
      if (order.cancelled_at) continue;
      const awb = order.fulfillments?.[0]?.tracking_number;
      if (awb && order.fulfillment_status === 'fulfilled') awbToRef.set(awb, { storeName, orderId: String(order.id) });
    }
  }

  const token = await getDelhiveryToken();
  let delhivery = new Map<string, DelhiveryShipment>();
  if (token && awbToRef.size > 0) {
    try { delhivery = await trackShipments(Array.from(awbToRef.keys())); } catch { /* ignore */ }
  }

  const rows: Record<string, unknown>[] = [];
  const tally: Record<string, number> = {};

  for (const { storeName, orders } of ordersData) {
    if (storeQ && !storeName.toLowerCase().includes(storeQ)) continue;
    for (const order of orders) {
      const titles = (order.line_items ?? []).map((li) => li.title ?? '').join(' ').toLowerCase();
      if (productQ && !titles.toLowerCase().includes(productQ)) continue;

      const awb = order.fulfillments?.[0]?.tracking_number ?? undefined;
      const ship = awb ? delhivery.get(awb) : undefined;
      const mapped = ship ? mapDelhiveryToOrderStatus(ship.status) : `shopify:${order.fulfillment_status ?? 'null'}`;
      tally[mapped] = (tally[mapped] ?? 0) + 1;

      rows.push({
        name: order.name,
        store: storeName,
        awb: awb ?? null,
        matchedDelhivery: !!ship,
        // raw Delhivery signals used by the classifier
        statusRaw: ship?.statusRaw ?? null,
        statusType: ship?.statusType ?? null,
        instructions: ship?.instructions ?? null,
        reverseInTransit: ship?.reverseInTransit ?? null,
        rtoStartedDate: ship?.rtoStartedDate ?? null,
        returnedDate: ship?.returnedDate ?? null,
        deliveryDate: ship?.deliveryDate ?? null,
        ndrCount: ship?.ndrCount ?? null,
        classified: ship?.status ?? null,
        mappedStatus: mapped,
        // shopify fallbacks (when no Delhivery match)
        shopifyFulfillment: order.fulfillment_status ?? null,
        shopifyShipmentStatus: order.fulfillments?.[0]?.shipment_status ?? null,
        tags: order.tags ?? '',
        note: order.note ?? '',
      });
    }
  }

  return NextResponse.json({
    product: productQ || '(all)',
    store: storeQ || '(all)',
    totalOrders: rows.length,
    statusTally: tally,
    delhiveryMatched: rows.filter((r) => r.matchedDelhivery).length,
    rows,
  });
}
