// Direct Shopify Admin API fetch for the Finance module (TS port of the worker's shopify.js).
import type { FinanceStore } from './stores';

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
