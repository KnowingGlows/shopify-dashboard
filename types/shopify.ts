export interface ShopifyStore {
  name: string;
  domain: string;
  accessToken: string;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  email: string;
  created_at: string;
  total_price: string;
  current_total_price?: string;
  total_refunded?: string;
  cancelled_at?: string | null;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  refunds?: Array<{
    transactions?: Array<{
      amount: string;
    }>;
  }>;
  line_items: Array<{
    id: string;
    title: string;
    quantity: number;
    price: string;
  }>;
}

export interface OrderData {
  storeName: string;
  orders: ShopifyOrder[];
}

export interface SalesMetrics {
  totalSalesINR: number;
  totalOrders: number;
  averageOrderValue: number;
  storeBreakdown: StoreMetrics[];
}

export interface StoreMetrics {
  storeName: string;
  totalSalesINR: number;
  totalOrders: number;
  averageOrderValue: number;
  currency: string;
}

export interface ExchangeRates {
  [key: string]: number;
}
