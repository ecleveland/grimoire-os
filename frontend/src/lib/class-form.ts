import type { ClassFeatureDraft } from '@/components/ClassFeaturesEditor';
import { MAX_LEVEL } from '@/lib/character-level';
import { sameFeatures, toFeatureRows, validateFeatures } from '@/lib/feature-rows';
import { cleanList, optionalText, parseIntInRange } from '@/lib/form-helpers';
import { DEFAULT_HIT_DIE, type SrdClass } from '@/lib/types';

/**
 * Form-state and API-payload mapping for the homebrew class form.
 *
 * Typed boxes hold strings so the inputs stay fully controlled. The ability,
 * skill and proficiency lists are string[] edited through chip controls.
 *
 * The payload has no `spellcasting`, `equipmentChoices` or `multiclassing` key.
 * The form doesn't edit those rules, and a PATCH that omits a key leaves the
 * stored value alone, so leaving them out is what preserves them.
 */

export interface ClassFormState {
  name: string;
  hitDie: string;
  description: string;
  primaryAbilities: string[];
  savingThrows: string[];
  skillChoices: string[];
  numSkillChoices: string;
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  subclassLevel: string;
  features: ClassFeatureDraft[];
}

/** Request body for POST and PATCH /srd/classes. */
export interface ClassPayload {
  name: string;
  hitDie: string;
  description: string | null;
  primaryAbilities: string[];
  savingThrows: string[];
  skillChoices: string[];
  numSkillChoices: number;
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  subclassLevel: number | null;
  /**
   * Sent only when the list changed. The API replaces every stored row and gives
   * each a new id, which orphans print-tray entries that still hold the old ones.
   */
  features?: ClassFeatureDraft[];
}

export type ClassFormResult = { payload: ClassPayload } | { error: string };

export function emptyClassFormState(): ClassFormState {
  return {
    name: '',
    hitDie: DEFAULT_HIT_DIE,
    description: '',
    primaryAbilities: [],
    savingThrows: [],
    skillChoices: [],
    numSkillChoices: '0',
    armorProficiencies: [],
    weaponProficiencies: [],
    toolProficiencies: [],
    subclassLevel: '',
    features: [],
  };
}

export function classToFormState(cls: SrdClass): ClassFormState {
  return {
    name: cls.name,
    hitDie: cls.hitDie,
    description: cls.description ?? '',
    primaryAbilities: cls.primaryAbilities ?? [],
    savingThrows: cls.savingThrows ?? [],
    skillChoices: cls.skillChoices ?? [],
    numSkillChoices: String(cls.numSkillChoices ?? 0),
    armorProficiencies: cls.armorProficiencies ?? [],
    weaponProficiencies: cls.weaponProficiencies ?? [],
    toolProficiencies: cls.toolProficiencies ?? [],
    // The API sends null for a class without one, which the shared type doesn't admit.
    subclassLevel: cls.subclassLevel == null ? '' : String(cls.subclassLevel),
    // Named fields, not a spread. The draft type refuses an `id`, so tsc catches
    // that key, but a spread would still carry any other key an API row has and
    // the type doesn't declare, and the write DTO 400s a save that sends one.
    features: (cls.features ?? []).map(f => ({
      name: f.name,
      level: f.level,
      description: f.description ?? '',
    })),
  };
}

/** Whether two cleaned lists hold the same values, in any order. */
function sameMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const members = new Set(b);
  return a.every(value => members.has(value));
}

export function formStateToPayload(s: ClassFormState, baseline?: ClassFormState): ClassFormResult {
  const name = s.name.trim();
  if (!name) return { error: 'Name is required' };

  // A blank box reads as 0 because Number('') is 0, which is the right default.
  const numSkillChoices = parseIntInRange(s.numSkillChoices, 0, 18);
  if (numSkillChoices === null) {
    return { error: 'Number of skill choices must be a whole number from 0 to 18' };
  }

  // The API can store a count that doesn't fit the pool, and the character
  // builder caps the picks it asks for at the pool size, so such a class still
  // works. Skill fields left as they loaded skip the two rules below, so an
  // unrelated edit isn't blocked by a mismatch the author never made. Counts
  // compare as numbers, so retyping "02" over a loaded 2 changes nothing.
  const skillChoices = cleanList(s.skillChoices);
  const skillsUnchanged =
    baseline !== undefined &&
    sameMembers(skillChoices, cleanList(baseline.skillChoices)) &&
    numSkillChoices === parseIntInRange(baseline.numSkillChoices, 0, 18);
  if (!skillsUnchanged) {
    // A count above the pool asks for picks that don't exist, and a count of 0
    // with skills offered leaves the pool unused.
    if (numSkillChoices > skillChoices.length) {
      return {
        error: `Number of skill choices can't be more than the skills offered (${skillChoices.length})`,
      };
    }
    if (skillChoices.length > 0 && numSkillChoices === 0) {
      return { error: 'Set how many of the offered skills a player picks' };
    }
  }

  const subclassText = s.subclassLevel.trim();
  const subclassLevel = subclassText ? parseIntInRange(subclassText, 1, MAX_LEVEL) : null;
  if (subclassText && subclassLevel === null) {
    return { error: `Subclass level must be a whole number from 1 to ${MAX_LEVEL}` };
  }

  const features = toFeatureRows(s.features);
  const featuresChanged = !baseline || !sameFeatures(features, toFeatureRows(baseline.features));
  // Validated only when the list is being sent, so a stored row this form would
  // reject can't block an edit that leaves the list alone.
  if (featuresChanged) {
    const featureError = validateFeatures(features);
    if (featureError) return { error: featureError };
  }

  const payload: ClassPayload = {
    name,
    hitDie: s.hitDie,
    description: optionalText(s.description),
    primaryAbilities: cleanList(s.primaryAbilities),
    savingThrows: cleanList(s.savingThrows),
    skillChoices,
    numSkillChoices,
    armorProficiencies: cleanList(s.armorProficiencies),
    weaponProficiencies: cleanList(s.weaponProficiencies),
    toolProficiencies: cleanList(s.toolProficiencies),
    subclassLevel,
  };
  if (featuresChanged) payload.features = features;
  return { payload };
}
