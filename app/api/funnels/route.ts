import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import type { Funnel, FunnelStatus } from '@/types/funnel';

const VALID_STATUSES: FunnelStatus[] = ['draft', 'testing', 'live', 'paused', 'killed'];
const db = () => (isFirebaseAvailable() ? getFirestore() : null);
const inMemory: Funnel[] = [];

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

function sanitizeFunnel(input: Record<string, unknown>, base?: Partial<Funnel>): Partial<Funnel> {
  const out: Partial<Funnel> = { ...base };
  if ('productId' in input) out.productId = String(input.productId ?? '').trim();
  if ('productName' in input) out.productName = String(input.productName ?? '').trim();
  if ('country' in input) out.country = String(input.country ?? '').trim();
  if ('language' in input) out.language = String(input.language ?? '').trim();
  if ('funnelishUrl' in input) out.funnelishUrl = String(input.funnelishUrl ?? '').trim();
  if ('status' in input) {
    const s = input.status;
    out.status = VALID_STATUSES.includes(s as FunnelStatus) ? (s as FunnelStatus) : 'draft';
  }
  if ('launchDate' in input) out.launchDate = String(input.launchDate ?? '').trim();
  if ('sellingPrice' in input) out.sellingPrice = Math.max(0, Number(input.sellingPrice) || 0);
  if ('deliveryRate' in input) out.deliveryRate = Math.max(0, Math.min(100, Number(input.deliveryRate) || 0));
  if ('beroas' in input) out.beroas = Math.max(0, Number(input.beroas) || 0);
  if ('notes' in input) out.notes = String(input.notes ?? '').trim();
  return out;
}

// GET /api/funnels?product=&country=&status=
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const product = searchParams.get('product') ?? '';
    const country = searchParams.get('country') ?? '';
    const status = searchParams.get('status') ?? '';

    const firestore = db();
    let entries: Funnel[];
    if (!firestore) {
      entries = [...inMemory];
    } else {
      const snap = await firestore.collection(COLLECTIONS.FUNNELS).get();
      entries = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: data.id ?? doc.id,
          productId: data.productId ?? '',
          productName: data.productName ?? '',
          country: data.country ?? '',
          language: data.language ?? '',
          funnelishUrl: data.funnelishUrl ?? '',
          status: (VALID_STATUSES.includes(data.status) ? data.status : 'draft') as FunnelStatus,
          launchDate: data.launchDate ?? '',
          sellingPrice: Number(data.sellingPrice) || 0,
          deliveryRate: Number(data.deliveryRate) || 0,
          beroas: Number(data.beroas) || 0,
          notes: data.notes ?? '',
          createdBy: data.createdBy ?? '',
          createdAt: data.createdAt ?? '',
          updatedAt: data.updatedAt ?? '',
        };
      });
    }

    const filtered = entries.filter((e) => {
      if (product && e.productName !== product) return false;
      if (country && e.country !== country) return false;
      if (status && e.status !== status) return false;
      return true;
    });
    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return NextResponse.json({ funnels: filtered });
  } catch (error) {
    console.error('Error fetching funnels:', error);
    return NextResponse.json({ error: 'Failed to fetch funnels.' }, { status: 500 });
  }
}

// POST /api/funnels — create
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const sanitized = sanitizeFunnel(body);

    if (!sanitized.productId) return NextResponse.json({ error: 'productId is required — pick a product from the tracker.' }, { status: 400 });
    if (!sanitized.productName) return NextResponse.json({ error: 'Product name is required.' }, { status: 400 });
    if (!sanitized.country) return NextResponse.json({ error: 'Country is required.' }, { status: 400 });
    if (!sanitized.language) return NextResponse.json({ error: 'Language is required.' }, { status: 400 });

    const now = new Date().toISOString();
    const entry: Funnel = {
      id: crypto.randomUUID(),
      productId: sanitized.productId,
      productName: sanitized.productName,
      country: sanitized.country,
      language: sanitized.language,
      funnelishUrl: sanitized.funnelishUrl ?? '',
      status: sanitized.status ?? 'draft',
      launchDate: sanitized.launchDate ?? '',
      sellingPrice: sanitized.sellingPrice ?? 0,
      deliveryRate: sanitized.deliveryRate ?? 0,
      beroas: sanitized.beroas ?? 0,
      notes: sanitized.notes ?? '',
      createdBy: session.email ?? '',
      createdAt: now,
      updatedAt: now,
    };

    const firestore = db();
    if (!firestore) {
      inMemory.unshift(entry);
      return NextResponse.json({ success: true, funnel: entry });
    }
    await firestore.collection(COLLECTIONS.FUNNELS).doc(entry.id).set(entry);
    return NextResponse.json({ success: true, funnel: entry });
  } catch (error) {
    console.error('Error creating funnel:', error);
    return NextResponse.json({ error: 'Failed to create funnel.' }, { status: 500 });
  }
}

// PATCH /api/funnels — update
export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'Funnel id is required.' }, { status: 400 });

    const sanitized = sanitizeFunnel(body, { updatedAt: new Date().toISOString() });
    sanitized.updatedAt = new Date().toISOString();

    const firestore = db();
    if (!firestore) {
      const idx = inMemory.findIndex((e) => e.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Funnel not found.' }, { status: 404 });
      inMemory[idx] = { ...inMemory[idx], ...sanitized };
      return NextResponse.json({ success: true, funnel: inMemory[idx] });
    }
    const ref = firestore.collection(COLLECTIONS.FUNNELS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Funnel not found.' }, { status: 404 });
    await ref.update(sanitized);
    const updated = { ...doc.data(), ...sanitized } as Funnel;
    return NextResponse.json({ success: true, funnel: updated });
  } catch (error) {
    console.error('Error updating funnel:', error);
    return NextResponse.json({ error: 'Failed to update funnel.' }, { status: 500 });
  }
}

// DELETE /api/funnels — also cascades the daily logs for that funnel
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'Funnel id is required.' }, { status: 400 });

    const firestore = db();
    if (!firestore) {
      const idx = inMemory.findIndex((e) => e.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Funnel not found.' }, { status: 404 });
      inMemory.splice(idx, 1);
      return NextResponse.json({ success: true });
    }
    const ref = firestore.collection(COLLECTIONS.FUNNELS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Funnel not found.' }, { status: 404 });

    // Cascade-delete logs for this funnel
    const logsSnap = await firestore.collection(COLLECTIONS.FUNNEL_DAILY_LOGS).where('funnelId', '==', id).get();
    const batch = firestore.batch();
    logsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting funnel:', error);
    return NextResponse.json({ error: 'Failed to delete funnel.' }, { status: 500 });
  }
}
