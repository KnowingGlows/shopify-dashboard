import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import type { Creative, CreativeStatus, CreativeResult } from '@/types/funnel';

const VALID_STATUSES: CreativeStatus[] = ['testing', 'live', 'killed'];
const VALID_RESULTS: CreativeResult[] = ['inconclusive', 'winner', 'loser'];

const db = () => (isFirebaseAvailable() ? getFirestore() : null);
const inMemory: Creative[] = [];

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

function sanitize(input: Record<string, unknown>, base?: Partial<Creative>): Partial<Creative> {
  const out: Partial<Creative> = { ...base };
  if ('funnelId' in input) out.funnelId = String(input.funnelId ?? '').trim();
  if ('productName' in input) out.productName = String(input.productName ?? '').trim();
  if ('country' in input) out.country = String(input.country ?? '').trim();
  if ('language' in input) out.language = String(input.language ?? '').trim();
  if ('batchName' in input) out.batchName = String(input.batchName ?? '').trim();
  if ('creativeType' in input) out.creativeType = String(input.creativeType ?? '').trim();
  if ('folderLink' in input) out.folderLink = String(input.folderLink ?? '').trim();
  if ('launchDate' in input) out.launchDate = String(input.launchDate ?? '').trim();
  if ('status' in input) {
    const s = input.status;
    out.status = VALID_STATUSES.includes(s as CreativeStatus) ? (s as CreativeStatus) : 'testing';
  }
  if ('result' in input) {
    const r = input.result;
    out.result = VALID_RESULTS.includes(r as CreativeResult) ? (r as CreativeResult) : 'inconclusive';
  }
  if ('notes' in input) out.notes = String(input.notes ?? '').trim();
  return out;
}

// GET /api/creatives-intl?funnelId=&country=&status=&result=
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const funnelId = searchParams.get('funnelId') ?? '';
    const country = searchParams.get('country') ?? '';
    const status = searchParams.get('status') ?? '';
    const result = searchParams.get('result') ?? '';

    const firestore = db();
    let entries: Creative[];
    if (!firestore) {
      entries = [...inMemory];
    } else {
      const snap = await firestore.collection(COLLECTIONS.CREATIVES_INTL).get();
      entries = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: data.id ?? doc.id,
          funnelId: data.funnelId ?? '',
          productName: data.productName ?? '',
          country: data.country ?? '',
          language: data.language ?? '',
          batchName: data.batchName ?? '',
          creativeType: data.creativeType ?? '',
          folderLink: data.folderLink ?? '',
          launchDate: data.launchDate ?? '',
          status: (VALID_STATUSES.includes(data.status) ? data.status : 'testing') as CreativeStatus,
          result: (VALID_RESULTS.includes(data.result) ? data.result : 'inconclusive') as CreativeResult,
          notes: data.notes ?? '',
          createdBy: data.createdBy ?? '',
          createdAt: data.createdAt ?? '',
          updatedAt: data.updatedAt ?? '',
        };
      });
    }

    const filtered = entries.filter((e) => {
      if (funnelId && e.funnelId !== funnelId) return false;
      if (country && e.country !== country) return false;
      if (status && e.status !== status) return false;
      if (result && e.result !== result) return false;
      return true;
    });
    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return NextResponse.json({ creatives: filtered });
  } catch (error) {
    console.error('Error fetching creatives:', error);
    return NextResponse.json({ error: 'Failed to fetch creatives.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const sanitized = sanitize(body);

    if (!sanitized.funnelId) return NextResponse.json({ error: 'funnelId is required.' }, { status: 400 });
    if (!sanitized.batchName) return NextResponse.json({ error: 'Batch name is required.' }, { status: 400 });

    const now = new Date().toISOString();
    const entry: Creative = {
      id: crypto.randomUUID(),
      funnelId: sanitized.funnelId,
      productName: sanitized.productName ?? '',
      country: sanitized.country ?? '',
      language: sanitized.language ?? '',
      batchName: sanitized.batchName,
      creativeType: sanitized.creativeType ?? '',
      folderLink: sanitized.folderLink ?? '',
      launchDate: sanitized.launchDate ?? '',
      status: sanitized.status ?? 'testing',
      result: sanitized.result ?? 'inconclusive',
      notes: sanitized.notes ?? '',
      createdBy: session.email ?? '',
      createdAt: now,
      updatedAt: now,
    };

    const firestore = db();
    if (!firestore) {
      inMemory.unshift(entry);
      return NextResponse.json({ success: true, creative: entry });
    }
    await firestore.collection(COLLECTIONS.CREATIVES_INTL).doc(entry.id).set(entry);
    return NextResponse.json({ success: true, creative: entry });
  } catch (error) {
    console.error('Error creating creative:', error);
    return NextResponse.json({ error: 'Failed to create creative.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'Creative id is required.' }, { status: 400 });

    const sanitized = sanitize(body, { updatedAt: new Date().toISOString() });
    sanitized.updatedAt = new Date().toISOString();

    const firestore = db();
    if (!firestore) {
      const idx = inMemory.findIndex((c) => c.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Creative not found.' }, { status: 404 });
      inMemory[idx] = { ...inMemory[idx], ...sanitized };
      return NextResponse.json({ success: true, creative: inMemory[idx] });
    }
    const ref = firestore.collection(COLLECTIONS.CREATIVES_INTL).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Creative not found.' }, { status: 404 });
    await ref.update(sanitized);
    const updated = { ...doc.data(), ...sanitized } as Creative;
    return NextResponse.json({ success: true, creative: updated });
  } catch (error) {
    console.error('Error updating creative:', error);
    return NextResponse.json({ error: 'Failed to update creative.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'Creative id is required.' }, { status: 400 });

    const firestore = db();
    if (!firestore) {
      const idx = inMemory.findIndex((c) => c.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Creative not found.' }, { status: 404 });
      inMemory.splice(idx, 1);
      return NextResponse.json({ success: true });
    }
    const ref = firestore.collection(COLLECTIONS.CREATIVES_INTL).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Creative not found.' }, { status: 404 });
    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting creative:', error);
    return NextResponse.json({ error: 'Failed to delete creative.' }, { status: 500 });
  }
}
