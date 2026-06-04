import { backfillNpcStatBlocks, BackfillPrisma } from './npc-statblock-backfill';
import { buildNpcStatBlock } from './generator/npc-pipeline';
import { NpcStatBlock } from './generator/npc-generator.types';

// A clean Skeleton row as it exists in the (re-seeded) monsters table.
const skeletonRow = {
  name: 'Skeleton',
  size: 'Medium',
  type: 'Undead',
  subtype: null,
  alignment: 'Lawful Evil',
  armorClass: 14,
  armorType: null,
  hitPoints: 13,
  hitDice: '2d8 + 4',
  speed: '30 ft.',
  str: 10,
  dex: 16,
  con: 15,
  int: 6,
  wis: 8,
  cha: 5,
  savingThrows: null,
  skills: null,
  damageResistances: [],
  damageImmunities: ['Poison'],
  damageVulnerabilities: ['Bludgeoning'],
  conditionImmunities: ['Exhaustion', 'Poisoned'],
  senses: 'Darkvision 60 ft.; Passive Perception 9',
  languages: "Understands Common but can't speak",
  challengeRating: 0.25,
  experiencePoints: 50,
  specialAbilities: [],
  actions: [
    {
      name: 'Shortsword',
      description: 'Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Piercing damage.',
    },
  ],
  reactions: null,
  legendaryActions: null,
};

function makePrisma(npcs: { id: string; statBlock: unknown }[]): BackfillPrisma & {
  npc: { update: jest.Mock };
} {
  return {
    monster: { findMany: jest.fn().mockResolvedValue([skeletonRow]) },
    npc: {
      findMany: jest.fn().mockResolvedValue(npcs),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('backfillNpcStatBlocks', () => {
  it('rebuilds a corrupt NPC stat block from the clean monster, preserving NPC fields', async () => {
    // A snapshot frozen before the VEG-261 fix: leaked "Gear" tokens in conditionImmunities.
    const corruptStatBlock = {
      baseMonster: 'Skeleton',
      name: 'Bob the Skeleton',
      size: 'Medium',
      type: 'Undead',
      subtype: null,
      alignment: 'Neutral Evil',
      armorClass: 14,
      armorType: null,
      hitPoints: 13,
      hitDice: '2d8 + 4',
      speed: '30 ft.',
      str: 10,
      dex: 16,
      con: 15,
      int: 6,
      wis: 8,
      cha: 5,
      savingThrows: null,
      skills: null,
      damageResistances: [],
      damageImmunities: ['Poison'],
      damageVulnerabilities: ['Bludgeoning'],
      conditionImmunities: ['Exhaustion', 'Poisoned Gear Shortbow', 'Shortsword'],
      senses: 'Darkvision 60 ft.; Passive Perception 9',
      languages: "Understands Common but can't speak",
      challengeRating: 0.25,
      experiencePoints: 50,
      specialAbilities: [],
      actions: [{ name: 'Spear', description: 'something stale' }],
      reactions: null,
      legendaryActions: null,
      professionWeaponSwap: { profession: 'guard', weapon: 'spear', replacedAction: 'Shortsword' },
    };

    const prisma = makePrisma([{ id: 'npc-1', statBlock: corruptStatBlock }]);
    const result = await backfillNpcStatBlocks(prisma);

    expect(result).toMatchObject({ scanned: 1, updated: 1, skipped: [] });
    expect(prisma.npc.update).toHaveBeenCalledTimes(1);

    const written = prisma.npc.update.mock.calls[0][0].data.statBlock as NpcStatBlock;
    // corruption fixed
    expect(written.conditionImmunities).toEqual(['Exhaustion', 'Poisoned']);
    // NPC-specific fields preserved
    expect(written.name).toBe('Bob the Skeleton');
    expect(written.alignment).toBe('Neutral Evil');
    expect(written.baseMonster).toBe('Skeleton');
    // profession weapon swap re-applied against the clean actions
    expect(written.professionWeaponSwap?.profession).toBe('guard');
    expect(written.actions[0].name).toBe('Spear');
  });

  it('skips an NPC whose baseMonster is no longer in the dataset', async () => {
    const prisma = makePrisma([
      { id: 'npc-x', statBlock: { baseMonster: 'Ghost of Christmas Past', name: 'Spooky' } },
    ]);
    const result = await backfillNpcStatBlocks(prisma);

    expect(result.updated).toBe(0);
    expect(result.skipped).toEqual([
      { id: 'npc-x', reason: 'unknown baseMonster "Ghost of Christmas Past"' },
    ]);
    expect(prisma.npc.update).not.toHaveBeenCalled();
  });

  it('is idempotent — does not rewrite an already-current stat block', async () => {
    const clean = buildNpcStatBlock(
      {
        ...skeletonRow,
        savingThrows: null,
        skills: null,
      },
      { name: 'Clean Skeleton', alignment: 'Lawful Evil', profession: null }
    );

    const prisma = makePrisma([{ id: 'npc-clean', statBlock: clean }]);
    const result = await backfillNpcStatBlocks(prisma);

    expect(result).toMatchObject({ scanned: 1, updated: 0 });
    expect(prisma.npc.update).not.toHaveBeenCalled();
  });

  it('ignores NPCs without a monster-derived stat block', async () => {
    const prisma = makePrisma([
      { id: 'npc-null', statBlock: null },
      { id: 'npc-empty', statBlock: { name: 'No base monster' } },
    ]);
    const result = await backfillNpcStatBlocks(prisma);

    expect(result).toMatchObject({ scanned: 0, updated: 0, skipped: [] });
    expect(prisma.npc.update).not.toHaveBeenCalled();
  });
});
