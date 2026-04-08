import type Afip from "@afipsdk/afip.js";

const clientCache = new Map<string, Afip>();

export function getCachedAfipClient(cacheKey: string) {
  return clientCache.get(cacheKey) ?? null;
}

export function setCachedAfipClient(cacheKey: string, client: Afip) {
  clientCache.set(cacheKey, client);
}

export function invalidateAfipClient(cacheKey: string) {
  clientCache.delete(cacheKey);
}

export function clearAfipCache() {
  clientCache.clear();
}
