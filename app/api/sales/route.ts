import { NextResponse } from 'next/server';
import { getShopifyStores } from '@/lib/shopify-config';
import { fetchAllStoresOrders } from '@/lib/shopify-api';
import { aggregateSalesData } from '@/lib/sales-aggregator';

function getRangeStart(
  range: string
): { range: string; createdAtMin: string; createdAtMax: string } {
  const normalizedRange = ['today', 'yesterday', '7d', '30d'].includes(range)
    ? range
    : 'today';
  const now = new Date();
  const startDate = new Date(now);
  const endDate = new Date(now);

  if (normalizedRange === 'today') {
    startDate.setHours(0, 0, 0, 0);
  } else if (normalizedRange === 'yesterday') {
    startDate.setDate(now.getDate() - 1);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
  } else {
    const daysBack = normalizedRange === '7d' ? 7 : 30;
    startDate.setTime(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  }

  return {
    range: normalizedRange,
    createdAtMin: startDate.toISOString(),
    createdAtMax: endDate.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const stores = getShopifyStores();

    if (stores.length === 0) {
      return NextResponse.json(
        { error: 'No Shopify stores configured. Please add store credentials to .env.local' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const { range, createdAtMin, createdAtMax } = getRangeStart(
      searchParams.get('range') ?? 'today'
    );
    const ordersData = await fetchAllStoresOrders(stores, { createdAtMin, createdAtMax });
    const salesMetrics = aggregateSalesData(ordersData);

    return NextResponse.json({
      success: true,
      data: salesMetrics,
      ordersData,
      range,
      rangeStart: createdAtMin,
      rangeEnd: createdAtMax,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching sales data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
