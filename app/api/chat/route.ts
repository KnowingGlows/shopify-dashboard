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
    query = query.limitToLast(60) as typeof query;
  }

  const snap = await query.get();
  const messages = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return NextResponse.json({ messages });
}

// POST /api/chat
// Actions:
//   { message: string }  — send a message
//   { action: 'mark-read', messageIds: string[] }  — mark messages as read
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const firestore = getFirestore();
  if (!firestore) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

  const body = await req.json();

  // ── Mark read ──────────────────────────────────────────────────────────────
  if (body.action === 'mark-read') {
    const ids: string[] = body.messageIds ?? [];
    if (ids.length > 0) {
      const batch = firestore.batch();
      for (const id of ids.slice(0, 500)) {
        const ref = firestore.collection(COLLECTIONS.CHAT_MESSAGES).doc(id);
        batch.update(ref, {
          readBy: (await ref.get()).data()?.readBy
            ? [...new Set([...((await ref.get()).data()?.readBy ?? []), user.email])]
            : [user.email],
        });
      }
      // Use arrayUnion instead for efficiency
      const batch2 = firestore.batch();
      const admin = await import('firebase-admin');
      for (const id of ids.slice(0, 500)) {
        batch2.update(
          firestore.collection(COLLECTIONS.CHAT_MESSAGES).doc(id),
          { readBy: admin.default.firestore.FieldValue.arrayUnion(user.email) }
        );
      }
      await batch2.commit().catch(() => {});
    }
    return NextResponse.json({ success: true });
  }

  // ── Send message ───────────────────────────────────────────────────────────
  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: 'Empty message' }, { status: 400 });

  const now = Date.now();
  const ref = firestore.collection(COLLECTIONS.CHAT_MESSAGES).doc();
  const doc: Record<string, unknown> = {
    id: ref.id,
    senderEmail: user.email,
    message,
    timestamp: now,
    readBy: [user.email],
  };
  if (body.attachments && Array.isArray(body.attachments) && body.attachments.length > 0) {
    doc.attachments = body.attachments;
  }
  await ref.set(doc);

  // ── Fire pings for @mentions ───────────────────────────────────────────────
  const mentions = [...message.matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase());
  if (mentions.length > 0) {
    try {
      // Resolve handles to emails
      const usersSnap = await firestore
        .collection(COLLECTIONS.USERS)
        .where('status', '==', 'active')
        .get();

      const pinged = new Set<string>();
      for (const userDoc of usersSnap.docs) {
        const data = userDoc.data();
        const handle = (data.email as string).split('@')[0].toLowerCase();
        if (mentions.includes(handle) && data.email !== user.email && !pinged.has(data.email)) {
          pinged.add(data.email);
          const notifRef = firestore.collection(COLLECTIONS.NOTIFICATIONS).doc();
          await notifRef.set({
            id: notifRef.id,
            type: 'ping',
            subtype: 'mention',
            targetEmail: data.email,
            senderEmail: user.email,
            message: `💬 Mentioned you in chat: "${message.slice(0, 80)}${message.length > 80 ? '…' : ''}"`,
            status: 'unread',
            createdAt: now,
          });
        }
      }
    } catch { /* non-critical */ }
  }

  return NextResponse.json({ message: doc });
}
