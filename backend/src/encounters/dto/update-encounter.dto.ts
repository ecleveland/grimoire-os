import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateEncounterDto } from './create-encounter.dto';
import { IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class UpdateEncounterDto extends PartialType(
  OmitType(CreateEncounterDto, ['campaignId'] as const)
) {
  @IsOptional()
  @IsNumber()
  currentTurn?: number;

  @IsOptional()
  @IsNumber()
  round?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
