import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'access_token';

// Kept aligned with the JWT_EXPIRES_IN default (24h). If you change one, change
// the other — the JWT will still be the source of truth for actual expiry; the
// cookie maxAge only controls when the browser stops sending it.
export const AUTH_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
