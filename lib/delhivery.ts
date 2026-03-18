/**
 * Delhivery Tracking API Integration
 *
 * Fetches real-time shipment status from Delhivery using AWB numbers.
 * Production endpoint: https://track.delhivery.com/api/v1/packages/json/
 * Supports up to 50 AWBs per request (comma-separated).
 */

import { getFirestore, COLLECTIONS } from './firebase';

const DELHIVERY_API = 'https://track.delhivery.com/api/v1/packages/json/';
const BATCH_SIZE = 50; // Delhivery limit per request

// ── Types ────────────────────────────────────────────────────────────

export type DelhiveryStatus =
  | 'manifested'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'ndr'           // Non-delivery report / attempted
  | 'rto_in_transit'
  | 'rto_delivered'  // Returned to origin
  | 'cancelled'
  | 'unknown';

export interface DelhiveryShipment {
  awb: string;
  status: DelhiveryStatus;
  statusRaw: string;         // e.g. "In Transit"
  statusType: string;        // e.g. "RT", "DL", "UD"
  instructions: string;      // e.g. "Vehicle Departed"
  location: string;
  statusDateTime: string;
  reverseInTransit: boolean;
  rtoStartedDate: string | null;
  returnedDate: string | null;
  deliveryDate: string | null;
  firstAttemptDate: string | null;
  expectedReturnDate: string | null;
  codAmount: number;         // Actual COD amount collected/to-be-collected
  ndrCount: number;          // Number of failed delivery events
  dispatchCount: number;     // Actual out-for-delivery attempts (from scans)
  orderType: string;         // "COD" | "Pre-paid"
  referenceNo: string;       // Shopify order number
  origin: string;
  destination: string;
  consigneeName: string;
}

// ── Token Management ─────────────────────────────────────────────────

let cachedToken: string | null = null;

export async function getDelhiveryToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;

  try {
    const db = getFirestore();
    if (!db) return null;
    const doc = await db.collection(COLLECTIONS.SETTINGS).doc('delhivery').get();
    if (doc.exists) {
      const data = doc.data();
      cachedToken = data?.apiToken ?? null;
      return cachedToken;
    }
  } catch {
    // silent
  }
  return null;
}

export async function setDelhiveryToken(token: string): Promise<void> {
  cachedToken = token;
  const db = getFirestore();
  if (!db) return;
  await db.collection(COLLECTIONS.SETTINGS).doc('delhivery').set({
    apiToken: token,
    updatedAt: Date.now(),
  }, { merge: true });
}

// ── Status Classification ────────────────────────────────────────────

function classifyDelhiveryStatus(shipment: {
  Status?: { Status?: string; StatusType?: string; StatusCode?: string; Instructions?: string };
  ReverseInTransit?: boolean;
  RTOStartedDate?: string | null;
  ReturnedDate?: string | null;
  DeliveryDate?: string | null;
  Scans?: Array<{ ScanDetail?: { Scan?: string; StatusCode?: string; Instructions?: string } }>;
  DispatchCount?: number;
}): DelhiveryStatus {
  const status = shipment.Status?.Status?.toLowerCase() ?? '';
  const statusType = shipment.Status?.StatusType ?? '';
  const instructions = (shipment.Status?.Instructions ?? '').toLowerCase();
  const statusCode = (shipment.Status?.StatusCode ?? '').toUpperCase();

  // RTO checks FIRST — must come before delivered check
  // RTO completed (returned to origin)
  if (shipment.ReturnedDate) return 'rto_delivered';

  // RTO in transit
  if (shipment.ReverseInTransit || statusType === 'RT') return 'rto_in_transit';
  if (shipment.RTOStartedDate && !shipment.ReturnedDate) return 'rto_in_transit';

  // Delivered (only if NOT an RTO)
  if (statusType === 'DL' || status === 'delivered') return 'delivered';
  if (shipment.DeliveryDate) return 'delivered';

  // NDR / delivery attempted — check current status
  const isNdrInstruction =
    instructions.includes('not delivered') ||
    instructions.includes('undelivered') ||
    instructions.includes('delivery attempted') ||
    instructions.includes('consignee refused') ||
    instructions.includes('address issue') ||
    instructions.includes('customer not available') ||
    instructions.includes('otp not received') ||
    instructions.includes('cancellation') ||
    instructions.includes('rejected') ||
    instructions.includes('refused') ||
    instructions.includes('no client instructions') ||
    statusCode.startsWith('EOD-') ||
    statusCode.startsWith('CR-') ||
    statusCode.startsWith('UD-');

  if (isNdrInstruction) return 'ndr';

  // Check if the last meaningful scan was a failed delivery (Pending after Dispatched)
  const scans = shipment.Scans ?? [];
  if (scans.length >= 2) {
    const lastScan = scans[scans.length - 1]?.ScanDetail;
    const prevScan = scans[scans.length - 2]?.ScanDetail;
    if (lastScan?.Scan?.toLowerCase() === 'pending' && prevScan?.Scan?.toLowerCase() === 'dispatched') {
      return 'ndr';
    }
  }

  // Check scan history for any NDR that hasn't been resolved (not yet re-dispatched or delivered)
  let hasNdr = false;
  for (let i = 0; i < scans.length; i++) {
    const sd = scans[i].ScanDetail;
    const code = (sd?.StatusCode ?? '').toUpperCase();
    if (code.startsWith('EOD-') || code.startsWith('CR-') || code.startsWith('UD-')) hasNdr = true;
  }
  // If there's an NDR after the last dispatch, the order is in NDR state
  if (hasNdr && status === 'pending') return 'ndr';

  // Out for delivery
  if (status === 'dispatched' || instructions.includes('out for delivery') || statusCode === 'X-DEX' ||
      statusCode.startsWith('X-DDD') || instructions.includes('dispatched to consignee')) {
    return 'out_for_delivery';
  }

  // Cancelled
  if (status === 'cancelled' || instructions.includes('cancelled')) return 'cancelled';

  // Manifested (not yet picked up)
  if (status === 'manifested') return 'manifested';

  // In Transit (default for shipped items)
  if (status === 'in transit' || statusType === 'UD') return 'in_transit';

  return 'unknown';
}

// ── Fetch Tracking Data ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchBatch(token: string, awbBatch: string[]): Promise<any[]> {
  try {
    const res = await fetch(`${DELHIVERY_API}?waybill=${awbBatch.join(',')}`, {
      headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.ShipmentData ?? [];
  } catch { return []; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseShipment(s: any): DelhiveryShipment | null {
  if (!s?.AWB) return null;

  // Count NDR attempts from scans
  let ndrCount = 0;
  const scans = s.Scans ?? [];
  for (let si = 0; si < scans.length; si++) {
    const sd = scans[si]?.ScanDetail;
    const inst = (sd?.Instructions ?? '').toLowerCase();
    const code = (sd?.StatusCode ?? '').toUpperCase();
    const scanType = (sd?.Scan ?? '').toLowerCase();

    // Only count explicit Delhivery NDR scan codes + unambiguous delivery failure instructions
    if (
      code.startsWith('EOD-') || code.startsWith('CR-') || code.startsWith('UD-') ||
      inst.includes('delivery attempted') ||
      inst.includes('consignee refused') ||
      inst.includes('customer not available') ||
      inst.includes('otp not received')
    ) {
      ndrCount++;
    }
  }

  // Count actual out-for-delivery attempts
  let dispatchCount = 0;
  for (const scan of scans) {
    if ((scan?.ScanDetail?.Scan ?? '').toLowerCase() === 'dispatched') dispatchCount++;
  }

  return {
    awb: s.AWB,
    status: classifyDelhiveryStatus({ ...s, Scans: scans }),
    statusRaw: s.Status?.Status ?? '',
    statusType: s.Status?.StatusType ?? '',
    instructions: s.Status?.Instructions ?? '',
    location: s.Status?.StatusLocation ?? '',
    statusDateTime: s.Status?.StatusDateTime ?? '',
    reverseInTransit: s.ReverseInTransit ?? false,
    rtoStartedDate: s.RTOStartedDate ?? null,
    returnedDate: s.ReturnedDate ?? null,
    deliveryDate: s.DeliveryDate ?? (() => {
      // Fallback 1: If current status is Delivered, use StatusDateTime
      if (s.Status?.StatusType === 'DL' || (s.Status?.Status ?? '').toLowerCase() === 'delivered') {
        return s.Status?.StatusDateTime ?? null;
      }
      // Fallback 2: Check scan history for a "Delivered" scan
      for (let i = (scans.length - 1); i >= 0; i--) {
        const scan = scans[i]?.ScanDetail;
        if ((scan?.Scan ?? '').toLowerCase() === 'delivered') {
          return scan?.ScanDateTime ?? null;
        }
      }
      return null;
    })(),
    firstAttemptDate: s.FirstAttemptDate ?? null,
    expectedReturnDate: s.ExpectedReturnDate ?? null,
    codAmount: s.CODAmount ?? 0,
    ndrCount,
    dispatchCount,
    orderType: s.OrderType ?? '',
    referenceNo: s.ReferenceNo ?? '',
    origin: s.Origin ?? '',
    destination: s.Destination ?? '',
    consigneeName: s.Consignee?.Name ?? '',
  };
}

export async function trackShipments(awbs: string[]): Promise<Map<string, DelhiveryShipment>> {
  const token = await getDelhiveryToken();
  if (!token) throw new Error('Delhivery API token not configured');

  const results = new Map<string, DelhiveryShipment>();

  // Split into batches of 50, run 3 concurrently
  const batches: string[][] = [];
  for (let i = 0; i < awbs.length; i += BATCH_SIZE) {
    batches.push(awbs.slice(i, i + BATCH_SIZE));
  }

  const CONCURRENCY = 5;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(chunk.map((b) => fetchBatch(token, b)));

    for (const shipments of batchResults) {
      for (const item of shipments) {
        const parsed = parseShipment(item.Shipment);
        if (parsed) results.set(parsed.awb, parsed);
      }
    }
  }

  return results;
}

// ── Map to Order Tracking Status ─────────────────────────────────────

export type OrderDeliveryStatus = 'delivered' | 'in_transit' | 'out_for_delivery' | 'rto' | 'rto_in_transit' | 'unfulfilled' | 'cancelled' | 'attempted' | 'manifested';

export function mapDelhiveryToOrderStatus(ds: DelhiveryStatus): OrderDeliveryStatus {
  switch (ds) {
    case 'delivered': return 'delivered';
    case 'in_transit': return 'in_transit';
    case 'out_for_delivery': return 'out_for_delivery';
    case 'ndr': return 'attempted';
    case 'rto_in_transit': return 'rto_in_transit';
    case 'rto_delivered': return 'rto';
    case 'cancelled': return 'cancelled';
    case 'manifested': return 'in_transit';
    default: return 'in_transit';
  }
}
