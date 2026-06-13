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

// A non-httpOnly "session present" flag the frontend reads to know a session
// likely exists *before* the /users/me hydration round-trip answers — so
// auth-gated chrome can reserve its layout space instead of popping in and
// shifting content (VEG-339). It carries no secret (the value is always "1");
// only its presence matters, so exposing it to JS is safe. Crucially it tracks
// the 7-day refresh window, NOT the 15-minute access/csrf rotation, so the hint
// stays correct for a returning user across the whole session lifetime. Set
// wherever the refresh cookie is issued; cleared on logout.
export const SESSION_PRESENT_COOKIE_NAME = 'session_present';
export const SESSION_PRESENT_COOKIE_VALUE = '1';

export function sessionPresentCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

export function clearSessionPresentCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
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
