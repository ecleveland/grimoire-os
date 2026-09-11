import { classFeatureIdentity } from '@grimoire-os/shared';
import type { ClassFeatureDraft } from '@/components/ClassFeaturesEditor';
import { MAX_LEVEL } from '@/lib/character-level';
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
  /** Always sent. The form owns the whole list, and the API replaces every stored row with it. */
  features: ClassFeatureDraft[];
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
    // Named fields, not a spread. API rows carry an `id` and the write DTO refuses
    // any key it doesn't whitelist, so a spread row would 400 every save of an
    // existing class. tsc can't catch it, because a spread skips the
    // excess-property check.
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
  // unrelated edit isn't blocked by a mismatch the author never made.
  const skillChoices = cleanList(s.skillChoices);
  const skillsUnchanged =
    baseline !== undefined &&
    sameMembers(skillChoices, cleanList(baseline.skillChoices)) &&
    s.numSkillChoices.trim() === baseline.numSkillChoices.trim();
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

  const features = s.features.map(f => ({
    name: f.name.trim(),
    level: f.level,
    description: (f.description ?? '').trim(),
  }));
  if (features.some(f => !f.name)) return { error: 'Every feature needs a name' };
  // The editor holds NaN while a level box is cleared, until the box loses focus.
  if (features.some(f => !Number.isInteger(f.level) || f.level < 1 || f.level > MAX_LEVEL)) {
    return { error: `Every feature needs a level from 1 to ${MAX_LEVEL}` };
  }
  // Compared on the trimmed names, since those are what gets sent. The editor's
  // live warning sees "Rage" and "Rage " as two rows; the server sees one.
  const seen = new Set<string>();
  for (const feature of features) {
    const identity = classFeatureIdentity(feature);
    if (seen.has(identity)) {
      return { error: 'Two features share a name at the same level; each pairing must be unique' };
    }
    seen.add(identity);
  }

  return {
    payload: {
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
      features,
    },
  };
}
