import { describe, it, expect, vi, afterEach } from 'vitest';

// BROWSER_API_URL is read once at module load, so each case stubs the env and
// imports a fresh copy of the module.
async function loadApiBase() {
  vi.resetModules();
  return import('../api-base');
}

describe('api-base', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('BROWSER_API_URL', () => {
    it('defaults to the relative /api so the browser calls its own origin', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', '');
      const { BROWSER_API_URL } = await loadApiBase();
      expect(BROWSER_API_URL).toBe('/api');
    });

    it('uses NEXT_PUBLIC_API_URL when it is set', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api');
      const { BROWSER_API_URL } = await loadApiBase();
      expect(BROWSER_API_URL).toBe('http://localhost:3001/api');
    });
  });

  describe('serverApiUrl', () => {
    it('prefers INTERNAL_API_URL', async () => {
      vi.stubEnv('INTERNAL_API_URL', 'http://backend:3001/api');
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api');
      const { serverApiUrl } = await loadApiBase();
      expect(serverApiUrl()).toBe('http://backend:3001/api');
    });

    it('falls back to an absolute NEXT_PUBLIC_API_URL when INTERNAL_API_URL is unset', async () => {
      vi.stubEnv('INTERNAL_API_URL', '');
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3010/api');
      const { serverApiUrl } = await loadApiBase();
      expect(serverApiUrl()).toBe('http://localhost:3010/api');
    });

    it('ignores a relative NEXT_PUBLIC_API_URL, which a server fetch cannot use', async () => {
      vi.stubEnv('INTERNAL_API_URL', '');
      vi.stubEnv('NEXT_PUBLIC_API_URL', '/api');
      const { serverApiUrl } = await loadApiBase();
      expect(serverApiUrl()).toBe('http://localhost:3001/api');
    });

    it('defaults to the dev backend when neither variable is set', async () => {
      vi.stubEnv('INTERNAL_API_URL', '');
      vi.stubEnv('NEXT_PUBLIC_API_URL', '');
      const { serverApiUrl } = await loadApiBase();
      expect(serverApiUrl()).toBe('http://localhost:3001/api');
    });

    it('strips a trailing slash', async () => {
      vi.stubEnv('INTERNAL_API_URL', 'http://backend:3001/api/');
      const { serverApiUrl } = await loadApiBase();
      expect(serverApiUrl()).toBe('http://backend:3001/api');
    });

    it('reads the env on each call, not at module load', async () => {
      vi.stubEnv('INTERNAL_API_URL', 'http://first:3001/api');
      const { serverApiUrl } = await loadApiBase();
      expect(serverApiUrl()).toBe('http://first:3001/api');

      vi.stubEnv('INTERNAL_API_URL', 'http://second:3001/api');
      expect(serverApiUrl()).toBe('http://second:3001/api');
    });
  });
});
