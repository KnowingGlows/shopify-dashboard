import type { ShopifyStore } from '@/types/shopify';

type StoreCredentialInput = {
  handle: string;
  clientId: string;
  clientSecret: string;
};

type StoreCredentialRecord = {
  handle: string;
  domain: string;
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  tokenFetchedAt?: number;
  tokenExpiresAt?: number;
};

const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
const storeRegistry = new Map<string, StoreCredentialRecord>();

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
  return store.accessToken;
};

export const registerStore = async (input: StoreCredentialInput) => {
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
    clientId: input.clientId,
    clientSecret: input.clientSecret,
  };

  storeRegistry.set(handle, record);
  await fetchAccessToken(record);
  return record;
};

export const getRegisteredStores = () =>
  Array.from(storeRegistry.values()).map((store) => ({
    handle: store.handle,
    domain: store.domain,
    lastTokenRefresh: store.tokenFetchedAt
      ? new Date(store.tokenFetchedAt).toISOString()
      : null,
    tokenExpiresAt: store.tokenExpiresAt
      ? new Date(store.tokenExpiresAt).toISOString()
      : null,
  }));

export const getRegisteredStoresWithTokens = async (): Promise<ShopifyStore[]> => {
  const stores = Array.from(storeRegistry.values());

  const shopifyStores = await Promise.all(
    stores.map(async (store) => {
      if (tokenExpired(store)) {
        await fetchAccessToken(store);
      }
      if (!store.accessToken) {
        throw new Error(`Missing access token for ${store.handle}.`);
      }
      return {
        name: store.handle,
        domain: store.domain,
        accessToken: store.accessToken,
      };
    })
  );

  return shopifyStores;
};
