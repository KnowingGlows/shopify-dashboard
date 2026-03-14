import { NextResponse } from 'next/server';
import { getShopifyStores } from '@/lib/shopify-config';
import { fetchAllStoresOrders } from '@/lib/shopify-api';

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
}

function classifyOrderStatus(order: {
  cancelled_at?: string | null;
  fulfillment_status: string | null;
  tags?: string;
  fulfillments?: Array<{
    status: string;
    shipment_status?: string | null;
    tracking_company?: string | null;
    tracking_number?: string | null;
  }>;
}): DeliveryStatus {
  if (order.cancelled_at) return 'cancelled';

  const tags = (order.tags ?? '').toLowerCase();

  // Check tags first — Indian shipping partners (Shiprocket, Delhivery, etc.) update these
  if (tags.includes('rto-in-transit') || tags.includes('rto in transit') || tags.includes('rto_in_transit')) return 'rto_in_transit';
  if (tags.includes('rto') || tags.includes('return to origin')) return 'rto';
  if (tags.includes('delivered')) return 'delivered';
  if (tags.includes('out for delivery') || tags.includes('out-for-delivery')) return 'out_for_delivery';
  if (tags.includes('in transit') || tags.includes('in-transit') || tags.includes('in_transit')) return 'in_transit';
  if (tags.includes('attempted') || tags.includes('undelivered') || tags.includes('ndr')) return 'attempted';

  // Fallback to fulfillment data
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

  // If fulfilled but no shipment status, assume delivered
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
      const daysBack = range === '30d' ? 29 : range === '14d' ? 13 : 6;
      createdAtMin = new Date(todayStart.getTime() - daysBack * DAY_MS).toISOString();
      createdAtMax = now.toISOString();
    }

    const { ordersData, errors } = await fetchAllStoresOrders(stores, {
      createdAtMin,
      createdAtMax,
    });

    // Classify each order per store
    const storeResults: Record<string, {
      storeName: string;
      orders: ClassifiedOrder[];
      totals: {
        total: number;
        cod: number;
        prepaid: number;
        delivered: number;
        codDelivered: number;
        inTransit: number;
        outForDelivery: number;
        rto: number;
        rtoInTransit: number;
        unfulfilled: number;
        cancelled: number;
        attempted: number;
      };
      dailyBreakdown: Record<string, {
        total: number;
        cod: number;
        prepaid: number;
        delivered: number;
        codDelivered: number;
        inTransit: number;
        rto: number;
        rtoInTransit: number;
        attempted: number;
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
        const status = classifyOrderStatus(order);
        const amount = parseFloat(order.total_price) || 0;
        const dateStr = toISTDateStr(new Date(order.created_at));
        const fulfillment = order.fulfillments?.[0];

        classified.push({
          id: order.id,
          name: order.name,
          date: dateStr,
          amount,
          paymentType,
          status,
          trackingCompany: fulfillment?.tracking_company ?? undefined,
          trackingNumber: fulfillment?.tracking_number ?? undefined,
          note: order.note ?? undefined,
          customerName: order.customer
            ? `${order.customer.first_name ?? ''} ${order.customer.last_name ?? ''}`.trim()
            : undefined,
        });

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

    return NextResponse.json({
      success: true,
      stores: storeResults,
      combined,
      storeErrors: errors,
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
