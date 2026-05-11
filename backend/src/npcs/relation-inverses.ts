// Forward-relation → inverse-relation map used when persisting NPC relations
// as bidirectional pairs (store-both per design Q6). Relations not in the map
// default to symmetric — the same label on both sides.

const INVERSE_MAP: Readonly<Record<string, string>> = {
  parent: 'child',
  child: 'parent',
  sibling: 'sibling',
  spouse: 'spouse',
  mentor: 'student',
  student: 'mentor',
  rival: 'rival',
  ally: 'ally',
  friend: 'friend',
  enemy: 'enemy',
  boss: 'subordinate',
  subordinate: 'boss',
};

export function inverseOf(relation: string): string {
  return INVERSE_MAP[relation] ?? relation;
}

export const KNOWN_RELATIONS: readonly string[] = Object.keys(INVERSE_MAP);
