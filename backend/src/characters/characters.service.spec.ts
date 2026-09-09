import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CharactersService } from './characters.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { createMockPrismaService, MockPrismaService } from '../test/prisma-mock.factory';
import { InventoryResolverService } from './inventory/inventory-resolver.service';
import { ContentAccessService } from '../srd/content-access.service';
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

// Case-insensitive since VEG-528, so this resolver and the frontend's
// `resolveByIdThenUniqueName` fold case identically. The value is LIKE-escaped
// because Prisma compiles `mode: 'insensitive'` to ILIKE and binds it as a
// pattern — unescaped, a class named "Fighte_" matched the SRD Fighter.
const classNameWhere = (name: string) => ({
  name: { equals: name, mode: 'insensitive' },
});

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
const classIdWhere = (classId: string) => ({
  AND: [{ id: classId }, visibleToOwner as Record<string, unknown>],
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
    prisma.srdClass.findMany.mockResolvedValue([
      { id: SRD_FIGHTER_ID, name: 'Fighter', spellcasting: null },
    ]);
    // The id lookup is its own query since VEG-528. Defaulting it to "no such
    // row" keeps every name-path test exercising the name path.
    prisma.srdClass.findFirst.mockResolvedValue(null);
  });

  describe('create', () => {
    it('should create a character with userId', async () => {
      prisma.character.create.mockResolvedValue(mockCharacter);

      const result = await service.create(USER_ID, createCharacterDto);

      expect(prisma.character.create).toHaveBeenCalledWith({
        data: {
          ...createCharacterDto,
          userId: USER_ID,
          // Derived from the unambiguous class name (VEG-528): the fixture sends
          // no classId, and a create that left the column null would put the
          // character straight onto the name heuristic it exists to replace.
          classId: SRD_FIGHTER_ID,
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

    it('round-trips classId through the response DTO (VEG-524)', async () => {
      // Same @Expose whitelist guard as backgroundId above. The column and the
      // create DTO are both necessary and neither is sufficient: without the
      // @Expose the id never reaches the client, and the sheet silently falls
      // back to resolving a duplicate class name by guesswork.
      const classId = '223e4567-e89b-42d3-a456-426614174000';
      prisma.character.create.mockResolvedValue({ ...mockCharacter, classId });

      const result = await service.create(USER_ID, { ...createCharacterDto, classId });

      expect(prisma.character.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ classId }),
      });
      expect(result.classId).toBe(classId);
    });

    // VEG-524 added the column but populated it from exactly one place: a user
    // clicking a dropdown row. Every character created through the API, and
    // every one predating the column, stayed on the name heuristic forever. The
    // fix is to derive the id wherever the name resolves to exactly one visible
    // row, at the write boundary, where being wrong is cheap to correct and the
    // query cost is paid once instead of on every read.
    describe('deriving classId from an unambiguous class name (VEG-528)', () => {
      it('derives and persists the id for an API create that sends only a name', async () => {
        prisma.character.create.mockResolvedValue(mockCharacter);

        await service.create(USER_ID, { ...createCharacterDto, classId: undefined });

        expect(prisma.character.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ classId: SRD_FIGHTER_ID }),
        });
      });

      it('scopes the derivation to the creator’s visible content', async () => {
        prisma.character.create.mockResolvedValue(mockCharacter);

        await service.create(USER_ID, createCharacterDto);

        expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
          where: classWhere('Fighter'),
          // `name` is selected because resolveCatalogRef, not the SQL predicate,
          // decides; and there is no `take`, because a count taken over an ILIKE
          // result is a count of pattern matches, not of the name.
          select: { id: true, name: true },
        });
      });

      it('leaves the id null when the name matches more than one visible row', async () => {
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-srd', name: 'Fighter' },
          { id: 'cls-hb', name: 'Fighter' },
        ]);
        prisma.character.create.mockResolvedValue(mockCharacter);

        await service.create(USER_ID, createCharacterDto);

        expect(prisma.character.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ classId: null }),
        });
      });

      it('leaves the id null for a class that is not in the catalog at all', async () => {
        prisma.srdClass.findMany.mockResolvedValue([]);
        prisma.character.create.mockResolvedValue(mockCharacter);

        await service.create(USER_ID, { ...createCharacterDto, class: 'Bloodbinder' });

        expect(prisma.character.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ classId: null }),
        });
      });

      // The picker already said which row it landed on. Deriving over the top
      // would break picking a duplicate-named class — the one case the id exists
      // for.
      it('never overwrites a client-supplied id', async () => {
        prisma.character.create.mockResolvedValue(mockCharacter);

        await service.create(USER_ID, { ...createCharacterDto, classId: 'cls-hb-fighter' });

        expect(prisma.character.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ classId: 'cls-hb-fighter' }),
        });
        expect(prisma.srdClass.findMany).not.toHaveBeenCalledWith(
          expect.objectContaining({ take: 2 })
        );
      });

      it('does not look up a class for a character created without one', async () => {
        prisma.character.create.mockResolvedValue(mockCharacter);

        await service.create(USER_ID, { ...createCharacterDto, class: undefined });

        expect(prisma.srdClass.findMany).not.toHaveBeenCalledWith(
          expect.objectContaining({ take: 2 })
        );
      });
    });

    it('does not check campaign membership when no campaignId is given', async () => {
      prisma.character.create.mockResolvedValue(mockCharacter);

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
    it('should return paginated characters filtered by userId', async () => {
      prisma.character.findMany.mockResolvedValue([mockCharacter]);
      prisma.character.count.mockResolvedValue(1);

      const result = await service.findAllForUser(USER_ID, { page: 1, limit: 20 });

      expect(prisma.character.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        select: {
          id: true,
          userId: true,
          name: true,
          race: true,
          class: true,
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
            class: mockCharacter.class,
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
        class: 'Wizard',
        level: 5,
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
        class: 'Homebrew Warlock',
        level: 5,
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
      prisma.character.findUnique.mockResolvedValue({ ...mockCharacter, class: 'Fighter' });
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
          class: 'Fighter',
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
            class: 'Wizard',
            level: 5,
            classId: null,
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
          class: 'fighter',
          classId: null,
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
          class: 'fighter',
          classId: null,
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
          class: 'Fighte_',
          classId: null,
        });

        await service.findOne(CHARACTER_ID);

        const [args] = prisma.srdClass.findMany.mock.calls[0];
        expect(args.where).toEqual(classWhere('Fighte\\_'));
      });

      it('escapes the percent wildcard too', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: '%',
          classId: null,
        });

        await service.findOne(CHARACTER_ID);

        const [args] = prisma.srdClass.findMany.mock.calls[0];
        expect(args.where).toEqual(classWhere('\\%'));
      });

      // Belt and braces: even if the SQL widened, the resolver decides on
      // case-folded equality, so a pattern that matched extra rows still resolves
      // to nothing rather than to whichever row it happened to catch.
      it('refuses a wildcard name even when the query returns rows', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighte_',
          classId: null,
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
          class: 'Fighter',
          classId: null,
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
          class: 'Fighter',
          classId,
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
        class: 'Homebrew Warlock',
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
        class: 'Homebrew Warlock',
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
    it('should verify ownership then update the character', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);
      const updated = { ...mockCharacter, level: 6 };
      prisma.character.update.mockResolvedValue(updated);

      const result = await service.update(CHARACTER_ID, USER_ID, { level: 6 });

      // Ownership is a lightweight userId-only read (no full DTO / class lookup).
      expect(prisma.character.findUnique).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        select: { userId: true, class: true, classId: true },
      });
      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        data: { level: 6 },
      });
      expect(result.level).toBe(6);
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

    // `class` and `classId` are a pair: the id is the resolution key FOR that
    // name, not an independent pointer. They can only drift apart here — a PATCH
    // that moves one and not the other — and once they disagree the read path
    // cannot tell which side went stale. A stale id looks exactly like a stale
    // name: a class renamed out from under a character produces the same
    // disagreement as a class name PATCHed without a new id, and preferring
    // either one silently corrupts the other case. So the invariant is kept
    // here, where the information to keep it still exists.
    describe('keeping class and classId consistent (VEG-524 follow-up)', () => {
      // Pre-VEG-528 this asserted `classId: null`. Dropping the key was only ever
      // half the job: it stopped the id naming the wrong row, but left the
      // character on the name heuristic. Re-deriving does both — the stale id
      // goes, and the new name's row is pinned while it is still unambiguous.
      it('re-derives classId when the class name changes without a new id', async () => {
        // Stored: Fighter + the Fighter row's id. Caller renames the class only.
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: 'cls-fighter',
        });
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-wizard', name: 'Wizard', spellcasting: null },
        ]);
        prisma.character.update.mockResolvedValue({ ...mockCharacter, class: 'Wizard' });

        const dto = plainToInstance(UpdateCharacterDto, { class: 'Wizard' });
        await service.update(CHARACTER_ID, USER_ID, dto);

        expect(prisma.character.update).toHaveBeenCalledWith({
          where: { id: CHARACTER_ID },
          data: { class: 'Wizard', classId: 'cls-wizard' },
        });
      });

      it('clears classId when the new name is ambiguous', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: 'cls-fighter',
        });
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-srd', name: 'Wizard' },
          { id: 'cls-hb', name: 'Wizard' },
        ]);
        prisma.character.update.mockResolvedValue({ ...mockCharacter, class: 'Wizard' });

        const dto = plainToInstance(UpdateCharacterDto, { class: 'Wizard' });
        await service.update(CHARACTER_ID, USER_ID, dto);

        expect(prisma.character.update).toHaveBeenCalledWith({
          where: { id: CHARACTER_ID },
          data: { class: 'Wizard', classId: null },
        });
      });

      // The editor sends `classId: null` for anything the picker did not land
      // on, which since VEG-527 includes a name the user merely typed. Honouring
      // the null literally would make every keystroke-then-save decay the column;
      // deriving heals it instead, and still yields null when the name collides.
      it('derives an id when the payload explicitly nulls it but the name resolves', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: null,
        });
        prisma.srdClass.findMany.mockResolvedValue([
          { id: SRD_FIGHTER_ID, name: 'Fighter', spellcasting: null },
        ]);
        prisma.character.update.mockResolvedValue(mockCharacter);

        const dto = plainToInstance(UpdateCharacterDto, { class: 'Fighter', classId: null });
        await service.update(CHARACTER_ID, USER_ID, dto);

        expect(prisma.character.update).toHaveBeenCalledWith({
          where: { id: CHARACTER_ID },
          data: { class: 'Fighter', classId: SRD_FIGHTER_ID },
        });
      });

      // `@IsOptional()` skips validation for null as well as undefined, so
      // `class: null` reaches the service as a real value. `??` treated it as
      // "not supplied" and derived from the OLD name, writing class = null
      // alongside the Fighter row's id — and loadClassData short-circuits on a
      // present id, so the now-classless character kept computing Fighter's
      // spell slots and weapon proficiencies indefinitely. Pre-VEG-528 the same
      // request cleared the id, so this would have been a regression.
      it('nulls classId when the class name is nulled, without reusing the old name', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: 'cls-fighter',
        });
        prisma.character.update.mockResolvedValue(mockCharacter);

        const dto = plainToInstance(UpdateCharacterDto, { class: null });
        await service.update(CHARACTER_ID, USER_ID, dto);

        const [args] = prisma.character.update.mock.calls[0];
        expect(args.data).toMatchObject({ class: null, classId: null });
        expect(prisma.srdClass.findMany).not.toHaveBeenCalledWith(
          expect.objectContaining({ take: 2 })
        );
      });

      // A wildcard name must not derive a key on the write path either. This is
      // the one that persists: `classId` is written permanently, so a "Wizar_"
      // pinned to the SRD Wizard's id would render Wizard's hit die, features and
      // spell slots for a class that does not exist, and the frontend would agree
      // because it resolves the stored id first.
      it('does not derive a key for a name containing LIKE wildcards', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: 'cls-fighter',
        });
        // The row a naive ILIKE would have matched.
        prisma.srdClass.findMany.mockResolvedValue([{ id: 'cls-wizard', name: 'Wizard' }]);
        prisma.character.update.mockResolvedValue(mockCharacter);

        const dto = plainToInstance(UpdateCharacterDto, { class: 'Wizar_' });
        await service.update(CHARACTER_ID, USER_ID, dto);

        const [args] = prisma.character.update.mock.calls[0];
        expect(args.data).toMatchObject({ class: 'Wizar_', classId: null });
      });

      // The editor sends `classId: null` on every save, so it healed by accident;
      // an API client re-sending the same name never did, and that is the
      // population the ticket exists for. Gated on the STORED key being empty,
      // because re-deriving over a good key would erase it whenever the name is
      // ambiguous — which is exactly the homebrew owner's situation.
      it('heals a null key on a re-save of the same name', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: null,
        });
        prisma.character.update.mockResolvedValue(mockCharacter);

        const dto = plainToInstance(UpdateCharacterDto, { class: 'Fighter', level: 6 });
        await service.update(CHARACTER_ID, USER_ID, dto);

        const [args] = prisma.character.update.mock.calls[0];
        expect(args.data).toMatchObject({ classId: SRD_FIGHTER_ID });
      });

      // The destructive case the gate above prevents. This owner's homebrew
      // "Fighter" collides with the SRD row, so derivation returns null; without
      // the stored-key check a plain re-save would erase the id pinning them to
      // the right row, which is worse than the state the ticket set out to fix.
      it('never re-derives over a key the character already has', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: 'cls-hb-fighter',
        });
        prisma.character.update.mockResolvedValue(mockCharacter);

        const dto = plainToInstance(UpdateCharacterDto, { class: 'Fighter', level: 6 });
        await service.update(CHARACTER_ID, USER_ID, dto);

        const [args] = prisma.character.update.mock.calls[0];
        expect(args.data.classId).toBeUndefined();
        expect(prisma.srdClass.findMany).not.toHaveBeenCalledWith(
          expect.objectContaining({ select: { id: true, name: true } })
        );
      });

      // `''` is legal under @IsOptional() @IsString(), and is neither undefined
      // nor null. Stored, it fails every id lookup while looking like a key, and
      // the backfill's `classId IS NULL` skips it, so nothing can ever repair it.
      it('treats an empty-string key as cleared, not as a key', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: 'cls-fighter',
        });
        prisma.character.update.mockResolvedValue(mockCharacter);

        const dto = plainToInstance(UpdateCharacterDto, { class: 'Fighter', classId: '' });
        await service.update(CHARACTER_ID, USER_ID, dto);

        const [args] = prisma.character.update.mock.calls[0];
        expect(args.data).toMatchObject({ classId: SRD_FIGHTER_ID });
      });

      // Clearing the class is not an invitation to guess one.
      it('nulls classId without a lookup when the class name is cleared', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: 'cls-fighter',
        });
        prisma.character.update.mockResolvedValue(mockCharacter);

        const dto = plainToInstance(UpdateCharacterDto, { class: '' });
        await service.update(CHARACTER_ID, USER_ID, dto);

        const [args] = prisma.character.update.mock.calls[0];
        expect(args.data).toMatchObject({ class: '', classId: null });
        expect(prisma.srdClass.findMany).not.toHaveBeenCalledWith(
          expect.objectContaining({ take: 2 })
        );
      });

      // The caller supplied both, so they have said what they mean. Nothing to
      // infer, and overriding them would break picking a duplicate-named class.
      it('leaves an explicitly supplied classId alone', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: 'cls-fighter',
        });
        prisma.character.update.mockResolvedValue(mockCharacter);

        const dto = plainToInstance(UpdateCharacterDto, {
          class: 'Fighter',
          classId: 'cls-hb-fighter',
        });
        await service.update(CHARACTER_ID, USER_ID, dto);

        expect(prisma.character.update).toHaveBeenCalledWith({
          where: { id: CHARACTER_ID },
          data: { class: 'Fighter', classId: 'cls-hb-fighter' },
        });
      });

      // A save that re-sends the same name is not a change, and must not cost the
      // character its resolution key — that is how an incidental edit would
      // silently make a duplicate-named class ambiguous again.
      it('preserves classId when the class name is unchanged', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: 'cls-fighter',
        });
        prisma.character.update.mockResolvedValue(mockCharacter);

        const dto = plainToInstance(UpdateCharacterDto, { class: 'Fighter', level: 6 });
        await service.update(CHARACTER_ID, USER_ID, dto);

        expect(prisma.character.update).toHaveBeenCalledWith({
          where: { id: CHARACTER_ID },
          data: { class: 'Fighter', level: 6 },
        });
      });

      it('does not touch classId when the payload does not mention class', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: 'cls-fighter',
        });
        prisma.character.update.mockResolvedValue(mockCharacter);

        const dto = plainToInstance(UpdateCharacterDto, { level: 6 });
        await service.update(CHARACTER_ID, USER_ID, dto);

        expect(prisma.character.update).toHaveBeenCalledWith({
          where: { id: CHARACTER_ID },
          data: { level: 6 },
        });
      });

      // The optimistic-locking path is a different Prisma call; the invariant
      // has to hold on both or the guarded save becomes the way around it.
      it('reconciles classId on the version-guarded path too', async () => {
        prisma.character.findUnique.mockResolvedValue({
          ...mockCharacter,
          class: 'Fighter',
          classId: 'cls-fighter',
        });
        prisma.srdClass.findMany.mockResolvedValue([
          { id: 'cls-wizard', name: 'Wizard', spellcasting: null },
        ]);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });

        const dto = plainToInstance(UpdateCharacterDto, { class: 'Wizard', expectedVersion: 1 });
        await service.update(CHARACTER_ID, USER_ID, dto);

        const [args] = prisma.character.updateMany.mock.calls[0];
        expect(args.data).toMatchObject({ class: 'Wizard', classId: 'cls-wizard' });
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
        .mockResolvedValueOnce({ ...mockCharacter, level: 6, version: 3 }); // post-write re-fetch
      prisma.character.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.update(CHARACTER_ID, USER_ID, {
        level: 6,
        expectedVersion: 2,
      });

      expect(prisma.character.updateMany).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID, version: 2 },
        data: { level: 6, version: { increment: 1 } },
      });
      // expectedVersion is a guard, never a persisted column.
      expect(prisma.character.update).not.toHaveBeenCalled();
      expect(result.level).toBe(6);
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
        .update(CHARACTER_ID, USER_ID, { level: 6, expectedVersion: 2 })
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
        service.update(CHARACTER_ID, USER_ID, { level: 6, expectedVersion: 2 })
      ).rejects.toThrow(NotFoundException);
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
    // PATCHes classId whenever the class picker resolves a row, so a missing
    // declaration would reject the whole save, not just drop the field.
    it('accepts classId on the update DTO (VEG-524)', async () => {
      const dto = plainToInstance(UpdateCharacterDto, {
        class: 'Fighter',
        classId: '223e4567-e89b-42d3-a456-426614174000',
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    // Typing over a resolved class clears the id, and the payload sends null
    // rather than '' to keep the column a clean soft ref (characterFormPayload).
    it('accepts a null classId so a stale id can be cleared (VEG-524)', async () => {
      const dto = plainToInstance(UpdateCharacterDto, { class: 'Homebrew Knight', classId: null });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('should verify ownership then delete the character', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);
      prisma.character.delete.mockResolvedValue(mockCharacter);

      await service.remove(CHARACTER_ID, USER_ID);

      expect(prisma.character.findUnique).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        // `class` rides along for update()'s class/classId invariant; remove()
        // ignores it (VEG-524 follow-up).
        select: { userId: true, class: true, classId: true },
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
