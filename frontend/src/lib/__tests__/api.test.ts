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

function createMockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(k => delete store[k]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
}

describe('apiFetch', () => {
  let mockLocalStorage: ReturnType<typeof createMockLocalStorage>;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockLocalStorage = createMockLocalStorage();
    vi.stubGlobal('localStorage', mockLocalStorage);
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

    it('attaches Authorization header when token exists in localStorage', async () => {
      mockLocalStorage.setItem('token', 'my-jwt-token');
      vi.mocked(fetch).mockResolvedValue(mockResponse(200) as unknown as Response);

      await apiFetch('/test');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-jwt-token',
          }),
        })
      );
    });

    it('omits Authorization header when no token in localStorage', async () => {
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

  describe('401 handling', () => {
    it('throws Error with message "Unauthorized"', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(401) as unknown as Response);

      await expect(apiFetch('/test')).rejects.toThrow('Unauthorized');
    });

    it('removes token from localStorage', async () => {
      mockLocalStorage.setItem('token', 'old-token');
      vi.mocked(fetch).mockResolvedValue(mockResponse(401) as unknown as Response);

      await apiFetch('/test').catch(() => {});

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
    });

    it('removes user from localStorage', async () => {
      mockLocalStorage.setItem('user', '{"id":"1"}');
      vi.mocked(fetch).mockResolvedValue(mockResponse(401) as unknown as Response);

      await apiFetch('/test').catch(() => {});

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('user');
    });

    it('clears auth-flag cookie', async () => {
      document.cookie = 'auth-flag=1; path=/';
      vi.mocked(fetch).mockResolvedValue(mockResponse(401) as unknown as Response);

      await apiFetch('/test').catch(() => {});

      expect(document.cookie).not.toContain('auth-flag=1');
    });

    it('redirects to /login via window.location.href', async () => {
      vi.mocked(fetch).mockResolvedValue(mockResponse(401) as unknown as Response);

      await apiFetch('/test').catch(() => {});

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
