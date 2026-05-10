import { OmitType, PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, ValidateIf, IsObject } from 'class-validator';
import { CreateNpcDto } from './create-npc.dto';

export class UpdateNpcDto extends PartialType(
  OmitType(CreateNpcDto, ['campaignId', 'statBlock'] as const)
) {
  // Permit explicit `null` to clear an existing stat block ("Remove Stat Block").
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsObject()
  statBlock?: Record<string, unknown> | null;
}
