import { OrderData, SalesMetrics, StoreMetrics, ShopifyOrder } from '@/types/shopify';
import { convertToINR } from './currency-converter';

export function aggregateSalesData(ordersData: OrderData[]): SalesMetrics {
  let totalSalesINR = 0;
  let totalOrders = 0;
  const storeBreakdown: StoreMetrics[] = [];

  ordersData.forEach(({ storeName, orders }) => {
    let storeSales = 0;
    let storeOrderCount = 0;

    orders.forEach((order: ShopifyOrder) => {
      const orderAmount = parseFloat(order.total_price);
      const amountInINR = convertToINR(orderAmount, order.currency);

      storeSales += amountInINR;
      storeOrderCount++;
      totalSalesINR += amountInINR;
      totalOrders++;
    });

    const storeAvg = storeOrderCount > 0 ? storeSales / storeOrderCount : 0;

    storeBreakdown.push({
      storeName,
      totalSalesINR: storeSales,
      totalOrders: storeOrderCount,
      averageOrderValue: storeAvg,
      currency: 'INR',
    });
  });

  const averageOrderValue = totalOrders > 0 ? totalSalesINR / totalOrders : 0;

  return {
    totalSalesINR,
    totalOrders,
    averageOrderValue,
    storeBreakdown,
  };
}

export function filterByStore(
  ordersData: OrderData[],
  storeName: string | null
): OrderData[] {
  if (!storeName || storeName === 'all') {
    return ordersData;
  }
  return ordersData.filter((data) => data.storeName === storeName);
}
