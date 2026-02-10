import { NextResponse } from 'next/server';
import {
  getUserByEmail,
  verifyPassword,
  createSessionToken,
  ensureAdminSeeded,
  COOKIE_NAME,
  SESSION_MAX_AGE,
} from '@/lib/auth';

export async function POST(request: Request) {
  try {
    // Auto-seed admin from env vars on first run
    await ensureAdminSeeded();

    const body = await request.json();
    const email = (body.email ?? '').trim();
    const password = body.password ?? '';

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials.' },
        { status: 401 }
      );
    }

    if (user.status === 'pending') {
      return NextResponse.json(
        { error: 'Your account is pending approval.' },
        { status: 403 }
      );
    }

    if (user.status === 'rejected') {
      return NextResponse.json(
        { error: 'Your access request was denied.' },
        { status: 403 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash, user.salt);
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid credentials.' },
        { status: 401 }
      );
    }

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      user: { email: user.email, role: user.role },
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed.' },
      { status: 500 }
    );
  }
}
