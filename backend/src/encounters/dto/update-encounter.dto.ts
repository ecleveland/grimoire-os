import { OmitType, PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateEncounterDto } from './create-encounter.dto';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { MAX_INT4 } from '@grimoire-os/shared';
import { IsStrictBoolean } from '../../common/validators/is-strict-boolean.decorator';

export class UpdateEncounterDto extends PartialType(
  OmitType(CreateEncounterDto, ['campaignId'] as const)
) {
  // Both are Int columns, so a fractional or out-of-int4 value 500s in the
  // Prisma driver instead of 400ing here (VEG-496). currentTurn indexes into
  // combatants and round counts up, so both floor at 0 and are capped by the
  // column rather than by any rule.
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_INT4)
  currentTurn?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_INT4)
  round?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  isActive?: boolean;

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
