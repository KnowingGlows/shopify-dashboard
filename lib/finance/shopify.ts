// Direct Shopify Admin API fetch for the Finance module (TS port of the worker's shopify.js).
import type { FinanceStore } from './stores';
import type { TrackedRow } from './delhivery';

const API = '2024-10';

export interface TrackingRow {
  order: string;
  created: string;
  waybill: string | null;
  company: string | null;
  fin: string | null;
  cod: boolean;
  total: string | null;
  city?: string;
  state?: string;
  zip?: string;
}

// Build an IST (+05:30) timestamp for Shopify created_at filtering.
function istBoundary(dateStr: string, end: boolean): string {
  return `${dateStr}T${end ? '23:59:59' : '00:00:00'}+05:30`;
}

/** Date range as {min,max} ISO-with-IST-offset strings. start/end are YYYY-MM-DD (IST). */
export function rangeFromDates(start: string, end: string) {
  return { min: istBoundary(start, false), max: istBoundary(end, true) };
}

export async function fetchOrders(store: FinanceStore, range: { min: string; max: string }): Promise<{ orders: number; rows: TrackingRow[] }> {
  const fields = 'id,name,created_at,financial_status,fulfillment_status,total_price,gateway,shipping_address,fulfillments';
  let url: string | null =
    `https://${store.domain}/admin/api/${API}/orders.json?status=any`
    + `&created_at_min=${encodeURIComponent(range.min)}&created_at_max=${encodeURIComponent(range.max)}`
    + `&limit=250&fields=${fields}`;

  const orders: Array<Record<string, unknown>> = [];
  for (let page = 0; url && page < 50; page++) {
    const res: Response = await fetch(url, { headers: { 'X-Shopify-Access-Token': store.token } });
    if (!res.ok) throw new Error(`Shopify ${store.name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json() as { orders?: Array<Record<string, unknown>> };
    orders.push(...(body.orders ?? []));
    const link = res.headers.get('Link') ?? '';
    url = null;
    if (link.includes('rel="next"')) {
      for (const part of link.split(',')) {
        if (part.includes('rel="next"')) url = part.slice(part.indexOf('<') + 1, part.indexOf('>'));
      }
    }
  }

  const rows: TrackingRow[] = [];
  for (const o of orders) {
    const sa = (o.shipping_address ?? {}) as Record<string, string>;
    const gw = String(o.gateway ?? '').toLowerCase();
    const cod = gw.includes('cod') || gw.includes('cash');
    const fuls = (o.fulfillments ?? []) as Array<Record<string, unknown>>;
    for (const f of fuls) {
      rows.push({
        order: String(o.name), created: String(o.created_at),
        waybill: (f.tracking_number as string) ?? null, company: (f.tracking_company as string) ?? null,
        fin: (o.financial_status as string) ?? null, cod,
        total: (o.total_price as string) ?? null,
        city: sa.city, state: sa.province, zip: sa.zip,
      });
    }
  }
  return { orders: orders.length, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shopify is the durable source of delivery + COD truth (Delhivery's tracking API
// purges aged waybills, so historical months must come from Shopify, which keeps
// shipment_status + payment_gateway_names + the RTO note forever).
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderRow {
  order: string;
  created: string;              // ISO created_at
  waybill: string | null;
  company: string | null;
  cod: boolean;                 // from payment_gateway_names
  total: string | null;
  shipped: boolean;             // has a fulfillment with tracking
  shipmentStatus: string | null;// delivered / in_transit / failure / ...
  isRto: boolean;               // from the order note / tags
  deliveredAt: string | null;   // fulfillment updated_at of the delivered fulfillment
  pickup: string | null;        // earliest fulfillment created_at
  city?: string;
  state?: string;
  zip?: string;
}

const RTO_RE = /return|rto|undeliver|rvp/i;

/** Fetch orders enriched with the fields needed to derive delivery + COD from Shopify alone. */
export async function fetchOrdersEnriched(store: FinanceStore, range: { min: string; max: string }): Promise<{ orders: number; rows: OrderRow[] }> {
  const fields = 'id,name,created_at,total_price,payment_gateway_names,note,tags,cancelled_at,shipping_address,fulfillments';
  let url: string | null =
    `https://${store.domain}/admin/api/${API}/orders.json?status=any`
    + `&created_at_min=${encodeURIComponent(range.min)}&created_at_max=${encodeURIComponent(range.max)}`
    + `&limit=250&fields=${fields}`;

  const raw: Array<Record<string, unknown>> = [];
  const seen = new Set<unknown>();
  for (let page = 0; url && page < 60; page++) {
    const res: Response = await fetch(url, { headers: { 'X-Shopify-Access-Token': store.token } });
    if (!res.ok) throw new Error(`Shopify ${store.name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json() as { orders?: Array<Record<string, unknown>> };
    for (const o of (body.orders ?? [])) { if (!seen.has(o.id)) { seen.add(o.id); raw.push(o); } }
    const link = res.headers.get('Link') ?? '';
    url = null;
    if (link.includes('rel="next"')) {
      for (const part of link.split(',')) {
        if (part.includes('rel="next"')) url = part.slice(part.indexOf('<') + 1, part.indexOf('>'));
      }
    }
  }

  const rows: OrderRow[] = raw.map((o) => {
    const sa = (o.shipping_address ?? {}) as Record<string, string>;
    const gws = (o.payment_gateway_names ?? []) as string[];
    const cod = gws.some(g => /cash on delivery|(^|\b)cod(\b|$)/i.test(String(g)));
    const note = String(o.note ?? '');
    const tags = String(o.tags ?? '');
    const isRto = RTO_RE.test(note) || /\brto\b/i.test(tags);
    const fuls = (o.fulfillments ?? []) as Array<Record<string, unknown>>;
    const tracked = fuls.filter(f => f.tracking_number);
    const statuses = tracked.map(f => String(f.shipment_status ?? '')).filter(Boolean);
    const shipmentStatus = statuses.includes('delivered') ? 'delivered'
      : statuses.includes('failure') ? 'failure'
      : (statuses[0] ?? null);
    const delFul = tracked.find(f => String(f.shipment_status ?? '') === 'delivered');
    return {
      order: String(o.name), created: String(o.created_at),
      waybill: (tracked[0]?.tracking_number as string) ?? null,
      company: (tracked[0]?.tracking_company as string) ?? null,
      cod, total: (o.total_price as string) ?? null,
      shipped: tracked.length > 0,
      shipmentStatus, isRto,
      deliveredAt: (delFul?.updated_at as string) ?? null,
      pickup: (tracked[0]?.created_at as string) ?? null,
      city: sa.city, state: sa.province, zip: sa.zip,
    };
  });
  return { orders: raw.length, rows };
}

/** A shipped OrderRow -> Delhivery TrackingRow (for live tracking of the recent window). */
export function toTrackingRow(o: OrderRow): TrackingRow {
  return { order: o.order, created: o.created, waybill: o.waybill, company: o.company, fin: null, cod: o.cod, total: o.total, city: o.city, state: o.state, zip: o.zip };
}

/** A shipped OrderRow -> TrackedRow derived purely from Shopify (for the historical window). */
export function deriveTrackedRow(o: OrderRow): TrackedRow {
  const stype = o.isRto ? 'RT' : (o.shipmentStatus === 'delivered' ? 'DL' : 'UD');
  return {
    waybill: String(o.waybill ?? o.order), order: o.order,
    status: o.isRto ? 'Returned' : (o.shipmentStatus ?? undefined),
    stype,
    instructions: undefined,
    ordertype: o.cod ? 'COD' : 'Pre-paid',
    cod_amt: o.cod ? (o.total ?? 0) : 0,
    pickup: o.pickup, promised: null,
    delivered: stype === 'DL' ? (o.deliveredAt ?? o.pickup) : null,
    returnedDate: o.isRto ? (o.deliveredAt ?? o.pickup) : null,
    rtoStartedDate: o.isRto ? (o.pickup ?? null) : null,
    reverseInTransit: o.isRto,
    state: o.state, city: o.city, total: o.total ?? null,
    scans: [],
  };
}
