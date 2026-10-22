import { describe, it, expect } from 'vitest';
import { hasSessionCookie } from '@/lib/session-cookie';

describe('hasSessionCookie', () => {
  it('is true for a non-empty value', () => {
    expect(hasSessionCookie('1')).toBe(true);
  });

  it('is false for an empty value', () => {
    expect(hasSessionCookie('')).toBe(false);
  });

  it('is false when the cookie is missing', () => {
    expect(hasSessionCookie(undefined)).toBe(false);
  });
});
