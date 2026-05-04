import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getShopifyStores } from '@/lib/shopify-config';
import { fetchAllStoresOrders } from '@/lib/shopify-api';
import { getDelhiveryToken, trackShipments, type DelhiveryShipment } from '@/lib/delhivery';
import type { RtoLineItem, RtoOrderItem, RtoStoreBucket, RtoSyncResponse } from '@/types/rto';

const DAY_MS = 24 * 60 * 60 * 1000;
// Shopify rejects orders.json?status=any with `created_at_min` older than 60 days
// (unless the app has the read_all_orders scope, which we don't). 59 leaves a margin
// for clock skew. RTO trips practically always resolve well under 30 days, so this
// captures every in-flight RTO with room to spare.
const LOOKBACK_DAYS = 59;

// ── Handler ───────────────────────────────────────────────────────────────────

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const warnings: string[] = [];

    // 1. Load Shopify stores
    const stores = await getShopifyStores();
    if (!stores || stores.length === 0) {
      return NextResponse.json(
        { error: 'No Shopify stores configured. Add store credentials in Settings.' },
        { status: 400 }
      );
    }

    // 2. Fetch the last N days of orders from each store
    const now = new Date();
    const createdAtMin = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS).toISOString();
    const createdAtMax = now.toISOString();
    const { ordersData, errors: fetchErrors } = await fetchAllStoresOrders(stores, {
      createdAtMin,
      createdAtMax,
    });
    fetchErrors.forEach((e) => {
      const msg = /forbidden/i.test(e.message)
        ? `${e.storeName}: 403 Forbidden — Shopify access token may be missing read_orders scope or the lookback exceeds 60 days.`
        : `${e.storeName}: ${e.message}`;
      warnings.push(msg);
    });

    // Bail clearly if every store failed — caller sees a real error, not an empty state.
    if (fetchErrors.length === stores.length) {
      return NextResponse.json(
        { error: `Failed to fetch orders from all ${stores.length} store${stores.length === 1 ? '' : 's'}.`, warnings },
        { status: 502 }
      );
    }

    // 3. Collect AWBs (only from fulfilled orders that aren't cancelled)
    const awbToOrderRef = new Map<string, { storeName: string; orderId: string }>();
    for (const { storeName, orders } of ordersData) {
      for (const order of orders) {
        if (order.cancelled_at) continue;
        const awb = order.fulfillments?.[0]?.tracking_number;
        if (awb && order.fulfillment_status === 'fulfilled') {
          // Last-write wins if duplicate AWB across stores; rare in practice
          awbToOrderRef.set(awb, { storeName, orderId: String(order.id) });
        }
      }
    }

    // 4. Query Delhivery
    const token = await getDelhiveryToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Delhivery API token not configured. Set it under Settings → Delhivery.' },
        { status: 400 }
      );
    }
    if (awbToOrderRef.size === 0) {
      return NextResponse.json({
        fetchedAt: new Date().toISOString(),
        delhiveryAvailable: true,
        totalOrders: 0,
        totalUnits: 0,
        totalValueAtRisk: 0,
        byStore: [],
        warnings: warnings.length > 0 ? warnings : ['No fulfilled orders with AWBs in the lookback window.'],
      } satisfies RtoSyncResponse);
    }

    let delhiveryData: Map<string, DelhiveryShipment>;
    try {
      delhiveryData = await trackShipments(Array.from(awbToOrderRef.keys()));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Delhivery error';
      return NextResponse.json({ error: `Delhivery tracking failed: ${message}` }, { status: 502 });
    }

    // 5. Filter to RTO-in-transit shipments only
    const rtoShipments: Array<{ awb: string; shipment: DelhiveryShipment; storeName: string; orderId: string }> = [];
    for (const [awb, shipment] of delhiveryData.entries()) {
      if (shipment.status !== 'rto_in_transit') continue;
      const ref = awbToOrderRef.get(awb);
      if (!ref) continue;
      rtoShipments.push({ awb, shipment, storeName: ref.storeName, orderId: ref.orderId });
    }

    // 6. Build per-order RTO items by joining shipment data with Shopify line_items
    type StoreAcc = Omit<RtoStoreBucket, 'products' | 'items'> & {
      itemsList: RtoOrderItem[];
      productMap: Map<string, { productName: string; sku: string; units: number; orderCount: number }>;
    };
    const storeBuckets = new Map<string, StoreAcc>();

    let grandOrders = 0;
    let grandUnits = 0;
    let grandValueAtRisk = 0;

    for (const { awb, shipment, storeName, orderId } of rtoShipments) {
      const storeOrders = ordersData.find((d) => d.storeName === storeName)?.orders ?? [];
      const order = storeOrders.find((o) => String(o.id) === orderId);
      if (!order) continue;

      const lineItems: RtoLineItem[] = (order.line_items ?? [])
        .filter((li) => (li.quantity ?? 0) > 0)
        .map((li) => {
          const qty = Number(li.quantity) || 0;
          const price = Number(li.price) || 0;
          return {
            productName: li.title ?? '(unknown)',
            sku: li.sku ?? '',
            quantity: qty,
            pricePerUnit: price,
            valueAtRisk: price * qty,
          };
        });

      const totalUnits = lineItems.reduce((s, li) => s + li.quantity, 0);
      const itemValue = lineItems.reduce((s, li) => s + li.valueAtRisk, 0);
      // Prefer Delhivery COD amount when present, fall back to Shopify line item total
      const valueAtRisk = shipment.codAmount > 0 ? shipment.codAmount : itemValue;

      const orderItem: RtoOrderItem = {
        orderId: order.name ?? `#${order.order_number ?? ''}`,
        storeName,
        awb,
        rtoStartedDate: shipment.rtoStartedDate,
        expectedReturnDate: shipment.expectedReturnDate,
        codAmount: shipment.codAmount || 0,
        orderType: shipment.orderType || (order.financial_status === 'pending' ? 'COD' : 'Pre-paid'),
        customerName: shipment.consigneeName || (order.customer
          ? `${order.customer.first_name ?? ''} ${order.customer.last_name ?? ''}`.trim()
          : ''),
        origin: shipment.origin || '',
        destination: shipment.destination || '',
        lineItems,
        totalUnits,
      };

      // Bucket
      if (!storeBuckets.has(storeName)) {
        storeBuckets.set(storeName, {
          storeName,
          orders: 0,
          units: 0,
          valueAtRisk: 0,
          itemsList: [],
          productMap: new Map(),
        });
      }
      const bucket = storeBuckets.get(storeName)!;
      bucket.orders += 1;
      bucket.units += totalUnits;
      bucket.valueAtRisk += valueAtRisk;
      bucket.itemsList.push(orderItem);

      for (const li of lineItems) {
        const key = `${li.productName}::${li.sku}`;
        if (!bucket.productMap.has(key)) {
          bucket.productMap.set(key, {
            productName: li.productName,
            sku: li.sku,
            units: 0,
            orderCount: 0,
          });
        }
        const p = bucket.productMap.get(key)!;
        p.units += li.quantity;
        p.orderCount += 1;
      }

      grandOrders += 1;
      grandUnits += totalUnits;
      grandValueAtRisk += valueAtRisk;
    }

    // 7. Finalize buckets
    const byStore: RtoStoreBucket[] = Array.from(storeBuckets.values())
      .map((b) => ({
        storeName: b.storeName,
        orders: b.orders,
        units: b.units,
        valueAtRisk: b.valueAtRisk,
        products: Array.from(b.productMap.values()).sort((a, b2) => b2.units - a.units),
        items: b.itemsList.sort((a, b2) => (b2.rtoStartedDate ?? '').localeCompare(a.rtoStartedDate ?? '')),
      }))
      .sort((a, b2) => b2.units - a.units);

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      delhiveryAvailable: true,
      totalOrders: grandOrders,
      totalUnits: grandUnits,
      totalValueAtRisk: grandValueAtRisk,
      byStore,
      warnings,
    } satisfies RtoSyncResponse);
  } catch (error) {
    console.error('RTO sync failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to sync RTO data.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
