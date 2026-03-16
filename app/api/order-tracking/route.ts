import { NextResponse } from 'next/server';
import { getShopifyStores } from '@/lib/shopify-config';
import { fetchAllStoresOrders } from '@/lib/shopify-api';
import { trackShipments, mapDelhiveryToOrderStatus, getDelhiveryToken, type DelhiveryShipment } from '@/lib/delhivery';

export const maxDuration = 60;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseISTDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  return new Date(utcMidnight - IST_OFFSET_MS);
}

function toISTDateStr(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

type DeliveryStatus = 'delivered' | 'in_transit' | 'out_for_delivery' | 'rto' | 'rto_in_transit' | 'unfulfilled' | 'cancelled' | 'attempted';

interface ClassifiedOrder {
  id: string;
  name: string;
  date: string;
  amount: number;
  paymentType: 'cod' | 'prepaid';
  status: DeliveryStatus;
  trackingCompany?: string;
  trackingNumber?: string;
  note?: string;
  customerName?: string;
  // Delhivery enrichment
  delhiveryStatus?: string;
  delhiveryInstructions?: string;
  delhiveryLocation?: string;
  ndrCount?: number;
  dispatchCount?: number;
  rtoStartedDate?: string;
  firstAttemptDate?: string;
}

// Fallback classification when Delhivery is not available
function classifyFromShopify(order: {
  cancelled_at?: string | null;
  fulfillment_status: string | null;
  tags?: string;
  note?: string | null;
  fulfillments?: Array<{
    status: string;
    shipment_status?: string | null;
  }>;
}): DeliveryStatus {
  if (order.cancelled_at) return 'cancelled';

  const tags = (order.tags ?? '').toLowerCase();
  const note = (order.note ?? '').toLowerCase();

  // Check order notes first
  if (note.includes('in transit for return') || note.includes('rto in transit') || note.includes('in transit to origin')) return 'rto_in_transit';
  if (note.includes('return to origin') || note.includes('rto initiated') || note.includes('rto')) return 'rto';
  if (note.includes('ndr') || note.includes('undelivered') || note.includes('delivery attempted') || note.includes('not delivered')) return 'attempted';
  if (note.includes('delivered')) return 'delivered';
  if (note.includes('out for delivery')) return 'out_for_delivery';

  // Check tags
  if (tags.includes('rto-in-transit') || tags.includes('rto in transit') || tags.includes('rto_in_transit')) return 'rto_in_transit';
  if (tags.includes('rto') || tags.includes('return to origin')) return 'rto';
  if (tags.includes('delivered')) return 'delivered';
  if (tags.includes('out for delivery') || tags.includes('out-for-delivery')) return 'out_for_delivery';
  if (tags.includes('in transit') || tags.includes('in-transit') || tags.includes('in_transit')) return 'in_transit';
  if (tags.includes('attempted') || tags.includes('undelivered') || tags.includes('ndr')) return 'attempted';

  // Fulfillment data
  if (!order.fulfillment_status || order.fulfillment_status === 'null') return 'unfulfilled';

  const fulfillment = order.fulfillments?.[0];
  if (!fulfillment) {
    return order.fulfillment_status === 'fulfilled' ? 'delivered' : 'unfulfilled';
  }
  if (fulfillment.status === 'cancelled') return 'cancelled';

  const shipment = fulfillment.shipment_status?.toLowerCase() ?? '';
  if (shipment === 'delivered') return 'delivered';
  if (shipment === 'out_for_delivery') return 'out_for_delivery';
  if (shipment === 'in_transit' || shipment === 'confirmed') return 'in_transit';
  if (shipment === 'failure' || shipment === 'attempted_delivery') return 'attempted';

  if (order.fulfillment_status === 'fulfilled') return 'delivered';
  return 'in_transit';
}

export async function GET(request: Request) {
  try {
    const stores = await getShopifyStores();
    if (stores.length === 0) {
      return NextResponse.json(
        { error: 'No Shopify stores configured. Add store credentials in Settings.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') ?? '7d';
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const now = new Date();
    let createdAtMin: string;
    let createdAtMax: string;

    if (range === 'custom' && startParam) {
      const startDate = parseISTDate(startParam);
      const endDate = endParam ? new Date(parseISTDate(endParam).getTime() + DAY_MS - 1) : new Date(startDate.getTime() + DAY_MS - 1);
      createdAtMin = startDate.toISOString();
      createdAtMax = endDate.toISOString();
    } else {
      const todayIST = toISTDateStr(now);
      const todayStart = parseISTDate(todayIST);
      if (range === 'today') {
        createdAtMin = todayStart.toISOString();
        createdAtMax = now.toISOString();
      } else if (range === 'yesterday') {
        createdAtMin = new Date(todayStart.getTime() - DAY_MS).toISOString();
        createdAtMax = todayStart.toISOString();
      } else {
        const daysBack = range === '30d' ? 29 : range === '14d' ? 13 : 6;
        createdAtMin = new Date(todayStart.getTime() - daysBack * DAY_MS).toISOString();
        createdAtMax = now.toISOString();
      }
    }

    const { ordersData, errors } = await fetchAllStoresOrders(stores, {
      createdAtMin,
      createdAtMax,
    });

    // ── Collect AWBs from fulfilled orders ──────────────────────────
    const awbToOrderKey = new Map<string, string[]>(); // AWB → [storeName:orderId, ...]
    for (const { storeName, orders } of ordersData) {
      for (const order of orders) {
        const awb = order.fulfillments?.[0]?.tracking_number;
        if (awb && order.fulfillment_status === 'fulfilled') {
          const key = `${storeName}:${order.id}`;
          if (!awbToOrderKey.has(awb)) awbToOrderKey.set(awb, []);
          awbToOrderKey.get(awb)!.push(key);
        }
      }
    }

    // ── Query Delhivery for real-time statuses ──────────────────────
    let delhiveryData = new Map<string, DelhiveryShipment>();
    let delhiveryAvailable = false;

    const token = await getDelhiveryToken();
    if (token && awbToOrderKey.size > 0) {
      try {
        delhiveryData = await trackShipments(Array.from(awbToOrderKey.keys()));
        delhiveryAvailable = true;
      } catch (error) {
        console.error('Delhivery tracking failed, falling back to Shopify:', error);
      }
    }

    // ── Classify orders ─────────────────────────────────────────────
    const storeResults: Record<string, {
      storeName: string;
      orders: ClassifiedOrder[];
      totals: {
        total: number; cod: number; prepaid: number; delivered: number; codDelivered: number;
        inTransit: number; outForDelivery: number; rto: number; rtoInTransit: number;
        unfulfilled: number; cancelled: number; attempted: number;
      };
      dailyBreakdown: Record<string, {
        total: number; cod: number; prepaid: number; delivered: number;
        codDelivered: number; inTransit: number; rto: number;
        rtoInTransit: number; attempted: number;
      }>;
    }> = {};

    for (const { storeName, orders } of ordersData) {
      const classified: ClassifiedOrder[] = [];
      const totals = {
        total: 0, cod: 0, prepaid: 0, delivered: 0, codDelivered: 0,
        inTransit: 0, outForDelivery: 0, rto: 0, rtoInTransit: 0,
        unfulfilled: 0, cancelled: 0, attempted: 0,
      };
      const dailyBreakdown: Record<string, {
        total: number; cod: number; prepaid: number; delivered: number;
        codDelivered: number; inTransit: number; rto: number;
        rtoInTransit: number; attempted: number;
      }> = {};

      for (const order of orders) {
        const isCOD = order.financial_status === 'pending';
        const paymentType = isCOD ? 'cod' : 'prepaid';
        const amount = parseFloat(order.total_price) || 0;
        const dateStr = toISTDateStr(new Date(order.created_at));
        const fulfillment = order.fulfillments?.[0];
        const awb = fulfillment?.tracking_number ?? undefined;

        // Use Delhivery status if available, otherwise fall back to Shopify
        let status: DeliveryStatus;
        let dShipment: DelhiveryShipment | undefined;

        if (awb && delhiveryAvailable && delhiveryData.has(awb)) {
          dShipment = delhiveryData.get(awb)!;
          status = mapDelhiveryToOrderStatus(dShipment.status) as DeliveryStatus;
          // Cancelled orders stay cancelled regardless of Delhivery
          if (order.cancelled_at) status = 'cancelled';
        } else {
          status = classifyFromShopify(order);
        }

        const classifiedOrder: ClassifiedOrder = {
          id: order.id,
          name: order.name,
          date: dateStr,
          amount,
          paymentType,
          status,
          trackingCompany: fulfillment?.tracking_company ?? undefined,
          trackingNumber: awb,
          note: order.note ?? undefined,
          customerName: order.customer
            ? `${order.customer.first_name ?? ''} ${order.customer.last_name ?? ''}`.trim()
            : undefined,
        };

        // Enrich with Delhivery data
        if (dShipment) {
          classifiedOrder.delhiveryStatus = dShipment.statusRaw;
          classifiedOrder.delhiveryInstructions = dShipment.instructions;
          classifiedOrder.delhiveryLocation = dShipment.location;
          classifiedOrder.ndrCount = dShipment.ndrCount;
          classifiedOrder.dispatchCount = dShipment.dispatchCount;
          classifiedOrder.rtoStartedDate = dShipment.rtoStartedDate ?? undefined;
          classifiedOrder.firstAttemptDate = dShipment.firstAttemptDate ?? undefined;
        }

        classified.push(classifiedOrder);

        // Aggregate totals
        totals.total++;
        if (isCOD) totals.cod++; else totals.prepaid++;
        if (status === 'delivered') { totals.delivered++; if (isCOD) totals.codDelivered++; }
        else if (status === 'in_transit') totals.inTransit++;
        else if (status === 'out_for_delivery') totals.outForDelivery++;
        else if (status === 'rto') totals.rto++;
        else if (status === 'rto_in_transit') totals.rtoInTransit++;
        else if (status === 'unfulfilled') totals.unfulfilled++;
        else if (status === 'cancelled') totals.cancelled++;
        else if (status === 'attempted') totals.attempted++;

        if (!dailyBreakdown[dateStr]) {
          dailyBreakdown[dateStr] = {
            total: 0, cod: 0, prepaid: 0, delivered: 0,
            codDelivered: 0, inTransit: 0, rto: 0, rtoInTransit: 0, attempted: 0,
          };
        }
        const day = dailyBreakdown[dateStr];
        day.total++;
        if (isCOD) day.cod++; else day.prepaid++;
        if (status === 'delivered') { day.delivered++; if (isCOD) day.codDelivered++; }
        else if (status === 'in_transit') day.inTransit++;
        else if (status === 'rto') day.rto++;
        else if (status === 'rto_in_transit') day.rtoInTransit++;
        else if (status === 'attempted') day.attempted++;
      }

      storeResults[storeName] = { storeName, orders: classified, totals, dailyBreakdown };
    }

    // Combined totals across all stores
    const combined = {
      total: 0, cod: 0, prepaid: 0, delivered: 0, codDelivered: 0,
      inTransit: 0, outForDelivery: 0, rto: 0, rtoInTransit: 0,
      unfulfilled: 0, cancelled: 0, attempted: 0,
    };
    for (const store of Object.values(storeResults)) {
      for (const key of Object.keys(combined) as (keyof typeof combined)[]) {
        combined[key] += store.totals[key];
      }
    }

    // ── Analytics helper ──────────────────────────────────────────────
    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;

    function computeAnalytics(orders: ClassifiedOrder[]) {
      const deliveredWithDelhivery = orders.filter((o) => o.status === 'delivered' && o.dispatchCount != null);
      const fadCnt = deliveredWithDelhivery.filter((o) => (o.dispatchCount ?? 0) <= 1).length;
      const fadPctVal = deliveredWithDelhivery.length > 0 ? Math.round(fadCnt / deliveredWithDelhivery.length * 1000) / 10 : null;

      const dDays: number[] = [];
      const codDDays: number[] = [];
      const prepaidDDays: number[] = [];
      for (const order of orders) {
        if (order.status !== 'delivered') continue;
        const awb = order.trackingNumber;
        const dShip = awb ? delhiveryData.get(awb) : null;
        if (dShip?.deliveryDate) {
          const created = new Date(order.date + 'T00:00:00+05:30').getTime();
          const delivered = new Date(dShip.deliveryDate).getTime();
          const days = Math.max(0, Math.round((delivered - created) / DAY_MS));
          if (days <= 30) {
            dDays.push(days);
            if (order.paymentType === 'cod') codDDays.push(days);
            else prepaidDDays.push(days);
          }
        }
      }

      const ndrOrd = orders.filter((o) => (o.ndrCount ?? 0) > 0);
      const ndrRes = ndrOrd.filter((o) => o.status === 'delivered').length;
      const ndrDel = ndrOrd.filter((o) => o.status === 'delivered');
      const codOrd = orders.filter((o) => o.paymentType === 'cod');

      return {
        fadPct: fadPctVal,
        fadCount: fadCnt,
        fadTotal: deliveredWithDelhivery.length,
        avgDeliveryDays: avg(dDays),
        avgCodDeliveryDays: avg(codDDays),
        avgPrepaidDeliveryDays: avg(prepaidDDays),
        ndrResolutionRate: ndrOrd.length > 0 ? Math.round(ndrRes / ndrOrd.length * 1000) / 10 : null,
        avgNdrAttempts: ndrDel.length > 0 ? Math.round(ndrDel.reduce((s, o) => s + (o.ndrCount ?? 0), 0) / ndrDel.length * 10) / 10 : null,
        totalNdrOrders: ndrOrd.length,
        atRiskValue: codOrd.filter((o) => o.status === 'rto_in_transit' || o.status === 'rto' || o.status === 'attempted').reduce((s, o) => s + o.amount, 0),
        codPendingDelivery: codOrd.filter((o) => o.status === 'in_transit' || o.status === 'out_for_delivery').reduce((s, o) => s + o.amount, 0),
        codDeliveredAmount: codOrd.filter((o) => o.status === 'delivered').reduce((s, o) => s + o.amount, 0),
        totalRevenue: codOrd.reduce((s, o) => s + o.amount, 0),
        deliveredRevenue: codOrd.filter((o) => o.status === 'delivered').reduce((s, o) => s + o.amount, 0),
        lostRevenue: codOrd.filter((o) => o.status === 'rto' || o.status === 'cancelled').reduce((s, o) => s + o.amount, 0),
      };
    }

    // Combined analytics
    const allOrders = Object.values(storeResults).flatMap((s) => s.orders);
    const analytics = computeAnalytics(allOrders);

    // Per-store analytics
    const storeAnalytics: Record<string, ReturnType<typeof computeAnalytics>> = {};
    for (const [name, store] of Object.entries(storeResults)) {
      storeAnalytics[name] = computeAnalytics(store.orders);
    }

    return NextResponse.json({
      success: true,
      stores: storeResults,
      combined,
      analytics,
      storeAnalytics,
      storeErrors: errors,
      delhiveryEnabled: delhiveryAvailable,
      rangeStart: createdAtMin,
      rangeEnd: createdAtMax,
    });
  } catch (error) {
    console.error('Error fetching order tracking data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order tracking data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
