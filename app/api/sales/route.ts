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
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const getISTDateParts = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const day = Number(parts.find((part) => part.type === 'day')?.value);

    return { year, month, day };
  };

  const startOfISTDay = (date: Date) => {
    const { year, month, day } = getISTDateParts(date);
    const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0);
    return new Date(utcMidnight - IST_OFFSET_MS);
  };

  const startOfTodayIST = startOfISTDay(now);
  let startDate = new Date(startOfTodayIST);
  let endDate = new Date(now);

  if (normalizedRange === 'yesterday') {
    startDate = new Date(startOfTodayIST.getTime() - DAY_MS);
    endDate = new Date(startOfTodayIST);
  } else if (normalizedRange === '7d' || normalizedRange === '30d') {
    const daysBack = normalizedRange === '7d' ? 6 : 29;
    startDate = new Date(startOfTodayIST.getTime() - daysBack * DAY_MS);
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
