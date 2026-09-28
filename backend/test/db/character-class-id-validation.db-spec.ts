// Real-DB regression tests for validating a client-supplied classId (VEG-531).
// The unit spec mocks Prisma, so it proves the service asks for the supplied id
// under the owner's visibility scope. Whether a stranger's homebrew row actually
// fails to match is a property of that where clause against real rows, and only
// a database tests a where clause. The stranger case is the one that matters: a
// guessed id must not pin a character to someone else's homebrew, and it must
// land exactly where a junk id lands so the caller learns nothing either way.
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
import { HOMEBREW_SOURCE_LABEL } from '../../src/srd/homebrew-write.helpers';

// Only `name`, `hitDie` and the array columns are required; the rest default.
const classRow = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  hitDie: 'd8',
  primaryAbilities: [],
  savingThrows: [],
  armorProficiencies: [],
  weaponProficiencies: [],
  skillChoices: [],
  toolProficiencies: [],
  ...over,
});

describe('client-supplied classId validation on a real DB (VEG-531)', () => {
  let ctx: SeedContext;
  let characters: CharactersService;

  let ownerId: string;
  let srdFighterId: string;
  let srdWizardId: string;
  let ownerHomebrewWizardId: string;
  let strangerHomebrewFighterId: string;

  const storedClassId = async (id: string) =>
    (await ctx.prisma.character.findUniqueOrThrow({ where: { id }, select: { classId: true } }))
      .classId;

  const createAs = (cls: string, classId?: string) =>
    characters.create(ownerId, { name: `Probe ${cls}`, class: cls, level: 3, classId });

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

    const [owner, stranger] = await Promise.all([
      prisma.user.create({
        data: { username: `veg531-owner-${Date.now()}`, passwordHash: 'x', displayName: 'Owner' },
      }),
      prisma.user.create({
        data: {
          username: `veg531-stranger-${Date.now()}`,
          passwordHash: 'x',
          displayName: 'Stranger',
        },
      }),
    ]);
    ownerId = owner.id;

    const homebrew = (createdById: string, hitDie: string) => ({
      contentSource: 'homebrew',
      createdById,
      source: HOMEBREW_SOURCE_LABEL,
      hitDie,
    });
    const [srdFighter, srdWizard, ownerWizard, strangerFighter] = await Promise.all([
      prisma.srdClass.create({ data: classRow('Fighter', { hitDie: 'd10' }) }),
      prisma.srdClass.create({ data: classRow('Wizard', { hitDie: 'd6' }) }),
      // The owner's own "Wizard" collides with the SRD one, so only an id can
      // pick between them.
      prisma.srdClass.create({ data: classRow('Wizard', homebrew(owner.id, 'd12')) }),
      // A stranger's "Fighter". Invisible to the owner, so it must never match.
      prisma.srdClass.create({ data: classRow('Fighter', homebrew(stranger.id, 'd12')) }),
    ]);
    srdFighterId = srdFighter.id;
    srdWizardId = srdWizard.id;
    ownerHomebrewWizardId = ownerWizard.id;
    strangerHomebrewFighterId = strangerFighter.id;
  });

  afterAll(async () => {
    await truncateAll(ctx.prisma);
    await teardownSeedContext(ctx);
  });

  describe('create', () => {
    it('discards a junk id and derives from the name', async () => {
      const created = await createAs('Fighter', 'anything');

      expect(await storedClassId(created.id)).toBe(srdFighterId);
    });

    it('refuses a stranger’s homebrew id exactly as it refuses a junk id', async () => {
      const junk = await createAs('Fighter', '00000000-0000-4000-8000-000000000000');
      const stranger = await createAs('Fighter', strangerHomebrewFighterId);

      expect(await storedClassId(stranger.id)).toBe(srdFighterId);
      // Same outcome, down to the seeded die, so nothing distinguishes the two.
      expect(stranger.classId).toBe(junk.classId);
      expect(stranger.hitDice).toEqual(junk.hitDice);
      expect(stranger.hitDice).toEqual({ dieType: 'd10', total: 3, spent: 0 });
    });

    it('keeps a visible id that disambiguates a duplicate name', async () => {
      const created = await createAs('Wizard', ownerHomebrewWizardId);

      expect(await storedClassId(created.id)).toBe(ownerHomebrewWizardId);
      expect(created.hitDice).toEqual({ dieType: 'd12', total: 3, spent: 0 });
    });

    it('stores no key when a junk id meets a name the owner has duplicated', async () => {
      const created = await createAs('Wizard', 'anything');

      expect(await storedClassId(created.id)).toBeNull();
    });
  });

  describe('update', () => {
    it('discards a junk id and derives from the stored name', async () => {
      const created = await createAs('Fighter');

      await characters.update(created.id, ownerId, { classId: 'anything' });

      expect(await storedClassId(created.id)).toBe(srdFighterId);
    });

    it('refuses a stranger’s homebrew id', async () => {
      const created = await createAs('Fighter');

      await characters.update(created.id, ownerId, {
        class: 'Fighter',
        classId: strangerHomebrewFighterId,
      });

      expect(await storedClassId(created.id)).toBe(srdFighterId);
    });

    it('keeps a visible id that disambiguates a duplicate name', async () => {
      const created = await createAs('Wizard', srdWizardId);

      await characters.update(created.id, ownerId, {
        class: 'Wizard',
        classId: ownerHomebrewWizardId,
      });

      expect(await storedClassId(created.id)).toBe(ownerHomebrewWizardId);
    });
  });
});
