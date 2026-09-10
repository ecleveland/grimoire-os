// Runtime enum objects — values match @grimoire-os/shared, defined locally for
// historical reasons (an early Turbopack limitation on value imports from
// file:-linked packages). That limitation no longer applies: app code value-
// imports the package widely today, including from client components and the
// ability/skill tables in `dnd-constants` and `ability-math` (VEG-453). These
// mirrors are safe to collapse onto the shared exports when someone wants to;
// nothing forces them.
export const Role = { PLAYER: 'player', DUNGEON_MASTER: 'dungeon_master', ADMIN: 'admin' } as const;
export type Role = (typeof Role)[keyof typeof Role];
export const CampaignStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];
export const NoteVisibility = { PRIVATE: 'private', PARTY: 'party', DM_ONLY: 'dm_only' } as const;
export type NoteVisibility = (typeof NoteVisibility)[keyof typeof NoteVisibility];
export const AuditAction = { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' } as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
export const CombatantType = { PC: 'pc', NPC: 'npc' } as const;
export type CombatantType = (typeof CombatantType)[keyof typeof CombatantType];

// The dice a class can actually have as a hit die. `hitDice.dieType` is only
// ever a hit die, so this — not DIE_TYPES — is what a hit-die picker offers
// (VEG-528): d20 and d100 are in the vocabulary for rolls, and one mis-click on
// d100 writes +51 into a permanent HP maximum. Deriving DIE_TYPES from it keeps
// the relationship structural instead of asking a future editor to remember it.
//
// Mirrors HIT_DIE_TYPES in @grimoire-os/shared, which VEG-530 added so the
// backend seed and the backfill migration narrow to the same five this picker
// offers. Kept as a local mirror alongside DIE_TYPES rather than re-exported;
// character-constants.test.ts pins the two together.
export const HIT_DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12'] as const;
export type HitDieType = (typeof HIT_DIE_TYPES)[number];

// Hit-die faces — mirrors DIE_TYPES in @grimoire-os/shared (the backend
// HitDiceDto validates `dieType` with `@IsIn(DIE_TYPES)`). Defined locally as a
// value because Turbopack can't resolve file:-linked packages for value imports.
// Stays the full set: it is also the validation vocabulary for stored values, so
// narrowing it would reject sheets that already carry a d20 or d100 pool.
export const DIE_TYPES = [...HIT_DIE_TYPES, 'd20', 'd100'] as const;
export type DieType = (typeof DIE_TYPES)[number];

/**
 * The die a hit-die picker starts on when the character has none recorded and
 * no class die to take.
 *
 * Deliberately the only hardcoded die left in the app (VEG-530). Four consumers
 * used to each invent their own d8 for a null `hitDice`, silently, which is how
 * a sheet acquired a permanent pool nobody chose. Now the server seeds the
 * column from the character's class, `null` means "no die recorded" everywhere
 * else, and this value is only ever a *selected* starting position in a control
 * that shows the player what it is and asks them to change it if it's wrong.
 */
export const DEFAULT_HIT_DIE: HitDieType = 'd8';

/**
 * Narrow a free-form die string (e.g. `SrdClass.hitDie`) to one that can be a
 * *hit* die, or null when it cannot.
 *
 * Single home for the membership-check-and-cast the guided builder, character
 * editor and level-up dialog all need. It narrows against `HIT_DIE_TYPES`, not
 * `DIE_TYPES`: every caller is deciding what to RECORD as a character's hit
 * dice, and `SrdClass.hitDie` is validated with `@IsIn(DIE_TYPES)`, so a
 * homebrew class may legally declare d20 or d100. Folding one of those in puts a
 * die on the sheet that no picker offers and that the backend seed and the
 * backfill migration both decline to write (VEG-530).
 *
 * Reading a stored pool needs no narrowing — `HitDice.dieType` is already typed
 * — so a sheet that predates this and carries an odd die still displays and
 * edits fine.
 */
export function asHitDie(value: string | undefined): HitDieType | null {
  return value && (HIT_DIE_TYPES as readonly string[]).includes(value)
    ? (value as HitDieType)
    : null;
}

// Resource recharge kinds — mirrors RECHARGE_KINDS in @grimoire-os/shared (the
// backend ResourceDto validates `recharge` with `@IsIn(RECHARGE_KINDS)`).
// Defined locally as a value because Turbopack can't resolve file:-linked
// packages for value imports.
export const RECHARGE_KINDS = ['short', 'long'] as const;
export type ResourceRecharge = (typeof RECHARGE_KINDS)[number];

// Creature sizes, smallest to largest. Re-exported, not redeclared: VEG-497
// promoted the list to @grimoire-os/shared so the editor's picker, the DTO's
// @IsIn whitelist and the carrying-capacity multipliers all read one tuple.
// The DTO does constrain `size` now, though stored rows predating that don't.
export { SIZES } from '@grimoire-os/shared';
export type { Size } from '@grimoire-os/shared';

export type {
  // Embedded types
  AbilityScores,
  HitPoints,
  HitDice,
  DeathSaves,
  SpellEntry,
  SpellSlot,
  InventoryItem,
  GearMeta,
  ArmorGear,
  BodyArmorGear,
  ShieldGear,
  WeaponGear,
  ArmorType,
  AttunedItem,
  Currency,
  Feature,
  CharacterFeat,
  CharacterResource,
  Weapon,
  Combatant,
  CombatantConcentration,
  Condition,
  PartyCharacter,
  CampaignMember,
  // Computed character stats (VEG-346/VEG-412)
  ComputedStats,
  ComputedArmorClass,
  ComputedArmorClassBreakdown,
  ComputedAbilityModifiers,
  ComputedSave,
  ComputedSkill,
  ComputedSpellcasting,
  ComputedSpellSlots,
  ComputedXp,
  SpellcasterType,
  // Entity types
  User,
  Campaign,
  Character,
  Note,
  Encounter,
  // List projections
  CampaignListItem,
  CharacterListItem,
  NoteListItem,
  EncounterListItem,
  NpcListItem,
  // NPC
  Npc,
  NpcRelation,
  NpcLootOverrides,
  NpcLootItem,
  NpcRerollField,
  GenerateNpcRequest,
  GeneratedNpcPreview,
  // Shop (VEG-353)
  Shop,
  ShopListItem,
  ShopLineItem,
  // Pagination
  PaginatedResponse,
  // Response types
  AccessTokenResponse,
  InviteCodeResponse,
  // SRD sub-types
  ClassSpellcasting,
  ClassFeature,
  EquipmentChoice,
  EquipmentChoiceItem,
  StartingEquipment,
  MonsterAction,
  BackgroundFeature,
  // SRD entity types
  SrdSpell,
  SrdMonster,
  SrdItem,
  SrdItemBundleComponent,
  SrdClass,
  SrdRace,
  SrdSubclass,
  SrdSubrace,
  SrdBackground,
  ContentSource,
  SrdFeat,
  SrdSpecies,
  SrdCondition,
  SrdSkill,
  SrdLanguage,
} from '@grimoire-os/shared';
