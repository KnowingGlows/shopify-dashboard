export interface ShopifyStore {
  name: string;
  domain: string;
  accessToken: string;
}

export interface ShopifyFulfillment {
  id: number;
  status: string; // 'success' | 'cancelled' | 'error' | 'failure'
  tracking_company?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  shipment_status?: string | null; // 'confirmed' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failure' | 'attempted_delivery'
  created_at: string;
  updated_at: string;
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
  tags?: string;
  fulfillments?: ShopifyFulfillment[];
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
    sku?: string;
    variant_title?: string | null;
  }>;
  customer?: {
    first_name: string;
    last_name: string;
    phone: string | null;
  };
  phone?: string;
  order_number?: number;
  note?: string | null;
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

// Product Tracker
export interface ProductCostOverride {
  cogs?: number;       // optional override (USD per unit)
  shipping?: number;   // optional override (USD per unit)
}

export interface ProductTrackerEntry {
  id: string;
  productName: string;
  productFileLink: string;
  productStage: string;
  totalSpent: number;
  // Per-product BASE cost (USD) — drives BEROAS when no country override exists.
  // Leave at 0 if you haven't sourced the product yet.
  cogs: number;        // unit cost from supplier
  shipping: number;    // shipping per unit
  // Per-country cost overrides. Looked up by funnel.country before falling
  // back to base cogs/shipping above. Either field may be omitted to inherit.
  costsByCountry?: Record<string, ProductCostOverride>;
  remarks: string;
  createdAt: string;
  updatedAt: string;
}

// Ads Tracker
export interface AdsTrackerEntry {
  id: string;
  productName: string;
  creativeFolderLink: string;
  batchName: string;
  creativeType: string;
  dailyAdSpend: number;
  weeklyRoas: number;
  creativeBatchResult: string;
  launchDate?: string;
  createdAt: string;
  updatedAt: string;
}

// Product Research Sheet
export interface PRSEntry {
  id: string;
  productName: string;
  adLink: string;
  websiteLink: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Inventory Tracker
export interface InventoryEntry {
  id: string;
  productName: string;
  sku: string;
  currentStock: number;
  reorderLevel: number;
  reorderQty: number;       // units to order per restock
  supplier: string;
  costPerUnit: number;
  status: string;
  store: string; // 'Kairova' | 'Mavric' | ''
  sourcingOrigin: string; // 'india' | 'china' | ''
  dailyAvgOrders: number; // rolling 7-day avg from dispatch logs
  notes: string;            // free-text notes
  lastRestockedDate: string; // YYYY-MM-DD when stock was last topped up
  createdAt: string;
  updatedAt: string;
}

// Inventory Dispatch Log
export interface InventoryDispatch {
  id: string;
  inventoryId: string;
  quantity: number;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

// Daily order dispatch (for Umang's monthly base calculation)
export interface DailyDispatchEntry {
  id: string;
  date: string;       // YYYY-MM-DD (IST)
  orders: number;
  notes: string;
  recordedBy: string; // user email
  createdAt: string;
  updatedAt: string;
}

