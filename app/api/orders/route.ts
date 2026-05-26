import { NextResponse } from 'next/server';
import { getShopifyStores } from '@/lib/shopify-config';
import { fetchShopifyOrders } from '@/lib/shopify-api';

// Brand name → store index mapping (Store 1 = Kairova, Store 2 = Mavric, Store 3 = Vyonik)
// NOTE: only a fallback — store lookup matches by name/displayName first.
const BRAND_STORE_INDEX: Record<string, number> = {
  kairova: 0,
  mavric: 1,
  vyonik: 2,
};

// GET /api/orders?store=StoreName&search=query
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeName = searchParams.get('store');
    const search = searchParams.get('search')?.trim().toLowerCase() ?? '';

    if (!storeName) {
      return NextResponse.json(
        { error: 'Store name is required.' },
        { status: 400 }
      );
    }

    const stores = await getShopifyStores();

    // Try matching by store name/displayName first, then by brand-to-index mapping
    let store = stores.find(
      (s) => s.name.toLowerCase() === storeName.toLowerCase()
    );
    if (!store) {
      const idx = BRAND_STORE_INDEX[storeName.toLowerCase()];
      if (idx !== undefined && idx < stores.length) {
        store = stores[idx];
      }
    }

    if (!store) {
      return NextResponse.json(
        { error: `Store "${storeName}" not found. ${stores.length} stores registered.` },
        { status: 404 }
      );
    }

    const orders = await fetchShopifyOrders(store, { limit: 250 });

    const filtered = search
      ? orders.filter((o) => o.name.toLowerCase().includes(search))
      : orders;

    const result = filtered.map((order) => ({
      id: order.id,
      name: order.name,
      orderNumber: order.order_number,
      customerName: order.customer
        ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
        : order.email || 'N/A',
      phone: order.customer?.phone || order.phone || null,
      email: order.email,
      totalPrice: order.total_price,
      currency: order.currency,
      financialStatus: order.financial_status,
      fulfillmentStatus: order.fulfillment_status,
      createdAt: order.created_at,
    }));

    return NextResponse.json({
      success: true,
      orders: result,
      storeName: store.name,
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch orders.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
