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

  it('builds a Keyv store with JSON serialization disabled (matches the v6 default store)', () => {
    const store = createAppCacheStore();
    expect(store).toBeInstanceOf(Keyv);
    // createKeyv disables Keyv-side (de)serialization so values aren't needlessly
    // JSON round-tripped — same as cache-manager v6's default store. Guards
    // against regressing back to a hand-rolled `new Keyv({ store })` wiring.
    expect(store.serialize).toBeUndefined();
    expect(store.deserialize).toBeUndefined();
  });

  it('enforces the default CACHE_LRU_SIZE cap on the no-arg factory', async () => {
    const store = createAppCacheStore();

    // Insert past the cap; the earliest entries must be evicted so the live set
    // never exceeds CACHE_LRU_SIZE. Proves the default factory threads the
    // constant through, without reaching into Keyv/cacheable internals.
    for (let i = 0; i < CACHE_LRU_SIZE + 5; i++) {
      await store.set(`k${i}`, i);
    }

    let survivors = 0;
    for (let i = 0; i < CACHE_LRU_SIZE + 5; i++) {
      if ((await store.get(`k${i}`)) !== undefined) survivors++;
    }
    expect(survivors).toBe(CACHE_LRU_SIZE);
    // The very first inserts are the ones evicted.
    expect(await store.get('k0')).toBeUndefined();
    expect(await store.get(`k${CACHE_LRU_SIZE + 4}`)).toBe(CACHE_LRU_SIZE + 4);
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
