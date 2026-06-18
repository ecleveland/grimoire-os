import { PUBLIC_PATH_PREFIXES } from './public-paths';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Error thrown for non-OK API responses, carrying the HTTP `status` and parsed
 * `body` so callers can branch on specific failures (e.g. a 409 optimistic-lock
 * conflict) instead of string-matching the message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}
// Nest validation 400s carry `message` as a string[]; joining keeps the toast
// readable instead of Error's bare-comma String coercion.
function errorMessage(message: unknown, status: number): string {
  if (Array.isArray(message)) return message.join('; ');
  if (typeof message === 'string' && message) return message;
  return `API error: ${status}`;
}

const REFRESH_PATH = '/auth/refresh';
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// In-flight refresh promise — when a burst of requests all 401 simultaneously,
// they share one refresh round-trip instead of each kicking off their own.
let inflightRefresh: Promise<boolean> | null = null;

// In-flight dead-session teardown — same dedup idea as inflightRefresh: a burst
// of terminal 401s must collapse into a single logout + navigation, not a
// logout-per-request storm (VEG-419).
let inflightEndSession: Promise<void> | null = null;

function isOnPublicPath(): boolean {
  if (typeof window === 'undefined') return false;
  const { pathname } = window.location;
  return PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

/**
 * Resolve an unrestorable session to a clean logged-out state (VEG-419).
 *
 * The access/refresh cookies are httpOnly, so client JS can't clear them via
 * `document.cookie` — only the server can. We POST `/auth/logout` (which works
 * even with an invalid/absent session and clears all four auth cookies), then
 * navigate to `/login`. Clearing the cookies is the crux: it stops the
 * middleware's presence-only check from disagreeing with the dead session and
 * ping-ponging `/login` ↔ `/`.
 *
 * Deduped via `inflightEndSession` so concurrent terminal 401s trigger exactly
 * one logout + one navigation. The logout failure is swallowed: the redirect
 * must escape the loop regardless. Navigation is skipped on public paths (no
 * protected route to leave) — `replace`, not `href`, so the dead route doesn't
 * linger in history.
 */
export function endDeadSession(): Promise<void> {
  if (!inflightEndSession) {
    inflightEndSession = (async () => {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        // Best-effort: navigate even if the logout round-trip fails.
      }
      if (typeof window !== 'undefined' && !isOnPublicPath()) {
        window.location.replace('/login');
      }
    })().finally(() => {
      inflightEndSession = null;
    });
  }
  return inflightEndSession;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!inflightRefresh) {
    inflightRefresh = (async () => {
      try {
        const res = await fetch(`${API_URL}${REFRESH_PATH}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        return res.ok;
      } catch {
        return false;
      }
    })().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

// The CsrfGuard's rejection message (backend/src/auth/guards/csrf.guard.ts).
// It is a global guard, so an idle-expired session's unsafe request dies on
// this 403 *before* JWT auth can 401 — it must trigger the same refresh.
const CSRF_REJECTION_MESSAGE = 'Invalid CSRF token';

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const isUnsafe = UNSAFE_METHODS.has(method);

  const doFetch = () => {
    // Double-submit cookie: on state-changing requests, read the csrf_token
    // cookie set by the backend on auth and echo it back as a header. Read
    // per attempt — a refresh between attempts rotates the cookie, and the
    // retry must echo the re-minted value, not a stale capture (VEG-277).
    // The header is omitted when the cookie isn't present so callers
    // explicitly overriding the header (e.g. in tests) still win.
    const csrfHeaders: Record<string, string> = {};
    if (isUnsafe) {
      const token = readCookie(CSRF_COOKIE_NAME);
      if (token) csrfHeaders[CSRF_HEADER_NAME] = token;
    }
    return fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...csrfHeaders,
        ...options.headers,
      },
    });
  };

  let res = await doFetch();

  // Never refresh on the refresh endpoint itself — that's how recursion happens.
  if (path !== REFRESH_PATH && (res.status === 401 || (res.status === 403 && isUnsafe))) {
    // A 403 warrants a refresh only when it is the CSRF guard's rejection
    // (idle expiry deleted the csrf cookie) — a genuine authorization denial
    // must surface untouched, without a refresh round-trip.
    let body: { message?: string } | null = null;
    if (res.status === 403) {
      body = await res.json().catch(() => ({}));
      if (body?.message !== CSRF_REJECTION_MESSAGE) {
        throw new ApiError(res.status, errorMessage(body?.message, res.status), body);
      }
    }

    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else if (res.status === 403) {
      // CSRF rejection and the session can't be refreshed: same terminal
      // state as a failed 401 refresh — the user has to log in again.
      await endDeadSession();
      throw new Error('Unauthorized');
    }
  }

  if (res.status === 401) {
    await endDeadSession();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, errorMessage(body.message, res.status), body);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}
