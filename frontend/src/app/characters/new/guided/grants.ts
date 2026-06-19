import type { CharacterFormValues } from '@/components/CharacterEditorForm';

/**
 * Source-tagged grant registry for the guided builder (VEG-393).
 *
 * The draft's `skills` / `proficiencies` / `languages` are flat, un-sourced
 * `string[]`s written by several steps. Tracking "who granted what" in ephemeral
 * step refs reconciled imperfectly across step navigation (refs reset on remount;
 * a background's contribution couldn't be told apart from a coincident class
 * pick). This registry gives those three fields the same source-tagging that
 * `features` already carry: each source (class / background / species) owns a
 * slice, a step replaces its whole slice idempotently from the current selection,
 * and the flat arrays are recompiled by union-deduping across sources. Clearing
 * or switching a source touches exactly that source's contribution.
 *
 * Only the three colliding grant fields live here. Single-source scalar/array
 * fields (saving throws, armor, speed, size) stay on the plain draft via
 * `onChange`. `features` are also multi-source but reconcile via their own
 * inline `source` tag in OriginStep (so the sheet can group them) rather than
 * through this registry — the two mechanisms are intentionally parallel.
 */
export type GrantSource = 'class' | 'background' | 'species';

export type GrantField = 'skills' | 'proficiencies' | 'languages';

/** One source's contribution to the grant fields. Absent field = "no opinion". */
export type GrantSlice = Partial<Record<GrantField, string[]>>;

/** Per-source slices. The hook owns one of these as builder-only state. */
export type GrantRegistry = Partial<Record<GrantSource, GrantSlice>>;

/** Fixed iteration order so compiled arrays are deterministic across renders. */
const SOURCE_ORDER: GrantSource[] = ['class', 'background', 'species'];
const GRANT_FIELDS: GrantField[] = ['skills', 'proficiencies', 'languages'];

/** Replace a source's entire slice (idempotent set, not a delta merge). */
export function setSourceSlice(
  reg: GrantRegistry,
  source: GrantSource,
  slice: GrantSlice
): GrantRegistry {
  return { ...reg, [source]: slice };
}

/**
 * Update a single field of a source's slice, preserving its other fields. Used
 * to *refine* a slice a source has already established via `setSourceSlice`
 * (e.g. the class skill-pool toggles updating the `class` slice's `skills`); it
 * does not register an applied identity, so a source is normally reconciled
 * first and refined second.
 */
export function setSourceField(
  reg: GrantRegistry,
  source: GrantSource,
  field: GrantField,
  values: string[]
): GrantRegistry {
  return { ...reg, [source]: { ...reg[source], [field]: values } };
}

/** Drop a source entirely (e.g. a background/species cleared). */
export function clearSource(reg: GrantRegistry, source: GrantSource): GrantRegistry {
  if (!(source in reg)) return reg;
  const next = { ...reg };
  delete next[source];
  return next;
}

/**
 * Compile the registry into the three flat draft fields: for each field, union
 * every source's values in `SOURCE_ORDER`, keeping the first occurrence (stable
 * dedupe). The result is assignable straight onto the draft.
 */
export function compileGrantFields(reg: GrantRegistry): Pick<CharacterFormValues, GrantField> {
  const out = { skills: [], proficiencies: [], languages: [] } as Pick<
    CharacterFormValues,
    GrantField
  >;
  for (const field of GRANT_FIELDS) {
    const seen = new Set<string>();
    for (const source of SOURCE_ORDER) {
      for (const value of reg[source]?.[field] ?? []) {
        if (!seen.has(value)) {
          seen.add(value);
          out[field].push(value);
        }
      }
    }
  }
  return out;
}
