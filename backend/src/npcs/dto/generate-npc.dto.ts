import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsStrictBoolean } from '../../common/validators/is-strict-boolean.decorator';

export class LootOverridesDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  trinketChance?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  magicItemChance?: number;

  @ApiPropertyOptional({ example: '1d3' })
  @IsOptional()
  @IsString()
  itemCountDie?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  coinageMultiplier?: number;
}

export class GenerateNpcDto {
  @ApiProperty()
  @IsUUID()
  campaignId!: string;

  @ApiPropertyOptional({ description: 'Optional deterministic seed' })
  @IsOptional()
  @IsString()
  seed?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  race?: string;

  @ApiPropertyOptional({ description: 'Free-text region/setting (e.g. "dwarven mine")' })
  @IsOptional()
  @IsString()
  setting?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  background?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alignment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['male', 'female'] })
  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @ApiPropertyOptional({ enum: ['friendly', 'neutral', 'hostile'] })
  @IsOptional()
  @IsIn(['friendly', 'neutral', 'hostile'])
  hostility?: 'friendly' | 'neutral' | 'hostile';

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  combatRelevant?: boolean;

  @ApiPropertyOptional({ type: LootOverridesDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LootOverridesDto)
  lootOverrides?: LootOverridesDto;
}
