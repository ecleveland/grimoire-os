import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { SKILL_NAMES } from '@grimoire-os/shared';
import { IsEachInCatalog } from '../../common/validators/is-each-in-catalog.decorator';

/**
 * Body for creating a homebrew background (VEG-431). Mirrors the SRD background
 * shape; ownership/tier fields are never accepted from the client — the service
 * stamps `contentSource: 'homebrew'` and the actor's `createdById`.
 *
 * `originFeatId` may reference an SRD feat or one of the caller's own homebrew
 * feats; visibility is validated in the service (not here — it needs the DB and
 * the acting user). `BackgroundFeature` children are deliberately not accepted
 * yet (VEG-472): the unified feature search has no visibility filtering, so
 * homebrew feature rows would leak globally.
 */
export class CreateBackgroundDto {
  @ApiProperty({ example: 'Gravedigger' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'You spent years tending the resting places of the dead.' })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  // Closed catalog (VEG-493): the guided builder's Origin step copies this
  // array straight onto Character.skills, so an unknown name here propagates
  // into a skill that silently computes as unproficient. Catalog membership
  // subsumes the length bound the other proficiency arrays need.
  @ApiPropertyOptional({ enum: SKILL_NAMES, isArray: true, example: ['Insight', 'Religion'] })
  @IsOptional()
  @IsArray()
  @IsEachInCatalog(SKILL_NAMES, 'skill')
  skillProficiencies?: string[];

  @ApiPropertyOptional({ example: ["Mason's Tools"] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  toolProficiencies?: string[];

  @ApiPropertyOptional({ example: 1, description: 'Number of additional languages granted' })
  @IsOptional()
  @IsInt()
  @Min(0)
  languages?: number;

  @ApiPropertyOptional({ example: 'A shovel, a set of common clothes, and a pouch with 10 gp' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  equipment?: string;

  @ApiPropertyOptional({ example: ['I keep quiet vigil over things others forget.'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  personalityTraits?: string[];

  @ApiPropertyOptional({ example: ['Respect. The dead deserve dignity. (Lawful)'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  ideals?: string[];

  @ApiPropertyOptional({ example: ['I owe the sexton who taught me everything.'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  bonds?: string[];

  @ApiPropertyOptional({ example: ['I speak to the dead more easily than the living.'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  flaws?: string[];

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Origin feat granted by this background — an SRD feat or one of your own homebrew feats',
  })
  @IsOptional()
  @IsUUID()
  originFeatId?: string;

  @ApiPropertyOptional({
    example: 'Cleric',
    description: 'Chosen option for a parameterized origin feat (e.g. Magic Initiate "Cleric")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  originFeatOption?: string;
}
