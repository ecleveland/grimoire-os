import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCharacterDraft } from '../useCharacterDraft';

describe('useCharacterDraft', () => {
  it('compiles the draft from base fields plus the grant registry', () => {
    const { result } = renderHook(() =>
      useCharacterDraft({ base: { name: 'Mialee' }, grants: { class: { skills: ['Arcana'] } } })
    );
    expect(result.current.draft.name).toBe('Mialee');
    expect(result.current.draft.skills).toEqual(['Arcana']);
  });

  it('onChange merges non-grant base fields; grant fields stay registry-driven', () => {
    const { result } = renderHook(() => useCharacterDraft());
    act(() => result.current.onChange({ class: 'Wizard', skills: ['ignored'] }));
    expect(result.current.draft.class).toBe('Wizard');
    // The registry is the sole writer of `skills`; an onChange to it is overridden.
    expect(result.current.draft.skills).toEqual([]);
  });

  it('reconcileSource replaces a source slice and recompiles', () => {
    const { result } = renderHook(() => useCharacterDraft());
    act(() => result.current.reconcileSource('background', 'acolyte', { skills: ['Insight'] }));
    expect(result.current.draft.skills).toEqual(['Insight']);
    act(() => result.current.reconcileSource('background', 'soldier', { skills: ['Athletics'] }));
    expect(result.current.draft.skills).toEqual(['Athletics']);
  });

  it('reconcileSource is a no-op when the identity is unchanged (survives remount churn)', () => {
    const { result } = renderHook(() => useCharacterDraft());
    act(() => result.current.reconcileSource('class', 'fighter', { skills: ['Athletics'] }));
    // Same identity, different slice → guarded, registry unchanged. This is what
    // makes a step re-render / remount idempotent instead of re-resetting.
    act(() => result.current.reconcileSource('class', 'fighter', { skills: ['CLOBBERED'] }));
    expect(result.current.draft.skills).toEqual(['Athletics']);
  });

  it('reconcileSource with an empty identity clears that source', () => {
    const { result } = renderHook(() => useCharacterDraft());
    act(() =>
      result.current.reconcileSource('species', 'elf', { languages: ['Common', 'Elvish'] })
    );
    expect(result.current.draft.languages).toEqual(['Common', 'Elvish']);
    act(() => result.current.reconcileSource('species', '', {}));
    expect(result.current.draft.languages).toEqual([]);
  });

  it('setSourceField updates one field without disturbing the source other fields', () => {
    const { result } = renderHook(() => useCharacterDraft());
    act(() =>
      result.current.reconcileSource('class', 'fighter', {
        proficiencies: ['Martial weapons'],
        skills: [],
      })
    );
    act(() => result.current.setSourceField('class', 'skills', ['Athletics', 'Acrobatics']));
    expect(result.current.draft.skills).toEqual(['Athletics', 'Acrobatics']);
    expect(result.current.draft.proficiencies).toEqual(['Martial weapons']);
  });

  it('keeps a co-granted value when one of its sources is cleared (bug-1 invariant)', () => {
    const { result } = renderHook(() => useCharacterDraft());
    act(() => result.current.setSourceField('class', 'skills', ['Insight']));
    act(() =>
      result.current.reconcileSource('background', 'acolyte', { skills: ['Insight', 'Religion'] })
    );
    expect(result.current.draft.skills).toEqual(['Insight', 'Religion']);
    act(() => result.current.reconcileSource('background', '', {}));
    expect(result.current.draft.skills).toEqual(['Insight']);
  });
});
