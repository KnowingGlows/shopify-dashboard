import { OrderData, SalesMetrics, StoreMetrics, ShopifyOrder } from '@/types/shopify';
import { convertToINR } from './currency-converter';

const toNumber = (value?: string) => (value ? Number(value) : 0);

const getRefundedAmount = (order: ShopifyOrder) => {
  if (order.total_refunded) {
    return toNumber(order.total_refunded);
  }

  if (!order.refunds?.length) {
    return 0;
  }

  return order.refunds.reduce((sum, refund) => {
    const refundTotal =
      refund.transactions?.reduce((total, transaction) => total + toNumber(transaction.amount), 0) ??
      0;
    return sum + refundTotal;
  }, 0);
};

const getGrossOrderAmount = (order: ShopifyOrder) => {
  const totalPrice = toNumber(order.total_price);
  const refundedAmount = getRefundedAmount(order);
  const netAmount =
    typeof order.current_total_price === 'string'
      ? toNumber(order.current_total_price)
      : Math.max(0, totalPrice - refundedAmount);
  const cancelledAmount = order.cancelled_at
    ? Math.max(0, totalPrice - (netAmount + refundedAmount))
    : 0;

  return netAmount + refundedAmount + cancelledAmount;
};

export function aggregateSalesData(ordersData: OrderData[]): SalesMetrics {
  let totalSalesINR = 0;
  let totalOrders = 0;
  const storeBreakdown: StoreMetrics[] = [];

  ordersData.forEach(({ storeName, orders, grossSales }) => {
    let storeSales = 0;
    const storeOrderCount = orders.length;
    const storeCurrency = orders[0]?.currency ?? 'INR';

    if (typeof grossSales === 'number') {
      storeSales = convertToINR(grossSales, storeCurrency);
    } else {
      orders.forEach((order: ShopifyOrder) => {
        const orderAmount = getGrossOrderAmount(order);
        const amountInINR = convertToINR(orderAmount, order.currency);
        storeSales += amountInINR;
      });
    }

    totalSalesINR += storeSales;
    totalOrders += storeOrderCount;

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
