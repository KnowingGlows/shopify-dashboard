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

export async function trackShipments(awbs: string[]): Promise<Map<string, DelhiveryShipment>> {
  const token = await getDelhiveryToken();
  if (!token) throw new Error('Delhivery API token not configured');

  const results = new Map<string, DelhiveryShipment>();

  // Process in batches of 50
  for (let i = 0; i < awbs.length; i += BATCH_SIZE) {
    const batch = awbs.slice(i, i + BATCH_SIZE);
    const waybillParam = batch.join(',');

    try {
      const res = await fetch(`${DELHIVERY_API}?waybill=${waybillParam}`, {
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        console.error(`Delhivery API error: ${res.status} ${res.statusText}`);
        continue;
      }

      const data = await res.json();
      const shipments = data.ShipmentData ?? [];

      for (const item of shipments) {
        const s = item.Shipment;
        if (!s?.AWB) continue;

        // Count NDR attempts from scans — look at status codes and instructions
        let ndrCount = 0;
        const scans = s.Scans ?? [];
        for (let si = 0; si < scans.length; si++) {
          const sd = scans[si].ScanDetail;
          const inst = (sd?.Instructions ?? '').toLowerCase();
          const code = (sd?.StatusCode ?? '').toUpperCase();
          const scanType = (sd?.Scan ?? '').toLowerCase();

          // EOD codes = end of day reasons (failed delivery)
          // ST- codes = status calls to consignee during delivery
          // CR- codes = customer refused
          // UD- codes = undelivered
          // Pending after Dispatched = failed delivery attempt
          if (
            code.startsWith('EOD-') ||
            code.startsWith('CR-') ||
            code.startsWith('UD-') ||
            inst.includes('not delivered') ||
            inst.includes('undelivered') ||
            inst.includes('delivery attempted') ||
            inst.includes('consignee refused') ||
            inst.includes('address issue') ||
            inst.includes('customer not available') ||
            inst.includes('otp not received') ||
            inst.includes('cancellation') ||
            inst.includes('no client instructions to reattempt') ||
            inst.includes('rejected') ||
            inst.includes('refused') ||
            (scanType === 'pending' && si > 0 && (scans[si - 1]?.ScanDetail?.Scan ?? '').toLowerCase() === 'dispatched')
          ) {
            ndrCount++;
          }
        }

        // Count actual out-for-delivery attempts from scans
        let dispatchCount = 0;
        for (const scan of scans) {
          if ((scan.ScanDetail?.Scan ?? '').toLowerCase() === 'dispatched') dispatchCount++;
        }

        results.set(s.AWB, {
          awb: s.AWB,
          status: classifyDelhiveryStatus({ ...s, Scans: s.Scans }),
          statusRaw: s.Status?.Status ?? '',
          statusType: s.Status?.StatusType ?? '',
          instructions: s.Status?.Instructions ?? '',
          location: s.Status?.StatusLocation ?? '',
          statusDateTime: s.Status?.StatusDateTime ?? '',
          reverseInTransit: s.ReverseInTransit ?? false,
          rtoStartedDate: s.RTOStartedDate ?? null,
          returnedDate: s.ReturnedDate ?? null,
          deliveryDate: s.DeliveryDate ?? null,
          firstAttemptDate: s.FirstAttemptDate ?? null,
          expectedReturnDate: s.ExpectedReturnDate ?? null,
          ndrCount,
          dispatchCount,
          orderType: s.OrderType ?? '',
          referenceNo: s.ReferenceNo ?? '',
          origin: s.Origin ?? '',
          destination: s.Destination ?? '',
          consigneeName: s.Consignee?.Name ?? '',
        });
      }
    } catch (error) {
      console.error('Delhivery tracking batch error:', error);
    }

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < awbs.length) {
      await new Promise((r) => setTimeout(r, 200));
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
