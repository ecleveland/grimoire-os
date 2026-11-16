import {
  authCookieOptions,
  clearAuthCookieOptions,
  clearRefreshCookieOptions,
  clearSessionPresentCookieOptions,
  refreshCookieOptions,
  sessionPresentCookieOptions,
} from './auth-cookie.config';
import { clearCsrfCookieOptions, csrfCookieOptions } from './csrf-cookie.config';

const optionBuilders = {
  authCookieOptions,
  clearAuthCookieOptions,
  refreshCookieOptions,
  clearRefreshCookieOptions,
  sessionPresentCookieOptions,
  clearSessionPresentCookieOptions,
  csrfCookieOptions,
  clearCsrfCookieOptions,
};

describe('auth cookie options follow COOKIE_SECURE', () => {
  const original = { COOKIE_SECURE: process.env.COOKIE_SECURE, NODE_ENV: process.env.NODE_ENV };

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe.each(Object.entries(optionBuilders))('%s', (_name, build) => {
    it.each`
      cookieSecure | nodeEnv          | expected
      ${undefined} | ${'production'}  | ${true}
      ${undefined} | ${'development'} | ${false}
      ${'true'}    | ${'development'} | ${true}
      ${'false'}   | ${'production'}  | ${false}
    `(
      'secure=$expected with COOKIE_SECURE=$cookieSecure and NODE_ENV=$nodeEnv',
      ({ cookieSecure, nodeEnv, expected }) => {
        process.env.NODE_ENV = nodeEnv;
        if (cookieSecure === undefined) delete process.env.COOKIE_SECURE;
        else process.env.COOKIE_SECURE = cookieSecure;

        expect(build().secure).toBe(expected);
      }
    );
  });
});
