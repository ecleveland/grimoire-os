import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddNpcRelationDto {
  @ApiProperty({ description: 'Target NPC id' })
  @IsUUID()
  toNpcId!: string;

  @ApiProperty({ example: 'sibling' })
  @IsString()
  relation!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
