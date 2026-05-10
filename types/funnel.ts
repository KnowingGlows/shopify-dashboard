// Funnel + creative types for international launch tracking.
// MONEY (cost, revenue, profit, currency) is OUT OF SCOPE here — that lives in
// the future Finance page. This page only tracks launches and performance.

export type FunnelStatus = 'draft' | 'testing' | 'live' | 'paused' | 'killed';
export type CreativeStatus = 'testing' | 'live' | 'killed';
export type CreativeResult = 'inconclusive' | 'winner' | 'loser';

export interface Funnel {
  id: string;
  productId?: string;           // FK to ProductTrackerEntry — required for new funnels;
                                // optional only to preserve legacy funnels created before linking
  productName: string;          // denormalized for display + legacy fallback
  country: string;              // long form, e.g. "Netherlands"
  language: string;
  funnelishUrl: string;
  status: FunnelStatus;
  launchDate: string;           // YYYY-MM-DD or ''

  // Per-market pricing — drives BEROAS auto-compute when set.
  // Cost (COGS + shipping) is read from the linked product; SP and delivery
  // rate vary per market and live here. Not "money tracking" (those daily
  // spend/revenue logs live on the Finance page) — these are configuration.
  sellingPrice: number;         // USD per unit
  deliveryRate: number;         // 0–100 percent (successful delivery)

  // Manual override / legacy fallback. Used only when SP or deliveryRate
  // aren't set yet, so old funnels keep working.
  beroas: number;

  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// One log per (funnel, date). Two pages edit it:
//   • Funnels page edits roas / orders / notes (launch performance).
//   • Finance page edits spend / revenue / profit / notes (money).
// PATCH semantics let either page update its fields without disturbing the other.
export interface FunnelDailyLog {
  id: string;
  funnelId: string;
  date: string;                 // YYYY-MM-DD (IST)

  // Performance (Funnels page)
  roas: number;                 // entered from Meta
  orders: number;

  // Money (Finance page) — all USD
  spend: number;
  revenue: number;
  profit: number;               // can be negative

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
  creativeType: string;
  folderLink: string;
  launchDate: string;
  status: CreativeStatus;
  result: CreativeResult;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
