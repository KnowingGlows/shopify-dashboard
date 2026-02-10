import { SignJWT, jwtVerify } from 'jose';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from './firebase';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'vaultik-dev-secret-change-in-production'
);
export const COOKIE_NAME = 'vaultik-session';
const SESSION_TTL = '7d';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

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
  // Timing-safe-ish comparison
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
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(JWT_SECRET);
}

export async function verifySessionToken(
  token: string
): Promise<{ sub: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { sub: string; email: string };
  } catch {
    return null;
  }
}

// ── Firestore user lookup (Node.js only, not for middleware) ─────────────────

export async function getUserByEmail(
  email: string
): Promise<{ id: string; email: string; passwordHash: string; salt: string } | null> {
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
  };
}
