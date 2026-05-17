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

// Product Tracker — a product owns its economics. COGS + selling price +
// delivery rate run through the shared 3PL engine (lib/3pl.ts) to give a
// BEROAS + gross margin that holds across every LP and ad of this product.
export interface ProductTrackerEntry {
  id: string;
  productName: string;
  productFileLink: string;   // drive / product file link (carried from PRS)
  adLink: string;            // winning ad reference (carried from PRS)
  websiteLink: string;       // competitor / store page (carried from PRS)
  productStage: string;
  totalSpent: number;

  // Economics (India). cogs is stored canonical in ₹ INR; costCurrency only
  // remembers which unit it was last entered in for display convenience.
  cogs: number;                       // ₹ per unit, landed supplier cost
  costCurrency: 'INR' | 'USD';        // input-unit hint only — cogs stays ₹
  sellingPrice: number;               // ₹ per unit (GST-inclusive)
  deliveryRate: number;               // 0–100 percent successfully delivered

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
  driveLink: string;   // product file / drive link — carried to Products on approve
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

