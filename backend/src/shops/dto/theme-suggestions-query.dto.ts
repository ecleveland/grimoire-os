import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Query for the theme-suggestion endpoint (VEG-355). */
export class ThemeSuggestionsQueryDto {
  @ApiProperty({ example: 'alchemist', description: 'Shop theme key to suggest stock for' })
  @IsString()
  @IsNotEmpty()
  theme!: string;
}
