import { NextResponse } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase';

export async function GET(request: Request) {
  try {
    const db = getFirestore();
    if (!db) return NextResponse.json({ error: 'Database not available' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

    const doc = await db.collection(COLLECTIONS.SETTINGS).doc(key).get();
    if (!doc.exists) return NextResponse.json({});

    return NextResponse.json(doc.data());
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getFirestore();
    if (!db) return NextResponse.json({ error: 'Database not available' }, { status: 500 });

    const body = await request.json();
    const { key, ...data } = body;
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

    await db.collection(COLLECTIONS.SETTINGS).doc(key).set({
      ...data,
      updatedAt: Date.now(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Settings POST error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
