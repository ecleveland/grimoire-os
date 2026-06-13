import type { SrdSpell } from '@/lib/types';
import { optionalText, parseCommaList } from '@/lib/form-helpers';

/**
 * Form-state <-> API-payload mapping for the homebrew spell form (VEG-294).
 *
 * Everything the user types lives as strings (level included) so inputs stay
 * fully controlled; the class list is edited as comma-separated text and the
 * ritual/concentration flags as booleans. `formStateToPayload` validates and
 * converts in one step, returning either the request body or the first
 * human-readable error.
 *
 * Cleared optional fields serialize as `null` (not `undefined`): JSON.stringify
 * drops undefined keys, which would make a PATCH silently keep the old value
 * (VEG-316).
 */

export interface SpellFormState {
  name: string;
  level: string;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  classes: string;
  ritual: boolean;
  concentration: boolean;
  material: string;
  higherLevels: string;
}

/** Request body for POST/PATCH /srd/spells (mirrors the backend CreateSpellDto). */
export interface SpellPayload {
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  classes: string[];
  ritual: boolean;
  concentration: boolean;
  material: string | null;
  higherLevels: string | null;
}

export type SpellFormResult = { payload: SpellPayload } | { error: string };

// Re-exported so existing imports keep working; the single implementation
// lives in form-helpers (shared with monster/item-form).
export { parseCommaList };

export function emptySpellFormState(): SpellFormState {
  return {
    name: '',
    level: '0',
    school: '',
    castingTime: '',
    range: '',
    components: '',
    duration: '',
    description: '',
    classes: '',
    ritual: false,
    concentration: false,
    material: '',
    higherLevels: '',
  };
}

export function spellToFormState(s: SrdSpell): SpellFormState {
  return {
    name: s.name,
    level: String(s.level),
    school: s.school,
    castingTime: s.castingTime,
    range: s.range,
    components: s.components,
    duration: s.duration,
    description: s.description,
    classes: s.classes.join(', '),
    ritual: s.ritual,
    concentration: s.concentration,
    material: s.material ?? '',
    higherLevels: s.higherLevels ?? '',
  };
}

export function formStateToPayload(s: SpellFormState): SpellFormResult {
  const name = s.name.trim();
  if (!name) return { error: 'Name is required' };

  const level = Number(s.level.trim());
  if (!Number.isInteger(level) || level < 0 || level > 9) {
    return { error: 'Level must be a whole number between 0 and 9' };
  }

  const school = s.school.trim();
  if (!school) return { error: 'School is required' };
  const castingTime = s.castingTime.trim();
  if (!castingTime) return { error: 'Casting time is required' };
  const range = s.range.trim();
  if (!range) return { error: 'Range is required' };
  const components = s.components.trim();
  if (!components) return { error: 'Components are required' };
  const duration = s.duration.trim();
  if (!duration) return { error: 'Duration is required' };
  const description = s.description.trim();
  if (!description) return { error: 'Description is required' };

  return {
    payload: {
      name,
      level,
      school,
      castingTime,
      range,
      components,
      duration,
      description,
      classes: parseCommaList(s.classes),
      ritual: s.ritual,
      concentration: s.concentration,
      material: optionalText(s.material),
      higherLevels: optionalText(s.higherLevels),
    },
  };
}
