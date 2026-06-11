// Delhivery tracking for the Finance module (TS port of the worker's delhivery.js).
import type { TrackingRow } from './shopify';

const BATCH = 20;
const CONCURRENCY = 4;

export interface TrackedRow {
  waybill: string;
  order?: string;
  status?: string;
  stype?: string;            // DL / RT / UD ...
  instructions?: string;
  ordertype?: string;        // COD / Pre-paid
  cod_amt?: number | string;
  pickup?: string | null;
  promised?: string | null;
  delivered?: string | null;
  // RTO signals — Delhivery sometimes returns stype='DL' for packages
  // successfully returned to origin (delivered back to seller). Always consult
  // these fields before treating stype=DL as a customer-delivery.
  returnedDate?: string | null;
  rtoStartedDate?: string | null;
  reverseInTransit?: boolean;
  state?: string;
  city?: string;
  total?: string | null;
  scans: Array<[string | undefined, string | undefined, string | undefined]>;
}

async function trackBatch(token: string, batch: string[]): Promise<Record<string, unknown>> {
  const url = `https://track.delhivery.com/api/v1/packages/json/?waybill=${batch.join(',')}&ref_ids=`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error(`Delhivery ${res.status}`);
      return await res.json() as Record<string, unknown>;
    } catch (e) {
      if (attempt === 2) { console.error('delhivery batch failed', (e as Error).message); return {}; }
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return {};
}

export async function trackAll(token: string, rows: TrackingRow[]): Promise<TrackedRow[]> {
  const meta = new Map<string, TrackingRow>();
  const wbs: string[] = [];
  for (const r of rows) {
    if (r.waybill) { const w = String(r.waybill); wbs.push(w); meta.set(w, r); }
  }

  const batches: string[][] = [];
  for (let i = 0; i < wbs.length; i += BATCH) batches.push(wbs.slice(i, i + BATCH));

  const results: TrackedRow[] = [];
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const slice = batches.slice(i, i + CONCURRENCY);
    const datas = await Promise.all(slice.map(b => trackBatch(token, b)));
    for (const d of datas) {
      const shipmentData = (d.ShipmentData ?? []) as Array<{ Shipment?: Record<string, unknown> }>;
      for (const item of shipmentData) {
        const s = (item.Shipment ?? {}) as Record<string, unknown>;
        const st = (s.Status ?? {}) as Record<string, unknown>;
        const wb = String(s.AWB);
        const m = meta.get(wb);
        const scans = ((s.Scans ?? []) as Array<{ ScanDetail?: Record<string, string> }>).map(sc => {
          const sd = sc.ScanDetail ?? {};
          return [sd.Scan, sd.Instructions, sd.ScanDateTime] as [string | undefined, string | undefined, string | undefined];
        });
        const revRaw = s.ReverseInTransit;
        const rev = revRaw === true || String(revRaw ?? '').toLowerCase() === 'true';
        results.push({
          waybill: wb, order: m?.order,
          status: st.Status as string, stype: st.StatusType as string, instructions: st.Instructions as string,
          ordertype: s.OrderType as string, cod_amt: s.CODAmount as number,
          pickup: (s.PickUpDate as string) ?? null, promised: (s.PromisedDeliveryDate as string) ?? null,
          delivered: (s.DeliveryDate as string) ?? null,
          returnedDate: (s.ReturnedDate as string) ?? null,
          rtoStartedDate: (s.RTOStartedDate as string) ?? null,
          reverseInTransit: rev,
          state: m?.state, city: m?.city, total: m?.total ?? null,
          scans,
        });
      }
    }
  }
  return results;
}
