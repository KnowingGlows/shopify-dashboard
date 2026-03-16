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
  ndrCount: number;          // Number of delivery attempts
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
}): DelhiveryStatus {
  const status = shipment.Status?.Status?.toLowerCase() ?? '';
  const statusType = shipment.Status?.StatusType ?? '';
  const instructions = (shipment.Status?.Instructions ?? '').toLowerCase();
  const statusCode = (shipment.Status?.StatusCode ?? '').toUpperCase();

  // Delivered
  if (statusType === 'DL' || status === 'delivered') return 'delivered';
  if (shipment.DeliveryDate) return 'delivered';

  // RTO completed (returned to origin)
  if (shipment.ReturnedDate) return 'rto_delivered';

  // RTO in transit
  if (shipment.ReverseInTransit || statusType === 'RT') return 'rto_in_transit';
  if (shipment.RTOStartedDate && !shipment.ReturnedDate) return 'rto_in_transit';

  // NDR / delivery attempted
  if (statusType === 'UD' && (
    instructions.includes('not delivered') ||
    instructions.includes('undelivered') ||
    instructions.includes('delivery attempted') ||
    instructions.includes('consignee refused') ||
    instructions.includes('address issue') ||
    instructions.includes('customer not available') ||
    instructions.includes('otp not received') ||
    statusCode.startsWith('CR-') ||
    statusCode.startsWith('UD-')
  )) return 'ndr';

  // Out for delivery
  if (instructions.includes('out for delivery') || statusCode === 'X-DEX' || instructions.includes('dispatched to consignee')) {
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

        // Count NDR attempts from scans
        let ndrCount = 0;
        for (const scan of (s.Scans ?? [])) {
          const inst = (scan.ScanDetail?.Instructions ?? '').toLowerCase();
          if (inst.includes('not delivered') || inst.includes('undelivered') || inst.includes('delivery attempted')) {
            ndrCount++;
          }
        }

        results.set(s.AWB, {
          awb: s.AWB,
          status: classifyDelhiveryStatus(s),
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
