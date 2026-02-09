import type { ShopifyStore } from '@/types/shopify';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from './firebase';

type StoreCredentialInput = {
  handle: string;
  displayName?: string;
  clientId: string;
  clientSecret: string;
};

type StoreCredentialRecord = {
  handle: string;
  domain: string;
  displayName?: string;
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  tokenFetchedAt?: number;
  tokenExpiresAt?: number;
};

// Token TTL: 24 hours (refresh slightly before to be safe)
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// In-memory cache for performance
const storeRegistry = new Map<string, StoreCredentialRecord>();
let isInitialized = false;

const normalizeHandle = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
  const host = withoutProtocol.split('/')[0];
  const handle = host.replace(/\.myshopify\.com$/i, '');
  return handle.toLowerCase();
};

const buildDomain = (handle: string) => `${handle}.myshopify.com`;

const tokenExpired = (store: StoreCredentialRecord) =>
  !store.tokenExpiresAt || Date.now() >= store.tokenExpiresAt;

const fetchAccessToken = async (store: StoreCredentialRecord) => {
  const url = `https://${store.domain}/admin/oauth/access_token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: store.clientId,
    client_secret: store.clientSecret,
  });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error_description ||
      payload?.error ||
      `Token request failed (${response.status})`;
    throw new Error(message);
  }
  if (!payload?.access_token) {
    throw new Error('Missing access_token in response.');
  }

  store.accessToken = payload.access_token;
  store.tokenFetchedAt = Date.now();
  store.tokenExpiresAt = store.tokenFetchedAt + TOKEN_TTL_MS;

  // Persist the updated token to Firestore (if available)
  await persistStoreToFirestore(store);

  return store.accessToken;
};

// Persist a store record to Firestore (only if Firebase is available)
const persistStoreToFirestore = async (store: StoreCredentialRecord) => {
  if (!isFirebaseAvailable()) {
    return;
  }

  try {
    const db = getFirestore();
    if (!db) return;

    await db.collection(COLLECTIONS.STORES).doc(store.handle).set({
      handle: store.handle,
      domain: store.domain,
      displayName: store.displayName || null,
      clientId: store.clientId,
      clientSecret: store.clientSecret,
      accessToken: store.accessToken || null,
      tokenFetchedAt: store.tokenFetchedAt || null,
      tokenExpiresAt: store.tokenExpiresAt || null,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error(`Failed to persist store ${store.handle} to Firestore:`, error);
    // Don't throw - allow in-memory operation to continue
  }
};

// Delete a store from Firestore
const deleteStoreFromFirestore = async (handle: string) => {
  if (!isFirebaseAvailable()) {
    return;
  }

  try {
    const db = getFirestore();
    if (!db) return;

    await db.collection(COLLECTIONS.STORES).doc(handle).delete();
  } catch (error) {
    console.error(`Failed to delete store ${handle} from Firestore:`, error);
  }
};

// Load all stores from Firestore into memory
const loadStoresFromFirestore = async () => {
  if (isInitialized) {
    return;
  }

  if (!isFirebaseAvailable()) {
    console.log('Firebase not available - using in-memory storage only');
    isInitialized = true;
    return;
  }

  try {
    const db = getFirestore();
    if (!db) {
      isInitialized = true;
      return;
    }

    const snapshot = await db.collection(COLLECTIONS.STORES).get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      const record: StoreCredentialRecord = {
        handle: data.handle,
        domain: data.domain,
        displayName: data.displayName || undefined,
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        accessToken: data.accessToken || undefined,
        tokenFetchedAt: data.tokenFetchedAt || undefined,
        tokenExpiresAt: data.tokenExpiresAt || undefined,
      };
      storeRegistry.set(record.handle, record);
    });

    isInitialized = true;
    console.log(`Loaded ${snapshot.size} stores from Firestore`);
  } catch (error) {
    console.error('Failed to load stores from Firestore:', error);
    isInitialized = true; // Mark as initialized to prevent infinite retries
  }
};

// Ensure stores are loaded before any operation
const ensureInitialized = async () => {
  if (!isInitialized) {
    await loadStoresFromFirestore();
  }
};

export const registerStore = async (input: StoreCredentialInput) => {
  await ensureInitialized();

  const handle = normalizeHandle(input.handle);
  if (!handle) {
    throw new Error('Store handle is required.');
  }
  if (!input.clientId || !input.clientSecret) {
    throw new Error('Client ID and client secret are required.');
  }

  const domain = buildDomain(handle);
  const record: StoreCredentialRecord = {
    handle,
    domain,
    displayName: input.displayName?.trim() || undefined,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
  };

  storeRegistry.set(handle, record);
  await fetchAccessToken(record);
  return record;
};

export const unregisterStore = async (handleInput: string) => {
  await ensureInitialized();

  const handle = normalizeHandle(handleInput);
  if (!storeRegistry.has(handle)) {
    throw new Error('Store not found.');
  }

  storeRegistry.delete(handle);
  await deleteStoreFromFirestore(handle);
};

export const getRegisteredStores = async () => {
  await ensureInitialized();

  return Array.from(storeRegistry.values()).map((store) => ({
    handle: store.handle,
    domain: store.domain,
    displayName: store.displayName ?? null,
    lastTokenRefresh: store.tokenFetchedAt
      ? new Date(store.tokenFetchedAt).toISOString()
      : null,
    tokenExpiresAt: store.tokenExpiresAt
      ? new Date(store.tokenExpiresAt).toISOString()
      : null,
  }));
};

export const updateStoreDisplayName = async (handleInput: string, displayName: string) => {
  await ensureInitialized();

  const handle = normalizeHandle(handleInput);
  const record = storeRegistry.get(handle);
  if (!record) {
    throw new Error('Store not found.');
  }
  record.displayName = displayName.trim() || undefined;
  storeRegistry.set(handle, record);
  await persistStoreToFirestore(record);
  return record;
};

export const getRegisteredStoresWithTokens = async (): Promise<ShopifyStore[]> => {
  await ensureInitialized();

  const stores = Array.from(storeRegistry.values());

  const shopifyStores = await Promise.all(
    stores.map(async (store) => {
      // Check if token is expired and refresh if needed
      if (tokenExpired(store)) {
        console.log(`Token expired for ${store.handle}, refreshing...`);
        await fetchAccessToken(store);
      }
      if (!store.accessToken) {
        throw new Error(`Missing access token for ${store.handle}.`);
      }
      return {
        name: store.displayName || store.handle,
        domain: store.domain,
        accessToken: store.accessToken,
      };
    })
  );

  return shopifyStores;
};

// Manually refresh token for a specific store
export const refreshStoreToken = async (handleInput: string) => {
  await ensureInitialized();

  const handle = normalizeHandle(handleInput);
  const record = storeRegistry.get(handle);
  if (!record) {
    throw new Error('Store not found.');
  }

  await fetchAccessToken(record);
  return {
    handle: record.handle,
    tokenFetchedAt: new Date(record.tokenFetchedAt!).toISOString(),
    tokenExpiresAt: new Date(record.tokenExpiresAt!).toISOString(),
  };
};
