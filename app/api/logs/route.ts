import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';

function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// GET /api/logs?date=YYYY-MM-DD
// Admin: returns all logs for the date
// User: returns only their own log
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getTodayIST();

    if (!isFirebaseAvailable()) {
      return NextResponse.json({ logs: [], date });
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json({ logs: [], date });
    }

    let snapshot;
    if (session.role === 'admin') {
      snapshot = await db
        .collection(COLLECTIONS.DAILY_LOGS)
        .where('date', '==', date)
        .get();
    } else {
      snapshot = await db
        .collection(COLLECTIONS.DAILY_LOGS)
        .where('date', '==', date)
        .where('userId', '==', session.sub)
        .get();
    }

    const logs = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        userId: data.userId,
        userEmail: data.userEmail,
        date: data.date,
        content: data.content ?? '',
        createdAt: data.createdAt ?? 0,
        updatedAt: data.updatedAt ?? 0,
      };
    });

    return NextResponse.json({ logs, date });
  } catch (error) {
    console.error('Error fetching daily logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch daily logs.' },
      { status: 500 }
    );
  }
}

// POST /api/logs
// Body: { date, content }
// Upserts a daily log for the current user
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await request.json();
    const date = (body.date ?? getTodayIST()).trim();
    const content = body.content ?? '';

    if (!isFirebaseAvailable()) {
      return NextResponse.json(
        { error: 'Firebase is not configured.' },
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

    const docId = `${session.sub}_${date}`;
    const now = Date.now();

    const existingDoc = await db
      .collection(COLLECTIONS.DAILY_LOGS)
      .doc(docId)
      .get();
    const createdAt = existingDoc.exists
      ? existingDoc.data()!.createdAt
      : now;

    await db.collection(COLLECTIONS.DAILY_LOGS).doc(docId).set({
      userId: session.sub,
      userEmail: session.email,
      date,
      content,
      createdAt,
      updatedAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving daily log:', error);
    return NextResponse.json(
      { error: 'Failed to save daily log.' },
      { status: 500 }
    );
  }
}
