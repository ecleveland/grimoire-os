import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import type { CharacterClass } from '@grimoire-os/shared';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '../generated/prisma/client';
import { CharactersService } from './characters.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { createMockPrismaService, MockPrismaService } from '../test/prisma-mock.factory';
import { InventoryResolverService } from './inventory/inventory-resolver.service';
import { ContentAccessService } from '../srd/content-access.service';
import { catalogNameWhere } from '../srd/resolve-catalog-ref';
import {
  USER_ID,
  USER_ID_2,
  CHARACTER_ID,
  mockCharacter,
  createCharacterDto,
} from '../test/fixtures';
import { CharacterDto, CharacterListItemDto } from './dto/character-response.dto';

// VEG-505: loadClassData resolves the class against the character owner's
// visible content (srd + shared + their own homebrew), not by bare name.
//
// Built from the real service rather than restated by hand. Writing both sides
// of the assertion from the same assumption means an inverted or narrowed
// visibleTo keeps this suite green; the service is already a provider below and
// has no constructor dependencies.
const visibleToOwner = new ContentAccessService().visibleTo(USER_ID);
// The projection both class lookups use. `name` joined it in VEG-528 so
// `resolveCatalogRef` can apply the deciding case-folded comparison itself
// instead of trusting the SQL predicate; `contentSource` left it, because the
// tier preference it fed is gone.
const classSelect = {
  id: true,
  name: true,
  spellcasting: true,
  weaponProficiencies: true,
};

// The production filter, not a local copy of its shape. A copy that omitted the
// escaping passed every fixture here, since none carries a metacharacter, while
// claiming to prove the escaping. Importing it means these assertions pin what
// the service really builds.
const classNameWhere = catalogNameWhere;

// The catalog row the default mocks stand for, and therefore the id every write
// path derives for the fixture's "Fighter" (VEG-528).
const SRD_FIGHTER_ID = 'cls-srd-fighter';

// A name lookup: the escaped-ILIKE predicate ANDed with the visibility fragment.
// Shared by loadClassData's fallback and by deriveClassId, so they cannot fetch
// different candidate sets.
const classWhere = (name: string) => ({
  AND: [classNameWhere(name), visibleToOwner as Record<string, unknown>],
});

// The id lookup, which VEG-528 split out of the old single `OR` query. Keeping
// the two apart is what lets Postgres serve the common case from the primary
// key: it cannot combine an index scan with a non-indexable ILIKE branch, so the
// merged form degraded the whole disjunction to a sequential scan.
// A derivation lookup is distinguishable from the read path's by its projection:
// deriveClass selects only what resolveByUniqueName needs, plus the hit die.
// Asserting on it is falsifiable, unlike the `take: 2` these assertions used to
// name — `take` was removed from the service in the same round that introduced
// the escaping, and the leftover `not.toHaveBeenCalledWith({take: 2})` could no
// longer fail.
//
// `hitDie` joined the projection in VEG-530: the row is already being fetched to
// pin `classId`, and the die is the field that stops four clients each inventing
// their own d8.
const DERIVE_SELECT = { select: { id: true, name: true, hitDie: true } };

// One stored class entry, a level-5 Fighter with nothing pinned by default.
const entry = (over: Partial<CharacterClass> = {}): CharacterClass => ({
  classId: null,
  name: 'Fighter',
  level: 5,
  subclass: null,
  subclassId: null,
  ...over,
});

// Catalog rows for the multiclass cases. Every lookup may return all of them,
// because resolveCatalogRef and resolveByUniqueName decide on the name in code.
const FIGHTER_ROW = { id: SRD_FIGHTER_ID, name: 'Fighter', hitDie: 'd10', spellcasting: null };
const PALADIN_ROW = { id: 'cls-srd-paladin', name: 'Paladin', hitDie: 'd10', spellcasting: null };
// The stored classes column for a single-class character.
const withClass = (name: string, classId: string | null = null, level = 5) => ({
  classes: [entry({ name, classId, level })],
});
const WIZARD_ROW = { id: 'cls-srd-wizard', name: 'Wizard', hitDie: 'd6', spellcasting: null };

const classIdWhere = (classId: string) => ({
  AND: [{ id: classId }, visibleToOwner as Record<string, unknown>],
});

// The write-side lookup when the client supplied an id (VEG-531): the id and the
// name in one query, both under the visibility fragment, so a guessed id can only
// ever match a row the owner could already see.
const classIdOrNameWhere = (classId: string, name: string) => ({
  AND: [{ OR: [{ id: classId }, classNameWhere(name)] }, visibleToOwner as Record<string, unknown>],
});

describe('CharactersService', () => {
  let service: CharactersService;
  let prisma: MockPrismaService;
  let campaignAuth: { assertCampaignMember: jest.Mock };
  let inventoryResolver: { resolveInventory: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    campaignAuth = { assertCampaignMember: jest.fn() };
    // Default: pass inventory through untouched, so tests that don't care
    // about resolution assert the same payloads they always have.
    inventoryResolver = { resolveInventory: jest.fn(inv => Promise.resolve(inv)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharactersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CampaignAuthService, useValue: campaignAuth },
        { provide: InventoryResolverService, useValue: inventoryResolver },
        ContentAccessService,
      ],
    }).compile();

    service = module.get<CharactersService>(CharactersService);

    // Default: the character's class exists in the catalog as a non-caster
    // (mockCharacter is a Fighter). Specific tests override for spellcasters.
    // `name` is present because `resolveCatalogRef` compares on it rather than
    // trusting the SQL predicate, and the same mock answers the write-path lookup
    // that derives `classId` from an unambiguous name (VEG-528).
    // `hitDie` is present because the column is NOT NULL in the schema and
    // VEG-530 seeds the character's hit-dice pool from it. A mock without it
    // would let every create test pass while the seed silently did nothing.
    prisma.srdClass.findMany.mockResolvedValue([
      { id: SRD_FIGHTER_ID, name: 'Fighter', hitDie: 'd10', spellcasting: null },
    ]);
    // The id lookup is its own query since VEG-528. Defaulting it to "no such
    // row" keeps every name-path test exercising the name path.
    prisma.srdClass.findFirst.mockResolvedValue(null);
    // A PATCH from the level-5 fixture to level 6 is a one-level bump, which
    // copies the row into a snapshot before the write (VEG-643). Defaulting the
    // read and the insert keeps the update tests that send `level: 6` on the
    // write behaviour they assert.
    prisma.character.findUniqueOrThrow.mockResolvedValue(mockCharacter);
    prisma.characterSnapshot.create.mockResolvedValue({ id: 'snap-1' });
  });

  describe('create', () => {
    const dataOf = () =>
      (prisma.character.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    const classesOf = () => dataOf().classes as Array<Record<string, unknown>>;
    const hitDiceOf = () => dataOf().hitDice;
    const createWith = (classes: CharacterClass[], over: Partial<CreateCharacterDto> = {}) =>
      service.create(USER_ID, { ...createCharacterDto, classes, ...over });

    beforeEach(() => {
      prisma.character.create.mockResolvedValue(mockCharacter);
    });

    it('should create a character with userId', async () => {
      const result = await service.create(USER_ID, createCharacterDto);

      expect(prisma.character.create).toHaveBeenCalledWith({
        data: {
          name: createCharacterDto.name,
          race: createCharacterDto.race,
          level: 5,
          userId: USER_ID,
          // The id is derived from the unambiguous class name, so the character
          // never sits on the name fallback.
          classes: [entry({ classId: SRD_FIGHTER_ID })],
          // Seeded from the same row: a level-5 Fighter owns five d10s.
          hitDice: [{ dieType: 'd10', total: 5, spent: 0 }],
        },
      });
      expect(result).toMatchObject(mockCharacter);
      expect(result).toBeInstanceOf(CharacterDto);
      // create funnels through toCharacterDto, so the computed block is present.
      expect(result.computed.proficiencyBonus).toBe(3);
      // Dex 12 → +1 base, plus the fixture's stored +1 bonus (VEG-452).
      expect(result.computed.initiative).toEqual({
        base: 1,
        bonus: 1,
        exhaustionPenalty: 0,
        effective: 2,
      });
    });

    it('round-trips conditions/concentration/exhaustion through the response DTO (VEG-408)', async () => {
      // Guards the @Expose whitelist: a freshly-added column is silently
      // dropped by toCharacterDto until exposed on CharacterDto.
      prisma.character.create.mockResolvedValue({
        ...mockCharacter,
        conditions: ['Poisoned', 'Prone'],
        concentration: { spell: 'Bless' },
        exhaustion: 3,
      });

      const result = await service.create(USER_ID, createCharacterDto);

      expect(result.conditions).toEqual(['Poisoned', 'Prone']);
      expect(result.concentration).toEqual({ spell: 'Bless' });
      expect(result.exhaustion).toBe(3);
    });

    it('round-trips backgroundId through the response DTO (VEG-476)', async () => {
      // Guards the @Expose whitelist: the editor sends backgroundId to
      // disambiguate duplicate-named backgrounds on load (VEG-473), so a
      // dropped column would silently break re-resolution.
      const backgroundId = '123e4567-e89b-42d3-a456-426614174000';
      prisma.character.create.mockResolvedValue({ ...mockCharacter, backgroundId });

      const result = await service.create(USER_ID, { ...createCharacterDto, backgroundId });

      expect(prisma.character.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ backgroundId }),
      });
      expect(result.backgroundId).toBe(backgroundId);
    });

    // Same @Expose whitelist guard as backgroundId above, for the list and its
    // deprecated projection. Without either the sheet falls back to resolving a
    // duplicate class name by guesswork.
    it('returns classes and projects the first entry onto the deprecated scalars', async () => {
      const classId = '223e4567-e89b-42d3-a456-426614174000';
      const classes = [
        entry({ classId, level: 3, subclass: 'Champion' }),
        entry({ name: 'Wizard', level: 2 }),
      ];
      prisma.character.create.mockResolvedValue({ ...mockCharacter, classes });

      const result = await createWith(classes);

      expect(result.classes).toEqual(classes);
      expect(result).toMatchObject({
        class: 'Fighter',
        classId,
        subclass: 'Champion',
        subclassId: null,
      });
    });

    describe('the class levels and the character level', () => {
      it('rejects classes whose levels do not sum to the level, writing nothing', async () => {
        const attempt = createWith([entry({ level: 4 })], { level: 5 });

        await expect(attempt).rejects.toThrow(BadRequestException);
        await expect(attempt).rejects.toThrow('classes levels sum to 4 but level is 5');
        expect(prisma.character.create).not.toHaveBeenCalled();
      });

      it('sets the level to the sum of the class levels when the DTO omits it', async () => {
        prisma.srdClass.findMany.mockResolvedValue([FIGHTER_ROW, PALADIN_ROW]);

        await createWith([entry({ level: 3 }), entry({ name: 'Paladin', level: 2 })], {
          level: undefined,
        });

        expect(dataOf().level).toBe(5);
      });

      // Every later save would send the stored level and fail the DTO's
      // @Max(20), so a character created past the cap could never be edited.
      it('rejects classes summing past the level cap when the DTO omits the level', async () => {
        prisma.srdClass.findMany.mockResolvedValue([FIGHTER_ROW, WIZARD_ROW]);

        const attempt = createWith([entry({ level: 20 }), entry({ name: 'Wizard', level: 1 })], {
          level: undefined,
        });

        await expect(attempt).rejects.toThrow(BadRequestException);
        await expect(attempt).rejects.toThrow(
          'classes levels sum to 21 but the maximum level is 20'
        );
        expect(prisma.character.create).not.toHaveBeenCalled();
      });

      it('accepts classes summing to exactly the level cap when the DTO omits the level', async () => {
        prisma.srdClass.findMany.mockResolvedValue([FIGHTER_ROW, WIZARD_ROW]);

        await createWith([entry({ level: 19 }), entry({ name: 'Wizard', level: 1 })], {
          level: undefined,
        });

        expect(dataOf().level).toBe(20);
      });

      it('creates a classless character at level 1 with no lookup and no pool', async () => {
        await service.create(USER_ID, { name: 'Nobody' });

        expect(dataOf()).toMatchObject({ level: 1, classes: [] });
        expect(dataOf()).not.toHaveProperty('hitDice');
        expect(prisma.srdClass.findMany).not.toHaveBeenCalledWith(
          expect.objectContaining(DERIVE_SELECT)
        );
      });

      it('keeps any level for a classless character', async () => {
        await service.create(USER_ID, { name: 'Nobody', classes: [], level: 7 });

        expect(dataOf()).toMatchObject({ level: 7, classes: [] });
      });
    });

    // Every API create used to land with a null key and never acquire one. The
    // id is derived wherever the name resolves to exactly one visible row, at
    // the write boundary, where being wrong is cheap to correct and the query
    // cost is paid once instead of on every read.
    describe('deriving each classId from an unambiguous class name (VEG-528)', () => {
      it('derives and persists the id for an entry that sends only a name', async () => {
        await createWith([entry()]);

        expect(classesOf()[0].classId).toBe(SRD_FIGHTER_ID);
      });

      it('pins an id on every entry, one lookup each', async () => {
        prisma.srdClass.findMany.mockResolvedValue([FIGHTER_ROW, PALADIN_ROW]);

        await createWith([entry({ level: 3 }), entry({ name: 'Paladin', level: 2 })]);

        expect(classesOf()).toEqual([
          entry({ classId: SRD_FIGHTER_ID, level: 3 }),
          entry({ classId: PALADIN_ROW.id, name: 'Paladin', level: 2 }),
        ]);
        expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
          where: classWhere('Paladin'),
          ...DERIVE_SELECT,
        });
      });

      it('stores each entry with its subclass fields, filling absent ones with null', async () => {
        await createWith([{ name: 'Fighter', level: 5 } as CharacterClass]);

        expect(classesOf()).toEqual([entry({ classId: SRD_FIGHTER_ID })]);
      });

      it('scopes the derivation to the creator’s visible content', async () => {
        await service.create(USER_ID, createCharacterDto);

        expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
          where: classWhere('Fighter'),
          // `name` is selected because resolveCatalogRef, not the SQL predicate,
          // decides; and there is no `take`, because a count taken over an ILIKE
          // result is a count of pattern matches, not of the name.
          select: { id: true, name: true, hitDie: true },
        });
      });

      it('leaves the id null when the name matches more than one visible row', async () => {
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-srd', name: 'Fighter' },
          { id: 'cls-hb', name: 'Fighter' },
        ]);

        await service.create(USER_ID, createCharacterDto);

        expect(classesOf()[0].classId).toBeNull();
      });

      it('leaves the id null for a class that is not in the catalog at all', async () => {
        prisma.srdClass.findMany.mockResolvedValue([]);

        await createWith([entry({ name: 'Bloodbinder' })]);

        expect(classesOf()[0].classId).toBeNull();
      });

      // `''` passes the entry's @IsOptional() @IsString() and is neither
      // undefined nor null, so `??` would persist it: a key that fails every id
      // lookup while looking like one.
      it('normalises an empty-string key rather than storing it', async () => {
        await createWith([entry({ classId: '' })]);

        expect(classesOf()[0].classId).toBe(SRD_FIGHTER_ID);
      });
    });

    // The class row is already being fetched to pin each classId; the die is one
    // column away in a query that already runs. Pools group by die, so a
    // Fighter/Paladin shares one d10 pool.
    describe('seeding hitDice from the resolved classes (VEG-530)', () => {
      it('seeds a full pool at the class level when the DTO omits one', async () => {
        await service.create(USER_ID, createCharacterDto);

        expect(hitDiceOf()).toEqual([{ dieType: 'd10', total: 5, spent: 0 }]);
      });

      it('groups classes that share a die into one pool', async () => {
        prisma.srdClass.findMany.mockResolvedValue([FIGHTER_ROW, PALADIN_ROW]);

        await createWith([entry({ level: 3 }), entry({ name: 'Paladin', level: 2 })]);

        expect(hitDiceOf()).toEqual([{ dieType: 'd10', total: 5, spent: 0 }]);
      });

      it('gives each die its own pool, in class order', async () => {
        prisma.srdClass.findMany.mockResolvedValue([FIGHTER_ROW, WIZARD_ROW]);

        await createWith([entry({ level: 3 }), entry({ name: 'Wizard', level: 2 })]);

        expect(hitDiceOf()).toEqual([
          { dieType: 'd10', total: 3, spent: 0 },
          { dieType: 'd6', total: 2, spent: 0 },
        ]);
      });

      it('carries the spent dice of a supplied pool for a die the classes produce', async () => {
        await createWith([entry()], { hitDice: [{ dieType: 'd10', total: 1, spent: 1 }] });

        expect(hitDiceOf()).toEqual([{ dieType: 'd10', total: 5, spent: 1 }]);
      });

      // A free-typed class has no catalog die, so the pool the player picked is
      // the only record of it.
      it('keeps a supplied pool for a die no class produces', async () => {
        prisma.srdClass.findMany.mockResolvedValue([]);
        const supplied = [{ dieType: 'd8' as const, total: 3, spent: 2 }];

        await createWith([entry({ name: 'Bloodbinder' })], { hitDice: supplied });

        expect(hitDiceOf()).toEqual(supplied);
      });

      // Omitted, the column keeps its SQL NULL default. A plain null would
      // store a jsonb null instead.
      it('omits the pools when an explicit null meets a class with no pool', async () => {
        prisma.srdClass.findMany.mockResolvedValue([]);

        await createWith([entry({ name: 'Bloodbinder' })], {
          hitDice: null as unknown as undefined,
        });

        expect(dataOf()).not.toHaveProperty('hitDice');
      });

      it('derives pools over an explicit null when a class yields one', async () => {
        await createWith([entry()], { hitDice: null as unknown as undefined });

        expect(hitDiceOf()).toEqual([{ dieType: 'd10', total: 5, spent: 0 }]);
      });

      // The whole premise of VEG-528: a name matching two visible rows has no
      // correct answer. Guessing a die here writes a permanent HP maximum from
      // the wrong class.
      it('seeds nothing when the class name matches more than one visible row', async () => {
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-srd', name: 'Fighter', hitDie: 'd10' },
          { id: 'cls-hb', name: 'Fighter', hitDie: 'd6' },
        ]);

        await service.create(USER_ID, createCharacterDto);

        expect(hitDiceOf()).toBeUndefined();
      });

      it('seeds nothing for a class that is not in the catalog', async () => {
        prisma.srdClass.findMany.mockResolvedValue([]);

        await createWith([entry({ name: 'Bloodbinder' })]);

        expect(hitDiceOf()).toBeUndefined();
      });

      // `SrdClass.hitDie` is validated with @IsIn(DIE_TYPES), which carries d20
      // and d100 for the roll vocabulary. Seeding a d100 pool would write +51 a
      // level into a permanent maximum. The level-up picker asks instead.
      it('refuses to seed a die that is not a real hit die', async () => {
        prisma.srdClass.findMany.mockResolvedValue([
          { id: SRD_FIGHTER_ID, name: 'Fighter', hitDie: 'd100' },
        ]);

        await service.create(USER_ID, createCharacterDto);

        expect(hitDiceOf()).toBeUndefined();
        // Still pinned: an odd die says nothing about which row was meant.
        expect(classesOf()[0].classId).toBe(SRD_FIGHTER_ID);
      });

      // The supplied id is resolved in the same query as the name since VEG-531,
      // so its die comes from that row rather than from a second lookup.
      it('seeds from a client-supplied classId, scoped to the creator’s content', async () => {
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-hb-barbarian', name: 'Barbarian', hitDie: 'd12' },
        ]);

        await createWith([entry({ name: 'Barbarian', classId: 'cls-hb-barbarian' })]);

        expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
          where: classIdOrNameWhere('cls-hb-barbarian', 'Barbarian'),
          ...DERIVE_SELECT,
        });
        expect(hitDiceOf()).toEqual([{ dieType: 'd12', total: 5, spent: 0 }]);
      });

      // A supplied id naming no visible row is discarded (VEG-531), so the pool
      // comes from whatever the name resolves to, exactly as if no id was sent.
      it('seeds from the name when a client-supplied classId names no visible row', async () => {
        await createWith([entry({ classId: 'cls-stranger' })]);

        expect(hitDiceOf()).toEqual([{ dieType: 'd10', total: 5, spent: 0 }]);
        expect(classesOf()[0].classId).toBe(SRD_FIGHTER_ID);
      });

      // Validating the id already fetched the row, so seeding never issues a
      // separate by-id lookup.
      it('does not issue a separate by-id lookup to seed the pool', async () => {
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-hb-fighter', name: 'Fighter', hitDie: 'd10' },
        ]);

        await createWith([entry({ classId: 'cls-hb-fighter' })]);

        expect(prisma.srdClass.findFirst).not.toHaveBeenCalledWith(
          expect.objectContaining({ select: { hitDie: true } })
        );
      });
    });

    // A supplied id is checked against the creator's visible catalog in the same
    // query that derives, and a miss falls through to name derivation, so junk
    // never persists as a key.
    describe('validating a client-supplied classId (VEG-531)', () => {
      it('honours a visible id, even where it disambiguates a duplicate name', async () => {
        prisma.srdClass.findMany.mockResolvedValue([
          { id: SRD_FIGHTER_ID, name: 'Fighter', hitDie: 'd10' },
          { id: 'cls-hb-fighter', name: 'Fighter', hitDie: 'd12' },
        ]);

        await createWith([entry({ classId: 'cls-hb-fighter' })]);

        expect(classesOf()[0].classId).toBe('cls-hb-fighter');
      });

      it('resolves the id and the name in one query scoped to the creator', async () => {
        await createWith([entry({ classId: 'cls-junk' })]);

        // One write-side lookup; the response's own read is loadClassData's.
        const writeReads = prisma.srdClass.findMany.mock.calls.filter(
          ([args]) => JSON.stringify(args.select) === JSON.stringify(DERIVE_SELECT.select)
        );
        expect(writeReads).toHaveLength(1);
        expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
          where: classIdOrNameWhere('cls-junk', 'Fighter'),
          ...DERIVE_SELECT,
        });
      });

      it('discards a junk id and derives from the name instead', async () => {
        await createWith([entry({ classId: 'anything' })]);

        expect(classesOf()[0].classId).toBe(SRD_FIGHTER_ID);
      });

      // A stranger's homebrew id is filtered out by the visibility fragment, so
      // the query returns exactly what it returns for a junk id and the outcome
      // cannot tell the caller whether that row exists.
      it('treats a stranger’s homebrew id the same as a junk id', async () => {
        await createWith([entry({ classId: 'cls-stranger-hb' })]);

        expect(classesOf()[0].classId).toBe(SRD_FIGHTER_ID);
      });

      it('stores no key when a junk id meets an ambiguous name', async () => {
        prisma.srdClass.findMany.mockResolvedValue([
          { id: SRD_FIGHTER_ID, name: 'Fighter', hitDie: 'd10' },
          { id: 'cls-hb-fighter', name: 'Fighter', hitDie: 'd12' },
        ]);

        await createWith([entry({ classId: 'anything' })]);

        expect(classesOf()[0].classId).toBeNull();
      });

      // A visible id whose row bears another name is still the row the client
      // picked. Its name is not counted towards the requested name's collisions.
      it('does not let the id row count as a name match for another name', async () => {
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-hb-wizard', name: 'Wizard', hitDie: 'd6' },
          { id: SRD_FIGHTER_ID, name: 'Fighter', hitDie: 'd10' },
        ]);

        await createWith([entry({ classId: 'cls-hb-wizard' })]);

        expect(classesOf()[0].classId).toBe('cls-hb-wizard');
      });
    });

    it('does not check campaign membership when no campaignId is given', async () => {
      await service.create(USER_ID, createCharacterDto);

      expect(campaignAuth.assertCampaignMember).not.toHaveBeenCalled();
    });

    it('persists the resolved inventory (VEG-462)', async () => {
      // The guided builder emits bare {name, quantity} lines; the resolver
      // backfills the catalog link and gear snapshot before the row is written.
      const submitted = [{ name: 'Chain mail', quantity: 1, equipped: false }];
      const resolved = [
        {
          name: 'Chain mail',
          quantity: 1,
          equipped: false,
          itemId: '11111111-1111-4111-8111-111111111111',
          gear: { type: 'armor', armorType: 'heavy', baseArmorClass: 16 },
        },
      ];
      inventoryResolver.resolveInventory.mockResolvedValue(resolved);
      prisma.character.create.mockResolvedValue({ ...mockCharacter, inventory: resolved });

      await service.create(USER_ID, { ...createCharacterDto, inventory: submitted });

      expect(inventoryResolver.resolveInventory).toHaveBeenCalledWith(submitted);
      expect(prisma.character.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ inventory: resolved }),
      });
    });

    it('resolves a free-typed inventory line from the classic editor (VEG-462)', async () => {
      // Deliberate: resolution is not gated to builder-originated payloads,
      // since no client-supplied flag could be trusted to mark them. Every
      // create path — classic editor, raw API — gets the same backfill.
      prisma.character.create.mockResolvedValue(mockCharacter);

      await service.create(USER_ID, {
        ...createCharacterDto,
        inventory: [{ name: 'Longsword', quantity: 1, equipped: false }],
      });

      expect(inventoryResolver.resolveInventory).toHaveBeenCalled();
    });

    it('does not invoke the resolver when no inventory is sent (VEG-462)', async () => {
      prisma.character.create.mockResolvedValue(mockCharacter);

      await service.create(USER_ID, createCharacterDto);

      expect(inventoryResolver.resolveInventory).not.toHaveBeenCalled();
    });

    it('auto-equips the resolved starting armor when the guided-builder flag is set (VEG-483)', async () => {
      // The resolver has attached the gear snapshot; auto-equip then flips the
      // best body armor to equipped so derived AC fires without a manual toggle.
      const resolved = [
        {
          name: 'Chain Mail',
          quantity: 1,
          equipped: false,
          itemId: '11111111-1111-4111-8111-111111111111',
          gear: { type: 'armor', armorType: 'heavy', baseArmorClass: 16 },
        },
        { name: 'Longsword', quantity: 1, equipped: false, gear: { type: 'weapon' } },
      ];
      inventoryResolver.resolveInventory.mockResolvedValue(resolved);
      prisma.character.create.mockResolvedValue(mockCharacter);

      await service.create(USER_ID, {
        ...createCharacterDto,
        inventory: [{ name: 'Chain mail', quantity: 1, equipped: false }],
        autoEquipStartingGear: true,
      });

      const persisted = prisma.character.create.mock.calls[0][0].data.inventory;
      expect(persisted).toEqual([
        expect.objectContaining({ name: 'Chain Mail', equipped: true }),
        expect.objectContaining({ name: 'Longsword', equipped: false }),
      ]);
    });

    it('never persists the transient autoEquipStartingGear flag (VEG-483)', async () => {
      prisma.character.create.mockResolvedValue(mockCharacter);

      await service.create(USER_ID, { ...createCharacterDto, autoEquipStartingGear: true });

      expect(prisma.character.create.mock.calls[0][0].data).not.toHaveProperty(
        'autoEquipStartingGear'
      );
    });

    it('leaves equipped state untouched when the flag is absent (VEG-483)', async () => {
      const resolved = [
        {
          name: 'Chain Mail',
          quantity: 1,
          equipped: false,
          gear: { type: 'armor', armorType: 'heavy', baseArmorClass: 16 },
        },
      ];
      inventoryResolver.resolveInventory.mockResolvedValue(resolved);
      prisma.character.create.mockResolvedValue(mockCharacter);

      await service.create(USER_ID, {
        ...createCharacterDto,
        inventory: [{ name: 'Chain mail', quantity: 1, equipped: false }],
      });

      expect(prisma.character.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ inventory: resolved }),
      });
    });

    it('asserts campaign membership when campaignId is provided', async () => {
      const campaignId = '123e4567-e89b-42d3-a456-426614174000';
      campaignAuth.assertCampaignMember.mockResolvedValue({ id: campaignId });
      prisma.character.create.mockResolvedValue({ ...mockCharacter, campaignId });

      await service.create(USER_ID, { ...createCharacterDto, campaignId });

      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(campaignId, USER_ID);
      expect(prisma.character.create).toHaveBeenCalled();
    });

    it('rejects and does not create when the user is not a member of the target campaign', async () => {
      const campaignId = '123e4567-e89b-42d3-a456-426614174000';
      campaignAuth.assertCampaignMember.mockRejectedValue(
        new ForbiddenException('You are not a member of this campaign')
      );

      await expect(
        service.create(USER_ID_2, { ...createCharacterDto, campaignId })
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.character.create).not.toHaveBeenCalled();
    });
  });

  describe('CreateCharacterDto validation', () => {
    it('rejects a non-UUID campaignId', async () => {
      const dto = plainToInstance(CreateCharacterDto, {
        ...createCharacterDto,
        campaignId: 'not-a-uuid',
      });

      const errors = await validate(dto);

      expect(errors.some(e => e.property === 'campaignId')).toBe(true);
    });

    it('accepts a UUID campaignId', async () => {
      const dto = plainToInstance(CreateCharacterDto, {
        ...createCharacterDto,
        campaignId: '123e4567-e89b-42d3-a456-426614174000',
      });

      const errors = await validate(dto);

      expect(errors.filter(e => e.property === 'campaignId')).toEqual([]);
    });
  });

  describe('findAllForUser', () => {
    // A list row as the slim select returns it: classes, no scalar class.
    const listRow = (classes: CharacterClass[]) => ({
      id: mockCharacter.id,
      userId: mockCharacter.userId,
      name: mockCharacter.name,
      race: mockCharacter.race,
      classes,
      level: mockCharacter.level,
      createdAt: mockCharacter.createdAt,
      updatedAt: mockCharacter.updatedAt,
    });

    it('should return paginated characters filtered by userId', async () => {
      prisma.character.findMany.mockResolvedValue([listRow(mockCharacter.classes)]);
      prisma.character.count.mockResolvedValue(1);

      const result = await service.findAllForUser(USER_ID, { page: 1, limit: 20 });

      expect(prisma.character.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        select: {
          id: true,
          userId: true,
          name: true,
          race: true,
          classes: true,
          level: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.character.count).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(result).toEqual({
        data: [
          {
            id: mockCharacter.id,
            userId: mockCharacter.userId,
            name: mockCharacter.name,
            race: mockCharacter.race,
            class: 'Fighter',
            level: mockCharacter.level,
            createdAt: mockCharacter.createdAt,
            updatedAt: mockCharacter.updatedAt,
          },
        ],
        total: 1,
        page: 1,
        lastPage: 1,
      });
      expect(result.data[0]).toBeInstanceOf(CharacterListItemDto);
      // Heavy columns never reach the list payload.
      expect((result.data[0] as unknown as Record<string, unknown>).abilityScores).toBeUndefined();
    });

    it('lists the first class as the class and a classless character as null', async () => {
      prisma.character.findMany.mockResolvedValue([
        listRow([entry({ name: 'Wizard', level: 3 }), entry({ level: 2 })]),
        listRow([]),
      ]);
      prisma.character.count.mockResolvedValue(2);

      const result = await service.findAllForUser(USER_ID, { page: 1, limit: 20 });

      expect(result.data.map(row => row.class)).toEqual(['Wizard', null]);
    });
  });

  describe('findOne', () => {
    it('should return character when found', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      const result = await service.findOne(CHARACTER_ID);

      expect(prisma.character.findUnique).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
      });
      expect(result).toMatchObject(mockCharacter);
    });

    it('attaches the computed-stats block derived from the stored inputs', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      const result = await service.findOne(CHARACTER_ID);

      // mockCharacter is a level-5 Fighter (non-caster): STR 16, DEX 12, CON 14,
      // WIS 13; proficient in Strength/Constitution saves and Athletics.
      expect(result.computed.proficiencyBonus).toBe(3);
      // Dex 12 → +1 base, plus the fixture's stored +1 bonus (VEG-452).
      expect(result.computed.initiative).toEqual({
        base: 1,
        bonus: 1,
        exhaustionPenalty: 0,
        effective: 2,
      });
      expect(result.computed.abilityModifiers.strength).toBe(3);
      expect(result.computed.savingThrows['Strength']).toEqual({ bonus: 6, proficient: true });
      expect(result.computed.skills['Athletics']).toEqual({
        ability: 'Strength',
        bonus: 6,
        proficient: true,
      });
      expect(result.computed.passivePerception).toBe(11);
      // Non-caster: no spellcasting block, no slots.
      expect(result.computed.spellcasting).toBeNull();
      expect(result.computed.spellSlots).toBeNull();
      // Level 5 at exactly 6500 XP: at the band floor, 7500 XP to level 6.
      expect(result.computed.xp).toEqual({
        currentLevelAt: 6500,
        nextLevelAt: 14000,
        into: 0,
        span: 7500,
        readyToLevel: false,
      });
    });

    it('derives spell DC/attack and slot maxima from the class spellcasting data', async () => {
      prisma.character.findUnique.mockResolvedValue({
        ...mockCharacter,
        ...withClass('Wizard'),
        spellcastingAbility: 'Intelligence',
        abilityScores: { ...mockCharacter.abilityScores, intelligence: 16 },
      });
      prisma.srdClass.findMany.mockResolvedValue([
        {
          id: 'cls-wizard',
          name: 'Wizard',
          spellcasting: {
            ability: 'Intelligence',
            spellSlotProgression: {
              5: { 1: 4, 2: 3, 3: 2 },
              20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
            },
          },
        },
      ]);

      const result = await service.findOne(CHARACTER_ID);

      expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
        where: classWhere('Wizard'),
        select: classSelect,
      });
      // INT 16 → mod 3, prof 3 at level 5: DC = 8 + 3 + 3 = 14; attack = 6.
      expect(result.computed.spellcasting).toEqual({
        ability: 'Intelligence',
        modifier: 3,
        saveDC: 14,
        attackBonus: 6,
      });
      expect(result.computed.spellSlots).toEqual({
        caster: 'full',
        maxByLevel: { 1: 4, 2: 3, 3: 2 },
      });
    });

    it('derives spell DC/attack from spellcastingAbility even when the class is unknown, omitting slots', async () => {
      const warn = jest.spyOn(
        (service as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn'
      );
      prisma.character.findUnique.mockResolvedValue({
        ...mockCharacter,
        ...withClass('Homebrew Warlock'),
        spellcastingAbility: 'Charisma',
        abilityScores: { ...mockCharacter.abilityScores, charisma: 16 },
      });
      // Class not present in the catalog.
      prisma.srdClass.findMany.mockResolvedValue([]);

      const result = await service.findOne(CHARACTER_ID);

      // CHA 16 → mod 3, prof 3: DC = 14, attack = 6 — derived from the column.
      expect(result.computed.spellcasting).toEqual({
        ability: 'Charisma',
        modifier: 3,
        saveDC: 14,
        attackBonus: 6,
      });
      // No class row → no progression → slots omitted, and it's logged.
      expect(result.computed.spellSlots).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('class "Homebrew Warlock" not found')
      );
    });

    // ── Weapon proficiency grants (VEG-463) — match rules live in gear.spec;
    // these pin that the class catalog row and the character's own column both
    // reach the derivation.
    const tieredLongsword = {
      name: 'Longsword',
      quantity: 1,
      equipped: true,
      gear: {
        type: 'weapon',
        damage: '1d8',
        damageType: 'Slashing',
        properties: [],
        ranged: false,
        weaponCategory: 'martial',
      },
    };

    it('resolves weapon proficiency from the class weapon-proficiency grants (VEG-463)', async () => {
      prisma.character.findUnique.mockResolvedValue({
        ...mockCharacter,
        // Nothing on the character row itself — the class grant must cover it.
        proficiencies: [],
        inventory: [tieredLongsword],
      });
      prisma.srdClass.findMany.mockResolvedValue([
        {
          id: SRD_FIGHTER_ID,
          name: 'Fighter',
          spellcasting: null,
          weaponProficiencies: ['Simple weapons', 'Martial weapons'],
        },
      ]);

      const result = await service.findOne(CHARACTER_ID);

      // STR 16 → +3, prof +3 granted by the class list.
      expect(result.computed.weapons[0]).toMatchObject({ attackBonus: '+6' });
      expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
        where: classWhere('Fighter'),
        select: classSelect,
      });
    });

    // VEG-505 tiered SrdClass, so a class name is no longer globally unique: two
    // users may each own a homebrew "Fighter" alongside the SRD one. Resolving
    // by bare name would let another user's homebrew drive this character's
    // spell slots and weapon proficiencies.
    it("resolves the class against the character owner's visible content only (VEG-505)", async () => {
      prisma.character.findUnique.mockResolvedValue({ ...mockCharacter, ...withClass('Fighter') });
      prisma.srdClass.findMany.mockResolvedValue([
        { id: SRD_FIGHTER_ID, name: 'Fighter', spellcasting: null, weaponProficiencies: [] },
      ]);

      await service.findOne(CHARACTER_ID);

      expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            classNameWhere('Fighter'),
            {
              OR: [
                { contentSource: { in: ['srd', 'shared'] } },
                { createdById: mockCharacter.userId },
              ],
            },
          ],
        },
        select: classSelect,
      });
    });

    // VEG-528 replaced the tier preference (homebrew ?? shared ?? srd) with a
    // refusal. The preference was a silent guess: authoring a homebrew "Wizard"
    // retroactively repointed every one of this owner's id-less Wizards at it,
    // and deleting it flipped them back, with nothing on the sheet saying so. It
    // also disagreed with the frontend resolver, which has always refused an
    // ambiguous name — so one sheet could compute spell slots off a class its
    // level-up dialog declined to name.
    //
    // Now both sides answer the same way: a name matching zero or many visible
    // rows resolves to nothing. Absent-and-logged beats confidently wrong, and
    // the VEG-528 backfill pins an id on every character whose name resolves
    // unambiguously today, so almost nothing reaches this path in practice.
    describe('refusing an ambiguous class name (VEG-528)', () => {
      const candidate = (contentSource: string, weaponProficiencies: string[]) => ({
        id: `cls-${contentSource}`,
        name: 'Fighter',
        spellcasting: null,
        weaponProficiencies,
      });

      // Longswords are martial: a proficient row reads +6 (STR +3, prof +3),
      // a non-proficient one +3. So the attack bonus names which row won.
      async function attackBonusFrom(candidates: unknown[]) {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          ...withClass('Fighter'),
          proficiencies: [],
          inventory: [tieredLongsword],
        });
        // No stored id in this block, so only the name query runs.
        prisma.srdClass.findMany.mockResolvedValue(candidates);
        const result = await service.findOne(CHARACTER_ID);
        return result.computed.weapons[0].attackBonus;
      }

      it('never sorts by a column — every visible row is fetched and judged in code', async () => {
        await attackBonusFrom([candidate('srd', ['Martial weapons'])]);

        const [args] = prisma.srdClass.findMany.mock.calls[0];
        expect(args.orderBy).toBeUndefined();
        expect(args.select).toEqual(classSelect);
      });

      it('resolves a name that matches exactly one visible row', async () => {
        expect(await attackBonusFrom([candidate('srd', ['Martial weapons'])])).toBe('+6');
      });

      // The property the whole decision rests on: with the grant present on one
      // row and absent on the other there is no correct answer, so neither is
      // used. +3 is the unproficient bonus — the class contributed nothing.
      it('grants nothing when the owner’s homebrew collides with the SRD row', async () => {
        expect(
          await attackBonusFrom([candidate('srd', []), candidate('homebrew', ['Martial weapons'])])
        ).toBe('+3');
      });

      it('grants nothing when a shared row collides with the SRD row', async () => {
        expect(
          await attackBonusFrom([candidate('srd', ['Martial weapons']), candidate('shared', [])])
        ).toBe('+3');
      });

      // Refusal must not depend on which row Postgres happened to return first —
      // that intermittency is exactly what the old tier preference was added to
      // remove, and dropping the preference must not bring it back.
      it('refuses regardless of the order Postgres returns the rows in', async () => {
        const homebrew = candidate('homebrew', ['Martial weapons']);
        const shared = candidate('shared', []);
        const srd = candidate('srd', []);
        expect(await attackBonusFrom([homebrew, shared, srd])).toBe('+3');
        expect(await attackBonusFrom([srd, shared, homebrew])).toBe('+3');
        expect(await attackBonusFrom([shared, srd, homebrew])).toBe('+3');
      });

      // Slots are the other half of what loadClassData returns, and the half a
      // player notices first. A caster whose name went ambiguous loses them —
      // deliberately, and visibly, rather than silently computing a homebrew
      // class's progression onto an SRD character's sheet.
      it('omits spell slots for an ambiguous name instead of guessing a progression', async () => {
        const caster = {
          id: 'cls-srd',
          name: 'Wizard',
          spellcasting: {
            ability: 'Intelligence',
            spellSlotProgression: { 5: { 1: 4, 2: 3, 3: 2 } },
          },
          weaponProficiencies: [],
        };
        const collidingCaster = { ...caster, id: 'cls-hb' };
        async function spellSlotsFrom(candidates: unknown[]) {
          prisma.character.findUnique.mockResolvedValue({
            ...mockCharacter,
            ...withClass('Wizard', null),
            spellcastingAbility: 'Intelligence',
          });
          prisma.srdClass.findMany.mockResolvedValue(candidates);
          return (await service.findOne(CHARACTER_ID)).computed.spellSlots;
        }

        // Asserted against its own contrast: one row grants a full caster's
        // slots at level 5, two rows grant none. Without the first half a
        // resolver that never granted slots at all would pass.
        expect(await spellSlotsFrom([caster])).not.toBeNull();
        expect(await spellSlotsFrom([caster, collidingCaster])).toBeNull();
      });

      // A refusal that logged nothing would present as an inexplicably slot-less
      // caster. The two reasons are distinguishable on purpose: "no such class"
      // is a typo, "matches N" is a collision the owner can resolve by re-picking.
      it('logs the collision, naming it as an ambiguity rather than a miss', async () => {
        const warn = jest.spyOn(
          (service as unknown as { logger: { warn: jest.Mock } }).logger,
          'warn'
        );

        await attackBonusFrom([candidate('srd', []), candidate('homebrew', ['Martial weapons'])]);

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('matches 2 visible classes'));
      });
    });

    // The frontend resolver folds case (`resolveByIdThenUniqueName`); Postgres
    // does not. Before VEG-528 a character with a free-typed "fighter" got the
    // SRD Fighter's hit die and features on the sheet and no spellcasting or
    // weapon grants from here — the same sheet, disagreeing with itself.
    describe('matching the class name case-insensitively (VEG-528)', () => {
      it('resolves a free-typed lowercase name against the catalog row', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          ...withClass('fighter', null),
          proficiencies: [],
          inventory: [tieredLongsword],
        });
        prisma.srdClass.findMany.mockResolvedValue([
          {
            id: 'cls-srd',
            name: 'fighter',
            spellcasting: null,
            weaponProficiencies: ['Martial weapons'],
          },
        ]);

        const result = await service.findOne(CHARACTER_ID);

        expect(result.computed.weapons[0].attackBonus).toBe('+6');
      });

      it('asks Postgres for the insensitive comparison rather than folding in code', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          ...withClass('fighter', null),
        });

        await service.findOne(CHARACTER_ID);

        const [args] = prisma.srdClass.findMany.mock.calls[0];
        expect(args.where).toEqual(classWhere('fighter'));
      });

      // The escaping half of the same rule (VEG-528 review). Prisma compiles
      // `mode: 'insensitive'` to `name ILIKE $1` and binds the value as a
      // PATTERN, so before the escape a character whose class was "Fighte_" or
      // "%" matched rows its name does not name — verified against the dev
      // database, where `equals: '%'` returned every class. That made the backend
      // a pattern matcher while the frontend resolver and the backfill migration
      // stayed on plain case-folded equality: the exact divergence this ticket
      // exists to delete, reintroduced by its own fix. Worse on the write path,
      // where deriveClassId would persist the matched id permanently.
      it('escapes LIKE metacharacters so a name is matched literally', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          ...withClass('Fighte_', null),
        });

        await service.findOne(CHARACTER_ID);

        const [args] = prisma.srdClass.findMany.mock.calls[0];
        expect(args.where).toEqual(classWhere('Fighte_'));
      });

      it('escapes the percent wildcard too', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          ...withClass('%', null),
        });

        await service.findOne(CHARACTER_ID);

        const [args] = prisma.srdClass.findMany.mock.calls[0];
        expect(args.where).toEqual(classWhere('%'));
      });

      // The third metacharacter. Unescaped, a trailing backslash is a dangling
      // LIKE escape, which Postgres 16 silently fails to match, so the class
      // would never resolve.
      it('escapes a trailing backslash so the name can still match', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          ...withClass('Fighter\\', null),
        });

        await service.findOne(CHARACTER_ID);

        const [args] = prisma.srdClass.findMany.mock.calls[0];
        expect(args.where).toEqual(classWhere('Fighter\\'));
      });

      // Belt and braces: even if the SQL widened, the resolver decides on
      // case-folded equality, so a pattern that matched extra rows still resolves
      // to nothing rather than to whichever row it happened to catch.
      it('refuses a wildcard name even when the query returns rows', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          ...withClass('Fighte_', null),
          proficiencies: [],
          inventory: [tieredLongsword],
        });
        prisma.srdClass.findMany.mockResolvedValue([
          {
            id: 'cls-srd',
            name: 'Fighter',
            spellcasting: null,
            weaponProficiencies: ['Martial weapons'],
          },
        ]);

        const result = await service.findOne(CHARACTER_ID);

        expect(result.computed.weapons[0].attackBonus).toBe('+3');
      });

      // Case-folding widens what counts as a collision, and it has to: the
      // partial unique indexes are case-sensitive, so "Fighter" and "fighter"
      // can both be legitimate rows. Matching both and then picking one would
      // re-create the arbitrary choice this ticket exists to delete.
      it('treats case-variant duplicates as ambiguous, not as a wider net', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          ...withClass('Fighter', null),
          proficiencies: [],
          inventory: [tieredLongsword],
        });
        prisma.srdClass.findMany.mockResolvedValue([
          {
            id: 'cls-srd',
            name: 'Fighter',
            spellcasting: null,
            weaponProficiencies: ['Martial weapons'],
          },
          { id: 'cls-hb', name: 'fighter', spellcasting: null, weaponProficiencies: [] },
        ]);

        const result = await service.findOne(CHARACTER_ID);

        expect(result.computed.weapons[0].attackBonus).toBe('+3');
      });
    });

    // VEG-524. A stored classId names the row the picker actually landed on, so
    // it wins over any name reasoning — otherwise the backend computes spell
    // slots and weapon grants from one row while the sheet displays another.
    // Since VEG-528 the id is also the only thing that resolves a colliding
    // name at all, which is why the write paths now derive and persist it.
    describe('resolving the class by stored classId (VEG-524)', () => {
      const HOMEBREW_ID = 'cls-homebrew';
      const SRD_ID = 'cls-srd';

      const row = (id: string, contentSource: string, weaponProficiencies: string[]) => ({
        id,
        name: 'Fighter',
        contentSource,
        spellcasting: null,
        weaponProficiencies,
      });

      // Same observable seam the tier tests use: longswords are martial, so a
      // proficient row reads +6 (STR +3, prof +3) and a non-proficient one +3.
      // The attack bonus names which row won.
      async function attackBonusFor(classId: string | null, candidates: unknown[]) {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          ...withClass('Fighter', classId),
          proficiencies: [],
          inventory: [tieredLongsword],
        });
        // Two queries since VEG-528: the id is looked up on its own so Postgres
        // can serve it from the primary key, and the name query runs only when
        // that misses. Mocking them separately is what makes the split visible.
        const byId = classId ? (candidates as { id: string }[]).find(c => c.id === classId) : null;
        prisma.srdClass.findFirst.mockResolvedValue(byId ?? null);
        prisma.srdClass.findMany.mockResolvedValue(candidates);
        const result = await service.findOne(CHARACTER_ID);
        return result.computed.weapons[0].attackBonus;
      }

      // Without the id these two rows are an unresolvable collision; the id
      // settles it.
      it('prefers the row the stored id names over a colliding homebrew row', async () => {
        expect(
          await attackBonusFor(SRD_ID, [
            row(HOMEBREW_ID, 'homebrew', []),
            row(SRD_ID, 'srd', ['Martial weapons']),
          ])
        ).toBe('+6');
      });

      it('prefers the stored id when it names the homebrew row', async () => {
        expect(
          await attackBonusFor(HOMEBREW_ID, [
            row(SRD_ID, 'srd', []),
            row(HOMEBREW_ID, 'homebrew', ['Martial weapons']),
          ])
        ).toBe('+6');
      });

      it('is stable regardless of the order Postgres returns the rows in', async () => {
        const homebrew = row(HOMEBREW_ID, 'homebrew', []);
        const srd = row(SRD_ID, 'srd', ['Martial weapons']);
        expect(await attackBonusFor(SRD_ID, [homebrew, srd])).toBe('+6');
        expect(await attackBonusFor(SRD_ID, [srd, homebrew])).toBe('+6');
      });

      // Homebrew rows are deletable, so a stored id can outlive its row. It
      // degrades to the name path rather than dropping the class outright — the
      // character keeps its grants for as long as the name stays unique.
      it('degrades a stale id to the unambiguous-name path, not to nothing', async () => {
        expect(await attackBonusFor('cls-deleted', [row(SRD_ID, 'srd', ['Martial weapons'])])).toBe(
          '+6'
        );
      });

      // The pre-VEG-528 assertion here was '+6': the tier preference took the
      // homebrew row. A stale id meeting a colliding name has no answer, and
      // now says so.
      it('grants nothing when a stale id meets a colliding name', async () => {
        expect(
          await attackBonusFor('cls-deleted', [
            row(SRD_ID, 'srd', []),
            row(HOMEBREW_ID, 'homebrew', ['Martial weapons']),
          ])
        ).toBe('+3');
      });

      it('grants nothing when no id is stored and the name collides', async () => {
        expect(
          await attackBonusFor(null, [
            row(SRD_ID, 'srd', []),
            row(HOMEBREW_ID, 'homebrew', ['Martial weapons']),
          ])
        ).toBe('+3');
      });

      // The id is a soft ref with no FK, so it is attacker-controlled input on
      // the read path too. Scoping has to wrap the id lookup as well as the name
      // one, or a guessed id would read a stranger's homebrew class.
      it('scopes the id lookup to the owner’s visible content', async () => {
        await attackBonusFor(HOMEBREW_ID, [row(HOMEBREW_ID, 'homebrew', ['Martial weapons'])]);

        expect(prisma.srdClass.findFirst).toHaveBeenCalledWith({
          where: classIdWhere(HOMEBREW_ID),
          select: classSelect,
        });
      });

      // visibleTo() returns a bare { OR: [...] }. Spreading it beside another key
      // would have one silently overwrite the other and drop the scoping, so both
      // queries nest under an explicit AND.
      it('nests the visibility fragment under AND rather than spreading it', async () => {
        await attackBonusFor(HOMEBREW_ID, [row(HOMEBREW_ID, 'homebrew', ['Martial weapons'])]);

        const [args] = prisma.srdClass.findFirst.mock.calls[0];
        expect(args.where.OR).toBeUndefined();
        expect(args.where.AND).toHaveLength(2);
      });

      // The point of splitting the two queries (VEG-528). Postgres cannot combine
      // an index scan with a non-indexable ILIKE branch, so the old single
      // `(id = $1 OR name ILIKE $2)` form degraded the whole disjunction to a
      // sequential scan and never touched the primary key. A resolved id must
      // therefore cost exactly one indexed query and no name lookup at all.
      it('does not run the name query at all when the stored id resolves', async () => {
        await attackBonusFor(HOMEBREW_ID, [row(HOMEBREW_ID, 'homebrew', ['Martial weapons'])]);

        expect(prisma.srdClass.findFirst).toHaveBeenCalledTimes(1);
        expect(prisma.srdClass.findMany).not.toHaveBeenCalled();
      });

      it('falls back to the name query only once the id misses', async () => {
        await attackBonusFor('cls-deleted', [row(SRD_ID, 'srd', ['Martial weapons'])]);

        expect(prisma.srdClass.findFirst).toHaveBeenCalledTimes(1);
        expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
          where: classWhere('Fighter'),
          select: classSelect,
        });
      });

      it('queries by name alone when no id is stored', async () => {
        await attackBonusFor(null, [row(SRD_ID, 'srd', ['Martial weapons'])]);

        expect(prisma.srdClass.findFirst).not.toHaveBeenCalled();
        expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
          where: classWhere('Fighter'),
          select: classSelect,
        });
      });
    });

    it('derives a non-proficient row when neither class nor character covers the weapon (VEG-463)', async () => {
      prisma.character.findUnique.mockResolvedValue({
        ...mockCharacter,
        ...withClass('Homebrew Warlock'),
        proficiencies: [],
        inventory: [tieredLongsword],
      });
      // Class not present in the catalog → no class grants.
      prisma.srdClass.findMany.mockResolvedValue([]);

      const result = await service.findOne(CHARACTER_ID);

      expect(result.computed.weapons[0]).toMatchObject({
        attackBonus: '+3',
        notes: 'Not proficient',
      });
    });

    it("resolves weapon proficiency from the character's own proficiencies column (VEG-463)", async () => {
      prisma.character.findUnique.mockResolvedValue({
        ...mockCharacter,
        ...withClass('Homebrew Warlock'),
        proficiencies: ['Longswords'],
        inventory: [tieredLongsword],
      });
      prisma.srdClass.findMany.mockResolvedValue([]);

      const result = await service.findOne(CHARACTER_ID);

      expect(result.computed.weapons[0]).toMatchObject({ attackBonus: '+6' });
    });

    it('warns when the spellcastingAbility column is not a recognized ability', async () => {
      const warn = jest.spyOn(
        (service as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn'
      );
      prisma.character.findUnique.mockResolvedValue({
        ...mockCharacter,
        spellcastingAbility: 'Inteligence', // typo
      });

      const result = await service.findOne(CHARACTER_ID);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('unrecognized spellcastingAbility "Inteligence"')
      );
      // Still renders a caster block, with modifier 0.
      expect(result.computed.spellcasting?.modifier).toBe(0);
    });

    describe('several classes', () => {
      const WIZARD_CASTER = {
        ...WIZARD_ROW,
        spellcasting: {
          ability: 'Intelligence',
          spellSlotProgression: {
            2: { 1: 3 },
            5: { 1: 4, 2: 3, 3: 2 },
            20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
          },
        },
        weaponProficiencies: ['Daggers'],
      };

      it('projects the first entry onto the deprecated scalar fields', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          classes: [
            entry({ classId: 'cls-1', level: 3, subclass: 'Champion', subclassId: 'sub-1' }),
            entry({ name: 'Wizard', level: 2 }),
          ],
        });

        const result = await service.findOne(CHARACTER_ID);

        expect(result).toMatchObject({
          class: 'Fighter',
          classId: 'cls-1',
          subclass: 'Champion',
          subclassId: 'sub-1',
        });
        expect(result.classes).toHaveLength(2);
      });

      it('projects nulls for a character with no classes', async () => {
        prisma.character.findUnique.mockResolvedValue({ ...mockCharacter, classes: [] });

        const result = await service.findOne(CHARACTER_ID);

        expect(result).toMatchObject({
          classes: [],
          class: null,
          classId: null,
          subclass: null,
          subclassId: null,
        });
        expect(prisma.srdClass.findMany).not.toHaveBeenCalled();
        expect(prisma.srdClass.findFirst).not.toHaveBeenCalled();
      });

      it('resolves every entry and unions their weapon proficiencies', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          classes: [entry({ level: 3 }), entry({ name: 'Wizard', level: 2 })],
          proficiencies: [],
          inventory: [
            {
              name: 'Dagger',
              quantity: 1,
              equipped: true,
              gear: {
                type: 'weapon',
                damage: '1d4',
                damageType: 'Piercing',
                properties: [],
                ranged: false,
                weaponCategory: 'simple',
              },
            },
          ],
        });
        prisma.srdClass.findMany.mockResolvedValue([
          { ...FIGHTER_ROW, weaponProficiencies: ['Martial weapons'] },
          WIZARD_CASTER,
        ]);

        const result = await service.findOne(CHARACTER_ID);

        expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
          where: classWhere('Fighter'),
          select: classSelect,
        });
        expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
          where: classWhere('Wizard'),
          select: classSelect,
        });
        // Only the Wizard grants daggers: STR 16 → +3, prof +3 at level 5.
        expect(result.computed.weapons[0]).toMatchObject({ attackBonus: '+6' });
      });

      it('reads spell slots at the caster class level, not the character level', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          classes: [entry({ level: 3 }), entry({ name: 'Wizard', level: 2 })],
          spellcastingAbility: 'Intelligence',
        });
        prisma.srdClass.findMany.mockResolvedValue([FIGHTER_ROW, WIZARD_CASTER]);

        const result = await service.findOne(CHARACTER_ID);

        expect(result.computed.spellSlots).toEqual({ caster: 'full', maxByLevel: { 1: 3 } });
        expect(result.computed.spellcasting?.ability).toBe('Intelligence');
      });

      it('warns once per entry that resolves to nothing', async () => {
        const warn = jest.spyOn(
          (service as unknown as { logger: { warn: jest.Mock } }).logger,
          'warn'
        );
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          classes: [
            entry({ name: 'Bloodbinder', level: 3 }),
            entry({ name: 'Runeblade', level: 2, classId: 'cls-gone' }),
          ],
        });
        prisma.srdClass.findMany.mockResolvedValue([]);

        await service.findOne(CHARACTER_ID);

        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('class "Bloodbinder" not found'));
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('class "Runeblade" (id cls-gone) not found')
        );
      });
    });

    it('should throw NotFoundException when character not found', async () => {
      prisma.character.findUnique.mockResolvedValue(null);

      await expect(service.findOne(CHARACTER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOneForUser', () => {
    it('should return character when user is owner', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      const result = await service.findOneForUser(CHARACTER_ID, USER_ID);

      expect(result).toMatchObject(mockCharacter);
    });

    it('should throw ForbiddenException when user does not own character', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      await expect(service.findOneForUser(CHARACTER_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('update', () => {
    const dataOf = () =>
      (prisma.character.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    // A stored row for the ownership read: the fixture with these classes.
    const storedWith = (classes: CharacterClass[], over: Record<string, unknown> = {}) =>
      prisma.character.findUnique.mockResolvedValue({
        ...mockCharacter,
        classes,
        level: classes.reduce((sum, c) => sum + c.level, 0) || mockCharacter.level,
        ...over,
      });
    const patch = (body: Record<string, unknown>) =>
      service.update(CHARACTER_ID, USER_ID, plainToInstance(UpdateCharacterDto, body));

    beforeEach(() => {
      prisma.character.update.mockResolvedValue(mockCharacter);
    });

    it('should verify ownership then update the character', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);
      const updated = { ...mockCharacter, name: 'Renamed' };
      prisma.character.update.mockResolvedValue(updated);

      const result = await service.update(CHARACTER_ID, USER_ID, { name: 'Renamed' });

      // Ownership is a narrow read (no full DTO / class lookup).
      expect(prisma.character.findUnique).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        select: { userId: true, classes: true, level: true, hitDice: true },
      });
      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        data: { name: 'Renamed' },
      });
      expect(result.name).toBe('Renamed');
      // The write response carries the recomputed block.
      expect(result.computed.proficiencyBonus).toBe(3);
    });

    it('persists inventory unchanged, without re-resolving (VEG-462)', async () => {
      // A PATCH sends the whole array, so the server can't distinguish a
      // newly-typed line from one the user deliberately renamed or unlinked.
      // Re-resolving here would re-bind the rename and resurrect gear they
      // had removed — so create is the only resolution point.
      const edited = [{ name: 'Grandfather’s mail', quantity: 1, equipped: true }];
      prisma.character.findUnique.mockResolvedValue(mockCharacter);
      prisma.character.update.mockResolvedValue({ ...mockCharacter, inventory: edited });

      await service.update(CHARACTER_ID, USER_ID, { inventory: edited });

      expect(inventoryResolver.resolveInventory).not.toHaveBeenCalled();
      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        data: { inventory: edited },
      });
    });

    it('round-trips status fields through the response DTO on update (VEG-408)', async () => {
      // The status tracker only ever writes through update(); guard the
      // @Expose whitelist on the path the feature actually uses, not just create.
      prisma.character.findUnique.mockResolvedValue(mockCharacter);
      prisma.character.update.mockResolvedValue({
        ...mockCharacter,
        conditions: ['Frightened'],
        concentration: {},
        exhaustion: 1,
      });

      const result = await service.update(CHARACTER_ID, USER_ID, { conditions: ['Frightened'] });

      expect(result.conditions).toEqual(['Frightened']);
      expect(result.concentration).toEqual({});
      expect(result.exhaustion).toBe(1);
    });

    // The sum rule is checked against the stored value of whichever field the
    // PATCH leaves out, so the two can never drift apart through a write.
    describe('the class levels and the character level', () => {
      it('rejects a level-only PATCH on a classed character, writing nothing', async () => {
        storedWith([entry()]);

        const attempt = patch({ level: 6 });

        await expect(attempt).rejects.toThrow(BadRequestException);
        await expect(attempt).rejects.toThrow('classes levels sum to 5 but level is 6');
        expect(prisma.character.update).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('rejects a classes-only PATCH that disagrees with the stored level', async () => {
        storedWith([entry()]);

        await expect(patch({ classes: [entry({ level: 4 })] })).rejects.toThrow(
          'classes levels sum to 4 but level is 5'
        );
        expect(prisma.character.update).not.toHaveBeenCalled();
      });

      it('accepts a classes-only PATCH that keeps the stored level', async () => {
        storedWith([entry()]);

        await patch({ classes: [entry({ level: 3 }), entry({ name: 'Paladin', level: 2 })] });

        expect(prisma.character.update).toHaveBeenCalledTimes(1);
      });

      it('accepts a level-only PATCH on a classless character, with no class lookup', async () => {
        storedWith([], { level: 3 });

        await patch({ level: 4 });

        expect(dataOf()).toMatchObject({ level: 4 });
        // The response's own read resolves the stored class; the write does not.
        expect(prisma.srdClass.findMany).not.toHaveBeenCalledWith(
          expect.objectContaining(DERIVE_SELECT)
        );
      });
    });

    // Pools derive from class levels whenever a PATCH carries classes or level.
    // Spent dice carry over from the pool of the same die.
    describe('rebuilding hitDice', () => {
      it('grows the pool with the class and carries the spent dice', async () => {
        storedWith([entry()], { hitDice: [{ dieType: 'd10', total: 5, spent: 2 }] });

        await patch({ level: 6, classes: [entry({ level: 6 })] });

        expect(dataOf().hitDice).toEqual([{ dieType: 'd10', total: 6, spent: 2 }]);
      });

      it('clamps the spent dice when the pool shrinks', async () => {
        storedWith([entry()], { hitDice: [{ dieType: 'd10', total: 5, spent: 5 }] });

        await patch({ level: 3, classes: [entry({ level: 3 })] });

        expect(dataOf().hitDice).toEqual([{ dieType: 'd10', total: 3, spent: 3 }]);
      });

      it('adds a pool for a second class with a new die', async () => {
        storedWith([entry({ level: 3 })], { hitDice: [{ dieType: 'd10', total: 3, spent: 1 }] });
        prisma.srdClass.findMany.mockResolvedValue([FIGHTER_ROW, WIZARD_ROW]);

        await patch({
          level: 4,
          classes: [entry({ level: 3 }), entry({ name: 'Wizard', level: 1 })],
        });

        expect(dataOf().hitDice).toEqual([
          { dieType: 'd10', total: 3, spent: 1 },
          { dieType: 'd6', total: 1, spent: 0 },
        ]);
      });

      it('carries the pools the same PATCH sends over the stored ones', async () => {
        storedWith([entry()], { hitDice: [{ dieType: 'd10', total: 5, spent: 0 }] });

        await patch({
          level: 6,
          classes: [entry({ level: 6 })],
          hitDice: [{ dieType: 'd10', total: 5, spent: 4 }],
        });

        expect(dataOf().hitDice).toEqual([{ dieType: 'd10', total: 6, spent: 4 }]);
      });

      // What the level-up dialog sends for a Fighter saved with a guessed d8.
      // Keeping the d8 pool beside the derived d10 one would hold twelve dice
      // at level 6.
      it('replaces a pool of a die no class produces, carrying its spent dice', async () => {
        storedWith([entry()], { hitDice: [{ dieType: 'd8', total: 5, spent: 2 }] });

        await patch({
          level: 6,
          classes: [entry({ level: 6 })],
          hitDice: [{ dieType: 'd8', total: 5, spent: 2 }],
        });

        expect(dataOf().hitDice).toEqual([{ dieType: 'd10', total: 6, spent: 2 }]);
      });

      it('keeps a stored pool for a die no class produces on a classless character', async () => {
        storedWith([], { level: 3, hitDice: [{ dieType: 'd8', total: 3, spent: 1 }] });

        await patch({ level: 4 });

        expect(dataOf().hitDice).toEqual([{ dieType: 'd8', total: 3, spent: 1 }]);
      });

      // A plain null would store a jsonb null; DbNull is SQL NULL.
      it('writes SQL NULL rather than an empty array when no pool results', async () => {
        storedWith([], { level: 5, hitDice: null });
        prisma.srdClass.findMany.mockResolvedValue([]);

        await patch({ classes: [entry({ name: 'Bloodbinder' })] });

        expect(dataOf().hitDice).toBe(Prisma.DbNull);
      });

      // A rest or a spend sends the pools alone. They are the player's own
      // record, so they are stored as sent and cost no class lookup.
      it('stores a hitDice-only PATCH as sent, with no class lookup', async () => {
        storedWith([entry()], { hitDice: [{ dieType: 'd10', total: 5, spent: 0 }] });
        const hitDice = [{ dieType: 'd10', total: 5, spent: 3 }];

        await patch({ hitDice });

        expect(prisma.character.update).toHaveBeenCalledWith({
          where: { id: CHARACTER_ID },
          data: { hitDice },
        });
        // The response's own read resolves the stored class; the write does not.
        expect(prisma.srdClass.findMany).not.toHaveBeenCalledWith(
          expect.objectContaining(DERIVE_SELECT)
        );
      });
    });

    // A classId is the resolution key for its entry's name, not an independent
    // pointer. Every PATCH carrying classes re-pins every entry, so a key can
    // never outlive the name it was resolved for.
    describe('pinning each classId on a classes PATCH (VEG-524, VEG-528)', () => {
      const pinnedOf = () => (dataOf().classes as CharacterClass[]).map(c => c.classId);

      it('re-derives the id when an entry is renamed without a new id', async () => {
        storedWith([entry({ classId: 'cls-fighter' })]);
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-wizard', name: 'Wizard', hitDie: 'd6' },
        ]);

        await patch({ classes: [entry({ name: 'Wizard' })] });

        expect(dataOf().classes).toEqual([entry({ name: 'Wizard', classId: 'cls-wizard' })]);
      });

      it('clears the id when the new name is ambiguous', async () => {
        storedWith([entry({ classId: 'cls-fighter' })]);
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-srd', name: 'Wizard' },
          { id: 'cls-hb', name: 'Wizard' },
        ]);

        await patch({ classes: [entry({ name: 'Wizard' })] });

        expect(pinnedOf()).toEqual([null]);
      });

      // The editor sends a null id for anything the picker did not land on,
      // which includes a name the user merely typed. Honouring the null
      // literally would decay the key on every keystroke-then-save; deriving
      // heals it, and still yields null when the name collides.
      it('derives an id when the entry explicitly nulls it but the name resolves', async () => {
        storedWith([entry()]);

        await patch({ classes: [entry({ classId: null })] });

        expect(pinnedOf()).toEqual([SRD_FIGHTER_ID]);
      });

      // A key with no class to name is incoherent: loadClassData would grant
      // that class's spell slots to a sheet showing no class at all.
      it('clears every entry without a lookup when classes is emptied', async () => {
        storedWith([entry({ classId: 'cls-fighter' })]);

        await patch({ classes: [] });

        expect(dataOf().classes).toEqual([]);
        expect(prisma.srdClass.findMany).not.toHaveBeenCalledWith(
          expect.objectContaining(DERIVE_SELECT)
        );
      });

      // `classId` is written permanently, so a "Wizar_" pinned to the SRD
      // Wizard's id would render Wizard's hit die, features and spell slots for a
      // class that does not exist.
      it('does not derive a key for a name containing LIKE wildcards', async () => {
        storedWith([entry({ classId: 'cls-fighter' })]);
        // The row a naive ILIKE would have matched.
        prisma.srdClass.findMany.mockResolvedValue([{ id: 'cls-wizard', name: 'Wizard' }]);

        await patch({ classes: [entry({ name: 'Wizar_' })] });

        expect(dataOf().classes).toEqual([entry({ name: 'Wizar_', classId: null })]);
      });

      it('heals a null key on a re-save of the same name', async () => {
        storedWith([entry()]);

        await patch({ level: 6, classes: [entry({ level: 6 })] });

        expect(pinnedOf()).toEqual([SRD_FIGHTER_ID]);
      });

      // The case that would be destructive to get wrong. This owner's homebrew
      // "Fighter" collides with the SRD row, so the name alone derives null. The
      // stored id sent back with the entry is visible, so it is kept.
      it('keeps a visible stored id on a re-save even where the name collides', async () => {
        storedWith([entry({ classId: 'cls-hb-fighter' })]);
        prisma.srdClass.findMany.mockResolvedValue([
          { id: SRD_FIGHTER_ID, name: 'Fighter', hitDie: 'd10' },
          { id: 'cls-hb-fighter', name: 'Fighter', hitDie: 'd12' },
        ]);

        await patch({ level: 6, classes: [entry({ classId: 'cls-hb-fighter', level: 6 })] });

        expect(pinnedOf()).toEqual(['cls-hb-fighter']);
        expect(dataOf().hitDice).toEqual([{ dieType: 'd12', total: 6, spent: 0 }]);
      });

      it('treats an empty-string key as cleared, not as a key', async () => {
        storedWith([entry({ classId: 'cls-fighter' })]);

        await patch({ classes: [entry({ classId: '' })] });

        expect(pinnedOf()).toEqual([SRD_FIGHTER_ID]);
      });

      it('does not touch classes when the payload does not mention them', async () => {
        storedWith([entry({ classId: 'cls-fighter' })]);

        await patch({ name: 'Renamed' });

        expect(prisma.character.update).toHaveBeenCalledWith({
          where: { id: CHARACTER_ID },
          data: { name: 'Renamed' },
        });
        // The response's own read resolves the stored class; the write does not.
        expect(prisma.srdClass.findMany).not.toHaveBeenCalledWith(
          expect.objectContaining(DERIVE_SELECT)
        );
      });

      it('re-pins every entry on the version-guarded path too', async () => {
        storedWith([entry({ classId: 'cls-fighter' })]);
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-wizard', name: 'Wizard', hitDie: 'd6' },
        ]);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });

        await patch({ classes: [entry({ name: 'Wizard' })], expectedVersion: 1 });

        const [args] = prisma.character.updateMany.mock.calls[0];
        expect(args.data.classes).toEqual([entry({ name: 'Wizard', classId: 'cls-wizard' })]);
      });

      // A supplied key is checked, not trusted. A visible id survives as sent;
      // junk, a deleted row, or a stranger's homebrew degrades to deriving from
      // the name, exactly as if the key had been cleared.
      describe('validating a client-supplied classId (VEG-531)', () => {
        beforeEach(() => storedWith([entry()]));

        it('discards a junk id and derives from the name instead', async () => {
          await patch({ classes: [entry({ classId: 'anything' })] });

          expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
            where: classIdOrNameWhere('anything', 'Fighter'),
            ...DERIVE_SELECT,
          });
          expect(pinnedOf()).toEqual([SRD_FIGHTER_ID]);
        });

        it('treats a stranger’s homebrew id the same as a junk id', async () => {
          await patch({ classes: [entry({ classId: 'cls-stranger-hb' })] });

          expect(pinnedOf()).toEqual([SRD_FIGHTER_ID]);
        });

        it('keeps a visible id that disambiguates a duplicate name', async () => {
          prisma.srdClass.findMany.mockResolvedValue([
            { id: SRD_FIGHTER_ID, name: 'Fighter', hitDie: 'd10' },
            { id: 'cls-hb-fighter', name: 'Fighter', hitDie: 'd12' },
          ]);

          await patch({ classes: [entry({ classId: 'cls-hb-fighter' })] });

          expect(pinnedOf()).toEqual(['cls-hb-fighter']);
        });

        it('checks each entry’s id against that entry’s own name', async () => {
          prisma.srdClass.findMany.mockResolvedValue([FIGHTER_ROW, PALADIN_ROW]);

          await patch({
            classes: [
              entry({ level: 3, classId: 'anything' }),
              entry({ name: 'Paladin', level: 2, classId: 'junk' }),
            ],
          });

          expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
            where: classIdOrNameWhere('junk', 'Paladin'),
            ...DERIVE_SELECT,
          });
          expect(pinnedOf()).toEqual([SRD_FIGHTER_ID, PALADIN_ROW.id]);
        });

        it('validates on the version-guarded path too', async () => {
          prisma.character.updateMany.mockResolvedValue({ count: 1 });

          await patch({ classes: [entry({ classId: 'anything' })], expectedVersion: 1 });

          const [args] = prisma.character.updateMany.mock.calls[0];
          expect((args.data.classes as CharacterClass[])[0].classId).toBe(SRD_FIGHTER_ID);
        });
      });
    });

    it('clears a stale backgroundId when the payload sends null (VEG-476)', async () => {
      // Re-picking a free-typed background (or editing the text) sends
      // backgroundId: null; update() must forward that so the soft ref is cleared
      // rather than pinning the old id. This is the write half of the degrade-on-
      // stale-id story — the load path only recovers if the column is honest.
      prisma.character.findUnique.mockResolvedValue(mockCharacter);
      prisma.character.update.mockResolvedValue({ ...mockCharacter, backgroundId: null });

      // Via plainToInstance so the null survives as it does from a real request
      // (the DTO field is typed `?: string`; @IsOptional carries the null clear).
      const dto = plainToInstance(UpdateCharacterDto, { backgroundId: null });
      const result = await service.update(CHARACTER_ID, USER_ID, dto);

      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        data: { backgroundId: null },
      });
      expect(result.backgroundId).toBeNull();
    });

    it('should throw ForbiddenException when non-owner tries to update', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      await expect(service.update(CHARACTER_ID, USER_ID_2, { level: 6 })).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw NotFoundException when character does not exist', async () => {
      prisma.character.findUnique.mockResolvedValue(null);

      await expect(service.update(CHARACTER_ID, USER_ID, { level: 6 })).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('update with optimistic locking (expectedVersion)', () => {
    it('guards the write on expectedVersion, increments version, and returns the fresh row', async () => {
      prisma.character.findUnique
        .mockResolvedValueOnce(mockCharacter) // findOneForUser ownership read
        .mockResolvedValueOnce({ ...mockCharacter, name: 'Renamed', version: 3 }); // post-write re-fetch
      prisma.character.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.update(CHARACTER_ID, USER_ID, {
        name: 'Renamed',
        expectedVersion: 2,
      });

      expect(prisma.character.updateMany).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID, version: 2 },
        data: { name: 'Renamed', version: { increment: 1 } },
      });
      // expectedVersion is a guard, never a persisted column.
      expect(prisma.character.update).not.toHaveBeenCalled();
      expect(result.name).toBe('Renamed');
      expect(result.version).toBe(3);
      // The optimistic re-fetch path also attaches the computed block.
      expect(result.computed.proficiencyBonus).toBe(3);
    });

    it('throws 409 ConflictException carrying currentVersion on a stale write', async () => {
      prisma.character.findUnique
        .mockResolvedValueOnce(mockCharacter) // ownership read
        .mockResolvedValueOnce({ ...mockCharacter, version: 5 }); // current-version probe
      prisma.character.updateMany.mockResolvedValue({ count: 0 });

      const err = await service
        .update(CHARACTER_ID, USER_ID, { name: 'Renamed', expectedVersion: 2 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({ currentVersion: 5 });
    });

    it('throws NotFoundException when the row vanished mid-update', async () => {
      prisma.character.findUnique
        .mockResolvedValueOnce(mockCharacter) // ownership read
        .mockResolvedValueOnce(null); // probe: gone
      prisma.character.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(CHARACTER_ID, USER_ID, { name: 'Renamed', expectedVersion: 2 })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('auto-snapshot on level-up (VEG-643)', () => {
    // A level-4 sheet with play state worth keeping. The PATCH overwrites all of
    // it, so the snapshot has to carry the values from before the write.
    const levelFour = {
      ...mockCharacter,
      classes: [entry({ level: 4 })],
      level: 4,
      hitPoints: { max: 36, current: 20, temporary: 0 },
      features: [{ name: 'Action Surge', source: 'Fighter', description: 'One extra action' }],
      inventory: [{ name: 'Shortsword', quantity: 2, equipped: true }],
    };
    // A level change carries the classes that add up to it.
    const toLevel = (level: number) => ({ level, classes: [entry({ level })] });

    const snapshotData = () => prisma.characterSnapshot.create.mock.calls[0][0].data;

    beforeEach(() => {
      prisma.character.findUnique.mockResolvedValue(levelFour);
      prisma.character.findUniqueOrThrow.mockResolvedValue(levelFour);
      prisma.characterSnapshot.create.mockResolvedValue({ id: 'snap-1' });
      prisma.character.update.mockResolvedValue({ ...levelFour, level: 5 });
    });

    it('selects the stored level in the ownership read (VEG-643)', async () => {
      await service.update(CHARACTER_ID, USER_ID, { name: 'Renamed' });

      expect(prisma.character.findUnique).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        select: { userId: true, classes: true, level: true, hitDice: true },
      });
    });

    it('captures the pre-update row labelled with the old level on a 4 to 5 PATCH (VEG-643)', async () => {
      const result = await service.update(CHARACTER_ID, USER_ID, toLevel(5));

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.characterSnapshot.create).toHaveBeenCalledTimes(1);
      const created = snapshotData();
      expect(created).toMatchObject({ characterId: CHARACTER_ID, level: 4, label: 'Level 4' });
      expect(created.data.hitPoints).toEqual(levelFour.hitPoints);
      expect(created.data.features).toEqual(levelFour.features);
      expect(created.data.inventory).toEqual(levelFour.inventory);
      expect(created.data).not.toHaveProperty('id');
      expect(created.data).not.toHaveProperty('userId');
      expect(created.data).not.toHaveProperty('version');
      expect(result.level).toBe(5);
    });

    it('captures before the write on a guarded 4 to 5 PATCH (VEG-643)', async () => {
      prisma.character.findUnique
        .mockResolvedValueOnce(levelFour) // ownership read
        .mockResolvedValueOnce({ ...levelFour, level: 5, version: 1 }); // post-write re-fetch
      prisma.character.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.update(CHARACTER_ID, USER_ID, {
        ...toLevel(5),
        expectedVersion: 0,
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.characterSnapshot.create).toHaveBeenCalledTimes(1);
      expect(snapshotData()).toMatchObject({ level: 4, label: 'Level 4' });
      expect(snapshotData().data.hitPoints).toEqual(levelFour.hitPoints);
      expect(prisma.characterSnapshot.create.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.character.updateMany.mock.invocationCallOrder[0]
      );
      expect(result.version).toBe(1);
    });

    it('reads, captures and writes through the transaction client (VEG-643)', async () => {
      const tx = createMockPrismaService();
      tx.character.findUniqueOrThrow.mockResolvedValue(levelFour);
      tx.characterSnapshot.create.mockResolvedValue({ id: 'snap-1' });
      tx.character.update.mockResolvedValue({ ...levelFour, level: 5 });
      prisma.$transaction.mockImplementation((fn: (client: MockPrismaService) => unknown) =>
        Promise.resolve(fn(tx))
      );

      await service.update(CHARACTER_ID, USER_ID, toLevel(5));

      expect(tx.character.findUniqueOrThrow).toHaveBeenCalledTimes(1);
      expect(tx.characterSnapshot.create).toHaveBeenCalledTimes(1);
      expect(tx.character.update).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        data: {
          level: 5,
          classes: [entry({ classId: SRD_FIGHTER_ID, level: 5 })],
          hitDice: [{ dieType: 'd10', total: 5, spent: 0 }],
        },
      });
      expect(prisma.character.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.characterSnapshot.create).not.toHaveBeenCalled();
      expect(prisma.character.update).not.toHaveBeenCalled();
    });

    it.each([
      ['a jump of two levels', toLevel(6)],
      ['a level going down', toLevel(3)],
      ['the same level re-sent', toLevel(4)],
      ['a PATCH without a level', { name: 'Renamed' }],
    ])('takes no snapshot and opens no transaction for %s (VEG-643)', async (_label, dto) => {
      await service.update(CHARACTER_ID, USER_ID, dto);

      expect(prisma.characterSnapshot.create).not.toHaveBeenCalled();
      expect(prisma.character.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        data: expect.objectContaining('level' in dto ? { level: dto.level } : dto),
      });
    });

    it('takes no snapshot on a guarded 5 to 4 PATCH (VEG-643)', async () => {
      prisma.character.findUnique
        .mockResolvedValueOnce({ ...levelFour, ...toLevel(5) })
        .mockResolvedValueOnce(levelFour);
      prisma.character.updateMany.mockResolvedValue({ count: 1 });

      await service.update(CHARACTER_ID, USER_ID, { ...toLevel(4), expectedVersion: 0 });

      expect(prisma.characterSnapshot.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 409 inside the transaction so a stale level-up keeps no snapshot (VEG-643)', async () => {
      prisma.character.findUnique
        .mockResolvedValueOnce(levelFour) // ownership read
        .mockResolvedValueOnce({ ...levelFour, version: 3 }); // current-version probe
      prisma.character.updateMany.mockResolvedValue({ count: 0 });

      const err = await service
        .update(CHARACTER_ID, USER_ID, { ...toLevel(5), expectedVersion: 0 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({ currentVersion: 3 });
      // The snapshot insert ran inside the callback, and the callback's promise
      // rejected, which is what rolls the insert back on a real database.
      expect(prisma.characterSnapshot.create).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      await expect(prisma.$transaction.mock.results[0].value).rejects.toBeInstanceOf(
        ConflictException
      );
    });
  });

  describe('UpdateCharacterDto mass assignment protection', () => {
    it('should reject campaignId as a non-whitelisted property', async () => {
      const dto = plainToInstance(UpdateCharacterDto, {
        name: 'Test',
        campaignId: 'malicious-campaign-id',
      });
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      const hasCampaignIdError = errors.some(e => e.property === 'campaignId');
      expect(hasCampaignIdError).toBe(true);
    });

    it('should allow legitimate character fields', async () => {
      const dto = plainToInstance(UpdateCharacterDto, {
        name: 'Updated Name',
        level: 10,
        race: 'Elf',
      });
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      expect(errors).toHaveLength(0);
    });

    // VEG-349: an editable field needs to be on the DTO, not just on the Prisma
    // model — forbidNonWhitelisted 400s anything it does not declare. The sheet
    // PATCHes classes with each entry's id whenever the picker resolves a row.
    it('accepts classes carrying a classId on the update DTO', async () => {
      const dto = plainToInstance(UpdateCharacterDto, {
        classes: [entry({ classId: '223e4567-e89b-42d3-a456-426614174000' })],
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    // Typing over a resolved class clears the id, and the payload sends null
    // rather than '' to keep the key a clean soft ref (characterFormPayload).
    it('accepts an entry with a null classId so a stale id can be cleared', async () => {
      const dto = plainToInstance(UpdateCharacterDto, {
        classes: [entry({ name: 'Homebrew Knight', classId: null })],
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('rejects the deprecated classId with a message naming classes', async () => {
      const dto = plainToInstance(UpdateCharacterDto, { classId: 'cls-srd-fighter' });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(JSON.stringify(errors.map(e => e.constraints))).toContain('classes');
    });
  });

  describe('remove', () => {
    it('should verify ownership then delete the character', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);
      prisma.character.delete.mockResolvedValue(mockCharacter);

      await service.remove(CHARACTER_ID, USER_ID);

      expect(prisma.character.findUnique).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        // The class and pool columns ride along for update()'s rules; remove()
        // ignores them.
        select: { userId: true, classes: true, level: true, hitDice: true },
      });
      expect(prisma.character.delete).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
      });
    });

    it('should throw ForbiddenException when non-owner tries to delete', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      await expect(service.remove(CHARACTER_ID, USER_ID_2)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when character does not exist', async () => {
      prisma.character.findUnique.mockResolvedValue(null);

      await expect(service.remove(CHARACTER_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
