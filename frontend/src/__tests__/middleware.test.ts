import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const ORIGIN = 'http://localhost:3000';
const AUTHED = { headers: { cookie: 'session_present=1' } };

function run(path: string, init?: typeof AUTHED) {
  return middleware(new NextRequest(`${ORIGIN}${path}`, init));
}

describe('middleware', () => {
  describe('unauthenticated', () => {
    it('redirects a protected deep link to /login carrying the path and query as next', () => {
      const res = run('/campaigns/1?tab=notes');
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        `${ORIGIN}/login?next=%2Fcampaigns%2F1%3Ftab%3Dnotes`
      );
    });

    it('redirects / to a bare /login with no next param', () => {
      const res = run('/');
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${ORIGIN}/login`);
    });

    it('lets a public SRD page through', () => {
      const res = run('/srd/spells');
      expect(res.headers.get('location')).toBeNull();
    });

    it('treats a path that only shares a public prefix as protected', () => {
      const res = run('/loginfoo');
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${ORIGIN}/login?next=%2Floginfoo`);
    });
  });

  describe('authenticated', () => {
    it('sends a signed-in visit to /login on to a valid next path', () => {
      const res = run('/login?next=%2Fcampaigns%2F1', AUTHED);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${ORIGIN}/campaigns/1`);
    });

    it('sends a signed-in visit to /login with an off-site next to /', () => {
      const res = run('/login?next=https%3A%2F%2Fevil.com', AUTHED);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${ORIGIN}/`);
    });

    it.each([
      ['a tab', '%2F%09%2Fevil.com'],
      ['a newline and backslash', '%2F%0A%5Cevil.com'],
      ['a dot segment that collapses to //', '%2F.%2F%2Fevil.com'],
    ])('sends a signed-in visit to /login whose next hides %s to /', (_label, next) => {
      const res = run(`/login?next=${next}`, AUTHED);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${ORIGIN}/`);
    });

    it('lets a protected page through', () => {
      const res = run('/campaigns/1', AUTHED);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  describe('API proxy', () => {
    const BACKEND = 'http://backend:3001/api';

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    function post(path: string) {
      return middleware(new NextRequest(`${ORIGIN}${path}`, { method: 'POST' }));
    }

    it('rewrites a signed-out login to the backend instead of redirecting it', () => {
      vi.stubEnv('INTERNAL_API_URL', BACKEND);
      const res = post('/api/auth/login');
      expect(res.headers.get('x-middleware-rewrite')).toBe(`${BACKEND}/auth/login`);
      expect(res.headers.get('location')).toBeNull();
    });

    it('keeps the query string', () => {
      vi.stubEnv('INTERNAL_API_URL', BACKEND);
      const res = run('/api/srd/search?q=fire&limit=5');
      expect(res.headers.get('x-middleware-rewrite')).toBe(`${BACKEND}/srd/search?q=fire&limit=5`);
    });

    it('maps /api alone to the backend base', () => {
      vi.stubEnv('INTERNAL_API_URL', BACKEND);
      const res = run('/api');
      expect(res.headers.get('x-middleware-rewrite')).toBe(BACKEND);
    });

    it('reads INTERNAL_API_URL on each request', () => {
      vi.stubEnv('INTERNAL_API_URL', 'http://first:3001/api');
      expect(run('/api/health').headers.get('x-middleware-rewrite')).toBe(
        'http://first:3001/api/health'
      );

      vi.stubEnv('INTERNAL_API_URL', 'http://second:3001/api');
      expect(run('/api/health').headers.get('x-middleware-rewrite')).toBe(
        'http://second:3001/api/health'
      );
    });

    it('rewrites a signed-in API call too', () => {
      vi.stubEnv('INTERNAL_API_URL', BACKEND);
      const res = run('/api/users/me', AUTHED);
      expect(res.headers.get('x-middleware-rewrite')).toBe(`${BACKEND}/users/me`);
    });

    it('treats a path that only shares the /api prefix as a protected page', () => {
      vi.stubEnv('INTERNAL_API_URL', BACKEND);
      const res = run('/apix');
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${ORIGIN}/login?next=%2Fapix`);
      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    });
  });

  describe('session cookie', () => {
    it('lets a protected page through on session_present alone, with no access cookie', () => {
      const res = run('/campaigns/1', { headers: { cookie: 'session_present=1' } });
      expect(res.headers.get('location')).toBeNull();
    });

    it('treats an access cookie without session_present as signed out', () => {
      const res = run('/campaigns/1', { headers: { cookie: 'access_token=abc' } });
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${ORIGIN}/login?next=%2Fcampaigns%2F1`);
    });

    it('treats an empty session_present value as signed out', () => {
      const res = run('/campaigns/1', { headers: { cookie: 'session_present=' } });
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${ORIGIN}/login?next=%2Fcampaigns%2F1`);
    });

    it('sends /login on to next when only session_present is set', () => {
      const res = run('/login?next=%2Fcampaigns%2F1', {
        headers: { cookie: 'session_present=1' },
      });
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${ORIGIN}/campaigns/1`);
    });
  });
});
