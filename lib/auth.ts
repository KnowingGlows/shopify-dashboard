import { SignJWT, jwtVerify } from 'jose';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from './firebase';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'orbit-dev-secret-change-in-production'
);
export const COOKIE_NAME = 'orbit-session';
const SESSION_TTL = '7d';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export type UserRole = 'ceo' | 'cmo' | 'operations' | 'customer_success' | 'warehouse' | 'admin' | 'user';
export type UserStatus = 'active' | 'pending' | 'rejected';

export const ROLE_LABELS: Record<UserRole, string> = {
  ceo: 'CEO',
  cmo: 'CMO',
  operations: 'Operations In Chief',
  customer_success: 'Customer Success Manager',
  warehouse: 'Warehouse In Charge',
  admin: 'Admin',
  user: 'User',
};

// Default page access per role
export const ROLE_DEFAULT_PAGES: Record<UserRole, string[]> = {
  ceo: ['/', '/brands', '/finance', '/product-tracker', '/ads-tracker', '/prs', '/inventory', '/tasks', '/logs', '/settings', '/users'],
  cmo: ['/', '/brands', '/finance', '/ads-tracker', '/prs', '/tasks', '/logs', '/settings'],
  operations: ['/', '/brands', '/finance', '/product-tracker', '/inventory', '/tasks', '/logs', '/settings'],
  customer_success: ['/', '/brands', '/tasks', '/logs', '/settings'],
  warehouse: ['/', '/inventory', '/tasks', '/logs', '/settings'],
  admin: ['/', '/brands', '/finance', '/product-tracker', '/ads-tracker', '/prs', '/inventory', '/tasks', '/logs', '/settings', '/users'],
  user: ['/', '/brands', '/tasks', '/settings', '/logs'],
};

// Pages that can be toggled per user
export const CONFIGURABLE_PAGES = [
  { path: '/', label: 'Home' },
  { path: '/brands', label: 'Brands' },
  { path: '/finance', label: 'Finance' },
  { path: '/product-tracker', label: 'Products' },
  { path: '/ads-tracker', label: 'Ads' },
  { path: '/prs', label: 'PRS' },
  { path: '/inventory', label: 'Inventory' },
  { path: '/tasks', label: 'Tasks' },
  { path: '/settings', label: 'Settings' },
  { path: '/logs', label: 'Daily Logs' },
] as const;

export const DEFAULT_PERMISSIONS = CONFIGURABLE_PAGES.map((p) => p.path);

export function getDefaultPermissionsForRole(role: UserRole): string[] {
  return ROLE_DEFAULT_PAGES[role] ?? ROLE_DEFAULT_PAGES.user;
}

// ── Password hashing (Web Crypto, Edge-compatible) ──────────────────────────

export async function hashPassword(
  password: string,
  salt?: string
): Promise<{ hash: string; salt: string }> {
  const s = salt ?? crypto.randomUUID();
  const data = new TextEncoder().encode(s + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return { hash, salt: s };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string
): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  if (hash.length !== storedHash.length) return false;
  let result = 0;
  for (let i = 0; i < hash.length; i++) {
    result |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}

// ── JWT helpers ─────────────────────────────────────────────────────────────

export async function createSessionToken(payload: {
  sub: string;
  email: string;
  role: UserRole;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(JWT_SECRET);
}

export async function verifySessionToken(
  token: string
): Promise<{ sub: string; email: string; role: UserRole } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { sub: string; email: string; role: UserRole };
  } catch {
    return null;
  }
}

// ── Firestore user operations (Node.js only, not for middleware) ─────────────

export async function getUserByEmail(
  email: string
): Promise<{
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: UserRole;
  status: UserStatus;
} | null> {
  if (!isFirebaseAvailable()) return null;

  const db = getFirestore();
  if (!db) return null;

  const snapshot = await db
    .collection(COLLECTIONS.USERS)
    .where('email', '==', email.toLowerCase().trim())
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    email: data.email,
    passwordHash: data.passwordHash,
    salt: data.salt,
    role: data.role ?? 'user',
    status: data.status ?? 'active',
  };
}

export async function createUser(
  email: string,
  password: string,
  role: UserRole = 'user',
  status: UserStatus = 'pending'
): Promise<{ id: string; email: string } | null> {
  if (!isFirebaseAvailable()) return null;

  const db = getFirestore();
  if (!db) return null;

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await db
    .collection(COLLECTIONS.USERS)
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get();

  if (!existing.empty) return null;

  const { hash, salt } = await hashPassword(password);

  const docRef = await db.collection(COLLECTIONS.USERS).add({
    email: normalizedEmail,
    passwordHash: hash,
    salt,
    role,
    status,
    createdAt: Date.now(),
  });

  return { id: docRef.id, email: normalizedEmail };
}

export async function getUsersByStatus(
  status: UserStatus
): Promise<Array<{ id: string; email: string; role: UserRole; status: UserStatus; createdAt: number }>> {
  if (!isFirebaseAvailable()) return [];

  const db = getFirestore();
  if (!db) return [];

  const snapshot = await db
    .collection(COLLECTIONS.USERS)
    .where('status', '==', status)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      email: data.email,
      role: data.role ?? 'user',
      status: data.status ?? 'pending',
      createdAt: data.createdAt ?? 0,
    };
  });
}

export async function updateUserStatus(
  userId: string,
  status: UserStatus
): Promise<boolean> {
  if (!isFirebaseAvailable()) return false;

  const db = getFirestore();
  if (!db) return false;

  await db.collection(COLLECTIONS.USERS).doc(userId).update({ status });
  return true;
}

export async function getUserById(
  userId: string
): Promise<{
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  permissions: string[];
} | null> {
  if (!isFirebaseAvailable()) return null;

  const db = getFirestore();
  if (!db) return null;

  const doc = await db.collection(COLLECTIONS.USERS).doc(userId).get();
  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    id: doc.id,
    email: data.email,
    role: data.role ?? 'user',
    status: data.status ?? 'active',
    permissions: data.permissions ?? DEFAULT_PERMISSIONS,
  };
}

export async function getAllUsers(): Promise<
  Array<{
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    permissions: string[];
    createdAt: number;
  }>
> {
  if (!isFirebaseAvailable()) return [];

  const db = getFirestore();
  if (!db) return [];

  const snapshot = await db
    .collection(COLLECTIONS.USERS)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      email: data.email,
      role: data.role ?? 'user',
      status: data.status ?? 'pending',
      permissions: data.permissions ?? DEFAULT_PERMISSIONS,
      createdAt: data.createdAt ?? 0,
    };
  });
}

export async function updateUserPermissions(
  userId: string,
  permissions: string[]
): Promise<boolean> {
  if (!isFirebaseAvailable()) return false;

  const db = getFirestore();
  if (!db) return false;

  await db.collection(COLLECTIONS.USERS).doc(userId).update({ permissions });
  return true;
}

// ── Auto-seed admin ─────────────────────────────────────────────────────────

const DEFAULT_ADMIN_EMAIL = 'tsovansh@gmail.com';
const DEFAULT_ADMIN_PASSWORD = 'Sovansh@1234';

let adminSeedChecked = false;

export async function ensureAdminSeeded(): Promise<void> {
  if (adminSeedChecked) return;
  adminSeedChecked = true;

  const adminEmail = process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  if (!isFirebaseAvailable()) return;

  const existing = await getUserByEmail(adminEmail);

  if (existing) {
    // Sync password if it was changed
    const passwordMatches = await verifyPassword(
      adminPassword,
      existing.passwordHash,
      existing.salt
    );
    if (!passwordMatches) {
      const db = getFirestore();
      if (db) {
        const { hash, salt } = await hashPassword(adminPassword);
        await db.collection(COLLECTIONS.USERS).doc(existing.id).update({
          passwordHash: hash,
          salt,
        });
        console.log(`Admin password synced: ${adminEmail}`);
      }
    }
    return;
  }

  await createUser(adminEmail, adminPassword, 'admin', 'active');
  console.log(`Admin user seeded: ${adminEmail}`);
}
