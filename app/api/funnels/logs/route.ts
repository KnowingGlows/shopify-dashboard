import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getFirestore, isFirebaseAvailable, COLLECTIONS, resolveDocRef } from '@/lib/firebase';
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
  // Performance
  if ('roas' in input) out.roas = Math.max(0, Number(input.roas) || 0);
  if ('orders' in input) out.orders = Math.max(0, Number(input.orders) || 0);
  // Money (USD)
  if ('spend' in input) out.spend = Math.max(0, Number(input.spend) || 0);
  if ('revenue' in input) out.revenue = Math.max(0, Number(input.revenue) || 0);
  if ('expense' in input) out.expense = Math.max(0, Number(input.expense) || 0);
  if ('profit' in input) out.profit = Number(input.profit) || 0; // allow negative
  // Shared
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
          spend: Number(data.spend) || 0,
          revenue: Number(data.revenue) || 0,
          expense: Number(data.expense) || 0,
          profit: Number(data.profit) || 0,
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

    // Auto-compute ROAS from spend & revenue when both provided and roas isn't.
    if (sanitized.roas == null && sanitized.spend != null && sanitized.revenue != null && sanitized.spend > 0) {
      sanitized.roas = sanitized.revenue / sanitized.spend;
    }

    const now = new Date().toISOString();
    const entry: FunnelDailyLog = {
      id: crypto.randomUUID(),
      funnelId,
      date: sanitized.date,
      roas: sanitized.roas ?? 0,
      orders: sanitized.orders ?? 0,
      spend: sanitized.spend ?? 0,
      revenue: sanitized.revenue ?? 0,
      expense: sanitized.expense ?? 0,
      profit: sanitized.profit ?? 0,
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
    const found = await resolveDocRef(firestore.collection(COLLECTIONS.FUNNEL_DAILY_LOGS), id);
    if (!found) return NextResponse.json({ error: 'Log not found.' }, { status: 404 });
    await found.ref.update(sanitized);
    const updated = { ...found.snap.data(), ...sanitized } as FunnelDailyLog;
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
    const found = await resolveDocRef(firestore.collection(COLLECTIONS.FUNNEL_DAILY_LOGS), id);
    if (!found) return NextResponse.json({ error: 'Log not found.' }, { status: 404 });
    await found.ref.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting funnel log:', error);
    return NextResponse.json({ error: 'Failed to delete log.' }, { status: 500 });
  }
}
