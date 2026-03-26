import { OmitType, PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateEncounterDto } from './create-encounter.dto';
import { IsOptional, IsNumber, IsBoolean } from 'class-validator';

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
}
