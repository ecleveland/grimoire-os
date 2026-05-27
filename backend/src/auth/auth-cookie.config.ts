import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'access_token';
export const REFRESH_COOKIE_NAME = 'refresh_token';

// Access token lives 15 minutes — short-lived per the refresh-token model.
// The JWT's `exp` claim is still the source of truth; the cookie maxAge only
// controls when the browser stops sending it.
export const AUTH_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;

// Refresh token lives 7 days. Stored as an opaque random string (hashed in DB).
export const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  };
}

export function clearAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

// Refresh cookie is scoped to /api/auth so it's only sent on refresh/logout —
// reduces the surface area for any XSS-driven cookie exfiltration even though
// it's already httpOnly.
export const REFRESH_COOKIE_PATH = '/api/auth';

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

export function clearRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}
