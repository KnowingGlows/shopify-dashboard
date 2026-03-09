import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  verifySessionToken,
  getAllUsers,
  getUsersByStatus,
  updateUserStatus,
  updateUserPermissions,
  COOKIE_NAME,
  type UserStatus,
} from '@/lib/auth';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';

const ADMIN_ROLES = ['admin', 'ceo'];

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload || !ADMIN_ROLES.includes(payload.role)) return null;
  return payload;
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // If status is specified, filter by it; otherwise return all users
    const users = status
      ? await getUsersByStatus(status as UserStatus)
      : await getAllUsers();

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const userId = body.userId ?? '';

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required.' },
        { status: 400 }
      );
    }

    // Update status if provided
    if (body.status && ['active', 'rejected'].includes(body.status)) {
      const success = await updateUserStatus(userId, body.status as UserStatus);
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to update user status.' },
          { status: 500 }
        );
      }
    }

    // Update role if provided
    if (body.role && ['ceo', 'cmo', 'operations', 'customer_success', 'warehouse', 'user'].includes(body.role)) {
      if (isFirebaseAvailable()) {
        const db = getFirestore();
        if (db) {
          await db.collection(COLLECTIONS.USERS).doc(userId).update({ role: body.role });
        }
      }
    }

    // Update permissions if provided
    if (Array.isArray(body.permissions)) {
      const success = await updateUserPermissions(userId, body.permissions);
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to update permissions.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('User update error:', error);
    return NextResponse.json(
      { error: 'Failed to update user.' },
      { status: 500 }
    );
  }
}
