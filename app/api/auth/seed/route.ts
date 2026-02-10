import { NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const seedSecret = body.seedSecret ?? '';
    const email = (body.email ?? '').toLowerCase().trim();
    const password = body.password ?? '';

    // Gate behind a secret to prevent unauthorized seeding
    const expectedSecret = process.env.SEED_SECRET;
    if (!expectedSecret || seedSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Invalid seed secret.' },
        { status: 403 }
      );
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    if (!isFirebaseAvailable()) {
      return NextResponse.json(
        { error: 'Firebase is not configured.' },
        { status: 500 }
      );
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json(
        { error: 'Firestore not available.' },
        { status: 500 }
      );
    }

    // Check if user already exists
    const existing = await db
      .collection(COLLECTIONS.USERS)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json(
        { error: 'User already exists.' },
        { status: 409 }
      );
    }

    const { hash, salt } = await hashPassword(password);

    await db.collection(COLLECTIONS.USERS).add({
      email,
      passwordHash: hash,
      salt,
      createdAt: Date.now(),
    });

    return NextResponse.json({ success: true, email });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed user.' },
      { status: 500 }
    );
  }
}
