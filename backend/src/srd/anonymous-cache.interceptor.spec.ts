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

function makeContext(req: { method: string; url: string; user?: unknown }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
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
});
