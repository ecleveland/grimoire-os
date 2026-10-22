// The non-httpOnly cookie that marks "this browser has a session". It lives in
// its own module because the edge middleware reads it and must not import the
// client-only auth context.

// Must match SESSION_PRESENT_COOKIE_NAME in backend/src/auth/auth-cookie.config.ts.
export const SESSION_PRESENT_COOKIE_NAME = 'session_present';

/** True only for a non-empty cookie value. An empty value counts as no session. */
export function hasSessionCookie(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}
