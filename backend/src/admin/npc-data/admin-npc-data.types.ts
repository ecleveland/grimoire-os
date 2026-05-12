export const NPC_DATA_TABLES = [
  'names',
  'appearance',
  'loot-templates',
  'trinkets',
  'personality',
] as const;

export type NpcDataTable = (typeof NPC_DATA_TABLES)[number];

export const PERSONALITY_KINDS = ['personalityTraits', 'ideals', 'bonds', 'flaws'] as const;
export type PersonalityKind = (typeof PERSONALITY_KINDS)[number];

export function isNpcDataTable(value: string): value is NpcDataTable {
  return (NPC_DATA_TABLES as readonly string[]).includes(value);
}

export function isPersonalityKind(value: unknown): value is PersonalityKind {
  return typeof value === 'string' && (PERSONALITY_KINDS as readonly string[]).includes(value);
}
