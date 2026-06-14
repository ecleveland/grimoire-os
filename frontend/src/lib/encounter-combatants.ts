import type { Combatant, PartyCharacter, SrdMonster } from '@/lib/types';
import { xpForCr } from '@grimoire-os/shared';

/** Derive the 5e DEX modifier from a monster's raw DEX score: floor((dex - 10) / 2). */
export function dexModifier(monster: SrdMonster): number {
  return Math.floor((monster.dex - 10) / 2);
}

/**
 * Roll initiative for any flat modifier: d20 + mod (VEG-283). `rng` is
 * injectable so tests can pin the roll; in the app it defaults to Math.random.
 */
export function rollInitiativeMod(mod: number, rng: () => number = Math.random): number {
  const d20 = Math.floor(rng() * 20) + 1;
  return d20 + mod;
}

/** Roll initiative for a monster: d20 + DEX modifier. */
export function rollInitiative(monster: SrdMonster, rng: () => number = Math.random): number {
  return rollInitiativeMod(dexModifier(monster), rng);
}

/**
 * Parse a freeform integer form field: finite numbers truncate to whole
 * values, blank or non-numeric input falls back to 0. The one parser shared
 * by all the add-combatant dialogs so their semantics can't drift.
 */
export function parseIntField(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && value.trim() !== '' ? Math.trunc(n) : 0;
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
 * block to re-open. HP is clamped to [0, maxHp] (the same invariant
 * commitCombatantHp enforces on edits) so a combatant can't start above its
 * maximum or below zero.
 */
export function buildManualCombatant(
  input: ManualCombatantInput,
  existingNames: string[]
): Combatant {
  const [name] = nextCombatantNames(existingNames, input.name.trim(), 1);
  const notes = input.notes?.trim();
  const maxHp = Math.max(0, input.maxHp);
  return {
    name,
    initiative: input.initiative,
    hp: Math.max(0, Math.min(input.hp, maxHp)),
    maxHp,
    ac: input.ac,
    isNpc: input.isNpc,
    ...(notes ? { notes } : {}),
  };
}

/** One picker row: which PC to add and the initiative the DM settled on. */
export interface PartyCombatantEntry {
  character: PartyCharacter;
  initiative: number;
}

/**
 * Build PC combatants from the party roster (VEG-283). AC and current/max/temp
 * HP are an add-time snapshot of the sheet (missing values fall back to 10,
 * current HP clamps into [0, max] in case the sheet is stale, and zero temp HP
 * is omitted like the rest of the tracker does), names auto-number against the
 * encounter and within the batch, and `isNpc` is always false. No
 * `characterId` linkage yet — gated on VEG-256.
 */
export function buildPartyCombatants(
  entries: PartyCombatantEntry[],
  existingNames: string[]
): Combatant[] {
  const taken = [...existingNames];
  return entries.map(({ character, initiative }) => {
    const [name] = nextCombatantNames(taken, character.name.trim(), 1);
    taken.push(name);
    const maxHp = character.hitPoints?.max ?? 10;
    const current = character.hitPoints?.current ?? maxHp;
    const tempHp = character.hitPoints?.temporary ?? 0;
    // Snapshot the sheet level (VEG-362) so the difficulty budget comes from the
    // encounter's own PCs without re-fetching the roster. Clamp to a whole 1–20:
    // a character's level isn't bounded at the character layer, but the
    // combatant write contract is (@IsInt @Min(1) @Max(20)), and every combatant
    // is echoed back on later PATCHes — an out-of-range snapshot would 400 the
    // write and brick the encounter. A non-finite level is omitted so the PC
    // simply doesn't contribute to the budget.
    const level = Number.isFinite(character.level)
      ? Math.min(20, Math.max(1, Math.trunc(character.level)))
      : undefined;
    return {
      name,
      initiative,
      hp: Math.max(0, Math.min(current, maxHp)),
      maxHp,
      ...(tempHp > 0 ? { tempHp } : {}),
      ac: character.armorClass ?? 10,
      isNpc: false,
      ...(level !== undefined ? { level } : {}),
    };
  });
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
    // Snapshot CR + XP (VEG-362) so the difficulty readout can sum them without
    // re-fetching the stat block; prefer the monster's own XP (homebrew can
    // override) and fall back to the canonical CR→XP value.
    cr: monster.challengeRating,
    xp: monster.experiencePoints ?? xpForCr(monster.challengeRating),
  }));
}
