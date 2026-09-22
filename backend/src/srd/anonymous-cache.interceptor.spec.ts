import { firstValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { AnonymousCacheInterceptor } from './anonymous-cache.interceptor';

function makeCacheManager() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn((k: string) => Promise.resolve(store.get(k))),
    set: jest.fn((k: string, v: unknown) => {
      store.set(k, v);
      return Promise.resolve();
    }),
  };
}

type FakeResponse = { setHeader: jest.Mock };

function makeResponse(): FakeResponse {
  return { setHeader: jest.fn() };
}

function makeContext(
  req: { method: string; url: string; user?: unknown },
  res: FakeResponse = makeResponse()
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getArgByIndex: () => req,
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function makeInterceptor(cacheManager: unknown): AnonymousCacheInterceptor {
  const reflector = { get: () => undefined } as unknown as Reflector;
  const interceptor = new AnonymousCacheInterceptor(cacheManager, reflector);
  // httpAdapterHost is property-injected by Nest at runtime; supply a minimal
  // adapter so the inherited trackBy/header logic can run under unit test.
  (interceptor as unknown as { httpAdapterHost: unknown }).httpAdapterHost = {
    httpAdapter: {
      getRequestMethod: (r: { method: string }) => r.method,
      getRequestUrl: (r: { url: string }) => r.url,
      setHeader: () => undefined,
    },
  };
  return interceptor;
}

async function run(
  interceptor: AnonymousCacheInterceptor,
  context: ExecutionContext,
  handlerValue: unknown,
  handlerSpy: jest.Mock
): Promise<unknown> {
  const next: CallHandler = {
    handle: () => {
      handlerSpy();
      return of(handlerValue);
    },
  };
  const result$ = await interceptor.intercept(context, next);
  return firstValueFrom(result$);
}

describe('AnonymousCacheInterceptor (VEG-333)', () => {
  it('caches an anonymous GET response and serves the second identical hit from cache', async () => {
    const cache = makeCacheManager();
    const interceptor = makeInterceptor(cache);
    const ctx = makeContext({ method: 'GET', url: '/srd/monsters?page=1' });
    const handler = jest.fn();

    const first = await run(interceptor, ctx, { data: 'catalog' }, handler);
    // A different handler value proves the second response came from cache, not a re-run.
    const second = await run(interceptor, ctx, { data: 'SHOULD_NOT_BE_SERVED' }, handler);

    expect(first).toEqual({ data: 'catalog' });
    expect(second).toEqual({ data: 'catalog' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(cache.store.get('/srd/monsters?page=1')).toEqual({ data: 'catalog' });
  });

  it('keys the cache by full URL so different query strings do not collide', async () => {
    const cache = makeCacheManager();
    const interceptor = makeInterceptor(cache);
    const handler = jest.fn();

    const a = await run(
      interceptor,
      makeContext({ method: 'GET', url: '/srd/monsters?page=1' }),
      { page: 1 },
      handler
    );
    const b = await run(
      interceptor,
      makeContext({ method: 'GET', url: '/srd/monsters?page=2' }),
      { page: 2 },
      handler
    );

    expect(a).toEqual({ page: 1 });
    expect(b).toEqual({ page: 2 });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('bypasses the cache for an authenticated request: handler runs every time, nothing stored', async () => {
    const cache = makeCacheManager();
    const interceptor = makeInterceptor(cache);
    const ctx = makeContext({ method: 'GET', url: '/srd/monsters', user: { userId: 'u1' } });
    const handler = jest.fn();

    const r1 = await run(interceptor, ctx, { data: 'u1-homebrew' }, handler);
    const r2 = await run(interceptor, ctx, { data: 'u1-homebrew-after-edit' }, handler);

    // The caller always sees a fresh result (their own writes are never hidden).
    expect(r1).toEqual({ data: 'u1-homebrew' });
    expect(r2).toEqual({ data: 'u1-homebrew-after-edit' });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.store.size).toBe(0);
  });

  it('does not cache a non-GET request even for an anonymous caller', async () => {
    // The owner-aware controllers also expose POST/PATCH/DELETE homebrew CRUD.
    // The inherited GET-only rule must keep those uncached — caching a mutation
    // response (or serving a stale catalog after a write) would be a real bug.
    const cache = makeCacheManager();
    const interceptor = makeInterceptor(cache);
    const ctx = makeContext({ method: 'POST', url: '/srd/monsters' });
    const handler = jest.fn();

    const r1 = await run(interceptor, ctx, { created: 1 }, handler);
    const r2 = await run(interceptor, ctx, { created: 2 }, handler);

    expect(r1).toEqual({ created: 1 });
    expect(r2).toEqual({ created: 2 });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.store.size).toBe(0);
  });

  it('never shares a cached entry between two authenticated users on the same URL', async () => {
    const cache = makeCacheManager();
    const interceptor = makeInterceptor(cache);
    const handler = jest.fn();

    const u1 = await run(
      interceptor,
      makeContext({ method: 'GET', url: '/srd/spells', user: { userId: 'u1' } }),
      { for: 'u1' },
      handler
    );
    const u2 = await run(
      interceptor,
      makeContext({ method: 'GET', url: '/srd/spells', user: { userId: 'u2' } }),
      { for: 'u2' },
      handler
    );

    expect(u1).toEqual({ for: 'u1' });
    expect(u2).toEqual({ for: 'u2' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('does not serve a cached anonymous response to an authenticated caller (no homebrew leak)', async () => {
    const cache = makeCacheManager();
    const interceptor = makeInterceptor(cache);
    const handler = jest.fn();

    // Anonymous request populates the cache for this URL.
    await run(
      interceptor,
      makeContext({ method: 'GET', url: '/srd/search?q=fire' }),
      { catalog: true },
      handler
    );
    // An authenticated caller on the same URL must bypass and get their own
    // result (catalog + their homebrew), never the cached anonymous entry.
    const authed = await run(
      interceptor,
      makeContext({ method: 'GET', url: '/srd/search?q=fire', user: { userId: 'u9' } }),
      { catalog: true, homebrew: ['mine'] },
      handler
    );

    expect(authed).toEqual({ catalog: true, homebrew: ['mine'] });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  // Classes joined the unified search in VEG-510, so a `types=class` URL now
  // returns owner-scoped rows the way `types=spell` always has. The entry the
  // next anonymous caller is served must still be the catalog-only one.
  it("keeps an owner's class hit out of the anonymous entry [VEG-510]", async () => {
    const cache = makeCacheManager();
    const interceptor = makeInterceptor(cache);
    const handler = jest.fn();
    const url = '/api/srd/search?types=class&q=Warden';
    const catalogOnly = { total: 0, data: [] };

    const anon = await run(interceptor, makeContext({ method: 'GET', url }), catalogOnly, handler);
    const owner = await run(
      interceptor,
      makeContext({ method: 'GET', url, user: { userId: 'u1' } }),
      { total: 1, data: [{ kind: 'class' }] },
      handler
    );
    // A third anonymous hit: whatever it gets came from the cache, since the
    // handler value here is one no caller should ever see.
    const anonAgain = await run(
      interceptor,
      makeContext({ method: 'GET', url }),
      { total: 1, data: [{ kind: 'SHOULD_NOT_BE_SERVED' }] },
      handler
    );

    expect(anon).toEqual(catalogOnly);
    expect(owner).toEqual({ total: 1, data: [{ kind: 'class' }] });
    expect(anonAgain).toEqual(catalogOnly);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(cache.store.get(url)).toEqual(catalogOnly);
  });

  // Skipping the in-process cache protects this process only. A reverse proxy
  // fronting /api/srd/* sees a plain 200 on a bare URL and is entitled to store
  // it, which would hand one user's homebrew to the next anonymous visitor.
  it('tells a proxy not to store an authenticated response', async () => {
    const res = makeResponse();
    const ctx = makeContext(
      { method: 'GET', url: '/api/srd/search?types=class', user: { userId: 'u1' } },
      res
    );

    await run(makeInterceptor(makeCacheManager()), ctx, { total: 1, data: [] }, jest.fn());

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });

  it('leaves an anonymous response cacheable by a proxy', async () => {
    const res = makeResponse();
    const ctx = makeContext({ method: 'GET', url: '/api/srd/search?types=class' }, res);

    await run(makeInterceptor(makeCacheManager()), ctx, { total: 0, data: [] }, jest.fn());

    expect(res.setHeader).not.toHaveBeenCalledWith('Cache-Control', expect.anything());
  });
});
