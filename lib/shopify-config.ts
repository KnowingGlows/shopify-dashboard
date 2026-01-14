import { ShopifyStore } from '@/types/shopify';

export function getShopifyStores(): ShopifyStore[] {
  const stores: ShopifyStore[] = [];

  // Parse environment variables to get all Shopify stores
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

export const SHOPIFY_API_VERSION = '2024-01';
