import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';
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

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  currentSession?: number;
}
