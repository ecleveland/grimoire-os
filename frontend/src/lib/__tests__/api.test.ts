import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from '../api';

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

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
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

    it('redirects to /login when /auth/refresh also returns 401', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response) // initial
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response); // refresh fails

      await expect(apiFetch('/test')).rejects.toThrow('Unauthorized');
      expect(window.location.href).toBe('/login');
    });

    it('redirects to /login when /auth/refresh request itself throws', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response)
        .mockRejectedValueOnce(new Error('network down'));

      await expect(apiFetch('/test')).rejects.toThrow('Unauthorized');
      expect(window.location.href).toBe('/login');
    });

    it('does not refresh on 401 from the refresh endpoint itself (no recursion)', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(mockResponse(401) as unknown as Response);

      await expect(apiFetch('/auth/refresh', { method: 'POST' })).rejects.toThrow('Unauthorized');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(window.location.href).toBe('/login');
    });

    it('throws when retry after refresh still returns 401 and redirects', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response)
        .mockResolvedValueOnce(mockResponse(200) as unknown as Response)
        .mockResolvedValueOnce(mockResponse(401) as unknown as Response);

      await expect(apiFetch('/test')).rejects.toThrow('Unauthorized');
      expect(window.location.href).toBe('/login');
    });
  });

  describe('non-401 error responses', () => {
    it('throws Error with message from response body when available', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockResponse(400, { message: 'Bad request data' }) as unknown as Response
      );

      await expect(apiFetch('/test')).rejects.toThrow('Bad request data');
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
  });
});
