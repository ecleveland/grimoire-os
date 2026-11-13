import configuration from './configuration';
import { cookieModeDescription, resolveCookieSecure } from './cookie.config';

describe('cookie.config', () => {
  describe('resolveCookieSecure', () => {
    it.each`
      cookieSecure | nodeEnv          | expected
      ${undefined} | ${'production'}  | ${true}
      ${undefined} | ${'development'} | ${false}
      ${''}        | ${'production'}  | ${true}
      ${''}        | ${'development'} | ${false}
      ${'true'}    | ${'production'}  | ${true}
      ${'true'}    | ${'development'} | ${true}
      ${'false'}   | ${'production'}  | ${false}
      ${'false'}   | ${'development'} | ${false}
    `(
      'COOKIE_SECURE=$cookieSecure with NODE_ENV=$nodeEnv gives secure=$expected',
      ({ cookieSecure, nodeEnv, expected }) => {
        expect(resolveCookieSecure({ COOKIE_SECURE: cookieSecure, NODE_ENV: nodeEnv })).toBe(
          expected
        );
      }
    );

    it('treats an unset NODE_ENV as not production', () => {
      expect(resolveCookieSecure({})).toBe(false);
    });

    it.each(['TRUE', 'yes', '1', '0', ' false', 'off'])(
      'rejects COOKIE_SECURE=%j with an error naming the accepted values',
      value => {
        expect(() => resolveCookieSecure({ COOKIE_SECURE: value, NODE_ENV: 'production' })).toThrow(
          `COOKIE_SECURE must be "true", "false" or unset, got "${value}"`
        );
      }
    );

    it('reads process.env when no env is passed', () => {
      const original = { COOKIE_SECURE: process.env.COOKIE_SECURE, NODE_ENV: process.env.NODE_ENV };
      try {
        process.env.NODE_ENV = 'production';
        process.env.COOKIE_SECURE = 'false';
        expect(resolveCookieSecure()).toBe(false);
      } finally {
        for (const [key, value] of Object.entries(original)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });
  });

  describe('cookieModeDescription', () => {
    it('names the override when COOKIE_SECURE turns the flag off', () => {
      expect(cookieModeDescription({ COOKIE_SECURE: 'false', NODE_ENV: 'production' })).toBe(
        'Auth cookies are sent without the Secure flag (COOKIE_SECURE=false). Browsers send them over plain HTTP.'
      );
    });

    it('names the override when COOKIE_SECURE turns the flag on', () => {
      expect(cookieModeDescription({ COOKIE_SECURE: 'true', NODE_ENV: 'development' })).toBe(
        'Auth cookies carry the Secure flag (COOKIE_SECURE=true). Browsers send them only over HTTPS, so login over plain HTTP fails.'
      );
    });

    it('names NODE_ENV when COOKIE_SECURE is unset in production', () => {
      expect(cookieModeDescription({ NODE_ENV: 'production' })).toBe(
        'Auth cookies carry the Secure flag (COOKIE_SECURE unset, NODE_ENV=production). Browsers send them only over HTTPS, so login over plain HTTP fails. Set COOKIE_SECURE=false to serve over plain HTTP.'
      );
    });

    it('names NODE_ENV when COOKIE_SECURE is unset outside production', () => {
      expect(cookieModeDescription({ COOKIE_SECURE: '', NODE_ENV: 'development' })).toBe(
        'Auth cookies are sent without the Secure flag (COOKIE_SECURE unset, NODE_ENV=development). Browsers send them over plain HTTP.'
      );
    });

    it('shows an unset NODE_ENV as unset', () => {
      expect(cookieModeDescription({})).toContain('(COOKIE_SECURE unset, NODE_ENV unset)');
    });
  });
});

describe('configuration', () => {
  const original = {
    COOKIE_SECURE: process.env.COOKIE_SECURE,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('refuses to load with an invalid COOKIE_SECURE', () => {
    process.env.JWT_SECRET = 'secret';
    process.env.COOKIE_SECURE = 'yes';

    expect(() => configuration()).toThrow('COOKIE_SECURE must be "true", "false" or unset');
  });

  it('exposes the resolved cookie mode', () => {
    process.env.JWT_SECRET = 'secret';
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SECURE = 'false';

    expect(configuration().auth.cookieSecure).toBe(false);
  });
});
