// Live FX rates (USD-base) — fetches from a free public endpoint and caches
// in Firestore for ~24h. India-only: the only pair left is USD↔INR (COGS is
// often sourced in USD).

import { getFirestore, isFirebaseAvailable, COLLECTIONS } from './firebase';

const FX_API = 'https://open.er-api.com/v6/latest/USD';
const FX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FX_DOC_ID = 'usd_base_v1';

// Hard-coded fallback if both the API and cache are unreachable.
// Refresh occasionally if these drift dramatically.
const FALLBACK_RATES: FxRates = {
  base: 'USD',
  rates: { USD: 1, INR: 83.5 },
  fetchedAt: 0,
  source: 'fallback',
};

export type FxRates = {
  base: 'USD';
  rates: { USD: number; INR: number };
  fetchedAt: number;        // epoch ms
  source: 'live' | 'cache' | 'fallback';
};

let memCache: FxRates | null = null;

async function readFirestoreCache(): Promise<FxRates | null> {
  if (!isFirebaseAvailable()) return null;
  const db = getFirestore();
  if (!db) return null;
  try {
    const doc = await db.collection(COLLECTIONS.FX_RATES).doc(FX_DOC_ID).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (!data) return null;
    return {
      base: 'USD',
      rates: {
        USD: 1,
        INR: Number(data.rates?.INR) || FALLBACK_RATES.rates.INR,
      },
      fetchedAt: Number(data.fetchedAt) || 0,
      source: 'cache',
    };
  } catch {
    return null;
  }
}

async function writeFirestoreCache(rates: FxRates): Promise<void> {
  if (!isFirebaseAvailable()) return;
  const db = getFirestore();
  if (!db) return;
  try {
    await db.collection(COLLECTIONS.FX_RATES).doc(FX_DOC_ID).set({
      base: rates.base,
      rates: rates.rates,
      fetchedAt: rates.fetchedAt,
    });
  } catch {
    // best-effort — never fail the caller
  }
}

async function fetchLive(): Promise<FxRates> {
  const res = await fetch(FX_API);
  if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
  const data = await res.json();
  if (data?.result !== 'success') throw new Error('FX API result not success');
  return {
    base: 'USD',
    rates: {
      USD: 1,
      INR: Number(data.rates?.INR) || FALLBACK_RATES.rates.INR,
    },
    fetchedAt: Date.now(),
    source: 'live',
  };
}

/**
 * Returns FX rates with USD as base. Fresh cache → memory → Firestore →
 * live API → stale Firestore → hard-coded fallback.
 */
export async function getRates(opts?: { force?: boolean }): Promise<FxRates> {
  const force = opts?.force === true;

  if (!force && memCache && Date.now() - memCache.fetchedAt < FX_CACHE_TTL_MS) {
    return memCache;
  }
  if (!force) {
    const cached = await readFirestoreCache();
    if (cached && Date.now() - cached.fetchedAt < FX_CACHE_TTL_MS) {
      memCache = cached;
      return cached;
    }
  }
  try {
    const fresh = await fetchLive();
    memCache = fresh;
    await writeFirestoreCache(fresh);
    return fresh;
  } catch {
    if (memCache) return memCache;
    const stale = await readFirestoreCache();
    return stale ?? FALLBACK_RATES;
  }
}
