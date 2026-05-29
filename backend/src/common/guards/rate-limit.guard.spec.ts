import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ThrottlerModule, ThrottlerStorage, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { RateLimitGuard } from './rate-limit.guard';
import { AUTH_COOKIE_NAME } from '../../auth/auth-cookie.config';

const TEST_SECRET = 'rate-limit-guard-test-secret';
const ANON_LIMIT = 7;
const AUTHED_LIMIT = 99;

function mockExecutionContext(req: Partial<Request>, res?: Partial<Response>): ExecutionContext {
  const handler = (() => undefined) as () => void;
  const classRef = class TestController {};
  return {
    switchToHttp: () => ({
      getRequest: <T = Request>() => req as T,
      getResponse: <T = Response>() =>
        (res ?? {
          header: jest.fn(),
        }) as T,
      getNext: () => undefined,
    }),
    getHandler: () => handler,
    getClass: () => classRef,
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

function reqWith(opts: {
  cookieToken?: string;
  bearerToken?: string;
  ip?: string;
}): Partial<Request> {
  const cookies = opts.cookieToken ? { [AUTH_COOKIE_NAME]: opts.cookieToken } : {};
  const headers: Record<string, string> = {};
  if (opts.bearerToken) headers['authorization'] = `Bearer ${opts.bearerToken}`;
  return {
    cookies,
    headers,
    ip: opts.ip ?? '203.0.113.5',
  } as Partial<Request>;
}

describe('RateLimitGuard', () => {
  let module: TestingModule;
  let guard: RateLimitGuard;
  let jwtService: JwtService;
  let storage: ThrottlerStorage;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    process.env.THROTTLE_ANON_LIMIT = String(ANON_LIMIT);
    process.env.THROTTLE_AUTHED_LIMIT = String(AUTHED_LIMIT);

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ auth: { jwtSecret: TEST_SECRET } })],
        }),
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: ANON_LIMIT }],
        }),
      ],
      providers: [RateLimitGuard, Reflector],
    }).compile();
    await module.init();

    guard = module.get(RateLimitGuard);
    jwtService = module.get(JwtService);
    storage = (guard as unknown as { storageService: ThrottlerStorage }).storageService;
  });

  afterAll(async () => {
    await module.close();
    process.env.THROTTLE_ANON_LIMIT = originalEnv.THROTTLE_ANON_LIMIT;
    process.env.THROTTLE_AUTHED_LIMIT = originalEnv.THROTTLE_AUTHED_LIMIT;
    if (originalEnv.THROTTLE_ANON_LIMIT === undefined) delete process.env.THROTTLE_ANON_LIMIT;
    if (originalEnv.THROTTLE_AUTHED_LIMIT === undefined) delete process.env.THROTTLE_AUTHED_LIMIT;
  });

  // The base ThrottlerGuard memoizes nothing on req, but our cache must not
  // leak between tests, so use a fresh req each time.

  describe('getTracker', () => {
    const getTracker = (req: Partial<Request>): Promise<string> =>
      (
        guard as unknown as {
          getTracker: (r: Record<string, unknown>) => Promise<string>;
        }
      ).getTracker(req as Record<string, unknown>);

    it('returns user:<id> when the JWT cookie is valid', async () => {
      const token = jwtService.sign({ sub: 'user-abc', username: 'a', role: 'player' });
      const tracker = await getTracker(reqWith({ cookieToken: token, ip: '198.51.100.1' }));
      expect(tracker).toBe('user:user-abc');
    });

    it('returns user:<id> when the Authorization Bearer header is valid', async () => {
      const token = jwtService.sign({ sub: 'user-xyz', username: 'x', role: 'player' });
      const tracker = await getTracker(reqWith({ bearerToken: token, ip: '198.51.100.2' }));
      expect(tracker).toBe('user:user-xyz');
    });

    it('prefers the cookie over the Authorization header when both are present', async () => {
      const cookieToken = jwtService.sign({ sub: 'cookie-user', username: 'c', role: 'player' });
      const bearerToken = jwtService.sign({ sub: 'bearer-user', username: 'b', role: 'player' });
      const tracker = await getTracker(reqWith({ cookieToken, bearerToken, ip: '198.51.100.3' }));
      expect(tracker).toBe('user:cookie-user');
    });

    it('falls back to ip:<addr> when no token is present', async () => {
      const tracker = await getTracker(reqWith({ ip: '198.51.100.4' }));
      expect(tracker).toBe('ip:198.51.100.4');
    });

    it('falls back to ip:<addr> when the JWT signature is invalid', async () => {
      const otherJwt = new JwtService({ secret: 'wrong-secret' });
      const badToken = otherJwt.sign({ sub: 'spoofed' });
      const tracker = await getTracker(reqWith({ cookieToken: badToken, ip: '198.51.100.5' }));
      expect(tracker).toBe('ip:198.51.100.5');
    });

    it('falls back to ip:<addr> when the JWT is expired', async () => {
      const expired = jwtService.sign(
        { sub: 'expired-user', username: 'e', role: 'player' },
        { expiresIn: '-1s' }
      );
      const tracker = await getTracker(reqWith({ cookieToken: expired, ip: '198.51.100.6' }));
      expect(tracker).toBe('ip:198.51.100.6');
    });

    it('falls back to ip:<addr> when the token is malformed', async () => {
      const tracker = await getTracker(reqWith({ cookieToken: 'not-a-jwt', ip: '198.51.100.7' }));
      expect(tracker).toBe('ip:198.51.100.7');
    });

    it('returns ip:unknown when no client IP can be determined', async () => {
      const tracker = await getTracker({ cookies: {}, headers: {} } as Partial<Request>);
      expect(tracker).toBe('ip:unknown');
    });
  });

  describe('handleRequest applies tiered limits', () => {
    let storageSpy: jest.SpyInstance;

    beforeEach(() => {
      storageSpy = jest.spyOn(storage, 'increment').mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    });

    afterEach(() => {
      storageSpy.mockRestore();
    });

    const callCanActivate = async (ctx: ExecutionContext): Promise<void> => {
      await guard.canActivate(ctx);
    };

    it('applies the anon limit to unauthenticated requests', async () => {
      await callCanActivate(mockExecutionContext(reqWith({ ip: '198.51.100.10' })));
      expect(storageSpy).toHaveBeenCalledTimes(1);
      const [, , limit] = storageSpy.mock.calls[0];
      expect(limit).toBe(ANON_LIMIT);
    });

    it('applies the higher authed limit when the JWT cookie is valid', async () => {
      const token = jwtService.sign({ sub: 'authed-1', username: 'a', role: 'player' });
      await callCanActivate(
        mockExecutionContext(reqWith({ cookieToken: token, ip: '198.51.100.11' }))
      );
      expect(storageSpy).toHaveBeenCalledTimes(1);
      const [, , limit] = storageSpy.mock.calls[0];
      expect(limit).toBe(AUTHED_LIMIT);
    });

    it('honors a per-route @Throttle override regardless of auth state', async () => {
      // Build a synthetic context whose handler carries the Throttle metadata.
      class FakeController {}
      const handler = function fakeHandler() {};
      Throttle({ default: { limit: 2, ttl: 60_000 } })(FakeController.prototype, 'fakeHandler', {
        value: handler,
        configurable: true,
        writable: true,
        enumerable: false,
      });
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => reqWith({ ip: '198.51.100.12' }),
          getResponse: () => ({ header: jest.fn() }),
          getNext: () => undefined,
        }),
        getHandler: () => handler,
        getClass: () => FakeController,
        getType: () => 'http',
      } as unknown as ExecutionContext;

      await callCanActivate(ctx);
      expect(storageSpy).toHaveBeenCalledTimes(1);
      const [, , limit] = storageSpy.mock.calls[0];
      expect(limit).toBe(2);
    });
  });
});
