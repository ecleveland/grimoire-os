import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

// Optional generator constraint overrides. Mirrors GenerateNpcDto fields
// except `campaignId`, which is always inherited from the source NPC.
export class RelatedConstraintsOverrideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seed?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  race?: string;

  @ApiPropertyOptional()
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
  @IsBoolean()
  combatRelevant?: boolean;
}

export class GenerateRelatedNpcDto {
  @ApiProperty({
    description:
      "The new NPC's role relative to the source (e.g. 'parent', 'child', 'sibling', 'spouse', 'friend', or a custom string)",
    example: 'parent',
  })
  @IsString()
  relation!: string;

  @ApiPropertyOptional({ type: RelatedConstraintsOverrideDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RelatedConstraintsOverrideDto)
  constraintsOverride?: RelatedConstraintsOverrideDto;
}
