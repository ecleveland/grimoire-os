import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  ambiguousSelectionMessage,
  isAmbiguousSelection,
  retainedSelectionId,
  useTypedSelectionId,
  type IdName,
} from '../content-selection';

const srd: IdName = { id: 'fighter', name: 'Fighter' };
const homebrew: IdName = { id: 'cls-hb', name: 'Fighter' };
const wizard: IdName = { id: 'wizard', name: 'Wizard' };
const catalog = [homebrew, srd, wizard];

describe('isAmbiguousSelection', () => {
  it('is true for a colliding name with no id', () => {
    expect(isAmbiguousSelection(catalog, { id: '', name: 'Fighter' })).toBe(true);
  });

  it('matches the collision case-insensitively, like the resolver', () => {
    expect(isAmbiguousSelection(catalog, { id: null, name: 'fIGHTER' })).toBe(true);
  });

  it('is false once an id picks one of the colliding rows', () => {
    expect(isAmbiguousSelection(catalog, { id: 'cls-hb', name: 'Fighter' })).toBe(false);
  });

  it('is true for a stale id on a colliding name, since nothing resolves', () => {
    expect(isAmbiguousSelection(catalog, { id: 'deleted', name: 'Fighter' })).toBe(true);
  });

  it('is false for a unique name, a custom name, and an empty name', () => {
    expect(isAmbiguousSelection(catalog, { id: '', name: 'Wizard' })).toBe(false);
    expect(isAmbiguousSelection(catalog, { id: '', name: 'Bloodbinder' })).toBe(false);
    expect(isAmbiguousSelection(catalog, { id: '', name: '' })).toBe(false);
    expect(isAmbiguousSelection(catalog, { id: undefined, name: undefined })).toBe(false);
  });
});

describe('ambiguousSelectionMessage', () => {
  it('names the entity and tells the user to pick from the list', () => {
    expect(ambiguousSelectionMessage(catalog, { id: '', name: 'Fighter' }, 'class')).toBe(
      'More than one class is named "Fighter". Pick one from the list.'
    );
  });

  it('is undefined when the selection is not ambiguous', () => {
    expect(ambiguousSelectionMessage(catalog, { id: 'fighter', name: 'Fighter' }, 'class')).toBe(
      undefined
    );
  });
});

describe('retainedSelectionId', () => {
  it('keeps the id when the typed text still names that row', () => {
    expect(retainedSelectionId(catalog, 'cls-hb', 'Fighter')).toBe('cls-hb');
  });

  it('compares case-insensitively', () => {
    expect(retainedSelectionId(catalog, 'cls-hb', 'fighter')).toBe('cls-hb');
  });

  // The stale-id rule: an id must never outlive a name edit away from its row.
  it('clears the id when the text names something else', () => {
    expect(retainedSelectionId(catalog, 'cls-hb', 'Fighte')).toBe('');
    expect(retainedSelectionId(catalog, 'cls-hb', 'Wizard')).toBe('');
  });

  it('clears when there is no remembered id or the id is not in the catalog', () => {
    expect(retainedSelectionId(catalog, '', 'Fighter')).toBe('');
    expect(retainedSelectionId(catalog, 'deleted', 'Fighter')).toBe('');
  });
});

describe('useTypedSelectionId', () => {
  // Typing passes through intermediate strings ("F", "Fi", ...) that clear the
  // id, so the picker has to remember the last id it held to restore it once
  // the text names that row again.
  it('restores the last held id after the text passes through other names', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useTypedSelectionId(catalog, id),
      { initialProps: { id: 'cls-hb' } }
    );
    expect(result.current('Fighterx')).toBe('');
    rerender({ id: '' });
    expect(result.current('F')).toBe('');
    expect(result.current('Fighter')).toBe('cls-hb');
  });

  it('follows a newly picked id', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useTypedSelectionId(catalog, id),
      { initialProps: { id: 'cls-hb' } }
    );
    rerender({ id: 'fighter' });
    expect(result.current('Fighter')).toBe('fighter');
  });

  it('returns blank when no id was ever held', () => {
    const { result } = renderHook(() => useTypedSelectionId(catalog, null));
    expect(result.current('Fighter')).toBe('');
  });
});
