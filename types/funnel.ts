// Funnel + daily log + creative types for international expansion.
// All monetary values stored in USD; display layer handles EUR/INR conversion.

export type FunnelStatus = 'draft' | 'testing' | 'live' | 'paused' | 'killed';
export type CreativeStatus = 'testing' | 'live' | 'killed';
export type CreativeResult = 'inconclusive' | 'winner' | 'loser';

export interface Funnel {
  id: string;
  productName: string;          // free-text for now; will link to product tracker in Round 3
  country: string;              // long form, e.g. "Netherlands"
  language: string;             // e.g. "Dutch"
  funnelishUrl: string;
  status: FunnelStatus;
  launchDate: string;           // YYYY-MM-DD or ''

  // Pricing/margin (USD) — drives BEROAS computation
  sellingPrice: number;
  costPrice: number;
  deliveryRate: number;         // 0–100 percentage (e.g. 95 for 95%)

  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FunnelDailyLog {
  id: string;
  funnelId: string;
  date: string;                 // YYYY-MM-DD (IST)
  spend: number;                // USD
  revenue: number;              // USD
  profit: number;               // USD (manually entered)
  orders: number;
  roas: number;                 // entered from Meta or computed = revenue / spend
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Creative {
  id: string;
  funnelId: string;
  productName: string;
  country: string;
  language: string;
  batchName: string;
  creativeType: string;         // 'video' | 'image' | 'UGC' | 'carousel' | etc.
  folderLink: string;
  launchDate: string;           // YYYY-MM-DD or ''
  status: CreativeStatus;
  result: CreativeResult;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type DisplayCurrency = 'USD' | 'EUR' | 'INR';
