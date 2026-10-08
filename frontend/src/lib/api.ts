import { isPublicPath, loginPathFor } from './public-paths';

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
let inflightRefresh: Promise<RefreshOutcome> | null = null;

// In-flight dead-session teardown — same dedup idea as inflightRefresh: a burst
// of terminal 401s must collapse into a single logout + navigation, not a
// logout-per-request storm (VEG-419).
let inflightEndSession: Promise<void> | null = null;

function isOnPublicPath(): boolean {
  if (typeof window === 'undefined') return false;
  return isPublicPath(window.location.pathname);
}

/**
 * Resolve an unrestorable session to a clean logged-out state (VEG-419).
 *
 * The access/refresh cookies are httpOnly, so client JS can't clear them via
 * `document.cookie` — only the server can. We POST `/auth/logout` (which works
 * even with an invalid/absent session and clears all four auth cookies), then
 * navigate to `/login`, carrying the current path and query as `next` so the
 * user returns there after signing in. Clearing the cookies is the crux: it stops the
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
        // Under the refresh lock, so another tab's refresh can't land fresh
        // cookies after the server has cleared them.
        await withRefreshLock(() =>
          fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
          })
        );
      } catch {
        // Best-effort: navigate even if the logout round-trip fails.
      }
      if (typeof window !== 'undefined' && !isOnPublicPath()) {
        const { pathname, search } = window.location;
        window.location.replace(loginPathFor(pathname + search));
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

/**
 * How a refresh ended: the server issued new cookies, the server answered
 * with an error (expired, revoked, throttled), or the request never got an
 * answer at all.
 */
export type RefreshOutcome = 'refreshed' | 'rejected' | 'unreachable';

/**
 * The refresh request never got an answer, or got one that says nothing
 * about the session (a gateway or server error). The session may still be
 * live, so callers must not treat this as a logout.
 */
export class NetworkError extends Error {
  constructor() {
    super('Could not reach the server');
    this.name = 'NetworkError';
  }
}

// Web Locks are scoped per origin and per browser profile, the same set of
// tabs that share the cookie jar, so one refresh under this lock serves them
// all. The backend rotates the refresh token on use, so a second tab posting
// the same token would only replay a spent one.
const REFRESH_LOCK_NAME = 'grimoire-os:auth-refresh';

function webLocks(): LockManager | null {
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
}

/**
 * Run `fn` while holding the cross-tab refresh lock, or directly in browsers
 * without Web Locks. Logout uses it so no tab's refresh can land new cookies
 * after the server has cleared them.
 */
export async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = webLocks();
  return locks ? await locks.request(REFRESH_LOCK_NAME, () => fn()) : fn();
}

async function postRefresh(): Promise<RefreshOutcome> {
  try {
    const res = await fetch(`${API_URL}${REFRESH_PATH}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) return 'refreshed';
    // Expired, revoked or throttled: the server has judged this session.
    if (res.status === 401 || res.status === 403 || res.status === 429) return 'rejected';
    // Any other error status gave no verdict on the session.
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
}

// Another tab's refresh may already have put new cookies in the shared jar,
// so a working /users/me means there is nothing left to refresh.
async function refreshedElsewhere(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/users/me`, { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

// A tab that lost a refresh race (no Web Locks, or the winner's cookies
// landed late) gets a 401 for the token the winner just rotated. Logging out
// on that would revoke the winner's fresh session for every tab, so a
// rejection counts only when /users/me fails too.
async function refreshOrAdopt(): Promise<RefreshOutcome> {
  const outcome = await postRefresh();
  if (outcome !== 'rejected') return outcome;
  return (await refreshedElsewhere()) ? 'refreshed' : 'rejected';
}

async function refreshAcrossTabs(): Promise<RefreshOutcome> {
  const locks = webLocks();
  if (!locks) return refreshOrAdopt();
  const outcome = await locks.request(REFRESH_LOCK_NAME, { ifAvailable: true }, lock =>
    lock ? refreshOrAdopt() : null
  );
  if (outcome) return outcome;
  return locks.request(REFRESH_LOCK_NAME, async () =>
    (await refreshedElsewhere()) ? 'refreshed' : refreshOrAdopt()
  );
}

/**
 * POST /auth/refresh through the tab's one in-flight request, under the
 * cross-tab refresh lock. The backend rotates the refresh token on first use,
 * so every refresh in a tab must share this, and tabs take turns.
 */
export function refreshSession(): Promise<RefreshOutcome> {
  if (!inflightRefresh) {
    inflightRefresh = refreshAcrossTabs().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

/** Settles once this tab's in-flight refresh does, or at once when none is running. */
export async function awaitInflightRefresh(): Promise<void> {
  if (inflightRefresh) await inflightRefresh;
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

    const outcome = await refreshSession();
    switch (outcome) {
      case 'refreshed':
        res = await doFetch();
        break;
      case 'unreachable':
        // No verdict on the session, so keep its cookies and let the caller
        // surface a connectivity error instead of a logout.
        throw new NetworkError();
      case 'rejected':
        if (res.status === 403) {
          // CSRF rejection and the session can't be refreshed: same terminal
          // state as a failed 401 refresh — the user has to log in again.
          await endDeadSession();
          throw new Error('Unauthorized');
        }
        break;
      default: {
        const _exhaustive: never = outcome;
        throw new Error(`Unhandled refresh outcome: ${String(_exhaustive)}`);
      }
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

  // Tiered detail endpoints send null for a row the caller can't see, and that
  // null arrives as a 200 with an empty body.
  const text = await res.text();
  if (!text) return null as T;
  return JSON.parse(text);
}
