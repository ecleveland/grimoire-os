import { OmitType, PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min } from 'class-validator';
import { CreateCharacterDto } from './create-character.dto';

export class UpdateCharacterDto extends PartialType(
  // autoEquipStartingGear is a create-only control flag (VEG-483): omitting it
  // here keeps it off PATCH, where the service spreads the DTO straight into
  // Prisma and an unknown argument would 500.
  OmitType(CreateCharacterDto, ['campaignId', 'autoEquipStartingGear'] as const)
) {
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
