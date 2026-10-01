import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const ORIGIN = 'http://localhost:3000';
const AUTHED = { headers: { cookie: 'access_token=abc' } };

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
});
