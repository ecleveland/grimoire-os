import { OmitType, PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min } from 'class-validator';
import { ABILITY_NAMES, SKILL_NAMES } from '@grimoire-os/shared';
import {
  IsCatalogArray,
  IsOptionalStringArray,
} from '../../common/validators/optional-array.decorators';
import { CreateCharacterDto } from './create-character.dto';

/**
 * The non-null `String[]` columns, redeclared here rather than inherited.
 *
 * `PartialType` re-applies `@IsOptional()` to every property it copies, and
 * class-validator only validates when *all* conditional-validation metadata
 * agrees — so the inherited `@IsOptional()` would silently defeat the
 * "null is not a legal value" rule these fields carry on the create DTO, on the
 * path where it matters most: PATCH is how a sheet edit is saved, and a client
 * that serialises unset optional fields as null would otherwise erase a
 * character's proficiencies and get a 200 back. Omitting them from the type
 * this extends means PartialType never sees them and the decorators below are
 * the only ones in play.
 *
 * They are one-line composites so this can't drift from CreateCharacterDto: both
 * sides name the same decorator and the same catalog.
 */
const REDECLARED_ARRAY_FIELDS = [
  'skills',
  'savingThrows',
  'languages',
  'proficiencies',
  'armorTraining',
] as const;

export class UpdateCharacterDto extends PartialType(
  // autoEquipStartingGear is a create-only control flag (VEG-483): omitting it
  // here keeps it off PATCH, where the service spreads the DTO straight into
  // Prisma and an unknown argument would 500.
  OmitType(CreateCharacterDto, [
    'campaignId',
    'autoEquipStartingGear',
    ...REDECLARED_ARRAY_FIELDS,
  ] as const)
) {
  @ApiPropertyOptional({ enum: SKILL_NAMES, isArray: true, example: ['Athletics', 'Intimidation'] })
  @IsCatalogArray(SKILL_NAMES, 'skill')
  skills?: string[];

  @ApiPropertyOptional({
    enum: ABILITY_NAMES,
    isArray: true,
    example: ['Strength', 'Constitution'],
  })
  @IsCatalogArray(ABILITY_NAMES, 'saving throw')
  savingThrows?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptionalStringArray()
  languages?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptionalStringArray()
  proficiencies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptionalStringArray()
  armorTraining?: string[];

  /**
   * Last-read version for optimistic locking (VEG-137). When supplied, the
   * update is rejected with 409 if the row has moved on. Omit to skip the guard.
   */
  @ApiPropertyOptional({ description: 'Last-read version for optimistic locking' })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}
