import { ShopifyStore, ShopifyOrder, OrderData } from '@/types/shopify';
import { SHOPIFY_API_VERSION } from './shopify-config';

interface FetchOrdersOptions {
  limit?: number;
  createdAtMin?: string;
  createdAtMax?: string;
  grossSalesRange?: {
    startDate: string;
    endDate: string;
  };
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
      const errors: string[] = [];
      let orders: ShopifyOrder[] = [];
      let grossSales: number | undefined;

      try {
        orders = await fetchShopifyOrders(store, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to fetch orders for ${store.name}:`, error);
        errors.push(`Orders: ${message}`);
      }

      if (options.grossSalesRange) {
        try {
          grossSales = await fetchStoreGrossSales(store, options.grossSalesRange);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Failed to fetch gross sales for ${store.name}:`, error);
          errors.push(`Gross sales: ${message}`);
        }
      }

      return {
        storeName: store.name,
        orders,
        grossSales,
        errors,
      };
    })
  );

  return {
    ordersData: results.map(({ storeName, orders, grossSales }) => ({
      storeName,
      orders,
      grossSales,
    })),
    errors: results.flatMap((result) =>
      result.errors.map((message) => ({ storeName: result.storeName, message }))
    ),
  };
}

async function fetchStoreGrossSales(
  store: ShopifyStore,
  range: { startDate: string; endDate: string }
): Promise<number> {
  const query = `
    query ($query: String!) {
      shopifyqlQuery(query: $query) {
        __typename
        ... on TableResponse {
          tableData {
            rowData
          }
        }
        ... on TableResponseWithPagination {
          tableData {
            rowData
          }
        }
      }
    }
  `;
  const shopifyQL = `FROM sales SHOW gross_sales SINCE ${range.startDate} UNTIL ${range.endDate}`;
  const response = await fetch(
    `https://${store.domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': store.accessToken,
      },
      body: JSON.stringify({
        query,
        variables: { query: shopifyQL },
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage =
      payload?.errors?.[0]?.message ||
      payload?.error ||
      `ShopifyQL request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'ShopifyQL error');
  }

  const tableData = payload?.data?.shopifyqlQuery?.tableData;
  const grossValue = extractGrossValue(tableData);
  if (grossValue === null || Number.isNaN(grossValue)) {
    throw new Error('Unable to parse gross sales from ShopifyQL response.');
  }
  return grossValue;
}

function extractGrossValue(tableData: unknown): number | null {
  const candidates: unknown[] = [];

  if (!tableData) {
    return null;
  }

  if (Array.isArray(tableData)) {
    tableData.forEach((entry) => {
      if (entry && typeof entry === 'object') {
        const rowData = (entry as { rowData?: unknown }).rowData;
        const rows = (entry as { rows?: unknown }).rows;
        if (rowData) {
          candidates.push(rowData);
        }
        if (rows) {
          candidates.push(rows);
        }
      }
    });
  } else if (typeof tableData === 'object') {
    const rowData = (tableData as { rowData?: unknown }).rowData;
    const rows = (tableData as { rows?: unknown }).rows;
    if (rowData) {
      candidates.push(rowData);
    }
    if (rows) {
      candidates.push(rows);
    }
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length === 0) {
      continue;
    }
    const firstRow = candidate[0];
    const value = Array.isArray(firstRow) ? firstRow[0] : firstRow;
    const parsed = parseAmount(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.-]/g, '');
    return Number(normalized);
  }
  return Number.NaN;
}
