// Shared types for the RTO (Return To Origin) dashboard.
// Kept out of the route file so the client page can import them safely.

export interface RtoLineItem {
  productName: string;
  sku: string;
  quantity: number;
}

export interface RtoOrderItem {
  orderId: string;          // Shopify name (e.g. "#KR1234")
  storeName: string;
  awb: string;
  rtoStartedDate: string | null;
  expectedReturnDate: string | null;
  orderType: string;        // "COD" | "Pre-paid"
  customerName: string;
  origin: string;
  destination: string;
  lineItems: RtoLineItem[];
  totalUnits: number;       // sum of line item quantities
}

export interface RtoStoreBucket {
  storeName: string;
  orders: number;
  units: number;
  products: Array<{
    productName: string;
    sku: string;
    units: number;
    orderCount: number;
  }>;
  items: RtoOrderItem[];
}

export interface RtoSyncResponse {
  fetchedAt: string;
  delhiveryAvailable: boolean;
  totalOrders: number;
  totalUnits: number;
  byStore: RtoStoreBucket[];
  warnings: string[];
}
