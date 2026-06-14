import { Keyv } from 'keyv';
import { CACHE_LRU_SIZE, CACHE_TTL_MS, createAppCacheStore } from './cache.config';

describe('cache.config', () => {
  it('uses a 24h TTL', () => {
    expect(CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('bounds the cache with a positive LRU size cap', () => {
    expect(CACHE_LRU_SIZE).toBeGreaterThan(0);
    expect(Number.isInteger(CACHE_LRU_SIZE)).toBe(true);
  });

  it('builds a Keyv store wired with the default TTL and LRU cap', () => {
    const store = createAppCacheStore();
    expect(store).toBeInstanceOf(Keyv);
    // CacheableMemory exposes the live config it was constructed with; assert the
    // default factory threads the module constants through so the bound can't
    // silently regress to an unbounded store.
    const backing = store.opts.store as unknown as { ttl: number; lruSize: number };
    expect(backing.lruSize).toBe(CACHE_LRU_SIZE);
    expect(backing.ttl).toBe(CACHE_TTL_MS);
  });

  it('evicts the least-recently-used entry once the cap is exceeded', async () => {
    const lruSize = 3;
    const store = createAppCacheStore({ lruSize });

    for (let i = 0; i < lruSize + 3; i++) {
      await store.set(`k${i}`, i);
    }

    const survivors: string[] = [];
    for (let i = 0; i < lruSize + 3; i++) {
      if ((await store.get(`k${i}`)) !== undefined) survivors.push(`k${i}`);
    }

    // Only the cap's worth of most-recent entries remain; the earliest were evicted.
    expect(survivors).toEqual(['k3', 'k4', 'k5']);
  });

  it('honors a custom TTL override', async () => {
    const store = createAppCacheStore({ ttl: 20, lruSize: 10 });
    await store.set('soon', 'gone');
    expect(await store.get('soon')).toBe('gone');
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(await store.get('soon')).toBeUndefined();
  });
});
