import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsStrictBoolean } from '../../common/validators/is-strict-boolean.decorator';

/**
 * Body for creating a homebrew spell (VEG-294). Mirrors the SRD spell shape;
 * ownership/tier fields are never accepted from the client — the service
 * stamps `contentSource: 'homebrew'` and the actor's `createdById`.
 */
export class CreateSpellDto {
  @ApiProperty({ example: 'Arcane Burst' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 2, description: '0 for cantrips, 1-9 for leveled spells' })
  @IsInt()
  @Min(0)
  @Max(9)
  level!: number;

  @ApiProperty({ example: 'Evocation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  school!: string;

  @ApiProperty({ example: '1 action' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  castingTime!: string;

  @ApiProperty({ example: '60 feet' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  range!: string;

  @ApiProperty({ example: 'V, S, M' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  components!: string;

  @ApiProperty({ example: 'Instantaneous' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  duration!: string;

  @ApiProperty({ example: 'A burst of raw arcane energy erupts from your hand.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  description!: string;

  @ApiPropertyOptional({ example: ['Wizard', 'Sorcerer'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  classes?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsStrictBoolean()
  ritual?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsStrictBoolean()
  concentration?: boolean;

  @ApiPropertyOptional({ example: 'a pinch of soot' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  material?: string;

  @ApiPropertyOptional({
    example: 'The damage increases by 1d8 for each slot level above 2nd.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  higherLevels?: string;
}
