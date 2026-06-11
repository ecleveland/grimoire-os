import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Body of POST /encounters/:id/loot (VEG-300). */
export class RollEncounterLootDto {
  /**
   * Index into the encounter's combatants array. When given, only that
   * combatant is rolled (it must reference a monster); omit to roll every
   * monster combatant. Combatants have no ids of their own — the embedded
   * array position is their only stable address.
   */
  @ApiPropertyOptional({
    description: 'Combatant to roll for; omit to roll all monster combatants',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  combatantIndex?: number;

  /**
   * Last-read version for optimistic locking (VEG-137). When supplied, the
   * roll is rejected with 409 if another version-checked write has bumped the
   * version since (unguarded writes don't bump it and stay invisible to the
   * guard). Omit to skip the check — but note an unguarded roll rewrites the
   * whole combatants array server-side, so concurrent combatant edits can be
   * silently reverted; clients should send this.
   */
  @ApiPropertyOptional({ description: 'Last-read version for optimistic locking' })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;

  /** Deterministic seed; a random one is generated when omitted. */
  @ApiPropertyOptional({ description: 'Optional deterministic seed' })
  @IsOptional()
  @IsString()
  seed?: string;
}
