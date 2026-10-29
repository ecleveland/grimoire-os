import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rememberCopiedFrom, takeCopiedFrom } from '../copied-from';

const KEY = 'copied-from:char-2';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('copied-from session note (VEG-646)', () => {
  it('returns the remembered origin once and removes the key', () => {
    rememberCopiedFrom('char-2', { name: 'Vex', level: 5 });
    expect(sessionStorage.getItem(KEY)).not.toBeNull();

    expect(takeCopiedFrom('char-2')).toEqual({ name: 'Vex', level: 5 });
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(takeCopiedFrom('char-2')).toBeNull();
  });

  it('returns null when nothing was remembered for the id', () => {
    rememberCopiedFrom('char-3', { name: 'Vex', level: 5 });
    expect(takeCopiedFrom('char-2')).toBeNull();
  });

  it.each([
    ['malformed JSON', '{not json'],
    ['a non-object', '"Vex"'],
    ['null', 'null'],
    ['a missing level', JSON.stringify({ name: 'Vex' })],
    ['a non-numeric level', JSON.stringify({ name: 'Vex', level: '5' })],
    ['a non-string name', JSON.stringify({ name: 5, level: 5 })],
  ])('returns null for %s and still removes the key', (_desc, stored) => {
    sessionStorage.setItem(KEY, stored);
    expect(takeCopiedFrom('char-2')).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('returns null without throwing when sessionStorage throws on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => takeCopiedFrom('char-2')).not.toThrow();
    expect(takeCopiedFrom('char-2')).toBeNull();
  });

  it('swallows a sessionStorage that throws on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => rememberCopiedFrom('char-2', { name: 'Vex', level: 5 })).not.toThrow();
  });
});
