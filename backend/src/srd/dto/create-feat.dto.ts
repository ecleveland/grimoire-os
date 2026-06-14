import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsStrictBoolean } from '../../common/validators/is-strict-boolean.decorator';

/**
 * Body for creating a homebrew feat (VEG-295). Mirrors the SRD feat shape;
 * ownership/tier fields are never accepted from the client — the service
 * stamps `contentSource: 'homebrew'` and the actor's `createdById`.
 */
export class CreateFeatDto {
  @ApiProperty({ example: 'Shield Master' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'You use shields not just for protection but also for offense.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  description!: string;

  @ApiPropertyOptional({ example: 'Level 4+, Fighter' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  prerequisite?: string;

  @ApiPropertyOptional({
    example: ['Shield Bash: When you take the Attack action, you can shove with your shield.'],
    description: 'One entry per benefit, shown as a bulleted list',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  benefits?: string[];

  @ApiPropertyOptional({ example: 'General' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsStrictBoolean()
  repeatable?: boolean;
}
