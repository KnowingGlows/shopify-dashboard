import { ShopifyStore, ShopifyOrder, OrderData } from '@/types/shopify';
import { SHOPIFY_API_VERSION } from './shopify-config';

interface FetchOrdersOptions {
  limit?: number;
  createdAtMin?: string;
  createdAtMax?: string;
}

function getNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  const links = linkHeader.split(',').map((link) => link.trim());
  const nextLink = links.find((link) => link.includes('rel="next"'));
  if (!nextLink) {
    return null;
  }

  const match = nextLink.match(/<([^>]+)>/);
  return match ? match[1] : null;
}

export async function fetchShopifyOrders(
  store: ShopifyStore,
  options: FetchOrdersOptions = {}
): Promise<ShopifyOrder[]> {
  const { limit = 250, createdAtMin, createdAtMax } = options;
  const url = new URL(
    `https://${store.domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json`
  );

  url.searchParams.set('limit', String(limit));
  url.searchParams.set('status', 'any');

  if (createdAtMin) {
    url.searchParams.set('created_at_min', createdAtMin);
  }

  if (createdAtMax) {
    url.searchParams.set('created_at_max', createdAtMax);
  }

  try {
    const allOrders: ShopifyOrder[] = [];
    let nextUrl: string | null = url.toString();

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': store.accessToken,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch orders from ${store.name}: ${response.statusText}`
        );
      }

      const data = await response.json();
      allOrders.push(...(data.orders || []));
      nextUrl = getNextPageUrl(response.headers.get('link'));
    }

    return allOrders;
  } catch (error) {
    console.error(`Error fetching orders from ${store.name}:`, error);
    throw error;
  }
}

export async function fetchAllStoresOrders(
  stores: ShopifyStore[],
  options: FetchOrdersOptions = {}
): Promise<{ ordersData: OrderData[]; errors: Array<{ storeName: string; message: string }> }> {
  const results = await Promise.all(
    stores.map(async (store) => {
      try {
        const orders = await fetchShopifyOrders(store, options);
        return {
          storeName: store.name,
          orders,
          error: null as string | null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to fetch orders for ${store.name}:`, error);
        return {
          storeName: store.name,
          orders: [],
          error: message,
        };
      }
    })
  );

  return {
    ordersData: results.map(({ storeName, orders }) => ({ storeName, orders })),
    errors: results
      .filter((result) => result.error)
      .map((result) => ({
        storeName: result.storeName,
        message: result.error ?? 'Unknown error',
      })),
  };
}
