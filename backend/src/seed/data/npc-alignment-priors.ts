// Joint distribution `P(alignment | race, background)` for the NPC generator.
// `weights` is a 9-vector ordered exactly as `NPC_ALIGNMENT_ORDER` below.
// Lookup falls back from `(race, background)` → `(race, null)` → uniform.
//
// Curated for v1. Custom user overrides land in a separate table (see VEG-251).

export const NPC_ALIGNMENT_ORDER = [
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil',
] as const;

export type NpcAlignmentPriorEntry = {
  race: string;
  background: string | null; // null → default for race
  weights: number[];
};

export const npcAlignmentPriors: NpcAlignmentPriorEntry[] = [
  // ── Race defaults ──────────────────────────────────────
  { race: 'Dragonborn', background: null, weights: [4, 5, 4, 4, 4, 3, 2, 2, 2] },
  { race: 'Dwarf', background: null, weights: [6, 6, 4, 4, 4, 2, 2, 1, 1] },
  { race: 'Elf', background: null, weights: [3, 5, 6, 3, 4, 4, 1, 1, 2] },
  { race: 'Gnome', background: null, weights: [3, 5, 5, 3, 5, 4, 1, 2, 2] },
  { race: 'Goliath', background: null, weights: [3, 4, 4, 4, 5, 4, 2, 2, 2] },
  { race: 'Halfling', background: null, weights: [4, 6, 5, 3, 5, 3, 1, 1, 1] },
  { race: 'Human', background: null, weights: [4, 4, 4, 4, 4, 4, 3, 3, 3] },
  { race: 'Orc', background: null, weights: [2, 2, 3, 3, 4, 4, 3, 4, 5] },
  { race: 'Tiefling', background: null, weights: [1, 1, 1, 2, 3, 4, 4, 6, 8] },

  // ── Tiefling background-specific overrides ─────────────
  // Faith pulls toward law/good — devout tieflings *can* roll LG.
  { race: 'Tiefling', background: 'Acolyte', weights: [6, 5, 3, 4, 4, 2, 2, 2, 2] },
  // Criminal life amplifies the racial baseline.
  { race: 'Tiefling', background: 'Criminal', weights: [0, 0, 1, 1, 2, 4, 4, 6, 9] },

  // ── Orc background-specific overrides ──────────────────
  // Soldier discipline shifts toward law/good.
  { race: 'Orc', background: 'Soldier', weights: [4, 4, 3, 5, 4, 2, 3, 2, 1] },

  // ── Half-orc / Orc + Acolyte (rare) ────────────────────
  { race: 'Orc', background: 'Acolyte', weights: [5, 5, 3, 4, 3, 2, 2, 1, 1] },

  // ── Dwarven scholars and clerics ───────────────────────
  { race: 'Dwarf', background: 'Acolyte', weights: [8, 6, 3, 4, 3, 1, 2, 1, 1] },
  { race: 'Dwarf', background: 'Sage', weights: [6, 5, 3, 5, 4, 2, 2, 1, 1] },

  // ── Elf rangers and acolytes ───────────────────────────
  { race: 'Elf', background: 'Acolyte', weights: [5, 6, 5, 3, 3, 2, 1, 1, 1] },

  // ── Human, the wide baseline by background ─────────────
  { race: 'Human', background: 'Soldier', weights: [6, 4, 2, 5, 4, 2, 4, 2, 1] },
  { race: 'Human', background: 'Criminal', weights: [1, 1, 2, 2, 4, 4, 4, 5, 5] },
];
