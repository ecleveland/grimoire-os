import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class MonsterActionDto {
  @ApiProperty({ example: 'Slam' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one target.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;
}

/**
 * Body for creating a homebrew monster (VEG-293). Mirrors the SRD monster
 * shape; ownership/tier fields are never accepted from the client — the
 * service stamps `contentSource: 'homebrew'` and the actor's `createdById`.
 */
export class CreateMonsterDto {
  @ApiProperty({ example: 'Cave Troll' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'Large' })
  @IsString()
  @IsNotEmpty()
  size!: string;

  @ApiProperty({ example: 'Giant' })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiPropertyOptional({ example: 'shapechanger' })
  @IsOptional()
  @IsString()
  subtype?: string;

  @ApiPropertyOptional({ example: 'chaotic evil' })
  @IsOptional()
  @IsString()
  alignment?: string;

  @ApiProperty({ example: 15 })
  @IsInt()
  @Min(0)
  armorClass!: number;

  @ApiPropertyOptional({ example: 'natural armor' })
  @IsOptional()
  @IsString()
  armorType?: string;

  @ApiProperty({ example: 84 })
  @IsInt()
  @Min(1)
  hitPoints!: number;

  @ApiPropertyOptional({ example: '8d10 + 40' })
  @IsOptional()
  @IsString()
  hitDice?: string;

  @ApiProperty({ example: '30 ft.' })
  @IsString()
  @IsNotEmpty()
  speed!: string;

  @ApiProperty({ example: 18 })
  @IsInt()
  @Min(1)
  @Max(30)
  str!: number;

  @ApiProperty({ example: 13 })
  @IsInt()
  @Min(1)
  @Max(30)
  dex!: number;

  @ApiProperty({ example: 20 })
  @IsInt()
  @Min(1)
  @Max(30)
  con!: number;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(1)
  @Max(30)
  int!: number;

  @ApiProperty({ example: 9 })
  @IsInt()
  @Min(1)
  @Max(30)
  wis!: number;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(1)
  @Max(30)
  cha!: number;

  @ApiPropertyOptional({ example: { str: 7, con: 9 }, description: 'Save bonuses by ability' })
  @IsOptional()
  @IsObject()
  savingThrows?: Record<string, number>;

  @ApiPropertyOptional({ example: { perception: 2 }, description: 'Skill bonuses by skill name' })
  @IsOptional()
  @IsObject()
  skills?: Record<string, number>;

  @ApiPropertyOptional({ example: ['cold', 'fire'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  damageResistances?: string[];

  @ApiPropertyOptional({ example: ['poison'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  damageImmunities?: string[];

  @ApiPropertyOptional({ example: ['thunder'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  damageVulnerabilities?: string[];

  @ApiPropertyOptional({ example: ['poisoned'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditionImmunities?: string[];

  @ApiPropertyOptional({ example: 'darkvision 60 ft., passive Perception 12' })
  @IsOptional()
  @IsString()
  senses?: string;

  @ApiPropertyOptional({ example: 'Giant' })
  @IsOptional()
  @IsString()
  languages?: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0)
  @Max(30)
  challengeRating!: number;

  @ApiPropertyOptional({ example: 1800 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  experiencePoints?: number;

  @ApiPropertyOptional({ type: [MonsterActionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonsterActionDto)
  specialAbilities?: MonsterActionDto[];

  @ApiPropertyOptional({ type: [MonsterActionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonsterActionDto)
  actions?: MonsterActionDto[];

  @ApiPropertyOptional({ type: [MonsterActionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonsterActionDto)
  reactions?: MonsterActionDto[];

  @ApiPropertyOptional({ type: [MonsterActionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonsterActionDto)
  legendaryActions?: MonsterActionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;
}
