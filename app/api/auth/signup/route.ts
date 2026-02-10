import { NextResponse } from 'next/server';
import { createUser } from '@/lib/auth';
import { isFirebaseAvailable } from '@/lib/firebase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = (body.email ?? '').trim();
    const password = body.password ?? '';

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    if (!isFirebaseAvailable()) {
      return NextResponse.json(
        { error: 'Service unavailable.' },
        { status: 500 }
      );
    }

    const result = await createUser(email, password, 'user', 'pending');
    if (!result) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Your access request has been submitted. You will be able to log in once an admin approves your account.',
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Signup failed.' },
      { status: 500 }
    );
  }
}
