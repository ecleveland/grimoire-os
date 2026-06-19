'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  emptyCharacterFormValues,
  type CharacterFormValues,
} from '@/components/CharacterEditorForm';
import {
  clearSource,
  compileGrantFields,
  setSourceField as setSourceFieldPure,
  setSourceSlice,
  type GrantField,
  type GrantRegistry,
  type GrantSlice,
  type GrantSource,
} from './grants';

export interface CharacterDraftApi {
  /** Compiled view: base fields overlaid with the compiled grant fields. */
  draft: CharacterFormValues;
  /** Write NON-grant base fields (name, class name, saves, speed, features…). */
  onChange: (patch: Partial<CharacterFormValues>) => void;
  /** The raw source-tagged registry (steps read their own slice from it). */
  grants: GrantRegistry;
  /**
   * Idempotently set a source's whole slice, keyed by `identity` (e.g. class id,
   * background id, race name; '' to clear). A no-op — returning `false` — when
   * `identity` is unchanged since the last call, so a step effect re-running on
   * remount or re-render never re-resets the slice. Returns `true` when it
   * applied, letting the caller gate its companion single-source `onChange`
   * writes (saves, subclass reset, species traits) on a genuine selection change.
   * The applied identities live here (in the shell, which doesn't unmount during
   * step navigation), not in step refs.
   */
  reconcileSource: (source: GrantSource, identity: string, slice: GrantSlice) => boolean;
  /** Update one field of a source slice (e.g. the class skill-pool toggles). */
  setSourceField: (source: GrantSource, field: GrantField, values: string[]) => void;
}

export function useCharacterDraft(initial?: {
  base?: Partial<CharacterFormValues>;
  grants?: GrantRegistry;
}): CharacterDraftApi {
  const [base, setBase] = useState<CharacterFormValues>(() => ({
    ...emptyCharacterFormValues(),
    ...initial?.base,
  }));
  const [grants, setGrants] = useState<GrantRegistry>(() => initial?.grants ?? {});
  const appliedIdentity = useRef<Partial<Record<GrantSource, string>>>({});

  const draft = useMemo(() => ({ ...base, ...compileGrantFields(grants) }), [base, grants]);

  const onChange = useCallback(
    (patch: Partial<CharacterFormValues>) => setBase(p => ({ ...p, ...patch })),
    []
  );

  const reconcileSource = useCallback(
    (source: GrantSource, identity: string, slice: GrantSlice): boolean => {
      if (appliedIdentity.current[source] === identity) return false;
      appliedIdentity.current[source] = identity;
      setGrants(reg => (identity ? setSourceSlice(reg, source, slice) : clearSource(reg, source)));
      return true;
    },
    []
  );

  const setSourceField = useCallback(
    (source: GrantSource, field: GrantField, values: string[]) =>
      setGrants(reg => setSourceFieldPure(reg, source, field, values)),
    []
  );

  return { draft, onChange, grants, reconcileSource, setSourceField };
}

type DraftGrantsApi = Pick<CharacterDraftApi, 'grants' | 'reconcileSource' | 'setSourceField'>;

const DraftGrantsContext = createContext<DraftGrantsApi | null>(null);

/** Provide the grant API to the steps that grant (Class, Origin). Lives in the
 * shell, above the swapping step, so its identity is stable across navigation. */
export function DraftProvider({ api, children }: { api: CharacterDraftApi; children: ReactNode }) {
  const value = useMemo<DraftGrantsApi>(
    () => ({
      grants: api.grants,
      reconcileSource: api.reconcileSource,
      setSourceField: api.setSourceField,
    }),
    [api.grants, api.reconcileSource, api.setSourceField]
  );
  return <DraftGrantsContext.Provider value={value}>{children}</DraftGrantsContext.Provider>;
}

export function useDraftGrants(): DraftGrantsApi {
  const ctx = useContext(DraftGrantsContext);
  if (!ctx) throw new Error('useDraftGrants must be used within a DraftProvider');
  return ctx;
}
