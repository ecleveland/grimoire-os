import type {
  AbilityScores,
  ClassSpellcasting,
  ComputedAbilityModifiers,
  ComputedSave,
  ComputedSkill,
  ComputedSpellcasting,
  ComputedSpellSlots,
  ComputedStats,
  ComputedXp,
  SpellcasterType,
} from '@grimoire-os/shared';
import { computeXpBand } from '@grimoire-os/shared';
import { srdGameRules } from '../../seed/data/game-rules';

/**
 * Subset of a character's stored fields the compute layer reads. Keeping this
 * narrow (rather than taking the full Prisma row) makes the formulas pure and
 * trivially unit-testable, and documents exactly which inputs drive derived
 * values (VEG-346).
 */
export interface CharacterComputeInput {
  level: number;
  experiencePoints: number;
  abilityScores: AbilityScores | null;
  /** Ability full names the character is proficient in (e.g. "Strength"). */
  savingThrows: string[];
  /** Skill names the character is proficient in (e.g. "Athletics"). */
  skills: string[];
  /** Explicit spellcasting ability (full name); overrides the class default. */
  spellcastingAbility: string | null;
}

// ── Game-rules source (single source of truth, mirrors GET /srd/rules) ──
// The proficiency-bonus table and skill→ability mappings are read straight from
// the seeded `game_rules` data rather than hardcoded here, so the compute layer
// can never drift from the rules API.

function ruleValue(category: string, key: string): Record<string, unknown> {
  const rule = srdGameRules.find(r => r.category === category && r.key === key);
  if (!rule) {
    throw new Error(`Missing game rule "${category}/${key}"`);
  }
  return rule.value as Record<string, unknown>;
}

const PROFICIENCY_BONUS_TABLE = ruleValue('proficiency-bonus', 'table') as Record<string, number>;
const SKILL_ABILITY_MAP = ruleValue('skills', 'ability-mappings') as Record<string, string>;
const XP_LEVEL_THRESHOLDS = ruleValue('experience-points', 'level-thresholds') as Record<
  string,
  number
>;

const ABILITY_KEYS: (keyof AbilityScores)[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];

const ABILITY_NAME_BY_KEY: Record<keyof AbilityScores, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

// ── Primitive formulas ─────────────────────────────────────────────────

/** Levels outside 1–20 clamp to the nearest valid level for table lookups. */
function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(20, Math.max(1, Math.floor(level)));
}

/** floor((score - 10) / 2) — the canonical 5e ability modifier. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Proficiency bonus from the rules table (ceil(level/4)+1), clamped 1–20. */
export function proficiencyBonus(level: number): number {
  return PROFICIENCY_BONUS_TABLE[String(clampLevel(level))];
}

/** A missing ability score is treated as 10 (modifier 0). */
function scoreFor(abilityScores: AbilityScores | null, key: keyof AbilityScores): number {
  return abilityScores?.[key] ?? 10;
}

function abilityKeyFromName(name: string): keyof AbilityScores | null {
  const key = name.toLowerCase() as keyof AbilityScores;
  return ABILITY_KEYS.includes(key) ? key : null;
}

/**
 * Whether a string names one of the six abilities. The service uses this to
 * flag a corrupt/typo'd `spellcastingAbility` column (free-form text) rather
 * than letting it silently produce a wrong save DC (VEG-346).
 */
export function isKnownAbilityName(name: string): boolean {
  return abilityKeyFromName(name) !== null;
}

// ── XP progress ────────────────────────────────────────────────────────

/** The shared XP band math applied to the seeded threshold table (VEG-411). */
export function computeXp(level: number, experiencePoints: number): ComputedXp {
  return computeXpBand(XP_LEVEL_THRESHOLDS, level, experiencePoints);
}

// ── Spell slots ────────────────────────────────────────────────────────

/**
 * A class's standard spell-slot progression spans levels 1–20; full casters
 * reach 9th-level slots by level 17, half casters top out at 5th. We read the
 * progression's own level-20 row to label the caster rather than hardcoding a
 * class list.
 */
function casterTypeFromProgression(
  progression: Record<number, Record<number, number>>
): Exclude<SpellcasterType, 'pact'> {
  const topRow = progression[20] ?? {};
  const highestSlotLevel = Math.max(0, ...Object.keys(topRow).map(Number));
  return highestSlotLevel >= 9 ? 'full' : 'half';
}

function resolveSpellSlots(
  level: number,
  spellcasting: ClassSpellcasting | null | undefined
): ComputedSpellSlots | null {
  if (!spellcasting) return null;
  const lvl = clampLevel(level);

  if (spellcasting.pactMagic && spellcasting.pactSlotProgression) {
    const entry = spellcasting.pactSlotProgression[lvl];
    const maxByLevel: Record<number, number> = {};
    if (entry && entry.slots > 0) {
      maxByLevel[entry.slotLevel] = entry.slots;
    }
    return { caster: 'pact', maxByLevel };
  }

  if (spellcasting.spellSlotProgression) {
    const row = spellcasting.spellSlotProgression[lvl] ?? {};
    const maxByLevel: Record<number, number> = {};
    for (const [slotLevel, count] of Object.entries(row)) {
      maxByLevel[Number(slotLevel)] = count;
    }
    return { caster: casterTypeFromProgression(spellcasting.spellSlotProgression), maxByLevel };
  }

  return null;
}

// ── Public entry point ─────────────────────────────────────────────────

/**
 * Derive a character's authoritative stats from its stored inputs. Pure: the
 * same inputs always yield the same block, so editing an ability score changes
 * every dependent value with no separate write (VEG-346).
 */
export function computeCharacterStats(
  character: CharacterComputeInput,
  classSpellcasting?: ClassSpellcasting | null
): ComputedStats {
  const { level, experiencePoints, abilityScores, savingThrows, skills, spellcastingAbility } =
    character;
  const profBonus = proficiencyBonus(level);

  const abilityModifiers = {} as ComputedAbilityModifiers;
  for (const key of ABILITY_KEYS) {
    abilityModifiers[key] = abilityModifier(scoreFor(abilityScores, key));
  }

  const savingThrowBonuses: Record<string, ComputedSave> = {};
  for (const key of ABILITY_KEYS) {
    const name = ABILITY_NAME_BY_KEY[key];
    const proficient = savingThrows.includes(name);
    savingThrowBonuses[name] = {
      proficient,
      bonus: abilityModifiers[key] + (proficient ? profBonus : 0),
    };
  }

  const skillBonuses: Record<string, ComputedSkill> = {};
  for (const [skill, ability] of Object.entries(SKILL_ABILITY_MAP)) {
    const key = abilityKeyFromName(ability);
    const mod = key ? abilityModifiers[key] : 0;
    const proficient = skills.includes(skill);
    skillBonuses[skill] = {
      ability,
      proficient,
      bonus: mod + (proficient ? profBonus : 0),
    };
  }

  const passivePerception = 10 + skillBonuses['Perception'].bonus;

  // Spellcasting ability: an explicit column wins (covers subclass casters like
  // Eldritch Knight), else fall back to the class default. Null → non-caster.
  // An unrecognized name (corrupt column) yields modifier 0; the service logs
  // it so the wrong-but-rendered DC is observable rather than silent.
  const resolvedAbility = spellcastingAbility ?? classSpellcasting?.ability ?? null;
  let spellcasting: ComputedSpellcasting | null = null;
  if (resolvedAbility) {
    const key = abilityKeyFromName(resolvedAbility);
    const mod = key ? abilityModifiers[key] : 0;
    spellcasting = {
      ability: resolvedAbility,
      modifier: mod,
      saveDC: 8 + profBonus + mod,
      attackBonus: profBonus + mod,
    };
  }

  return {
    proficiencyBonus: profBonus,
    abilityModifiers,
    initiative: abilityModifiers.dexterity,
    savingThrows: savingThrowBonuses,
    skills: skillBonuses,
    passivePerception,
    spellcasting,
    spellSlots: resolveSpellSlots(level, classSpellcasting),
    xp: computeXp(level, experiencePoints),
  };
}
