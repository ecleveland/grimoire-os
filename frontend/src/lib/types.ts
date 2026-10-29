import { isHitDie, type HitDieType } from '@grimoire-os/shared';

// Enums and die vocabularies come from @grimoire-os/shared, the same tuples the
// backend DTOs validate against with @IsIn. HIT_DIE_TYPES is the narrower set a
// hit-die picker offers (VEG-528); DIE_TYPES stays the full set because stored
// sheets may already carry a d20 or d100 pool.
export {
  Role,
  CampaignStatus,
  NoteVisibility,
  AuditAction,
  CombatantType,
  HIT_DIE_TYPES,
  DIE_TYPES,
  RECHARGE_KINDS,
} from '@grimoire-os/shared';
export type { HitDieType, DieType, ResourceRecharge } from '@grimoire-os/shared';

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
 * Wraps shared `isHitDie` to accept the `undefined` the guided builder,
 * character editor and level-up dialog all pass. It narrows against
 * `HIT_DIE_TYPES`, not `DIE_TYPES`: every caller is deciding what to RECORD as
 * a character's hit dice, and `SrdClass.hitDie` is validated with
 * `@IsIn(DIE_TYPES)`, so a homebrew class may legally declare d20 or d100.
 * Folding one of those in puts a die on the sheet that no picker offers and
 * that the backend seed and the backfill migration both decline to write
 * (VEG-530).
 *
 * Reading a stored pool needs no narrowing because `HitDice.dieType` is already
 * typed, so a sheet that predates this and carries an odd die still displays
 * and edits fine.
 */
export function asHitDie(value: string | undefined): HitDieType | null {
  return value && isHitDie(value) ? value : null;
}

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
  CharacterSnapshot,
  CharacterSnapshotSummary,
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
