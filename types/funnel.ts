// Funnel + creative types for international launch tracking.
// MONEY (cost, revenue, profit, currency) is OUT OF SCOPE here — that lives in
// the future Finance page. This page only tracks launches and performance.

export type FunnelStatus = 'draft' | 'testing' | 'live' | 'paused' | 'killed';
export type CreativeStatus = 'testing' | 'live' | 'killed';
export type CreativeResult = 'inconclusive' | 'winner' | 'loser';

export interface Funnel {
  id: string;
  productName: string;          // free-text for now; will link to product tracker in Round 3
  country: string;              // long form, e.g. "Netherlands"
  language: string;
  funnelishUrl: string;
  status: FunnelStatus;
  launchDate: string;           // YYYY-MM-DD or ''
  beroas: number;               // breakeven ROAS — single number; future will pull from Finance
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FunnelDailyLog {
  id: string;
  funnelId: string;
  date: string;                 // YYYY-MM-DD (IST)
  roas: number;                 // entered from Meta
  orders: number;               // optional sales count
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
