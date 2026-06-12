import type { Combatant, SrdMonster } from '@/lib/types';

/** Derive the 5e DEX modifier from a monster's raw DEX score: floor((dex - 10) / 2). */
export function dexModifier(monster: SrdMonster): number {
  return Math.floor((monster.dex - 10) / 2);
}

/**
 * Roll initiative for a monster: d20 + DEX modifier. `rng` is injectable so
 * tests can pin the roll; in the app it defaults to Math.random.
 */
export function rollInitiative(monster: SrdMonster, rng: () => number = Math.random): number {
  const d20 = Math.floor(rng() * 20) + 1;
  return d20 + dexModifier(monster);
}

/**
 * Produce `count` fresh combatant names for `base`, auto-numbering on collision
 * within the encounter. The first free name is the bare base ("Goblin"); further
 * ones append an incrementing suffix ("Goblin 2", "Goblin 3", …). Names already
 * present in `existingNames` — including ones generated earlier in this batch —
 * are skipped so a batch never collides with itself.
 */
export function nextCombatantNames(existingNames: string[], base: string, count: number): string[] {
  const taken = new Set(existingNames);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    let candidate = base;
    let suffix = 1;
    while (taken.has(candidate)) {
      suffix += 1;
      candidate = `${base} ${suffix}`;
    }
    taken.add(candidate);
    names.push(candidate);
  }
  return names;
}

/** Form values for a hand-entered combatant (VEG-282) — no SRD monster behind it. */
export interface ManualCombatantInput {
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  ac: number;
  isNpc: boolean;
  notes?: string;
}

/**
 * Build a single ad-hoc combatant from form input (VEG-282): the name is
 * trimmed and auto-numbered against `existingNames`, blank notes are omitted
 * entirely, and no `monsterId` is set — manual combatants have no source stat
 * block to re-open.
 */
export function buildManualCombatant(
  input: ManualCombatantInput,
  existingNames: string[]
): Combatant {
  const [name] = nextCombatantNames(existingNames, input.name.trim(), 1);
  const notes = input.notes?.trim();
  return {
    name,
    initiative: input.initiative,
    hp: input.hp,
    maxHp: input.maxHp,
    ac: input.ac,
    isNpc: input.isNpc,
    ...(notes ? { notes } : {}),
  };
}

export interface BuildCombatantsOptions {
  quantity: number;
  /** One initiative value per combatant; length must equal `quantity`. */
  initiatives: number[];
}

/**
 * Build `quantity` NPC combatants pre-filled from a monster (VEG-260): name is
 * auto-numbered against `existingNames`, AC/HP come from the stat block, and
 * `monsterId` is recorded so the tracker can re-open the source stat block.
 */
export function buildMonsterCombatants(
  monster: SrdMonster,
  { quantity, initiatives }: BuildCombatantsOptions,
  existingNames: string[]
): Combatant[] {
  if (initiatives.length !== quantity) {
    throw new Error(`initiatives length (${initiatives.length}) must match quantity (${quantity})`);
  }
  const names = nextCombatantNames(existingNames, monster.name, quantity);
  return names.map((name, i) => ({
    name,
    initiative: initiatives[i],
    hp: monster.hitPoints,
    maxHp: monster.hitPoints,
    ac: monster.armorClass,
    isNpc: true,
    monsterId: monster.id,
  }));
}
