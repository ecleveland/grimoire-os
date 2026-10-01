import { describe, it, expect } from 'vitest';
import { isPublicPath, loginPathFor, resolveNextPath, withNext } from '../public-paths';

describe('isPublicPath', () => {
  it.each(['/login', '/login/', '/register', '/srd', '/srd/spells'])(
    'treats %s as public',
    path => {
      expect(isPublicPath(path)).toBe(true);
    }
  );

  it.each(['/loginfoo', '/srdx', '/', '/campaigns/1'])('treats %s as protected', path => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe('resolveNextPath', () => {
  it('passes a same-origin relative path through unchanged', () => {
    expect(resolveNextPath('/campaigns/1?tab=notes')).toBe('/campaigns/1?tab=notes');
  });

  it.each([
    ['a protocol-relative URL', '//evil.com'],
    ['a backslash host', '/\\evil.com'],
    ['an absolute URL', 'https://evil.com'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['an empty string', ''],
    ['the root', '/'],
    ['a dot segment that collapses to //', '/.//evil.com'],
    ['a parent segment that collapses to //', '/a/..//evil.com'],
    ['an encoded dot segment that collapses to //', '/%2e//evil.com'],
  ])('falls back to / for %s', (_label, raw) => {
    expect(resolveNextPath(raw)).toBe('/');
  });

  it('falls back to / for a backslash anywhere in the path', () => {
    expect(resolveNextPath('/campaigns\\1')).toBe('/');
  });

  it.each([
    ['a tab before a second slash', '/\t/evil.com'],
    ['a newline before a backslash', '/\n\\evil.com'],
    ['a carriage return before a second slash', '/\r/evil.com'],
    ['a null byte', '/\x00evil'],
  ])('falls back to / for a path with %s', (_label, raw) => {
    expect(resolveNextPath(raw)).toBe('/');
  });

  it('normalises dot segments and keeps the hash', () => {
    expect(resolveNextPath('/a/../campaigns/1#notes')).toBe('/campaigns/1#notes');
  });

  it('falls back to / for null and undefined', () => {
    expect(resolveNextPath(null)).toBe('/');
    expect(resolveNextPath(undefined)).toBe('/');
  });
});

describe('loginPathFor', () => {
  it('returns bare /login for the root or an empty target', () => {
    expect(loginPathFor('/')).toBe('/login');
    expect(loginPathFor('')).toBe('/login');
  });

  it('carries the target path and query as an encoded next param', () => {
    expect(loginPathFor('/campaigns/1?tab=notes')).toBe(
      '/login?next=%2Fcampaigns%2F1%3Ftab%3Dnotes'
    );
  });
});

describe('withNext', () => {
  it('returns the bare path when next is null or empty', () => {
    expect(withNext('/register', null)).toBe('/register');
    expect(withNext('/register', '')).toBe('/register');
  });

  it('appends an encoded next param when next is set', () => {
    expect(withNext('/login', '/campaigns/1')).toBe('/login?next=%2Fcampaigns%2F1');
  });
});
