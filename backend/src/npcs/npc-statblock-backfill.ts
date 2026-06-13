import { buildNpcStatBlock, MonsterRef } from './generator/npc-pipeline';
import { NpcStatBlock, StatBlockAction } from './generator/npc-generator.types';
import { GLOBAL_CONTENT_SOURCES } from '../srd/content-access.service';

// VEG-261: NPC stat blocks (Npc.statBlock JSONB) are frozen snapshots copied from a
// monster at generation time, so re-seeding the corrected `monsters` table does NOT fix
// them. This backfill re-derives each NPC's stat block from its `baseMonster` against the
// current (clean) monster rows — reusing buildNpcStatBlock so a re-derived snapshot is
// identical to a freshly generated one — while preserving the NPC-specific name, alignment,
// and profession weapon swap. Idempotent: only rows whose rebuild differs are updated.

// Structural slices of PrismaService — keeps this unit-testable with a plain mock.
interface MonsterRow {
  name: string;
  size: string;
  type: string;
  subtype: string | null;
  alignment: string | null;
  armorClass: number;
  armorType: string | null;
  hitPoints: number;
  hitDice: string | null;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows: unknown;
  skills: unknown;
  damageResistances: string[];
  damageImmunities: string[];
  damageVulnerabilities: string[];
  conditionImmunities: string[];
  senses: string | null;
  languages: string | null;
  challengeRating: number;
  experiencePoints: number | null;
  specialAbilities: unknown;
  actions: unknown;
  reactions: unknown;
  legendaryActions: unknown;
}

interface NpcRow {
  id: string;
  statBlock: unknown;
}

export interface BackfillPrisma {
  monster: {
    findMany: (args: { where: { contentSource: { in: string[] } } }) => Promise<MonsterRow[]>;
  };
  npc: {
    findMany: (args: { select: { id: true; statBlock: true } }) => Promise<NpcRow[]>;
    update: (args: { where: { id: string }; data: { statBlock: unknown } }) => Promise<unknown>;
  };
}

export interface BackfillResult {
  scanned: number;
  updated: number;
  skipped: { id: string; reason: string }[];
}

function rowToMonsterRef(m: MonsterRow): MonsterRef {
  return {
    name: m.name,
    size: m.size,
    type: m.type,
    subtype: m.subtype ?? null,
    alignment: m.alignment ?? null,
    armorClass: m.armorClass,
    armorType: m.armorType ?? null,
    hitPoints: m.hitPoints,
    hitDice: m.hitDice ?? null,
    speed: m.speed,
    str: m.str,
    dex: m.dex,
    con: m.con,
    int: m.int,
    wis: m.wis,
    cha: m.cha,
    savingThrows: (m.savingThrows as Record<string, number> | null) ?? null,
    skills: (m.skills as Record<string, number> | null) ?? null,
    damageResistances: m.damageResistances ?? [],
    damageImmunities: m.damageImmunities ?? [],
    damageVulnerabilities: m.damageVulnerabilities ?? [],
    conditionImmunities: m.conditionImmunities ?? [],
    senses: m.senses ?? null,
    languages: m.languages ?? null,
    challengeRating: m.challengeRating,
    experiencePoints: m.experiencePoints ?? null,
    specialAbilities: (m.specialAbilities as StatBlockAction[] | null) ?? null,
    actions: (m.actions as StatBlockAction[] | null) ?? [],
    reactions: (m.reactions as StatBlockAction[] | null) ?? null,
    legendaryActions: (m.legendaryActions as StatBlockAction[] | null) ?? null,
  };
}

export async function backfillNpcStatBlocks(prisma: BackfillPrisma): Promise<BackfillResult> {
  // Pinned to the global catalog (VEG-335): the rebuild resolves baseMonster
  // by NAME, and per-source unique indexes allow a homebrew monster to share
  // an SRD name — unscoped, such a row could hijack the map and rewrite every
  // matching NPC's stat block with one user's private homebrew stats.
  const byName = new Map<string, MonsterRef>(
    (
      await prisma.monster.findMany({
        where: { contentSource: { in: [...GLOBAL_CONTENT_SOURCES] } },
      })
    ).map(m => [m.name, rowToMonsterRef(m)])
  );

  const npcs = await prisma.npc.findMany({ select: { id: true, statBlock: true } });
  const result: BackfillResult = { scanned: 0, updated: 0, skipped: [] };

  for (const npc of npcs) {
    const sb = npc.statBlock as NpcStatBlock | null;
    if (!sb || !sb.baseMonster) continue; // NPC without a monster-derived stat block
    result.scanned++;

    const base = byName.get(sb.baseMonster);
    if (!base) {
      result.skipped.push({ id: npc.id, reason: `unknown baseMonster "${sb.baseMonster}"` });
      continue;
    }

    const rebuilt = buildNpcStatBlock(base, {
      name: sb.name,
      alignment: sb.alignment ?? base.alignment ?? 'Neutral',
      profession: sb.professionWeaponSwap?.profession ?? null,
    });

    if (JSON.stringify(rebuilt) === JSON.stringify(sb)) continue; // already current

    await prisma.npc.update({ where: { id: npc.id }, data: { statBlock: rebuilt } });
    result.updated++;
  }

  return result;
}
