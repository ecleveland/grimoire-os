import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Concentration tracking (VEG-287/VEG-408). Mirrors the shared
 * `CombatantConcentration`: the object's presence means concentrating; `spell`
 * optionally names what. One class serves both the encounter tracker's
 * combatants and the character sheet's status tracker so the validation can't
 * drift.
 */
export class ConcentrationDto {
  @ApiPropertyOptional({ description: 'The spell being concentrated on, if named.' })
  @IsOptional()
  @IsString()
  spell?: string;
}
