import { describe, expect, it } from 'vitest';
import {
  addResource,
  editResource,
  recoverResources,
  removeResource,
} from '@/lib/character-resources';
import type { CharacterResource } from '@/lib/types';

const ki: CharacterResource = { name: 'Ki Points', max: 5, used: 2, recharge: 'short' };
const rage: CharacterResource = { name: 'Rage', max: 3, used: 3, recharge: 'long' };

describe('addResource', () => {
  it('appends to the list', () => {
    expect(addResource([ki], rage)).toEqual([ki, rage]);
  });

  it('starts from an empty list', () => {
    expect(addResource([], ki)).toEqual([ki]);
  });

  it('does not mutate the input list', () => {
    const list = [ki];
    addResource(list, rage);
    expect(list).toHaveLength(1);
  });
});

describe('editResource', () => {
  it('replaces fields at the index, keeping the rest', () => {
    const next = editResource([ki, rage], 1, { name: 'Rage!', max: 4 });
    expect(next[1]).toEqual({ ...rage, name: 'Rage!', max: 4 });
    expect(next[0]).toEqual(ki);
  });

  it('re-clamps used when max shrinks below it', () => {
    const next = editResource([rage], 0, { max: 2 });
    expect(next[0]).toEqual({ ...rage, max: 2, used: 2 });
  });

  it('clamps a directly-set used into 0..max (single home for the clamp rule)', () => {
    expect(editResource([ki], 0, { used: 99 })[0].used).toBe(5);
    expect(editResource([ki], 0, { used: -2 })[0].used).toBe(0);
  });

  it('returns the list unchanged for an out-of-range index', () => {
    expect(editResource([ki], 3, { name: 'X' })).toEqual([ki]);
  });
});

describe('removeResource', () => {
  it('removes the entry at the index', () => {
    expect(removeResource([ki, rage], 0)).toEqual([rage]);
  });

  it('returns the list unchanged for an out-of-range index', () => {
    expect(removeResource([ki], 5)).toEqual([ki]);
  });
});

describe('recoverResources', () => {
  it("short scope resets only recharge:'short' resources", () => {
    expect(recoverResources([ki, rage], 'short')).toEqual([{ ...ki, used: 0 }, rage]);
  });

  it("long scope resets both 'short' and 'long' resources", () => {
    expect(recoverResources([ki, rage], 'long')).toEqual([
      { ...ki, used: 0 },
      { ...rage, used: 0 },
    ]);
  });

  it('handles an empty list', () => {
    expect(recoverResources([], 'long')).toEqual([]);
  });
});
