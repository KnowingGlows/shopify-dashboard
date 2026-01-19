import { ShopifyStore } from '@/types/shopify';
import { getRegisteredStoresWithTokens } from './store-registry';

export function getEnvStores(): ShopifyStore[] {
  const stores: ShopifyStore[] = [];

  Object.keys(process.env).forEach((key) => {
    if (key.startsWith('SHOPIFY_STORE_')) {
      const storeConfig = process.env[key];
      if (storeConfig) {
        const [domain, accessToken] = storeConfig.split('|');
        if (domain && accessToken) {
          const storeName = key.replace('SHOPIFY_STORE_', 'Store ');
          stores.push({
            name: storeName,
            domain: domain.trim(),
            accessToken: accessToken.trim(),
          });
        }
      }
    }
  });

  return stores;
}

export function getEnvStoreSummaries() {
  return getEnvStores().map((store) => ({
    name: store.name,
    domain: store.domain,
  }));
}

export async function getShopifyStores(): Promise<ShopifyStore[]> {
  const envStores = getEnvStores();
  const registeredStores = await getRegisteredStoresWithTokens();
  return [...envStores, ...registeredStores];
}

export const SHOPIFY_API_VERSION = '2024-01';
