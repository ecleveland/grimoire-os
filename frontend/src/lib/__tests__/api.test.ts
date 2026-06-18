import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ApiError } from '../api';

const API_URL = 'http://localhost:3001/api';

function mockResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body ?? {}),
  };
}

describe('apiFetch', () => {
  const originalLocation = window.location;
  const originalCookie = Object.getOwnPropertyDescriptor(document, 'cookie');

  function setCookie(value: string) {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => value,
    });
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(window, 'location', {
      writable: true,
      // `replace` is a Location prototype method, so the spread above doesn't
      // copy it — stub it explicitly so endDeadSession's navigation is a no-op
      // we can assert on. Default pathname '/' is a protected (non-public) path.
      value: { ...originalLocation, href: '', pathname: '/', replace: vi.fn() },
    });
    setCookie('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
    if (originalCookie) Object.defineProperty(document, 'cookie', originalCookie);
  });

  describe('request construction', () => {
    it('prepends API_URL to the path', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200, { ok: true }) as unknown as Response);

      await apiFetch('/test');

      expect(fetch).toHaveBeenCalledWith(`${API_URL}/test`, expect.any(Object));
    });

    it('sets Content-Type to application/json by default', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);

      await apiFetch('/test');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('sends credentials so the httpOnly auth cookie rides along', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);

      await apiFetch('/test');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('never attaches an Authorization header (cookie auth only)', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);

      await apiFetch('/test');

      const callHeaders = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(callHeaders).not.toHaveProperty('Authorization');
    });

    it('merges custom headers from options, preserving caller overrides', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);

      await apiFetch('/test', {
        headers: { 'X-Custom': 'value', 'Content-Type': 'text/plain' },
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'value',
            'Content-Type': 'text/plain',
          }),
        })
      );
    });

    it('passes through request options (method, body)', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);

      await apiFetch('/test', {
        method: 'POST',
        body: JSON.stringify({ key: 'value' }),
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ key: 'value' }),
        })
      );
    });
  });

  describe('CSRF double-submit', () => {
    it('attaches the x-csrf-token header from the csrf_token cookie on POST', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);
      setCookie('csrf_token=secret-csrf-value');

      await apiFetch('/things', { method: 'POST', body: '{}' });

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['x-csrf-token']).toBe('secret-csrf-value');
    });

    it.each(['PUT', 'PATCH', 'DELETE'])('attaches the x-csrf-token header on %s', async method => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);
      setCookie('csrf_token=tok');

      await apiFetch('/things/1', { method });

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['x-csrf-token']).toBe('tok');
    });

    it('does not attach the header on GET', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);
      setCookie('csrf_token=tok');

      await apiFetch('/things');

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers).not.toHaveProperty('x-csrf-token');
    });

    it('omits the header when no csrf_token cookie is present (avoids sending empty values)', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);

      await apiFetch('/things', { method: 'POST' });

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers).not.toHaveProperty('x-csrf-token');
    });

    it('parses csrf_token correctly when other cookies are present', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);
      setCookie('foo=bar; csrf_token=abc; baz=qux');

      await apiFetch('/things', { method: 'POST' });

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['x-csrf-token']).toBe('abc');
    });

    it('lets a caller-provided x-csrf-token header take precedence', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);
      setCookie('csrf_token=from-cookie');

      await apiFetch('/things', {
        method: 'POST',
        headers: { 'x-csrf-token': 'caller-override' },
      });

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['x-csrf-token']).toBe('caller-override');
    });
  });

  describe('successful responses', () => {
    it('returns parsed JSON for 200 response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(200, { data: 'hello' }) as unknown as Response
      );

      const result = await apiFetch('/test');

      expect(result).toEqual({ data: 'hello' });
    });

    it('returns undefined for 204 response', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(204) as unknown as Response);

      const result = await apiFetch('/test');

      expect(result).toBeUndefined();
    });
  });

  describe('401 handling with refresh', () => {
    it('attempts /auth/refresh on 401 and retries the original request on success', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response) // initial
        .mockResolvedValueOnce(mockResponse(200) as unknown as Response) // /auth/refresh
        .mockResolvedValueOnce(mockResponse(200, { ok: true }) as unknown as Response); // retry

      const result = await apiFetch('/test');

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const refreshCall = fetchMock.mock.calls[1];
      expect(refreshCall[0]).toBe(`${API_URL}/auth/refresh`);
      expect(refreshCall[1]).toEqual(
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
    });

    it('clears the dead session and lands on /login when /auth/refresh also returns 401', async () => {
      // VEG-419: a terminal 401 must clear the stale (httpOnly) cookies via
      // POST /auth/logout before navigating, so the middleware's presence check
      // stops disagreeing with reality and can't bounce /login back to /.
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response) // initial
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response) // refresh fails
        .mockResolvedValueOnce(mockResponse(204) as unknown as Response); // /auth/logout

      await expect(apiFetch('/test')).rejects.toThrow('Unauthorized');

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/auth/logout`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(window.location.replace).toHaveBeenCalledWith('/login');
    });

    it('clears the dead session and lands on /login when /auth/refresh request itself throws', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response)
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(mockResponse(204) as unknown as Response); // /auth/logout

      await expect(apiFetch('/test')).rejects.toThrow('Unauthorized');

      expect(window.location.replace).toHaveBeenCalledWith('/login');
    });

    it('still navigates to /login even when the /auth/logout cleanup call fails', async () => {
      // The clear-and-redirect must escape the loop regardless of whether the
      // logout round-trip itself succeeds.
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response)
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response) // refresh fails
        .mockRejectedValueOnce(new Error('network down')); // logout fails

      await expect(apiFetch('/test')).rejects.toThrow('Unauthorized');

      expect(window.location.replace).toHaveBeenCalledWith('/login');
    });

    it('does not refresh on 401 from the refresh endpoint itself (no recursion)', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response) // /auth/refresh
        .mockResolvedValueOnce(mockResponse(204) as unknown as Response); // /auth/logout cleanup

      await expect(apiFetch('/auth/refresh', { method: 'POST' })).rejects.toThrow('Unauthorized');
      // One call for the refresh request, one for the logout cleanup — never a
      // recursive refresh-on-refresh.
      const refreshCalls = fetchMock.mock.calls.filter(c => c[0] === `${API_URL}/auth/refresh`);
      expect(refreshCalls).toHaveLength(1);
      expect(window.location.replace).toHaveBeenCalledWith('/login');
    });

    it('throws and clears the session when the retry after refresh still returns 401', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response)
        .mockResolvedValueOnce(mockResponse(200) as unknown as Response)
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response)
        .mockResolvedValueOnce(mockResponse(204) as unknown as Response); // /auth/logout

      await expect(apiFetch('/test')).rejects.toThrow('Unauthorized');
      expect(window.location.replace).toHaveBeenCalledWith('/login');
    });

    it('clears the session once under a burst of concurrent 401s (no logout/redirect storm)', async () => {
      // VEG-419 AC: a single dead-session detection must not fan out into a
      // logout-per-request storm. The inflight dedup collapses N terminal 401s
      // into one /auth/logout and one navigation.
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockImplementation(async (url: string | URL | Request) => {
        if (typeof url === 'string' && url.endsWith('/auth/logout')) {
          return mockResponse(204) as unknown as Response;
        }
        return mockResponse(401) as unknown as Response; // every request + refresh 401s
      });

      const results = await Promise.allSettled([apiFetch('/a'), apiFetch('/b'), apiFetch('/c')]);
      expect(results.every(r => r.status === 'rejected')).toBe(true);

      const logoutCalls = fetchMock.mock.calls.filter(c => c[0] === `${API_URL}/auth/logout`);
      expect(logoutCalls).toHaveLength(1);
      expect(window.location.replace).toHaveBeenCalledTimes(1);
    });

    it('clears the dead session but does NOT navigate when already on a public path', async () => {
      // No /-↔-/login bounce if the user is already on /login: clear cookies,
      // but don't re-navigate.
      (window.location as unknown as { pathname: string }).pathname = '/login';
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response)
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response) // refresh fails
        .mockResolvedValueOnce(mockResponse(204) as unknown as Response); // /auth/logout

      await expect(apiFetch('/test')).rejects.toThrow('Unauthorized');

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/auth/logout`,
        expect.objectContaining({ method: 'POST' })
      );
      expect(window.location.replace).not.toHaveBeenCalled();
    });
  });

  describe('CSRF recovery (VEG-277)', () => {
    // The csrf_token cookie shares the access cookie's 15-minute maxAge and
    // is rotated by /auth/refresh. After idle expiry the browser has deleted
    // both, so a stale tab's first unsafe request is rejected 403 "Invalid
    // CSRF token" by the global CsrfGuard *before* JWT auth can 401 — the
    // refresh that would re-mint both cookies must be triggered from the
    // CSRF rejection too.

    it('refreshes and retries once when a POST is rejected with the CSRF 403', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(
          mockResponse(403, { message: 'Invalid CSRF token' }) as unknown as Response
        )
        .mockImplementationOnce(async () => {
          // /auth/refresh re-mints the rotated csrf cookie alongside the
          // access cookie.
          setCookie('csrf_token=re-minted');
          return mockResponse(200) as unknown as Response;
        })
        .mockResolvedValueOnce(mockResponse(200, { ok: true }) as unknown as Response);

      const result = await apiFetch('/srd/cards', { method: 'POST', body: '{}' });

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1][0]).toBe(`${API_URL}/auth/refresh`);
      const retryHeaders = fetchMock.mock.calls[2][1]?.headers as Record<string, string>;
      expect(retryHeaders['x-csrf-token']).toBe('re-minted');
    });

    it('sends the rotated csrf token on the retry after a 401-triggered refresh', async () => {
      // Latent variant of the same bug: the header used to be captured once
      // before the first attempt, so the post-refresh retry echoed the stale
      // token and died on the CSRF guard despite a successful refresh.
      setCookie('csrf_token=stale');
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response)
        .mockImplementationOnce(async () => {
          setCookie('csrf_token=rotated');
          return mockResponse(200) as unknown as Response;
        })
        .mockResolvedValueOnce(mockResponse(200, { ok: true }) as unknown as Response);

      await apiFetch('/things', { method: 'POST', body: '{}' });

      const retryHeaders = fetchMock.mock.calls[2][1]?.headers as Record<string, string>;
      expect(retryHeaders['x-csrf-token']).toBe('rotated');
    });

    it('surfaces a genuine authorization 403 unchanged without attempting a refresh', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        mockResponse(403, { message: 'Forbidden resource' }) as unknown as Response
      );

      await expect(apiFetch('/admin/users', { method: 'POST', body: '{}' })).rejects.toThrow(
        'Forbidden resource'
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not treat a CSRF-worded 403 on a GET as refreshable (safe methods skip the guard)', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        mockResponse(403, { message: 'Invalid CSRF token' }) as unknown as Response
      );

      await expect(apiFetch('/things')).rejects.toThrow('Invalid CSRF token');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('clears the dead session and lands on /login when the refresh after a CSRF 403 fails', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(
          mockResponse(403, { message: 'Invalid CSRF token' }) as unknown as Response
        )
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response) // refresh fails
        .mockResolvedValueOnce(mockResponse(204) as unknown as Response); // /auth/logout

      await expect(apiFetch('/srd/cards', { method: 'POST', body: '{}' })).rejects.toThrow(
        'Unauthorized'
      );
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/auth/logout`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(window.location.replace).toHaveBeenCalledWith('/login');
    });

    it('throws the CSRF error without looping when the retry is rejected again', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(
          mockResponse(403, { message: 'Invalid CSRF token' }) as unknown as Response
        )
        .mockResolvedValueOnce(mockResponse(200) as unknown as Response) // refresh ok
        .mockResolvedValueOnce(
          mockResponse(403, { message: 'Invalid CSRF token' }) as unknown as Response
        ); // retry still rejected

      await expect(apiFetch('/srd/cards', { method: 'POST', body: '{}' })).rejects.toThrow(
        'Invalid CSRF token'
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('non-401 error responses', () => {
    it('throws Error with message from response body when available', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(400, { message: 'Bad request data' }) as unknown as Response
      );

      await expect(apiFetch('/test')).rejects.toThrow('Bad request data');
    });

    it('joins array messages (Nest validation 400s) instead of String-coercing them', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(400, {
          message: ['gp must be ordered', 'weight must be ≥ 0'],
        }) as unknown as Response
      );

      await expect(apiFetch('/test')).rejects.toThrow('gp must be ordered; weight must be ≥ 0');
    });

    it('throws Error with status code fallback when body has no message', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(500, {}) as unknown as Response);

      await expect(apiFetch('/test')).rejects.toThrow('API error: 500');
    });

    it('throws Error with status code fallback when body is not JSON', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 502,
        json: vi.fn().mockRejectedValue(new Error('not json')),
      } as unknown as Response);

      await expect(apiFetch('/test')).rejects.toThrow('API error: 502');
    });

    it('throws an ApiError carrying the HTTP status and response body', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(409, {
          message: 'Encounter was modified by another request; re-fetch and retry.',
          currentVersion: 7,
        }) as unknown as Response
      );

      const err = await apiFetch('/encounters/enc-1', { method: 'PATCH' }).catch(e => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(409);
      expect(err.message).toMatch(/modified by another request/i);
      expect((err.body as { currentVersion: number }).currentVersion).toBe(7);
    });
  });
});
