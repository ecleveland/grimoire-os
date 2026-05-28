import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CsrfGuard, CSRF_SKIP_KEY } from './csrf.guard';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../csrf-cookie.config';

interface GuardOpts {
  method?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string | string[] | undefined>;
  skip?: boolean;
}

function createContext({ method = 'POST', cookies = {}, headers = {}, skip = false }: GuardOpts): {
  context: ExecutionContext;
  reflector: Reflector;
} {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
    if (key === CSRF_SKIP_KEY) return skip;
    return undefined;
  });

  const req = { method, cookies, headers } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}) as unknown as () => unknown,
    getClass: () => ({}) as unknown as new () => unknown,
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('CsrfGuard', () => {
  describe('safe methods', () => {
    it.each(['GET', 'HEAD', 'OPTIONS', 'get', 'head', 'options'])(
      'allows %s without any token',
      method => {
        const { context, reflector } = createContext({ method });
        const guard = new CsrfGuard(reflector);
        expect(guard.canActivate(context)).toBe(true);
      }
    );
  });

  describe('@SkipCsrf() handlers', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      'allows %s when handler is decorated with SkipCsrf even with no token',
      method => {
        const { context, reflector } = createContext({ method, skip: true });
        const guard = new CsrfGuard(reflector);
        expect(guard.canActivate(context)).toBe(true);
      }
    );
  });

  describe('protected unsafe methods', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('allows %s when cookie matches header', method => {
      const { context, reflector } = createContext({
        method,
        cookies: { [CSRF_COOKIE_NAME]: 'matching-token' },
        headers: { [CSRF_HEADER_NAME]: 'matching-token' },
      });
      const guard = new CsrfGuard(reflector);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('rejects when no cookie is present', () => {
      const { context, reflector } = createContext({
        method: 'POST',
        headers: { [CSRF_HEADER_NAME]: 'a-token' },
      });
      const guard = new CsrfGuard(reflector);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('rejects when no header is present', () => {
      const { context, reflector } = createContext({
        method: 'POST',
        cookies: { [CSRF_COOKIE_NAME]: 'a-token' },
      });
      const guard = new CsrfGuard(reflector);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('rejects when cookie and header disagree', () => {
      const { context, reflector } = createContext({
        method: 'POST',
        cookies: { [CSRF_COOKIE_NAME]: 'cookie-value' },
        headers: { [CSRF_HEADER_NAME]: 'header-value' },
      });
      const guard = new CsrfGuard(reflector);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('rejects when cookie is the empty string (no false match on falsy values)', () => {
      const { context, reflector } = createContext({
        method: 'POST',
        cookies: { [CSRF_COOKIE_NAME]: '' },
        headers: { [CSRF_HEADER_NAME]: '' },
      });
      const guard = new CsrfGuard(reflector);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('accepts only the first value when the header arrives as an array', () => {
      const { context, reflector } = createContext({
        method: 'POST',
        cookies: { [CSRF_COOKIE_NAME]: 'tok' },
        headers: { [CSRF_HEADER_NAME]: ['tok', 'attacker-injected'] },
      });
      const guard = new CsrfGuard(reflector);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('rejects when the array header first value does not match', () => {
      const { context, reflector } = createContext({
        method: 'POST',
        cookies: { [CSRF_COOKIE_NAME]: 'tok' },
        headers: { [CSRF_HEADER_NAME]: ['nope', 'tok'] },
      });
      const guard = new CsrfGuard(reflector);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
