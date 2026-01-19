import { ShopifyStore } from '@/types/shopify';
import { getRegisteredStoresWithTokens } from './store-registry';

export async function getShopifyStores(): Promise<ShopifyStore[]> {
  return getRegisteredStoresWithTokens();
}

export const SHOPIFY_API_VERSION = '2024-01';
