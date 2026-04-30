import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import type { DailyDispatchEntry } from '@/types/shopify';

const db = () => (isFirebaseAvailable() ? getFirestore() : null);

const inMemoryStore: DailyDispatchEntry[] = [];

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

function getISTDate(date?: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date ?? new Date());
}

// GET /api/dispatch?month=YYYY-MM (optional)
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYY-MM

    const firestore = db();
    if (!firestore) {
      const filtered = month
        ? inMemoryStore.filter((e) => e.date.startsWith(month))
        : inMemoryStore;
      return NextResponse.json({ entries: filtered.sort((a, b) => b.date.localeCompare(a.date)) });
    }

    const snap = await firestore.collection(COLLECTIONS.DAILY_DISPATCHES).get();
    const entries: DailyDispatchEntry[] = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: data.id ?? doc.id,
          date: data.date ?? '',
          orders: Number(data.orders) || 0,
          notes: data.notes ?? '',
          recordedBy: data.recordedBy ?? '',
          createdAt: data.createdAt ?? '',
          updatedAt: data.updatedAt ?? '',
        };
      })
      .filter((e) => (month ? e.date.startsWith(month) : true))
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching dispatch entries:', error);
    return NextResponse.json({ error: 'Failed to fetch dispatch entries.' }, { status: 500 });
  }
}

// POST /api/dispatch — create a new entry
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const date = (body.date as string) || getISTDate();
    const orders = Number(body.orders) || 0;
    const notes = (body.notes as string) ?? '';

    if (orders < 0) {
      return NextResponse.json({ error: 'Orders cannot be negative.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format (YYYY-MM-DD).' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const entry: DailyDispatchEntry = {
      id: crypto.randomUUID(),
      date,
      orders,
      notes,
      recordedBy: session.email ?? '',
      createdAt: now,
      updatedAt: now,
    };

    const firestore = db();
    if (!firestore) {
      inMemoryStore.unshift(entry);
      return NextResponse.json({ success: true, entry });
    }

    await firestore.collection(COLLECTIONS.DAILY_DISPATCHES).doc(entry.id).set(entry);
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('Error creating dispatch entry:', error);
    return NextResponse.json({ error: 'Failed to create dispatch entry.' }, { status: 500 });
  }
}

// PATCH /api/dispatch — update an entry by id
export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const { id, ...updates } = body as { id?: string } & Partial<DailyDispatchEntry>;
    if (!id) return NextResponse.json({ error: 'Entry id is required.' }, { status: 400 });

    const sanitized: Partial<DailyDispatchEntry> = { updatedAt: new Date().toISOString() };
    if ('date' in updates && updates.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(updates.date)) {
        return NextResponse.json({ error: 'Invalid date format.' }, { status: 400 });
      }
      sanitized.date = updates.date;
    }
    if ('orders' in updates) sanitized.orders = Number(updates.orders) || 0;
    if ('notes' in updates) sanitized.notes = updates.notes ?? '';

    const firestore = db();
    if (!firestore) {
      const idx = inMemoryStore.findIndex((e) => e.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
      inMemoryStore[idx] = { ...inMemoryStore[idx], ...sanitized };
      return NextResponse.json({ success: true, entry: inMemoryStore[idx] });
    }

    const docRef = firestore.collection(COLLECTIONS.DAILY_DISPATCHES).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });

    await docRef.update(sanitized);
    const updated = { ...doc.data(), ...sanitized } as DailyDispatchEntry;
    return NextResponse.json({ success: true, entry: updated });
  } catch (error) {
    console.error('Error updating dispatch entry:', error);
    return NextResponse.json({ error: 'Failed to update dispatch entry.' }, { status: 500 });
  }
}

// DELETE /api/dispatch — delete an entry by id
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const { id } = body as { id?: string };
    if (!id) return NextResponse.json({ error: 'Entry id is required.' }, { status: 400 });

    const firestore = db();
    if (!firestore) {
      const idx = inMemoryStore.findIndex((e) => e.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
      inMemoryStore.splice(idx, 1);
      return NextResponse.json({ success: true });
    }

    const docRef = firestore.collection(COLLECTIONS.DAILY_DISPATCHES).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });

    await docRef.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting dispatch entry:', error);
    return NextResponse.json({ error: 'Failed to delete dispatch entry.' }, { status: 500 });
  }
}
