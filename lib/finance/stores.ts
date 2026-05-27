// Self-contained store registry for the Finance module.
//
// Deliberately independent of Orbit's Firebase/OAuth store-registry (which is
// being reworked). This reads direct Shopify Admin API tokens (shpat_) from env,
// mirroring the Cloudflare worker backend — the validated source of truth.

export interface FinanceStore {
  slug: string;
  name: string;
  accent: string;       // tailwind-ish hex for charts/accents
  domain: string;       // xxx.myshopify.com
  token: string;        // shpat_...
}

type StoreDef = { slug: string; name: string; accent: string; storeEnv: string; tokenEnv: string };

const DEFS: StoreDef[] = [
  { slug: 'vyonik',  name: 'Vyonik',  accent: '#38bdf8', storeEnv: 'FIN_VYONIK_STORE',  tokenEnv: 'FIN_VYONIK_TOKEN'  },
  { slug: 'kairova', name: 'Kairova', accent: '#fbbf24', storeEnv: 'FIN_KAIROVA_STORE', tokenEnv: 'FIN_KAIROVA_TOKEN' },
  { slug: 'kyvant',  name: 'Kyvant',  accent: '#34d399', storeEnv: 'FIN_KYVANT_STORE',  tokenEnv: 'FIN_KYVANT_TOKEN'  },
  { slug: 'maverik', name: 'Maverik', accent: '#a78bfa', storeEnv: 'FIN_MAVERIK_STORE', tokenEnv: 'FIN_MAVERIK_TOKEN' },
];

/** All stores that have credentials configured in env. */
export function getFinanceStores(): FinanceStore[] {
  const out: FinanceStore[] = [];
  for (const d of DEFS) {
    const domain = process.env[d.storeEnv];
    const token = process.env[d.tokenEnv];
    if (domain && token) out.push({ slug: d.slug, name: d.name, accent: d.accent, domain, token });
  }
  return out;
}

export function getDelhiveryToken(): string | undefined {
  return process.env.FIN_DELHIVERY_TOKEN;
}

/** Metadata for every known store (configured or not) — for UI listing. */
export function getAllStoreMeta() {
  return DEFS.map(d => ({
    slug: d.slug,
    name: d.name,
    accent: d.accent,
    configured: !!(process.env[d.storeEnv] && process.env[d.tokenEnv]),
  }));
}
