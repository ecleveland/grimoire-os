import { ExecutionContext } from '@nestjs/common';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { AUTH_COOKIE_NAME } from '../auth-cookie.config';

function contextFor(req: {
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ cookies: {}, headers: {}, ...req }) }),
  } as unknown as ExecutionContext;
}

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;
  let parentCanActivate: jest.SpyInstance;

  beforeEach(() => {
    guard = new OptionalJwtAuthGuard();
    // AuthGuard('jwt') is memoized, so the parent prototype is stable.
    parentCanActivate = jest
      .spyOn(Object.getPrototypeOf(OptionalJwtAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
  });

  afterEach(() => {
    parentCanActivate.mockRestore();
  });

  it('lets credential-less requests through as anonymous without invoking the strategy', () => {
    expect(guard.canActivate(contextFor({}))).toBe(true);

    expect(parentCanActivate).not.toHaveBeenCalled();
  });

  it('enforces JWT authentication when the access-token cookie is present — an expired token must 401 so clients refresh instead of silently degrading', async () => {
    await guard.canActivate(contextFor({ cookies: { [AUTH_COOKIE_NAME]: 'some-token' } }));

    expect(parentCanActivate).toHaveBeenCalled();
  });

  it('enforces JWT authentication when a bearer Authorization header is present', async () => {
    await guard.canActivate(contextFor({ headers: { authorization: 'Bearer some-token' } }));

    expect(parentCanActivate).toHaveBeenCalled();
  });

  it('ignores non-bearer Authorization headers (anonymous, not 401)', () => {
    expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Basic dXNlcjpwdw==' } }))
    ).toBe(true);

    expect(parentCanActivate).not.toHaveBeenCalled();
  });

  it('ignores an empty access-token cookie', () => {
    expect(guard.canActivate(contextFor({ cookies: { [AUTH_COOKIE_NAME]: '' } }))).toBe(true);

    expect(parentCanActivate).not.toHaveBeenCalled();
  });
});
