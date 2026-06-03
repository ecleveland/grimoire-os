import { OmitType, PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateEncounterDto } from './create-encounter.dto';
import { IsOptional, IsNumber, IsBoolean, IsInt, Min } from 'class-validator';

export class UpdateEncounterDto extends PartialType(
  OmitType(CreateEncounterDto, ['campaignId'] as const)
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  currentTurn?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  round?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
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
