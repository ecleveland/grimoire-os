import type { Combatant } from '@grimoire-os/shared';

/**
 * Drop the combatants linked (via `characterId`) to any of the given character
 * ids — used when a player leaves a campaign to strip their PC combatants from
 * the encounters' embedded JSON arrays (VEG-256).
 *
 * Legacy combatants without a `characterId` are always kept (there's no reliable
 * key to attribute them, which is exactly why this linkage was added). Returns
 * the filtered array plus how many were removed, so the caller only rewrites the
 * encounters that actually changed.
 */
export function stripCombatantsForCharacters(
  combatants: Combatant[] | null,
  characterIds: ReadonlySet<string>
): { combatants: Combatant[]; removed: number } {
  const source = combatants ?? [];
  const kept = source.filter(c => c.characterId === undefined || !characterIds.has(c.characterId));
  return { combatants: kept, removed: source.length - kept.length };
}
