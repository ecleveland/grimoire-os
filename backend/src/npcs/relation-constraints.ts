// Pure helpers that pre-seed the NPC generator when creating a related NPC
// via POST /npcs/:id/relations/generate. All inputs/outputs are plain
// values so the rules are unit-testable without a Prisma client.

import { SeededRng } from './generator/seeded-rng';

export function extractFamilyName(fullName: string): string | null {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  return tokens[tokens.length - 1];
}

export function swapFamilyName(generatedName: string, familyName: string | null): string {
  if (!familyName) return generatedName;
  const tokens = generatedName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return familyName;
  if (tokens.length === 1) return `${tokens[0]} ${familyName}`;
  tokens[tokens.length - 1] = familyName;
  return tokens.join(' ');
}

// Canonical half-X races recognised by 5e. Order-independent. Mixed pairs not
// in this map default to the source parent's race (the generator can still
// produce a thematic appearance via overrides).
const HALF_RACE_MAP: ReadonlyMap<string, string> = new Map([
  [pairKey('Human', 'Elf'), 'Half-Elf'],
  [pairKey('Human', 'Orc'), 'Half-Orc'],
  [pairKey('Elf', 'Orc'), 'Half-Orc'],
]);

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

export function pickChildRace(sourceRace: string, spouseRace: string | null): string {
  if (!spouseRace || sourceRace === spouseRace) return sourceRace;
  return HALF_RACE_MAP.get(pairKey(sourceRace, spouseRace)) ?? sourceRace;
}

export function adjustedAgeForRelation(
  sourceAge: number | null,
  relation: string,
  seed?: string
): number | null {
  if (sourceAge === null || sourceAge === undefined) return null;
  switch (relation) {
    case 'parent':
      return sourceAge + 25;
    case 'child':
      return Math.max(0, sourceAge - 25);
    case 'sibling': {
      const rng = new SeededRng(seed ?? `sibling-${sourceAge}`);
      const offset = rng.intInRange(-5, 5);
      return Math.max(0, sourceAge + offset);
    }
    default:
      return null;
  }
}
