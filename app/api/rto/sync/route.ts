import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getShopifyStores } from '@/lib/shopify-config';
import { fetchAllStoresOrders } from '@/lib/shopify-api';
import { getDelhiveryToken, trackShipments, noteIndicatesRto, type DelhiveryShipment } from '@/lib/delhivery';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import type { RtoLineItem, RtoOrderItem, RtoStoreBucket, RtoSyncResponse } from '@/types/rto';

const DAY_MS = 24 * 60 * 60 * 1000;
// RTO trips practically always resolve within ~30 days end-to-end. 35-day window
// catches every in-flight RTO with a margin, and is well under Shopify's 60-day
// `read_all_orders` cutoff. Smaller window = far fewer orders to fetch = faster.
const LOOKBACK_DAYS = 35;

// Cache fresh syncs briefly so back-to-back page loads are instant. The auto-refresh
// interval on the page is 5 minutes, so this only short-circuits redundant requests.
const CACHE_TTL_MS = 90 * 1000;
const CACHE_DOC_ID = 'rto_sync_v1';

const firestoreDb = () => (isFirebaseAvailable() ? getFirestore() : null);

async function readCache(): Promise<RtoSyncResponse | null> {
  const db = firestoreDb();
  if (!db) return null;
  try {
    const doc = await db.collection(COLLECTIONS.LOGISTICS_CACHE).doc(CACHE_DOC_ID).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (!data) return null;
    const cachedAt = Number(data.cachedAt) || 0;
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null;
    return data.payload as RtoSyncResponse;
  } catch {
    return null;
  }
}

async function writeCache(payload: RtoSyncResponse): Promise<void> {
  const db = firestoreDb();
  if (!db) return;
  try {
    await db.collection(COLLECTIONS.LOGISTICS_CACHE).doc(CACHE_DOC_ID).set({
      cachedAt: Date.now(),
      payload,
    });
  } catch {
    // best-effort cache write; never fail the request
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const force = new URL(request.url).searchParams.get('force') === '1';
    if (!force) {
      const cached = await readCache();
      if (cached) return NextResponse.json(cached);
    }

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
      const empty: RtoSyncResponse = {
        fetchedAt: new Date().toISOString(),
        delhiveryAvailable: true,
        totalOrders: 0,
        totalUnits: 0,
        byStore: [],
        warnings: warnings.length > 0 ? warnings : ['No fulfilled orders with AWBs in the lookback window.'],
      };
      await writeCache(empty);
      return NextResponse.json(empty);
    }

    let delhiveryData: Map<string, DelhiveryShipment>;
    try {
      delhiveryData = await trackShipments(Array.from(awbToOrderRef.keys()));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Delhivery error';
      return NextResponse.json({ error: `Delhivery tracking failed: ${message}` }, { status: 502 });
    }

    // 5. RTO is comment-driven — couriers over-report it, so the Shopify order
    //    comment ("returned to origin") is the source of truth. Include orders
    //    the comment flags as RTO; attach Delhivery tracking when available.
    const rtoShipments: Array<{ awb: string; shipment: DelhiveryShipment | null; storeName: string; orderId: string }> = [];
    for (const { storeName, orders } of ordersData) {
      for (const order of orders) {
        if (order.cancelled_at) continue;
        if (!noteIndicatesRto(order.note, order.tags)) continue;
        const awb = order.fulfillments?.[0]?.tracking_number ?? '';
        rtoShipments.push({ awb, shipment: awb ? delhiveryData.get(awb) ?? null : null, storeName, orderId: String(order.id) });
      }
    }

    // 6. Build per-order RTO items by joining shipment data with Shopify line_items
    type StoreAcc = Omit<RtoStoreBucket, 'products' | 'items'> & {
      itemsList: RtoOrderItem[];
      productMap: Map<string, { productName: string; sku: string; units: number; orderCount: number }>;
    };
    const storeBuckets = new Map<string, StoreAcc>();

    let grandOrders = 0;
    let grandUnits = 0;

    for (const { awb, shipment, storeName, orderId } of rtoShipments) {
      const storeOrders = ordersData.find((d) => d.storeName === storeName)?.orders ?? [];
      const order = storeOrders.find((o) => String(o.id) === orderId);
      if (!order) continue;

      const lineItems: RtoLineItem[] = (order.line_items ?? [])
        .filter((li) => (li.quantity ?? 0) > 0)
        .map((li) => ({
          productName: li.title ?? '(unknown)',
          sku: li.sku ?? '',
          quantity: Number(li.quantity) || 0,
        }));

      const totalUnits = lineItems.reduce((s, li) => s + li.quantity, 0);

      const orderItem: RtoOrderItem = {
        orderId: order.name ?? `#${order.order_number ?? ''}`,
        storeName,
        awb,
        rtoStartedDate: shipment?.rtoStartedDate ?? null,
        expectedReturnDate: shipment?.expectedReturnDate ?? null,
        orderType: shipment?.orderType || (order.financial_status === 'pending' ? 'COD' : 'Pre-paid'),
        customerName: shipment?.consigneeName || (order.customer
          ? `${order.customer.first_name ?? ''} ${order.customer.last_name ?? ''}`.trim()
          : ''),
        origin: shipment?.origin || '',
        destination: shipment?.destination || '',
        lineItems,
        totalUnits,
      };

      // Bucket
      if (!storeBuckets.has(storeName)) {
        storeBuckets.set(storeName, {
          storeName,
          orders: 0,
          units: 0,
          itemsList: [],
          productMap: new Map(),
        });
      }
      const bucket = storeBuckets.get(storeName)!;
      bucket.orders += 1;
      bucket.units += totalUnits;
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
    }

    // 7. Finalize buckets
    const byStore: RtoStoreBucket[] = Array.from(storeBuckets.values())
      .map((b) => ({
        storeName: b.storeName,
        orders: b.orders,
        units: b.units,
        products: Array.from(b.productMap.values()).sort((a, b2) => b2.units - a.units),
        items: b.itemsList.sort((a, b2) => (b2.rtoStartedDate ?? '').localeCompare(a.rtoStartedDate ?? '')),
      }))
      .sort((a, b2) => b2.units - a.units);

    const response: RtoSyncResponse = {
      fetchedAt: new Date().toISOString(),
      delhiveryAvailable: true,
      totalOrders: grandOrders,
      totalUnits: grandUnits,
      byStore,
      warnings,
    };
    await writeCache(response);
    return NextResponse.json(response);
  } catch (error) {
    console.error('RTO sync failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to sync RTO data.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
