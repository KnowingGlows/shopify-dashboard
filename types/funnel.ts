// LP (landing page) + creative types — India-only.
//
// An LP is one landing page for a product. A product (ProductTrackerEntry)
// owns its economics — selling price, COGS, delivery rate → BEROAS + gross
// margin — and every LP / creative for that product inherits those numbers.
// Here we only track the LP itself (its link, its inspiration, its launch
// status) and its day-to-day performance (ROAS / orders). Money tracking
// lives on the future Finance page.

export type FunnelStatus = 'draft' | 'testing' | 'live' | 'paused' | 'killed';
export type CreativeStatus = 'testing' | 'live' | 'killed';
export type CreativeResult = 'inconclusive' | 'winner' | 'loser';

export interface Funnel {
  id: string;
  productId?: string;           // FK to ProductTrackerEntry — required for new LPs;
                                // optional only to preserve legacy LPs created before linking
  productName: string;          // denormalized for display + legacy fallback

  name: string;                 // human label for this LP (distinguishes LPs of the same product)
  funnelishUrl: string;         // the LP link itself
  inspoLink: string;            // inspiration / reference (competitor LP, swipe, doc)

  status: FunnelStatus;
  launchDate: string;           // YYYY-MM-DD or ''

  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// One log per (LP, date). Two pages edit it:
//   • LPs page edits roas / orders / notes (launch performance).
//   • Finance page edits spend / revenue / profit / notes (money).
// PATCH semantics let either page update its fields without disturbing the other.
export interface FunnelDailyLog {
  id: string;
  funnelId: string;
  date: string;                 // YYYY-MM-DD (IST)

  // Performance (LPs page)
  roas: number;                 // entered from Meta
  orders: number;

  // Money (Finance page) — all ₹ INR
  spend: number;                // ad spend
  revenue: number;
  expense: number;              // other operating expenses (refunds, tools, payouts, etc.)
  profit: number;               // can be negative

  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Creative {
  id: string;
  funnelId: string;             // the LP this creative belongs to
  productName: string;
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
