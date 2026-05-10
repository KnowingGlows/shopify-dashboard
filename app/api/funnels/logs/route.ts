import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import type { FunnelDailyLog } from '@/types/funnel';

const db = () => (isFirebaseAvailable() ? getFirestore() : null);
const inMemory: FunnelDailyLog[] = [];

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

function sanitize(input: Record<string, unknown>, base?: Partial<FunnelDailyLog>): Partial<FunnelDailyLog> {
  const out: Partial<FunnelDailyLog> = { ...base };
  if ('date' in input) {
    const d = String(input.date ?? '').trim();
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Invalid date format (YYYY-MM-DD).');
    out.date = d;
  }
  if ('roas' in input) out.roas = Math.max(0, Number(input.roas) || 0);
  if ('orders' in input) out.orders = Math.max(0, Number(input.orders) || 0);
  if ('notes' in input) out.notes = String(input.notes ?? '').trim();
  return out;
}

// GET /api/funnels/logs?funnelId=
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const funnelId = searchParams.get('funnelId') ?? '';

    const firestore = db();
    let logs: FunnelDailyLog[];
    if (!firestore) {
      logs = funnelId ? inMemory.filter((l) => l.funnelId === funnelId) : [...inMemory];
    } else {
      const query = funnelId
        ? firestore.collection(COLLECTIONS.FUNNEL_DAILY_LOGS).where('funnelId', '==', funnelId)
        : firestore.collection(COLLECTIONS.FUNNEL_DAILY_LOGS);
      const snap = await query.get();
      logs = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: data.id ?? doc.id,
          funnelId: data.funnelId ?? '',
          date: data.date ?? '',
          roas: Number(data.roas) || 0,
          orders: Number(data.orders) || 0,
          notes: data.notes ?? '',
          createdBy: data.createdBy ?? '',
          createdAt: data.createdAt ?? '',
          updatedAt: data.updatedAt ?? '',
        };
      });
    }

    logs.sort((a, b) => b.date.localeCompare(a.date));
    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Error fetching funnel logs:', error);
    return NextResponse.json({ error: 'Failed to fetch logs.' }, { status: 500 });
  }
}

// POST /api/funnels/logs — create
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const funnelId = String(body.funnelId ?? '');
    if (!funnelId) return NextResponse.json({ error: 'funnelId is required.' }, { status: 400 });

    let sanitized: Partial<FunnelDailyLog>;
    try {
      sanitized = sanitize(body);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid input.' }, { status: 400 });
    }
    if (!sanitized.date) return NextResponse.json({ error: 'Date is required.' }, { status: 400 });

    const now = new Date().toISOString();
    const entry: FunnelDailyLog = {
      id: crypto.randomUUID(),
      funnelId,
      date: sanitized.date,
      roas: sanitized.roas ?? 0,
      orders: sanitized.orders ?? 0,
      notes: sanitized.notes ?? '',
      createdBy: session.email ?? '',
      createdAt: now,
      updatedAt: now,
    };

    const firestore = db();
    if (!firestore) {
      inMemory.unshift(entry);
      return NextResponse.json({ success: true, log: entry });
    }
    await firestore.collection(COLLECTIONS.FUNNEL_DAILY_LOGS).doc(entry.id).set(entry);
    return NextResponse.json({ success: true, log: entry });
  } catch (error) {
    console.error('Error creating funnel log:', error);
    return NextResponse.json({ error: 'Failed to create log.' }, { status: 500 });
  }
}

// PATCH /api/funnels/logs — update
export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'Log id is required.' }, { status: 400 });

    let sanitized: Partial<FunnelDailyLog>;
    try {
      sanitized = sanitize(body, { updatedAt: new Date().toISOString() });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid input.' }, { status: 400 });
    }
    sanitized.updatedAt = new Date().toISOString();

    const firestore = db();
    if (!firestore) {
      const idx = inMemory.findIndex((l) => l.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Log not found.' }, { status: 404 });
      inMemory[idx] = { ...inMemory[idx], ...sanitized };
      return NextResponse.json({ success: true, log: inMemory[idx] });
    }
    const ref = firestore.collection(COLLECTIONS.FUNNEL_DAILY_LOGS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Log not found.' }, { status: 404 });
    await ref.update(sanitized);
    const updated = { ...doc.data(), ...sanitized } as FunnelDailyLog;
    return NextResponse.json({ success: true, log: updated });
  } catch (error) {
    console.error('Error updating funnel log:', error);
    return NextResponse.json({ error: 'Failed to update log.' }, { status: 500 });
  }
}

// DELETE /api/funnels/logs
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'Log id is required.' }, { status: 400 });

    const firestore = db();
    if (!firestore) {
      const idx = inMemory.findIndex((l) => l.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Log not found.' }, { status: 404 });
      inMemory.splice(idx, 1);
      return NextResponse.json({ success: true });
    }
    const ref = firestore.collection(COLLECTIONS.FUNNEL_DAILY_LOGS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Log not found.' }, { status: 404 });
    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting funnel log:', error);
    return NextResponse.json({ error: 'Failed to delete log.' }, { status: 500 });
  }
}
