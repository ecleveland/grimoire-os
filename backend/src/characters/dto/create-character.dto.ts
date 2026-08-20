import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  ValidateNested,
  ValidateIf,
  IsIn,
  IsUUID,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ABILITY_NAMES,
  ARMOR_TYPES,
  AttunedItem,
  CharacterFeat,
  CONDITIONS,
  DIE_TYPES,
  Feature,
  MAX_EXPERIENCE_POINTS,
  MAX_INITIATIVE_BONUS,
  RECHARGE_KINDS,
  SKILL_NAMES,
  SpellEntry,
  WEAPON_CATEGORIES,
} from '@grimoire-os/shared';
import { IsEachInCatalog } from '../../common/validators/is-each-in-catalog.decorator';
import {
  IsCatalogArray,
  IsOptionalStringArray,
} from '../../common/validators/optional-array.decorators';
import { IsStrictBoolean } from '../../common/validators/is-strict-boolean.decorator';
import { IsLteSibling } from '../../common/validators/is-lte-sibling.decorator';
import { IsNonBlankString } from '../../common/validators/non-blank-string.decorator';
import { ConcentrationDto } from '../../common/dto/concentration.dto';

class AbilityScoresDto {
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  strength?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  dexterity?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  constitution?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  intelligence?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  wisdom?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  charisma?: number;
}

class HitPointsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  max?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  current?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  temporary?: number;
}

class DeathSavesDto {
  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  successes?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  failures?: number;
}

class SpellSlotDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  level!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  total?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  used?: number;
}

// The gear DTO still accepts armorType:'shield' inbound even though the shared
// ARMOR_TYPES no longer lists it (VEG-461): both new and legacy-persisted
// shields carry it, and the frontend round-trips the whole inventory array on
// every equip-toggle PATCH, so a character owning a shield must keep passing
// validation. 'shield' is the only value beyond the three body-armor tiers.
const GEAR_ARMOR_TYPES = [...ARMOR_TYPES, 'shield'] as const;

/**
 * Armor/weapon metadata snapshotted from the catalog at add time (VEG-410).
 * A discriminated union in the shared type; class-validator can't switch DTO
 * classes on `type`, so one class carries every branch. Each branch field is
 * required when its `type` matches AND validated whenever present — otherwise
 * a whitelisted cross-branch field (weapon `damage` on armor gear) would
 * persist completely unvalidated junk into the inventory JSON.
 *
 * Shields (VEG-461) are `armorType:'shield'` and carry an additive
 * `armorClassBonus` instead of a `baseArmorClass`. Both fields are present-only
 * for shields rather than required, because a shield can arrive in either the
 * new (`armorClassBonus`) or the legacy (`baseArmorClass`) shape and both must
 * round-trip; `baseArmorClass` stays required for body armor.
 */
class GearMetaDto {
  @ApiProperty({ enum: ['armor', 'weapon'] })
  @IsIn(['armor', 'weapon'])
  type!: string;

  // ── armor branch ──
  @ApiPropertyOptional({ enum: GEAR_ARMOR_TYPES })
  @ValidateIf(o => o.type === 'armor' || o.armorType !== undefined)
  @IsIn(GEAR_ARMOR_TYPES)
  armorType?: string;

  // Required for body armor; present-only for shields (which carry
  // armorClassBonus instead, or baseArmorClass on a legacy-persisted row).
  @ApiPropertyOptional({ example: 16 })
  @ValidateIf(
    o => (o.type === 'armor' && o.armorType !== 'shield') || o.baseArmorClass !== undefined
  )
  @IsInt()
  @Min(0)
  @Max(99)
  baseArmorClass?: number;

  // A shield's additive AC bonus (VEG-461). Present-only, not required for
  // shields: a legacy shield arrives with baseArmorClass and no armorClassBonus.
  @ApiPropertyOptional({ example: 2 })
  @ValidateIf(o => o.armorClassBonus !== undefined)
  @IsInt()
  @Min(0)
  @Max(99)
  armorClassBonus?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  stealthDisadvantage?: boolean;

  @ApiPropertyOptional({ example: 13 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  strengthRequirement?: number;

  // ── weapon branch ──
  @ApiPropertyOptional({ example: '1d8' })
  @ValidateIf(o => o.type === 'weapon' || o.damage !== undefined)
  @IsString()
  damage?: string;

  @ApiPropertyOptional({ example: 'Slashing' })
  @ValidateIf(o => o.type === 'weapon' || o.damageType !== undefined)
  @IsString()
  damageType?: string;

  @ApiPropertyOptional({ type: [String] })
  @ValidateIf(o => o.type === 'weapon' || o.properties !== undefined)
  @IsArray()
  @IsString({ each: true })
  properties?: string[];

  @ApiPropertyOptional()
  @ValidateIf(o => o.type === 'weapon' || o.ranged !== undefined)
  @IsStrictBoolean()
  ranged?: boolean;

  // Present-only validation (not required for type === 'weapon'): pre-VEG-463
  // snapshots carry no tier and must keep round-tripping through PATCH.
  @ApiPropertyOptional({ enum: WEAPON_CATEGORIES })
  @ValidateIf(o => o.weaponCategory !== undefined)
  @IsIn(WEAPON_CATEGORIES)
  weaponCategory?: string;
}

class InventoryItemDto {
  @ApiProperty({ example: 'Longsword' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  equipped?: boolean;

  @ApiPropertyOptional({ description: 'Optional link to the Item catalog row' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({
    type: GearMetaDto,
    description: 'Armor/weapon stats snapshotted from the catalog (VEG-410)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GearMetaDto)
  gear?: GearMetaDto;
}

class CurrencyDto {
  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  cp?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  sp?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  ep?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  gp?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  pp?: number;
}

class HitDiceDto {
  @ApiProperty({ example: 'd10', enum: DIE_TYPES })
  @IsIn(DIE_TYPES)
  dieType!: string;

  @ApiProperty({ example: 8 })
  @IsNumber()
  total!: number;

  @ApiProperty({ example: 2 })
  @IsNumber()
  spent!: number;
}

class ResourceDto {
  @ApiProperty({ example: 'Ki Points' })
  // Non-blank, not just non-empty: a whitespace-only name would render an
  // unidentifiable row whose Edit/Remove aria-labels collapse to bare verbs.
  @IsNonBlankString()
  name!: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  max!: number;

  @ApiProperty({ example: 2, minimum: 0, maximum: 99 })
  @IsInt()
  @Min(0)
  @Max(99)
  @IsLteSibling('max')
  used!: number;

  @ApiProperty({ example: 'short', enum: RECHARGE_KINDS })
  @IsIn(RECHARGE_KINDS)
  recharge!: string;
}

class WeaponDto {
  @ApiProperty({ example: 'Longsword' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '+5' })
  @IsString()
  attackBonus!: string;

  @ApiProperty({ example: '1d8+3' })
  @IsString()
  damage!: string;

  @ApiProperty({ example: 'slashing' })
  @IsString()
  damageType!: string;

  @ApiPropertyOptional({ example: 'Versatile (1d10)' })
  @IsOptional()
  @IsString()
  notes?: string;
}

class FeatureDto implements Feature {
  @ApiProperty({ example: 'Darkvision' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

class CharacterFeatDto implements CharacterFeat {
  @ApiPropertyOptional({ description: 'SRD/homebrew Feat id when granted from the catalog' })
  @IsOptional()
  @IsString()
  featId?: string | null;

  @ApiProperty({ example: 'Magic Initiate' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Cleric', description: 'Chosen option for a parameterized feat' })
  @IsOptional()
  @IsString()
  option?: string | null;

  @ApiPropertyOptional({ description: 'Where the grant came from, e.g. the background name' })
  @IsOptional()
  @IsString()
  source?: string;
}

class SpellEntryDto implements SpellEntry {
  @ApiProperty({ example: 3, description: '0 = cantrip' })
  @IsInt()
  @Min(0)
  @Max(9)
  level!: number;

  @ApiProperty({ example: 'Fireball' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsStrictBoolean()
  prepared?: boolean;

  @ApiPropertyOptional({ example: '1 action' })
  @IsOptional()
  @IsString()
  castingTime?: string;

  @ApiPropertyOptional({ example: '150 feet' })
  @IsOptional()
  @IsString()
  range?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  concentration?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  ritual?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  material?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Optional link to the Spell catalog row' })
  @IsOptional()
  @IsUUID()
  spellId?: string;
}

class AttunedItemDto implements AttunedItem {
  @ApiProperty({ example: 'Cloak of Protection' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Optional link to the Item catalog row' })
  @IsOptional()
  @IsUUID()
  itemId?: string;
}

export class CreateCharacterDto {
  @ApiProperty({ example: 'Thorin Ironforge' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Dwarf' })
  @IsOptional()
  @IsString()
  race?: string;

  @ApiPropertyOptional({ example: 'Fighter' })
  @IsOptional()
  @IsString()
  class?: string;

  // Same boundary rationale as experiencePoints: level became client-writable
  // with the level-up assistant (VEG-411), and Prisma 500s on a non-integer or
  // out-of-range Int. 5e caps characters at level 20 (MAX_LEVEL mirrors this
  // in the sheet UI).
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  level?: number;

  @ApiPropertyOptional({ example: 'Champion' })
  @IsOptional()
  @IsString()
  subclass?: string;

  @ApiPropertyOptional({ example: 'Soldier' })
  @IsOptional()
  @IsString()
  background?: string;

  // VEG-476: soft ref to the selected background row so a loaded character can
  // resolve its background by id when a homebrew row reuses an SRD name (VEG-473).
  // Not a UUID-validated FK — homebrew rows are deletable, and the frontend
  // resolver degrades safely on a stale/unknown id.
  @ApiPropertyOptional({ description: 'Resolution key for the selected background (VEG-476)' })
  @IsOptional()
  @IsString()
  backgroundId?: string;

  @ApiPropertyOptional({ example: 'Lawful Good' })
  @IsOptional()
  @IsString()
  alignment?: string;

  // Bounded to the Postgres int4 range: the sheet's Award XP control (VEG-411)
  // writes this repeatedly, and an unchecked finite value past the column range
  // overflows in Prisma and 500s instead of 400ing here.
  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_EXPERIENCE_POINTS)
  experiencePoints?: number;

  @ApiPropertyOptional({ type: AbilityScoresDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AbilityScoresDto)
  abilityScores?: AbilityScoresDto;

  @ApiPropertyOptional({ type: HitPointsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HitPointsDto)
  hitPoints?: HitPointsDto;

  @ApiPropertyOptional({ type: DeathSavesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeathSavesDto)
  deathSaves?: DeathSavesDto;

  @ApiPropertyOptional({ example: 16 })
  @IsOptional()
  @IsNumber()
  armorClass?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  speed?: number;

  // Same boundary rationale as experiencePoints and level: a fractional or
  // out-of-int4 value overflows in Prisma and 500s instead of 400ing here. The
  // bound is generous rather than 5e-accurate — homebrew bonuses are small, but
  // the column only has to stay inside Int.
  @ApiPropertyOptional({
    example: 2,
    description:
      'Flat initiative BONUS added on top of the Dexterity modifier (VEG-452) — not a total. ' +
      'Omit or send 0 when the character has no feat/feature bonus; the Dexterity modifier is ' +
      'always applied on top by the server.',
  })
  @IsOptional()
  @IsInt()
  @Min(-MAX_INITIATIVE_BONUS)
  @Max(MAX_INITIATIVE_BONUS)
  initiative?: number;

  // @ValidateIf + IsStrictArray, matching skills/savingThrows below: these are
  // non-null String[] columns too, so an explicit null used to reach Prisma and
  // 500. Rejecting it here makes the boundary uniform — Prisma never sees a
  // null for a column that can't hold one.
  @ApiPropertyOptional({ type: [String] })
  @IsOptionalStringArray()
  proficiencies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptionalStringArray()
  languages?: string[];

  // Proficiency catalogs (VEG-493). Both are the direct write boundary for the
  // columns `computed` reads: an unknown name produces no computed row and
  // leaves the skill/save the caller meant sitting at proficient: false, so the
  // sheet shows wrong numbers with no error anywhere. VEG-492 closed the same
  // drift class on the seed side; these close it on the API side.
  //
  // `@ValidateIf` rather than `@IsOptional()`, so an absent key is skipped but
  // an explicit null is validated (and rejected by the array guard). These hold
  // durable character data: an earlier revision transformed null → [] to spare
  // Prisma the 500 it throws for the non-null column, but the service spreads
  // `changes` straight into `prisma.character.update`, so that turned a loud
  // failure into a silent 200 that erased every stored proficiency for any
  // client that serialises an unset optional field as null. Clearing is still
  // available, explicitly, as []. `conditions` below keeps the null → [] clear:
  // it is transient status, not durable data.
  @ApiPropertyOptional({
    enum: ABILITY_NAMES,
    isArray: true,
    example: ['Strength', 'Constitution'],
  })
  @IsCatalogArray(ABILITY_NAMES, 'saving throw')
  savingThrows?: string[];

  @ApiPropertyOptional({ enum: SKILL_NAMES, isArray: true, example: ['Athletics', 'Intimidation'] })
  @IsCatalogArray(SKILL_NAMES, 'skill')
  skills?: string[];

  // The ability field that actually feeds a computed number: computeCharacterStats
  // resolves an unknown name to a null key and falls back to modifier 0, so a
  // typo renders a wrong-but-plausible spell save DC — the same silent-drift
  // failure the two catalogs above exist to prevent (VEG-346 shipped
  // isKnownAbilityName() for exactly this column).
  @ApiPropertyOptional({ enum: ABILITY_NAMES, example: 'Intelligence' })
  @IsOptional()
  @IsString()
  // '' means "not a spellcaster" and has to keep passing: ClassStep clears the
  // field to '' when the chosen class has no spellcasting, and
  // CharacterEditorForm both initialises it to '' and coerces a stored null to
  // '' on load — so every non-caster save sends it. @IsOptional() covers null
  // and undefined but not '', so without this the catalog would 400 every
  // Fighter.
  @ValidateIf((_object, value) => value !== '')
  // Static message: the six legal values are short enough to recite, and
  // echoing the caller's value back would reintroduce the amplification and
  // token-interpolation problems IsEachInCatalog exists to avoid.
  @IsIn(ABILITY_NAMES)
  spellcastingAbility?: string;

  @ApiPropertyOptional({ example: 13 })
  @IsOptional()
  @IsNumber()
  spellSaveDC?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  spellAttackBonus?: number;

  @ApiPropertyOptional({ type: [SpellEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpellEntryDto)
  spells?: SpellEntryDto[];

  @ApiPropertyOptional({ type: [SpellSlotDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpellSlotDto)
  spellSlots?: SpellSlotDto[];

  @ApiPropertyOptional({ type: [InventoryItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryItemDto)
  inventory?: InventoryItemDto[];

  @ApiPropertyOptional({ type: [AttunedItemDto], description: 'Up to 3 attuned magic items' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => AttunedItemDto)
  attunedItems?: AttunedItemDto[];

  @ApiPropertyOptional({ type: CurrencyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CurrencyDto)
  currency?: CurrencyDto;

  @ApiPropertyOptional({ type: [FeatureDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureDto)
  features?: FeatureDto[];

  @ApiPropertyOptional({ type: [CharacterFeatDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CharacterFeatDto)
  feats?: CharacterFeatDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personalityTraits?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ideals?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bonds?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flaws?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backstory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appearance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Medium' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsStrictBoolean()
  heroicInspiration?: boolean;

  @ApiPropertyOptional({ type: HitDiceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HitDiceDto)
  hitDice?: HitDiceDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptionalStringArray()
  armorTraining?: string[];

  @ApiPropertyOptional({ type: [WeaponDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeaponDto)
  weapons?: WeaponDto[];

  // PC status tracking (VEG-408). Whitelisted here so the sheet's PATCHes pass
  // forbidNonWhitelisted (the VEG-349 deathSaves lesson).
  @ApiPropertyOptional({ enum: CONDITIONS, isArray: true, example: ['Poisoned'] })
  @IsOptional()
  // null → [] so a null clear behaves like the concentration/exhaustion
  // clears; without it @IsOptional lets null through to Prisma, which rejects
  // it for the required String[] column (a 500 instead of a clean clear).
  // Unlike skills/savingThrows this stays a valid clear: conditions are
  // transient status, so a null can't destroy anything the player authored.
  @Transform(({ value }) => (value === null ? [] : (value as unknown)))
  @ArrayUnique()
  // Was a bare @IsIn, whose message recites all 15 legal values and never names
  // the typo — the same diagnosis failure the skill/save catalogs were changed
  // to fix, on the field those two cite as their model.
  @IsEachInCatalog(CONDITIONS, 'condition')
  conditions?: string[];

  @ApiPropertyOptional({ type: ConcentrationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConcentrationDto)
  concentration?: ConcentrationDto;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  exhaustion?: number;

  // Limited-use class/race resources (VEG-409). Whitelisted so the sheet's
  // resource-tracker PATCHes pass forbidNonWhitelisted (the VEG-349 lesson).
  @ApiPropertyOptional({ type: [ResourceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ResourceDto)
  resources?: ResourceDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  // Transient create-only control flag (VEG-483): when the guided builder sends
  // it, the service auto-equips the resolved starting armor + shield so derived
  // AC fires on a fresh build. Consumed by the service and stripped before the
  // row is written — it is not a persisted column. Omitted from
  // UpdateCharacterDto's inherited fields so it can never reach a PATCH.
  @ApiPropertyOptional({
    description: 'Guided-builder only: auto-equip resolved starting armor + shield on create',
  })
  @IsOptional()
  @IsStrictBoolean()
  autoEquipStartingGear?: boolean;
}
