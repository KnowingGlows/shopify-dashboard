import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { getFirestore, COLLECTIONS } from '@/lib/firebase';
import { cookies } from 'next/headers';

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('orbit-session')?.value;
  if (!token) return null;
  try {
    const payload = await verifySessionToken(token);
    return payload as { email: string; role: string; name?: string };
  } catch {
    return null;
  }
}

// GET /api/chat?since=<timestamp>  — fetch messages
// Returns last 60 messages (or messages newer than `since`)
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const firestore = getFirestore();
  if (!firestore) return NextResponse.json({ messages: [] });

  const since = req.nextUrl.searchParams.get('since');
  const sinceTs = since ? parseInt(since, 10) : 0;

  let query = firestore
    .collection(COLLECTIONS.CHAT_MESSAGES)
    .orderBy('timestamp', 'asc');

  if (sinceTs > 0) {
    query = query.where('timestamp', '>', sinceTs) as typeof query;
  } else {
    // Initial load: last 60 messages
    query = query.limitToLast(60) as typeof query;
  }

  const snap = await query.get();
  const messages = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return NextResponse.json({ messages });
}

// POST /api/chat  — send a message { message: string }
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const firestore = getFirestore();
  if (!firestore) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

  const body = await req.json();
  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: 'Empty message' }, { status: 400 });

  const now = Date.now();
  const ref = firestore.collection(COLLECTIONS.CHAT_MESSAGES).doc();
  const doc = {
    id: ref.id,
    senderEmail: user.email,
    message,
    timestamp: now,
  };
  await ref.set(doc);

  return NextResponse.json({ message: doc });
}
