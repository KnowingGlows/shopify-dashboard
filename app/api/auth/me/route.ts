import { NextResponse } from 'next/server';
import { verifySessionToken, getUserById, COOKIE_NAME, DEFAULT_PERMISSIONS } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated.' },
        { status: 401 }
      );
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid session.' },
        { status: 401 }
      );
    }

    // Fetch live permissions from Firestore
    const dbUser = await getUserById(payload.sub);
    const permissions = dbUser?.permissions ?? DEFAULT_PERMISSIONS;

    return NextResponse.json({
      user: {
        email: payload.email,
        role: payload.role,
        permissions,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Session check failed.' },
      { status: 500 }
    );
  }
}
