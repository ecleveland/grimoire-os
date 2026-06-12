import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
  // Restore the raw body value: without this, the global pipe's
  // enableImplicitConversion coerces any non-empty string (including 'false')
  // to true before @IsBoolean runs. The transform's `value` is already
  // coerced; only `obj` still holds the original. (Same fix as VEG-314.)
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.repeatable)
  @IsBoolean()
  repeatable?: boolean;
}
