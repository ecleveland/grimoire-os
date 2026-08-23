import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { MAX_INT4 } from '@grimoire-os/shared';
import { CampaignStatus } from '../../prisma/enums';

export class CreateCampaignDto {
  @ApiProperty({ example: 'Curse of Strahd' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'A gothic horror adventure in Barovia' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @ApiPropertyOptional({ example: 'Forgotten Realms' })
  @IsOptional()
  @IsString()
  setting?: string;

  // An Int column, so a fractional or out-of-int4 value 500s in the Prisma
  // driver rather than 400ing here (VEG-496). Bounded by the column alone: a
  // campaign can run for as many sessions as it likes.
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_INT4)
  currentSession?: number;
}
