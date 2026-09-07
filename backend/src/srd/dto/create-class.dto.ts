import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ABILITY_NAMES, CASTER_TYPES, DIE_TYPES, SKILL_NAMES } from '@grimoire-os/shared';
import { IsEachInCatalog } from '../../common/validators/is-each-in-catalog.decorator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.decorator';
import { IsStrictBoolean } from '../../common/validators/is-strict-boolean.decorator';
import {
  IsLevelKeyedMap,
  MAX_CHARACTER_LEVEL,
} from '../../common/validators/level-keyed-map.decorator';

export class ClassSpellcastingDto {
  @ApiProperty({ example: 'Wisdom' })
  @IsIn(ABILITY_NAMES)
  ability!: string;

  @ApiPropertyOptional({ description: 'Warlock only: Pact Magic instead of standard slots' })
  @IsOptionalNotNull()
  @IsStrictBoolean()
  pactMagic?: boolean;

  @ApiPropertyOptional({ example: { 1: { 1: 2 } } })
  @IsOptionalNotNull()
  @IsLevelKeyedMap('slotProgression')
  spellSlotProgression?: Record<number, Record<number, number>>;

  @ApiPropertyOptional({ example: { 1: { slots: 1, slotLevel: 1 } } })
  @IsOptionalNotNull()
  @IsLevelKeyedMap('pactProgression')
  pactSlotProgression?: Record<number, { slots: number; slotLevel: number }>;

  @ApiPropertyOptional({ example: { 1: 2 } })
  @IsOptionalNotNull()
  @IsLevelKeyedMap('levelCount')
  cantripsKnown?: Record<number, number>;

  @ApiPropertyOptional({ example: { 1: 4 } })
  @IsOptionalNotNull()
  @IsLevelKeyedMap('levelCount')
  spellsKnown?: Record<number, number>;

  @ApiPropertyOptional({ example: 'Wisdom modifier + half your level' })
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(200)
  preparedFormula?: string;
}

export class EquipmentChoiceItemDto {
  @ApiProperty({ example: 'A greataxe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

export class EquipmentChoiceOptionDto {
  @ApiProperty({ type: [EquipmentChoiceItemDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EquipmentChoiceItemDto)
  items!: EquipmentChoiceItemDto[];
}

export class EquipmentChoiceDto {
  @ApiProperty({ example: 1, description: 'How many of the options below the player picks' })
  @IsInt()
  @Min(1)
  @Max(20)
  choose!: number;

  @ApiProperty({ type: [EquipmentChoiceOptionDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EquipmentChoiceOptionDto)
  from!: EquipmentChoiceOptionDto[];
}

export class StartingEquipmentDto {
  @ApiProperty({ type: [EquipmentChoiceDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EquipmentChoiceDto)
  choices!: EquipmentChoiceDto[];

  @ApiPropertyOptional({ type: [EquipmentChoiceItemDto] })
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => EquipmentChoiceItemDto)
  guaranteed?: EquipmentChoiceItemDto[];

  @ApiPropertyOptional({ example: '5d4 x 10 gp' })
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(100)
  startingGold?: string;
}

export class MulticlassPrerequisiteDto {
  @ApiProperty({ enum: ABILITY_NAMES, example: 'Strength' })
  @IsIn(ABILITY_NAMES)
  ability!: string;

  @ApiProperty({ example: 13 })
  @IsInt()
  @Min(1)
  @Max(30)
  minimum!: number;
}

export class ClassMulticlassingDto {
  @ApiProperty({ type: [MulticlassPrerequisiteDto] })
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => MulticlassPrerequisiteDto)
  prerequisites!: MulticlassPrerequisiteDto[];

  @ApiProperty({ example: ['Light armor', 'Martial weapons'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  proficienciesGained!: string[];

  @ApiProperty({
    enum: CASTER_TYPES,
    nullable: true,
    description: 'How this class contributes to the multiclass spell-slot table; null for none',
  })
  @IsIn([...CASTER_TYPES, null])
  casterType!: string | null;

  @ApiPropertyOptional({
    enum: ['OR'],
    description: 'Present only to flag the exception; absent means every prerequisite must be met',
  })
  @IsOptionalNotNull()
  @IsIn(['OR'])
  prerequisiteLogic?: 'OR';
}

/** Ceiling on a class's feature list. A 20-level SRD class carries 5 to 18 rows;
 * this leaves generous room for a densely-written homebrew class while keeping
 * one request from writing an unbounded number of child rows. */
const MAX_CLASS_FEATURES = 100;

/**
 * Identity a feature row is unique by, matching the
 * `[classId, name, level]` unique index VEG-507 widened the table to.
 *
 * Case-sensitive on purpose. The index is a plain btree over text, so "Rage" and
 * "rage" are two rows to Postgres; folding case here would make the DTO reject a
 * body the database would happily store, which is a rule nobody could find by
 * reading the schema. The two must refuse the same set and nothing more.
 *
 * The separator is a character `level` cannot contain, so ("a|1", 1) and
 * ("a", "1|1") cannot collide the way a bare concatenation would.
 */
function featureIdentity(f: ClassFeatureDto): string {
  return `${f.level}|${f.name}`;
}

/**
 * One per-level entry in a class's feature list (VEG-507).
 *
 * `description` is optional here but the column is NOT NULL; the service
 * defaults a missing one to the empty string, so a half-drafted feature can be
 * saved without inventing prose for it.
 */
export class ClassFeatureDto {
  @ApiProperty({ example: 'Rage' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 1, description: 'Character level at which the feature is gained' })
  @IsInt()
  @Min(1)
  @Max(MAX_CHARACTER_LEVEL)
  level!: number;

  @ApiPropertyOptional({ example: 'In battle, you fight with primal ferocity.' })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;
}

/**
 * Body for creating a homebrew class (VEG-506). Ownership and tier columns are
 * never accepted from the client; {@link ContentCrudService} stamps
 * `contentSource: 'homebrew'` and the actor's `createdById`, and strips those
 * keys from the payload regardless.
 *
 * The three Json columns are validated against real shapes rather than accepted
 * as arbitrary JSON. `spellcasting` is the one that matters most: its
 * progression tables drive spell slots on a character sheet, so a garbage table
 * written here fails at render time on someone's character rather than at the
 * request that stored it.
 *
 * `features` are written as child `ClassFeature` rows in the same request
 * (VEG-507). On PATCH the array is a full **replacement**, not a merge: the
 * class's existing rows are deleted and the payload's are inserted, so every
 * feature gets a fresh id on every write. Merge was not an option worth having —
 * with the row's only natural key being its name and level, a rename plus a
 * re-add is indistinguishable from an edit, so a merge would have to guess.
 * Omitting the key leaves the existing rows untouched; `[]` or `null` clears
 * them all.
 *
 * Both write responses carry the class row **without** its features, on POST and
 * PATCH alike. Re-read `GET /srd/classes/:id` for the rows. The shared write
 * skeleton's delegate takes no `include` and its `create` is final, so returning
 * them on one path and not the other was the only alternative, and an asymmetry
 * between the two verbs is worse than a uniform absence.
 *
 * Subclasses are still absent; they arrive with VEG-509.
 */
export class CreateClassDto {
  @ApiProperty({ example: 'Warden' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: DIE_TYPES, example: 'd10' })
  @IsIn(DIE_TYPES)
  hitDie!: string;

  @ApiPropertyOptional({ example: 'A sworn protector of wild places.' })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  // Closed catalogs, for the same reason backgrounds closes `skillProficiencies`
  // (VEG-493): the guided builder copies these onto the character, so an unknown
  // name propagates into a stat that silently computes as unproficient.
  @ApiPropertyOptional({ enum: ABILITY_NAMES, isArray: true, example: ['Strength'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsEachInCatalog(ABILITY_NAMES, 'ability')
  primaryAbilities?: string[];

  @ApiPropertyOptional({
    enum: ABILITY_NAMES,
    isArray: true,
    example: ['Strength', 'Constitution'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsEachInCatalog(ABILITY_NAMES, 'ability')
  savingThrows?: string[];

  @ApiPropertyOptional({ enum: SKILL_NAMES, isArray: true, example: ['Athletics', 'Survival'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(18)
  @IsEachInCatalog(SKILL_NAMES, 'skill')
  skillChoices?: string[];

  @ApiPropertyOptional({ example: ['Light armor', 'Medium armor', 'Shields'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  armorProficiencies?: string[];

  @ApiPropertyOptional({ example: ['Simple weapons', 'Martial weapons'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  weaponProficiencies?: string[];

  @ApiPropertyOptional({ example: ['Herbalism Kit'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  toolProficiencies?: string[];

  @ApiPropertyOptional({ example: 2, description: 'How many of skillChoices the player picks' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(18)
  numSkillChoices?: number;

  @ApiPropertyOptional({ example: 3, description: 'Level at which a subclass is chosen' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_CHARACTER_LEVEL)
  subclassLevel?: number;

  @ApiPropertyOptional({ type: ClassSpellcastingDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ClassSpellcastingDto)
  spellcasting?: ClassSpellcastingDto;

  @ApiPropertyOptional({ type: StartingEquipmentDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => StartingEquipmentDto)
  equipmentChoices?: StartingEquipmentDto;

  @ApiPropertyOptional({ type: ClassMulticlassingDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ClassMulticlassingDto)
  multiclassing?: ClassMulticlassingDto;

  @ApiPropertyOptional({
    type: [ClassFeatureDto],
    description:
      'Per-level features. Replaces the class’s existing features outright; ' +
      'omit to leave them alone, send [] or null to clear them.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CLASS_FEATURES)
  // `@ValidateNested({ each: true })` does not reject an element that is itself
  // an array: it treats one as a nested collection and validates its members, so
  // `features: [[]]` passes every constraint below with nothing to check. That
  // reached the service as `{ name: undefined, level: undefined }` and became a
  // 500 at the insert. `@IsObject` excludes arrays, which closes it — the same
  // pairing the three Json columns above already use.
  @IsObject({ each: true })
  // Rejects here what the [classId, name, level] index would reject at the
  // write, so the author gets a 400 naming the field rather than a 409 or —
  // before this ran — a duplicate-*class*-name conflict from the shared error
  // mapper, which keys everything to the parent noun.
  @ArrayUnique(featureIdentity)
  @ValidateNested({ each: true })
  @Type(() => ClassFeatureDto)
  // `| null` because null is a real, tested input here, not a stray: it is how
  // the client clears the list (VEG-316), the same as the String[] columns
  // above. Declaring it `ClassFeatureDto[] | undefined` would be the type
  // saying a value the service handles on purpose cannot arrive, which is what
  // forced the mapping helper to take `unknown` and cast.
  features?: ClassFeatureDto[] | null;
}
