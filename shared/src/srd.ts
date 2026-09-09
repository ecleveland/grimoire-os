// ── SRD Sub-types ──────────────────────────────────────────────────────

/** Spellcasting configuration for a class (currently only stores ability; future M9 tickets add progression data) */
export interface ClassSpellcasting {
  ability: string;
  /** True only for Warlock — uses Pact Magic instead of standard spell slots */
  pactMagic?: boolean;
  /** Standard spell slot progression keyed by character level, then slot level → count */
  spellSlotProgression?: Record<number, Record<number, number>>;
  /** Warlock-only: pact slot progression keyed by character level */
  pactSlotProgression?: Record<number, { slots: number; slotLevel: number }>;
  /** Cantrips known at each character level (all casters) */
  cantripsKnown?: Record<number, number>;
  /** Spells known at each character level (Bard, Ranger, Sorcerer, Warlock) */
  spellsKnown?: Record<number, number>;
  /** Formula for prepared spell count (Cleric, Druid, Paladin, Wizard) */
  preparedFormula?: string;
}

/** How a class behaves when multiclassed into (SRD "Multiclassing" table). */
export const CASTER_TYPES = ['full', 'half', 'pact'] as const;
export type CasterType = (typeof CASTER_TYPES)[number];

/** One ability minimum a character must meet to multiclass into or out of a class. */
export interface MulticlassPrerequisite {
  ability: string;
  minimum: number;
}

/**
 * Multiclassing rules for a class: what you must have to take it, what you gain
 * when you do, and how it contributes to the multiclass spell-slot table.
 *
 * `casterType` is null for a class that contributes nothing (Rogue and the other
 * non-casters); `pact` is Warlock, whose slots are tracked separately from the
 * shared table.
 *
 * `prerequisiteLogic` carries only 'OR', and only where any one prerequisite
 * suffices — Fighter is the SRD's single such class (Strength or Dexterity).
 * Absent is the usual case, where every prerequisite must be met. It is not
 * `'AND' | 'OR'` on purpose: that would give one state two encodings, so a
 * consumer testing `=== 'AND'` would be right for a client-written row and wrong
 * for all twelve seeded ones. Testing `=== 'OR'` is correct for both.
 */
export interface ClassMulticlassing {
  prerequisites: MulticlassPrerequisite[];
  proficienciesGained: string[];
  casterType: CasterType | null;
  prerequisiteLogic?: 'OR';
}

/** A class or subclass feature unlocked at a specific level */
export interface ClassFeature {
  /**
   * Relational row id. Present on API responses (the class/subclass endpoints
   * include the full feature rows); optional because hand-authored seed
   * literals omit it. Used to address a feature as a printable card (VEG-265).
   */
  id?: string;
  name: string;
  level: number;
  description?: string;
}

/**
 * The identity a class or subclass feature is unique by: its level and name,
 * with the parent id supplied by whatever holds it.
 *
 * One copy, because there were three and two of them disagreed. The backend DTO
 * feeds it to `@ArrayUnique` so a payload is refused exactly when the
 * `[classId, name, level]` index would refuse it; the editor uses it to flag a
 * collision as the author types; the class list uses it as a React key. If those
 * drift — one folds case, another trims — the warning shown in the browser stops
 * matching the 400 the server returns, and nothing fails to tell you.
 *
 * Case-sensitive and untrimmed on purpose: the index is a plain btree over text,
 * so "Rage" and "rage" are two rows to Postgres, and a rule stricter than the
 * constraint is one nobody can find by reading the schema.
 *
 * The separator is a character `level` cannot contain — it is validated as an
 * integer at the write boundary — so the prefix before the first `|` is
 * unambiguous and ("a|1", 1) cannot collide with ("a", "1|1").
 */
export function classFeatureIdentity(f: Pick<ClassFeature, 'name' | 'level'>): string {
  return `${f.level}|${f.name}`;
}

/** A starting equipment choice group for character creation */
export interface EquipmentChoiceItem {
  name: string;
  quantity: number;
}

export interface EquipmentChoice {
  choose: number;
  from: { items: EquipmentChoiceItem[] }[];
}

/** Starting equipment for a class, including guaranteed items and gold alternative */
export interface StartingEquipment {
  choices: EquipmentChoice[];
  guaranteed?: EquipmentChoiceItem[];
  startingGold?: string;
}

/** A named ability/action on a monster (special abilities, actions, reactions, legendary actions) */
export interface MonsterAction {
  name: string;
  description: string;
}

/** A background feature with name and description */
export interface BackgroundFeature {
  name: string;
  description: string;
}

// ── Content source / ownership (VEG-292) ───────────────────────────────

/**
 * Origin of a piece of reference content, which also determines its visibility:
 * - `srd`: loaded by the seed; globally visible; immutable.
 * - `shared`: published by an admin; globally visible like SRD, but user-authored
 *   and editable by any admin (VEG-310).
 * - `homebrew`: authored by a user; visible only to its creator (per-user library).
 *
 * The shared content tables hold all three, so `/srd/*` is the initial data load
 * rather than a hard boundary. The "global catalog" everyone sees is `srd + shared`.
 */
export type ContentSource = 'srd' | 'shared' | 'homebrew';

/**
 * Authorship/scope fields carried by every content type that can originate from
 * the SRD seed, an admin, or a user (monsters, spells, feats, magic items,
 * backgrounds).
 *
 * - SRD rows have `contentSource: 'srd'` and a null `createdById`.
 * - Shared rows have `contentSource: 'shared'` and `createdById` set to the
 *   publishing admin; they are globally visible.
 * - Homebrew rows are owned by their creator (`createdById`) and form a per-user
 *   library visible to that user across all their campaigns.
 * - `campaignId` is reserved for future per-campaign scoping; it is always null
 *   for now (the column exists so adding that feature needs no second migration).
 */
export interface ContentOwnership {
  contentSource: ContentSource;
  createdById?: string | null;
  campaignId?: string | null;
}

// ── SRD Entity Interfaces ──────────────────────────────────────────────

export interface SrdSpell extends ContentOwnership {
  id: string;
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
  material?: string;
  higherLevels?: string;
  source: string;
}

export interface SrdMonster extends ContentOwnership {
  id: string;
  name: string;
  size: string;
  type: string;
  subtype?: string;
  alignment: string;
  armorClass: number;
  armorType?: string;
  hitPoints: number;
  hitDice?: string;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows?: Record<string, number>;
  skills?: Record<string, number>;
  damageResistances: string[];
  damageImmunities: string[];
  damageVulnerabilities: string[];
  conditionImmunities: string[];
  senses?: string;
  languages?: string;
  challengeRating: number;
  experiencePoints?: number;
  specialAbilities?: MonsterAction[];
  actions: MonsterAction[];
  reactions?: MonsterAction[];
  legendaryActions?: MonsterAction[];
  description?: string;
  source: string;
}

/**
 * A component line of an equipment-pack bundle: the contained item with its
 * quantity (e.g. Burglar's Pack → 10× Candle). Returned on the item detail
 * endpoint for items with category "Equipment Pack" (VEG-308).
 */
export interface SrdItemBundleComponent {
  itemId: string;
  name: string;
  quantity: number;
}

export interface SrdItem extends ContentOwnership {
  id: string;
  name: string;
  category: string;
  cost?: string;
  /** Weight in pounds — a Float column server-side, so always a number. */
  weight?: number;
  description?: string;
  damage?: string;
  damageType?: string;
  /**
   * Wearable-armor AC as self-describing text — "11 + Dex modifier",
   * "13 + Dex modifier (max 2)", "16", "+2" (shield). Distinct from the
   * numeric creature AC on monsters/characters/NPCs.
   */
  armorClass?: string;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
  properties: string[];
  rarity?: string;
  requiresAttunement?: boolean;
  isMagic?: boolean;
  source: string;
  /**
   * Resolved bundle contents. Returned by the item *detail* endpoint only
   * (the list endpoint never includes it), and only when the item has bundle
   * entries — in practice the seeded equipment packs.
   */
  contents?: SrdItemBundleComponent[];
}

export interface SrdClass extends ContentOwnership {
  id: string;
  name: string;
  hitDie: string;
  primaryAbilities: string[];
  savingThrows: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  skillChoices: string[];
  toolProficiencies: string[];
  numSkillChoices: number;
  description?: string;
  features: ClassFeature[];
  spellcasting?: ClassSpellcasting;
  equipmentChoices?: StartingEquipment;
  multiclassing?: ClassMulticlassing;
  subclassLevel?: number;
  source: string;
}

export interface SrdRace {
  id: string;
  name: string;
  speed: number;
  size: string;
  abilityBonuses: Record<string, number>;
  /** `id` is the RaceTrait row id — present on API responses, optional in seed literals (VEG-265). */
  traits: { id?: string; name: string; description?: string }[];
  languages: string[];
  description?: string;
  age?: string;
  alignment?: string;
  sizeDescription?: string;
  source: string;
}

export interface SrdSubclass {
  id: string;
  name: string;
  classId: string;
  description?: string;
  features?: ClassFeature[];
  spellList?: string[];
  source: string;
}

export interface SrdSubrace {
  id: string;
  name: string;
  raceId: string;
  description?: string;
  abilityBonuses?: Record<string, number>;
  traits?: string[];
  source: string;
}

export interface SrdBackgroundAbilityScores {
  choose: number;
  options: string[];
}

/** A minimal id+name pointer to another SRD entity (e.g. a linked feat). */
export interface SrdReference {
  id: string;
  name: string;
}

export interface SrdBackground extends ContentOwnership {
  id: string;
  name: string;
  description?: string;
  skillProficiencies: string[];
  toolProficiencies: string[];
  languages: number;
  equipment?: string;
  feature?: BackgroundFeature | null;
  /**
   * Canonical SRD origin feat, linked by FK at seed (VEG-429). `originFeatOption`
   * carries the chosen parameter for repeatable feats (e.g. Magic Initiate
   * "Cleric"); null for non-parameterized feats.
   */
  originFeat?: SrdReference | null;
  originFeatOption?: string | null;
  abilityScores?: SrdBackgroundAbilityScores;
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
  source: string;
}

export interface SrdFeat extends ContentOwnership {
  id: string;
  name: string;
  description?: string;
  prerequisite?: string;
  benefits?: string[];
  category?: string;
  repeatable?: boolean;
  source: string;
}

export interface SrdSpeciesTrait {
  name: string;
  description: string;
}

export interface SrdSpecies {
  id: string;
  name: string;
  speed: number;
  size: string;
  description?: string;
  traits?: SrdSpeciesTrait[];
  source: string;
}

export interface SrdCondition {
  id: string;
  name: string;
  description?: string;
  bullets: string[];
  source: string;
}

export interface SrdSkill {
  id: string;
  name: string;
  ability: string;
  description?: string;
  source: string;
}

export interface SrdLanguage {
  id: string;
  name: string;
  type: string;
  typicalSpeakers?: string;
  script?: string;
  source: string;
}

export interface GameRule {
  id: string;
  category: string;
  key: string;
  value: Record<string, unknown>;
  source: string;
}
