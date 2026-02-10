import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';

export type PnlEntry = {
  brand: string;
  date: string; // YYYY-MM-DD
  profit: number;
  cashflow: number;
  adspend: number;
};

// GET /api/pnl?date=YYYY-MM-DD
// Returns all brand entries for the given date (defaults to today)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getTodayIST();

    if (!isFirebaseAvailable()) {
      return NextResponse.json({ entries: [], date });
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json({ entries: [], date });
    }

    const snapshot = await db
      .collection(COLLECTIONS.PNL_ENTRIES)
      .where('date', '==', date)
      .get();

    const entries: PnlEntry[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      entries.push({
        brand: data.brand,
        date: data.date,
        profit: data.profit ?? 0,
        cashflow: data.cashflow ?? 0,
        adspend: data.adspend ?? 0,
      });
    });

    return NextResponse.json({ entries, date });
  } catch (error) {
    console.error('Error fetching P&L entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch P&L entries.' },
      { status: 500 }
    );
  }
}

// POST /api/pnl
// Body: { brand, date, profit, cashflow, adspend }
// Upserts a P&L entry for the given brand and date
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const brand = (body.brand ?? '').trim();
    const date = (body.date ?? getTodayIST()).trim();
    const profit = Number(body.profit) || 0;
    const cashflow = Number(body.cashflow) || 0;
    const adspend = Number(body.adspend) || 0;

    if (!brand) {
      return NextResponse.json({ error: 'Brand name is required.' }, { status: 400 });
    }

    if (!isFirebaseAvailable()) {
      return NextResponse.json(
        { error: 'Firebase is not configured. Cannot save P&L data.' },
        { status: 500 }
      );
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json(
        { error: 'Firebase is not available.' },
        { status: 500 }
      );
    }

    const docId = `${brand.toLowerCase()}_${date}`;
    const entry: PnlEntry = { brand, date, profit, cashflow, adspend };

    await db.collection(COLLECTIONS.PNL_ENTRIES).doc(docId).set({
      ...entry,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('Error saving P&L entry:', error);
    return NextResponse.json(
      { error: 'Failed to save P&L entry.' },
      { status: 500 }
    );
  }
}

function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
