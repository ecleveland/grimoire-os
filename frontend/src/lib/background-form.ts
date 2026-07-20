import type { SrdBackground } from '@/lib/types';
import { optionalText, parseIntInRange, parseLines } from '@/lib/form-helpers';

export { parseLines };

/**
 * Form-state <-> API-payload mapping for the homebrew background form
 * (VEG-431), following the `feat-form` pattern.
 *
 * Most fields the user types live as strings so inputs stay fully controlled;
 * the personality tables are edited as one-entry-per-line text. Skill and tool
 * proficiencies are structured string[] (VEG-474) — skills picked from the
 * canonical set via ToggleChips, tools as open-ended TokenListEditor chips. The
 * origin feat is picked from a combobox: `originFeatId` is only set by an
 * explicit pick, and typing a name that no longer matches the picked feat clears
 * it — the id, not the display name, is what the API stores.
 *
 * Cleared optional fields serialize as `null` (not `undefined`): JSON.stringify
 * drops undefined keys, which would make a PATCH silently keep the old value
 * (VEG-316).
 */

export interface BackgroundFormState {
  name: string;
  description: string;
  // Structured proficiency lists (VEG-474): skills are picked from the canonical
  // 5e set via ToggleChips; tools are open-ended chips via TokenListEditor. Both
  // are already string[] here — no newline round-trip like the free-text tables.
  skillProficiencies: string[];
  toolProficiencies: string[];
  languages: string;
  equipment: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  /** Display name shown in the origin-feat combobox. */
  originFeatName: string;
  /** Set only when a feat was picked from the combobox list. */
  originFeatId: string | null;
  originFeatOption: string;
}

/** Request body for POST/PATCH /srd/backgrounds (mirrors CreateBackgroundDto). */
export interface BackgroundPayload {
  name: string;
  description: string | null;
  skillProficiencies: string[];
  toolProficiencies: string[];
  languages: number;
  equipment: string | null;
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
  originFeatId: string | null;
  originFeatOption: string | null;
}

export type BackgroundFormResult = { payload: BackgroundPayload } | { error: string };

/**
 * Trim, drop blanks, and remove exact duplicates while preserving order. The
 * ToggleChips / TokenListEditor controls keep the live value clean, so this only
 * guards legacy data authored in the free-text era (blank or duplicated entries)
 * from being written straight back on a re-save (VEG-474).
 */
function cleanList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const token = value.trim();
    if (token && !seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

export function emptyBackgroundFormState(): BackgroundFormState {
  return {
    name: '',
    description: '',
    skillProficiencies: [],
    toolProficiencies: [],
    languages: '',
    equipment: '',
    personalityTraits: '',
    ideals: '',
    bonds: '',
    flaws: '',
    originFeatName: '',
    originFeatId: null,
    originFeatOption: '',
  };
}

export function backgroundToFormState(bg: SrdBackground): BackgroundFormState {
  return {
    name: bg.name,
    description: bg.description ?? '',
    // Structured lists round-trip as arrays; ToggleChips renders any saved value
    // outside the canonical set as a removable extra, so legacy/free-typed skills
    // stay visible and editable rather than silently vanishing (VEG-474).
    skillProficiencies: bg.skillProficiencies ?? [],
    toolProficiencies: bg.toolProficiencies ?? [],
    languages: String(bg.languages ?? 0),
    equipment: bg.equipment ?? '',
    personalityTraits: bg.personalityTraits.join('\n'),
    ideals: bg.ideals.join('\n'),
    bonds: bg.bonds.join('\n'),
    flaws: bg.flaws.join('\n'),
    originFeatName: bg.originFeat?.name ?? '',
    originFeatId: bg.originFeat?.id ?? null,
    originFeatOption: bg.originFeatOption ?? '',
  };
}

export function formStateToPayload(s: BackgroundFormState): BackgroundFormResult {
  const name = s.name.trim();
  if (!name) return { error: 'Name is required' };

  // parseIntInRange returns 0 for a blank input (Number('') === 0), which is
  // exactly the blank-defaults-to-none behavior the field wants.
  const languages = parseIntInRange(s.languages, 0);
  if (languages === null) {
    return { error: 'Languages must be a whole number of 0 or more' };
  }

  // A typed-but-unpicked feat name would silently save nothing; make the
  // mismatch loud instead of dropping the user's intent.
  if (s.originFeatName.trim() && !s.originFeatId) {
    return { error: 'Pick the origin feat from the list (SRD or one of your homebrew feats)' };
  }

  const originFeatId = s.originFeatName.trim() ? s.originFeatId : null;

  return {
    payload: {
      name,
      description: optionalText(s.description),
      skillProficiencies: cleanList(s.skillProficiencies),
      toolProficiencies: cleanList(s.toolProficiencies),
      languages,
      equipment: optionalText(s.equipment),
      personalityTraits: parseLines(s.personalityTraits),
      ideals: parseLines(s.ideals),
      bonds: parseLines(s.bonds),
      flaws: parseLines(s.flaws),
      originFeatId,
      // An option is meaningless without a feat — never send one on its own.
      originFeatOption: originFeatId ? optionalText(s.originFeatOption) : null,
    },
  };
}
