import { createKeyv } from 'cacheable';
import { Keyv } from 'keyv';

/**
 * TTL for the global in-memory cache. SRD data is static between seeds, so 24h
 * covers realistic refresh windows. The CacheInterceptor writes without an
 * explicit TTL, so cache-manager falls back to the module-level `ttl` (see
 * AppModule); the store carries the same value for any direct writes. Tunable
 * via CACHE_TTL_MS for operators who want a shorter staleness window.
 */
export const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS ?? `${24 * 60 * 60 * 1000}`, 10);

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
 * cached while one-off queries fall out. Defaults to a small-self-host size;
 * tunable via CACHE_LRU_SIZE to match an instance's heap budget.
 */
export const CACHE_LRU_SIZE = parseInt(process.env.CACHE_LRU_SIZE ?? '1000', 10);

/**
 * Builds the bounded, LRU-backed Keyv store for the global CacheModule.
 *
 * `createKeyv` is cacheable's canonical adapter: it wires an LRU-bounded
 * `CacheableMemory` and disables Keyv's JSON serialization — matching
 * cache-manager v6's default in-memory store (which also disables it), so values
 * aren't needlessly round-tripped through JSON and a single CacheableMemory
 * envelope tracks each entry's TTL. Parameterized for tests; production callers
 * rely on the exported defaults.
 */
export function createAppCacheStore({
  ttl = CACHE_TTL_MS,
  lruSize = CACHE_LRU_SIZE,
}: { ttl?: number; lruSize?: number } = {}): Keyv {
  return createKeyv({ ttl, lruSize });
}
