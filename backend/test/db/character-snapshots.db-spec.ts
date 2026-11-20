// Real-DB regression tests for the level-up snapshot (VEG-643). The unit spec
// mocks `$transaction`, so it can only show that the snapshot insert and the
// guarded write run inside one callback. Whether a stale-version 409 really rolls
// the insert back, and whether deleting a character takes its snapshots with it,
// are properties of Postgres, so only a database tests them.
import { ConflictException } from '@nestjs/common';
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';
import { ContentAccessService } from '../../src/srd/content-access.service';
import { CampaignAuthService } from '../../src/auth/campaign-auth.service';
import { InventoryResolverService } from '../../src/characters/inventory/inventory-resolver.service';
import { CharactersService } from '../../src/characters/characters.service';
import { CharacterSnapshotsService } from '../../src/characters/snapshots/character-snapshots.service';

const HIT_POINTS_AT_FOUR = { max: 36, current: 20, temporary: 0 };

// A free-typed Fighter, because the database holds no class rows here.
const fighterAt = (level: number) => ({
  classes: [{ classId: null, name: 'Fighter', level, subclass: null, subclassId: null }],
  level,
});

describe('character snapshots on a real DB (VEG-643)', () => {
  let ctx: SeedContext;
  let characters: CharactersService;
  let snapshots: CharacterSnapshotsService;
  let ownerId: string;

  const createLevelFour = () =>
    characters.create(ownerId, {
      name: 'Probe',
      ...fighterAt(4),
      hitPoints: HIT_POINTS_AT_FOUR,
    });

  const snapshotsOf = (characterId: string) =>
    ctx.prisma.characterSnapshot.findMany({ where: { characterId } });

  beforeAll(async () => {
    ctx = await createSeedContext();
    const { prisma } = ctx;
    await truncateAll(prisma);

    characters = new CharactersService(
      prisma,
      new CampaignAuthService(prisma),
      new InventoryResolverService(prisma),
      new ContentAccessService()
    );
    snapshots = new CharacterSnapshotsService(prisma, characters);

    const owner = await prisma.user.create({
      data: { username: `veg643-owner-${Date.now()}`, passwordHash: 'x', displayName: 'Owner' },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    await truncateAll(ctx.prisma);
    await teardownSeedContext(ctx);
  });

  it('keeps one snapshot of the level-4 sheet after a 4 to 5 PATCH (VEG-643)', async () => {
    const created = await createLevelFour();

    await characters.update(created.id, ownerId, {
      ...fighterAt(5),
      hitPoints: { max: 44, current: 44, temporary: 0 },
      expectedVersion: created.version,
    });

    const rows = await snapshotsOf(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ level: 4, label: 'Level 4' });
    const data = rows[0].data as Record<string, unknown>;
    expect(data.level).toBe(4);
    expect(data.hitPoints).toEqual(HIT_POINTS_AT_FOUR);
    for (const column of ['id', 'userId', 'campaignId', 'version', 'createdAt', 'updatedAt']) {
      expect(data).not.toHaveProperty(column);
    }
  });

  it('reads the stored sheet back as a computed level-4 character (VEG-643)', async () => {
    const created = await createLevelFour();
    await characters.update(created.id, ownerId, {
      ...fighterAt(5),
      expectedVersion: created.version,
    });
    const [summary] = await snapshots.list(created.id, ownerId);

    const snapshot = await snapshots.get(created.id, summary.id, ownerId);

    expect(snapshot.data).toMatchObject({ id: created.id, userId: ownerId, level: 4 });
    expect(snapshot.data.hitPoints).toEqual(HIT_POINTS_AT_FOUR);
    expect(snapshot.data.computed.proficiencyBonus).toBe(2);
  });

  it('leaves no snapshot when a stale expectedVersion makes the PATCH 409 (VEG-643)', async () => {
    const created = await createLevelFour();

    await expect(
      characters.update(created.id, ownerId, {
        ...fighterAt(5),
        expectedVersion: created.version + 1,
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(await snapshotsOf(created.id)).toHaveLength(0);
    const stored = await ctx.prisma.character.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.level).toBe(4);
  });

  // A snapshot taken before characters held a list of classes still stores the
  // scalar class columns and a single hit-dice object.
  describe('a snapshot stored before the classes list', () => {
    const legacySnapshot = async () => {
      const created = await createLevelFour();
      const { data } = await ctx.prisma.characterSnapshot.create({
        data: {
          characterId: created.id,
          level: 4,
          label: 'Level 4',
          data: {
            name: 'Probe',
            class: 'Fighter',
            classId: null,
            subclass: 'Champion',
            level: 4,
            hitPoints: HIT_POINTS_AT_FOUR,
            hitDice: { dieType: 'd10', total: 4, spent: 3 },
            proficiencies: [],
            languages: [],
            savingThrows: [],
            skills: [],
            armorTraining: [],
            conditions: [],
          },
        },
        select: { data: true },
      });
      const [summary] = await snapshots.list(created.id, ownerId);
      return { created, summary, data };
    };

    it('reads back with one class entry and one pool', async () => {
      const { created, summary } = await legacySnapshot();

      const snapshot = await snapshots.get(created.id, summary.id, ownerId);

      expect(snapshot.data.classes).toEqual([
        { classId: null, name: 'Fighter', level: 4, subclass: 'Champion', subclassId: null },
      ]);
      expect(snapshot.data.hitDice).toEqual([{ dieType: 'd10', total: 4, spent: 3 }]);
      expect(snapshot.data).toMatchObject({ class: 'Fighter', subclass: 'Champion' });
    });

    it('copies into a new character in the current shape with every die restored', async () => {
      const { created, summary } = await legacySnapshot();

      const copy = await snapshots.copy(created.id, summary.id, ownerId);

      const stored = await ctx.prisma.character.findUniqueOrThrow({ where: { id: copy.id } });
      expect(stored.classes).toEqual([
        { classId: null, name: 'Fighter', level: 4, subclass: 'Champion', subclassId: null },
      ]);
      expect(stored.hitDice).toEqual([{ dieType: 'd10', total: 4, spent: 0 }]);
    });
  });

  it('deletes the snapshots along with the character (VEG-643)', async () => {
    const created = await createLevelFour();
    await characters.update(created.id, ownerId, {
      ...fighterAt(5),
      expectedVersion: created.version,
    });
    expect(await snapshotsOf(created.id)).toHaveLength(1);

    await characters.remove(created.id, ownerId);

    expect(await snapshotsOf(created.id)).toHaveLength(0);
  });
});
