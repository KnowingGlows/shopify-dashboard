import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { getFirestore, COLLECTIONS } from '@/lib/firebase';
import { cookies } from 'next/headers';

function db() {
  return getFirestore();
}

async function getUser(_req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('orbit-session')?.value;
  if (!token) return null;
  try {
    const payload = await verifySessionToken(token);
    return payload as { email: string; role: string; userId?: string };
  } catch {
    return null;
  }
}

// GET: Fetch notifications for current user
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const firestore = db();
  if (!firestore) return NextResponse.json({ notifications: [] });

  const params = req.nextUrl.searchParams;
  const action = params.get('action') ?? 'list';

  if (action === 'list') {
    try {
      // Simple query without orderBy to avoid needing composite index
      const snap = await firestore
        .collection(COLLECTIONS.NOTIFICATIONS)
        .where('targetEmail', '==', user.email)
        .get();

      const notifications = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as { id: string; status: string; createdAt: number; [key: string]: unknown }))
        .filter((n) => n.status !== 'dismissed')
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 50);

      return NextResponse.json({ notifications });
    } catch (err) {
      console.error('Notifications list error:', err);
      return NextResponse.json({ notifications: [] });
    }
  }

  if (action === 'users') {
    // Return list of all active users for the ping selector
    try {
      const snap = await firestore
        .collection(COLLECTIONS.USERS)
        .where('status', '==', 'active')
        .get();
      const users = snap.docs.map((d) => ({
        id: d.id,
        email: d.data().email as string,
        role: d.data().role as string,
      }));
      return NextResponse.json({ users });
    } catch {
      return NextResponse.json({ users: [] });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// POST: Send ping, dismiss, mark-read
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const firestore = db();
  if (!firestore) return NextResponse.json({ success: false, error: 'No database' }, { status: 500 });

  const body = await req.json();
  const action = body.action as string;

  // Send a ping to a user
  if (action === 'send-ping') {
    const { targetEmail, message } = body as { targetEmail: string; message: string };
    if (!targetEmail || !message) {
      return NextResponse.json({ error: 'Missing targetEmail or message' }, { status: 400 });
    }

    await firestore.collection(COLLECTIONS.NOTIFICATIONS).add({
      type: 'ping',
      targetEmail,
      senderEmail: user.email,
      message,
      status: 'unread', // unread → read → dismissed
      createdAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  }

  // Send a system notification (adspend reminder, etc.)
  if (action === 'send-system') {
    const { targetEmail, message, subtype } = body as { targetEmail: string; message: string; subtype?: string };
    if (!targetEmail || !message) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    await firestore.collection(COLLECTIONS.NOTIFICATIONS).add({
      type: 'system',
      subtype: subtype ?? 'reminder',
      targetEmail,
      senderEmail: 'system',
      message,
      status: 'unread',
      createdAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  }

  // Dismiss a notification
  if (action === 'dismiss') {
    const { notificationId } = body as { notificationId: string };
    if (!notificationId) return NextResponse.json({ error: 'Missing notificationId' }, { status: 400 });

    await firestore.collection(COLLECTIONS.NOTIFICATIONS).doc(notificationId).update({
      status: 'dismissed',
      dismissedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  }

  // Mark as read (stops sound but keeps in list)
  if (action === 'mark-read') {
    const { notificationId } = body as { notificationId: string };
    if (!notificationId) return NextResponse.json({ error: 'Missing notificationId' }, { status: 400 });

    await firestore.collection(COLLECTIONS.NOTIFICATIONS).doc(notificationId).update({
      status: 'read',
      readAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  }

  // Dismiss all
  if (action === 'dismiss-all') {
    const snap = await firestore
      .collection(COLLECTIONS.NOTIFICATIONS)
      .where('targetEmail', '==', user.email)
      .get();

    const batch = firestore.batch();
    snap.docs.forEach((d) => {
      const status = d.data().status;
      if (status === 'unread' || status === 'read') {
        batch.update(d.ref, { status: 'dismissed', dismissedAt: Date.now() });
      }
    });
    await batch.commit();

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
