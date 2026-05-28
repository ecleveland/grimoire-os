import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CSRF_TOKEN_HEX_LENGTH,
  clearCsrfCookieOptions,
  csrfCookieOptions,
  generateCsrfToken,
} from './csrf-cookie.config';

describe('csrf-cookie.config', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('exposes the canonical cookie + header names', () => {
    expect(CSRF_COOKIE_NAME).toBe('csrf_token');
    expect(CSRF_HEADER_NAME).toBe('x-csrf-token');
  });

  describe('generateCsrfToken', () => {
    it('returns a hex string of the documented length', () => {
      const token = generateCsrfToken();
      expect(token).toHaveLength(CSRF_TOKEN_HEX_LENGTH);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('returns a different value each call (entropy)', () => {
      const a = generateCsrfToken();
      const b = generateCsrfToken();
      expect(a).not.toBe(b);
    });
  });

  describe('csrfCookieOptions', () => {
    it('is readable by JS (httpOnly false) so the frontend can mirror it as a header', () => {
      expect(csrfCookieOptions().httpOnly).toBe(false);
    });

    it('uses sameSite=lax and path=/ so it rides on same-site mutating requests', () => {
      const opts = csrfCookieOptions();
      expect(opts.sameSite).toBe('lax');
      expect(opts.path).toBe('/');
    });

    it('is insecure in non-production so localhost dev still works', () => {
      process.env.NODE_ENV = 'development';
      expect(csrfCookieOptions().secure).toBe(false);
    });

    it('is secure in production', () => {
      process.env.NODE_ENV = 'production';
      expect(csrfCookieOptions().secure).toBe(true);
    });
  });

  describe('clearCsrfCookieOptions', () => {
    it('matches the issue path so res.clearCookie targets the right cookie', () => {
      const issue = csrfCookieOptions();
      const clear = clearCsrfCookieOptions();
      expect(clear.path).toBe(issue.path);
      expect(clear.sameSite).toBe(issue.sameSite);
      expect(clear.httpOnly).toBe(issue.httpOnly);
    });
  });
});
