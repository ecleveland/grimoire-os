import type { CharacterResource, ResourceRecharge } from '@/lib/types';

/**
 * Pure state transitions for the sheet's limited-use resource tracker
 * (VEG-409): player-defined pools like ki, rage, or sorcery points. `used` is a
 * consumed counter mirroring `SpellSlot.used`/`HitDice.spent`. List edits are
 * immutable and index-based, matching how the other editable JSON arrays
 * (inventory, weapons) are addressed — spend/restore is just an `editResource`
 * of `used`, so the 0..max clamp has a single home. Rest recovery lives here
 * too so the rest composites in `character-play.ts` and the tracker UI share
 * one rule.
 */

export function addResource(
  list: CharacterResource[],
  resource: CharacterResource
): CharacterResource[] {
  return [...list, resource];
}

/**
 * Merge `patch` into the entry at `index`; out-of-range indexes return the list
 * unchanged. Shrinking `max` re-clamps `used` so the tracker never renders (or
 * persists) more consumed uses than the pool holds.
 */
export function editResource(
  list: CharacterResource[],
  index: number,
  patch: Partial<CharacterResource>
): CharacterResource[] {
  return list.map((resource, i) => {
    if (i !== index) return resource;
    const next = { ...resource, ...patch };
    return { ...next, used: Math.max(0, Math.min(next.max, next.used)) };
  });
}

export function removeResource(list: CharacterResource[], index: number): CharacterResource[] {
  return list.filter((_, i) => i !== index);
}

/**
 * Rest recovery (5e): a short rest restores `recharge: 'short'` resources; a
 * long rest restores both kinds. `scope` names the rest taken.
 */
export function recoverResources(
  list: CharacterResource[],
  scope: ResourceRecharge
): CharacterResource[] {
  return list.map(resource =>
    scope === 'long' || resource.recharge === 'short' ? { ...resource, used: 0 } : resource
  );
}
