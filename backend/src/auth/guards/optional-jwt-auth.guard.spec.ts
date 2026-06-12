import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;

  beforeEach(() => {
    guard = new OptionalJwtAuthGuard();
  });

  it('returns the user when authentication succeeds', () => {
    const user = { userId: 'u1', username: 'dm', role: 'dungeon_master' };

    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('returns undefined instead of throwing when no token is present', () => {
    expect(guard.handleRequest(null, false)).toBeUndefined();
  });

  it('returns undefined instead of throwing when token validation errors', () => {
    expect(guard.handleRequest(new Error('jwt expired'), false)).toBeUndefined();
  });
});
