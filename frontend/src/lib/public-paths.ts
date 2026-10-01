// Route prefixes reachable without an authenticated session, plus the helpers
// that apply them. The middleware (decides whether to bounce an unauthenticated
// request to /login) and the client's dead-session teardown (skips the redirect
// when the user is already on a public route) both call these functions, so the
// two layers always agree and the app never ping-pongs between /login and /.
export const PUBLIC_PATH_PREFIXES = ['/login', '/register', '/srd'];

/** A path is public when it equals a prefix or sits beneath it as a segment. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

// Any origin works; resolveNextPath only checks that parsing does not change it.
const PLACEHOLDER_ORIGIN = 'http://n';

/**
 * Returns `raw` as a normalised same-origin path, or `/` when it could leave the
 * site. Browsers read `/\evil.com` as `//evil.com` and strip tab, LF and CR
 * before parsing, so the cheap checks reject backslashes and control characters,
 * and the final check parses `raw` against a placeholder origin and accepts it
 * only when the origin is unchanged. Parsing collapses dot segments, so
 * `/.//evil.com` becomes `//evil.com`; the normalised result gets the same
 * `//` and backslash checks before it is returned.
 */
export function resolveNextPath(raw: string | null | undefined): string {
  if (
    !raw ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.includes('\\') ||
    /[\x00-\x1f\x7f]/.test(raw)
  ) {
    return '/';
  }
  try {
    const url = new URL(raw, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return '/';
    const out = url.pathname + url.search + url.hash;
    return out.startsWith('//') || out.includes('\\') ? '/' : out;
  } catch {
    return '/';
  }
}

/** The login URL that returns to `target` (pathname plus search) after sign-in. */
export function loginPathFor(target: string): string {
  if (!target || target === '/') return '/login';
  return `/login?next=${encodeURIComponent(target)}`;
}

/** Appends `next` to `path` so a hop between /login and /register keeps it. */
export function withNext(path: string, next: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
