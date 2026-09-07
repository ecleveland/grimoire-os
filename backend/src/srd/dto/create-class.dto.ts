import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
 * Features and subclasses are deliberately absent: a class created here has
 * neither, and they arrive with VEG-507 and VEG-509 respectively.
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
}
