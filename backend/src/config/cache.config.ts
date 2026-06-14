import { CacheableMemory } from 'cacheable';
import { Keyv } from 'keyv';

/**
 * SRD data is static between seeds, so a 24h in-memory cache covers realistic
 * refresh windows. Shared by the global CacheModule, SrdController's blanket
 * CacheInterceptor, and the VEG-333 AnonymousCacheInterceptor.
 */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Hard cap on the number of live entries in the global in-memory cache (VEG-340).
 *
 * VEG-333 made the owner-aware SRD routes anonymous-cacheable, including the
 * unified search keyed by full URL with a free-text `?q=` param — an unbounded
 * cardinality surface. Without a size bound, high-cardinality anonymous traffic
 * (a crawler/fuzzer hitting `?q=<unique>` repeatedly) would accrete one
 * never-re-requested 24h entry per distinct URL, risking slow heap growth and
 * OOM on small self-hosted instances. The LRU evicts the least-recently-used
 * entry once the cap is hit, so the working set of genuinely popular pages stays
 * cached while one-off queries fall out. Sized for a small self-host.
 */
export const CACHE_LRU_SIZE = 1000;

/**
 * Builds the bounded, LRU-backed Keyv store for the global CacheModule. The TTL
 * is set on the store as a backstop; at runtime the CacheInterceptor passes the
 * module-level TTL on every write, so both agree at 24h. Parameterized for tests
 * — production callers rely on the exported defaults.
 */
export function createAppCacheStore({
  ttl = CACHE_TTL_MS,
  lruSize = CACHE_LRU_SIZE,
}: { ttl?: number; lruSize?: number } = {}): Keyv {
  return new Keyv({ store: new CacheableMemory({ ttl, lruSize }) });
}
