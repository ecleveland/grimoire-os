import { randomBytes } from 'crypto';
import type { CookieOptions } from 'express';

export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const CSRF_TOKEN_BYTES = 32;
export const CSRF_TOKEN_HEX_LENGTH = CSRF_TOKEN_BYTES * 2;

// The CSRF cookie lives as long as the access cookie. Once the access token
// expires and is refreshed, the CSRF token is rotated alongside it.
export const CSRF_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;

export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString('hex');
}

// httpOnly is FALSE on purpose — double-submit requires the frontend JS to read
// the cookie value and echo it back as a header. sameSite=lax + Origin checks
// (via CORS) still gate cross-origin access, so the token itself is not the
// only line of defense.
export function csrfCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CSRF_COOKIE_MAX_AGE_MS,
  };
}

export function clearCsrfCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}
