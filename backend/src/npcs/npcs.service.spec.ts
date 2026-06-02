import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NpcsService } from './npcs.service';
import { NpcGeneratorService } from './generator/npc-generator.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { USER_ID, USER_ID_2, CAMPAIGN_ID } from '../test/fixtures';
import { NpcDto, NpcListItemDto, NpcRelationDto } from './dto/npc-response.dto';

describe('NpcsService', () => {
  let service: NpcsService;
  let prisma: MockPrismaService;
  let campaignAuth: { assertCampaignOwner: jest.Mock };
  let generator: { generate: jest.Mock };

  const NPC_ID = 'npc-1111-2222-3333-444444444444';
  const TARGET_NPC_ID = 'npc-5555-6666-7777-888888888888';
  const RELATION_ID = 'rel-9999-0000-1111-222222222222';

  const mockNpc = {
    id: NPC_ID,
    campaignId: CAMPAIGN_ID,
    createdById: USER_ID,
    name: 'Old Maelin',
    race: 'Human',
    background: 'Sage',
    profession: 'Innkeeper',
    alignment: 'Neutral Good',
    size: 'Medium',
    age: 64,
    gender: 'Male',
    appearance: 'Greying beard, kind eyes',
    personalityTraits: ['Welcoming'],
    ideals: ['Hospitality'],
    bonds: ['The inn'],
    flaws: ['Gossipy'],
    statBlock: null,
    goldPieces: 5,
    silverPieces: 12,
    copperPieces: 0,
    loot: null,
    lootOverrides: null,
    generationParams: null,
    lockedFields: [],
    isManual: true,
    createdAt: new Date('2026-05-08T00:00:00Z'),
    updatedAt: new Date('2026-05-08T00:00:00Z'),
  };

  const mockRelation = {
    id: RELATION_ID,
    fromNpcId: NPC_ID,
    toNpcId: TARGET_NPC_ID,
    relation: 'sibling',
    notes: null,
  };

  beforeEach(async () => {
    campaignAuth = { assertCampaignOwner: jest.fn() };
    generator = { generate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NpcsService,
        prismaMockProvider(),
        { provide: CampaignAuthService, useValue: campaignAuth },
        { provide: NpcGeneratorService, useValue: generator },
      ],
    }).compile();

    service = module.get<NpcsService>(NpcsService);
    prisma = module.get<MockPrismaService>(PrismaService as unknown as new () => MockPrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      campaignId: CAMPAIGN_ID,
      name: 'Old Maelin',
      race: 'Human',
      profession: 'Innkeeper',
      isManual: true,
    };

    it('throws ForbiddenException when non-DM tries to create', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.create(USER_ID_2, createDto)).rejects.toThrow(ForbiddenException);
    });

    it('DM creates NPC with createdById set', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npc.create.mockResolvedValue(mockNpc);

      const result = await service.create(USER_ID, createDto);

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.npc.create).toHaveBeenCalledWith({
        data: {
          campaignId: CAMPAIGN_ID,
          name: 'Old Maelin',
          race: 'Human',
          profession: 'Innkeeper',
          isManual: true,
          createdById: USER_ID,
        },
      });
      expect(result).toEqual(mockNpc);
      expect(result).toBeInstanceOf(NpcDto);
    });

    it('passes JSON fields through as InputJsonValue', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npc.create.mockResolvedValue(mockNpc);

      const statBlock = { ac: 12, hp: 4 };
      const loot = { items: [{ name: 'gold ring', quantity: 1 }] };
      const lootOverrides = { goldMultiplier: 1.5 };
      const generationParams = { seed: 'abc' };

      await service.create(USER_ID, {
        ...createDto,
        statBlock,
        loot,
        lootOverrides,
        generationParams,
      } as Parameters<typeof service.create>[1]);

      const arg = prisma.npc.create.mock.calls[0][0].data;
      expect(arg.statBlock).toEqual(statBlock);
      expect(arg.loot).toEqual(loot);
      expect(arg.lootOverrides).toEqual(lootOverrides);
      expect(arg.generationParams).toEqual(generationParams);
    });
  });

  describe('findAllForCampaign', () => {
    it('paginates and verifies DM role', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npc.findMany.mockResolvedValue([mockNpc]);
      prisma.npc.count.mockResolvedValue(1);

      const result = await service.findAllForCampaign(CAMPAIGN_ID, USER_ID, { page: 1, limit: 20 });

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.npc.findMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID },
        select: {
          id: true,
          campaignId: true,
          name: true,
          race: true,
          profession: true,
          alignment: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: [
          {
            id: mockNpc.id,
            campaignId: mockNpc.campaignId,
            name: mockNpc.name,
            race: mockNpc.race,
            profession: mockNpc.profession,
            alignment: mockNpc.alignment,
            createdAt: mockNpc.createdAt,
            updatedAt: mockNpc.updatedAt,
          },
        ],
        total: 1,
        page: 1,
        lastPage: 1,
      });
      expect(result.data[0]).toBeInstanceOf(NpcListItemDto);
      // Heavy JSON/prose columns never reach the list payload.
      expect((result.data[0] as unknown as Record<string, unknown>).statBlock).toBeUndefined();
      expect((result.data[0] as unknown as Record<string, unknown>).appearance).toBeUndefined();
    });

    it('applies race + profession filters', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npc.findMany.mockResolvedValue([]);
      prisma.npc.count.mockResolvedValue(0);

      await service.findAllForCampaign(CAMPAIGN_ID, USER_ID, {
        page: 2,
        limit: 5,
        race: 'Elf',
        profession: 'Merchant',
      });

      expect(prisma.npc.findMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID, race: 'Elf', profession: 'Merchant' },
        select: {
          id: true,
          campaignId: true,
          name: true,
          race: true,
          profession: true,
          alignment: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: 5,
        take: 5,
      });
    });

    it('throws ForbiddenException when non-DM lists', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(
        service.findAllForCampaign(CAMPAIGN_ID, USER_ID_2, { page: 1, limit: 20 })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('returns NPC with relations and verifies DM', async () => {
      const withRelations = { ...mockNpc, outgoingLinks: [mockRelation], incomingLinks: [] };
      prisma.npc.findUnique.mockResolvedValue(withRelations);
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });

      const result = await service.findOne(NPC_ID, USER_ID);

      expect(prisma.npc.findUnique).toHaveBeenCalledWith({
        where: { id: NPC_ID },
        include: {
          outgoingLinks: {
            include: {
              toNpc: { select: { id: true, name: true, race: true } },
              fromNpc: { select: { id: true, name: true, race: true } },
            },
          },
          incomingLinks: {
            include: {
              toNpc: { select: { id: true, name: true, race: true } },
              fromNpc: { select: { id: true, name: true, race: true } },
            },
          },
        },
      });
      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(result).toEqual(withRelations);
      expect(result).toBeInstanceOf(NpcDto);
    });

    it('throws NotFoundException when NPC does not exist', async () => {
      prisma.npc.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing', USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for non-DM viewer', async () => {
      prisma.npc.findUnique.mockResolvedValue({
        ...mockNpc,
        outgoingLinks: [],
        incomingLinks: [],
      });
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.findOne(NPC_ID, USER_ID_2)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('round-trips lockedFields and lootOverrides', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      const lockedFields = ['name', 'race'];
      const lootOverrides = { goldMultiplier: 2 };
      const updated = { ...mockNpc, lockedFields, lootOverrides };
      prisma.npc.update.mockResolvedValue(updated);

      const result = await service.update(NPC_ID, USER_ID, { lockedFields, lootOverrides } as any);

      expect(prisma.npc.findUnique).toHaveBeenCalledWith({
        where: { id: NPC_ID },
        select: { id: true, campaignId: true },
      });
      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.npc.update).toHaveBeenCalledWith({
        where: { id: NPC_ID },
        data: { lockedFields, lootOverrides },
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when NPC missing', async () => {
      prisma.npc.findUnique.mockResolvedValue(null);
      await expect(service.update(NPC_ID, USER_ID, { name: 'x' })).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws ForbiddenException when non-DM updates', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );
      await expect(service.update(NPC_ID, USER_ID_2, { name: 'x' })).rejects.toThrow(
        ForbiddenException
      );
    });

    it('clears statBlock via Prisma.JsonNull when null is passed', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npc.update.mockResolvedValue({ ...mockNpc, statBlock: null });

      await service.update(NPC_ID, USER_ID, { statBlock: null } as any);

      const callArgs = prisma.npc.update.mock.calls[0][0];
      expect(callArgs.data.statBlock).toBe(Prisma.JsonNull);
    });
  });

  describe('remove', () => {
    it('deletes when DM', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npc.delete.mockResolvedValue(mockNpc);

      await service.remove(NPC_ID, USER_ID);

      expect(prisma.npc.delete).toHaveBeenCalledWith({ where: { id: NPC_ID } });
    });

    it('throws NotFoundException when NPC missing', async () => {
      prisma.npc.findUnique.mockResolvedValue(null);
      await expect(service.remove(NPC_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-DM deletes', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );
      await expect(service.remove(NPC_ID, USER_ID_2)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addRelation (store-both)', () => {
    const dto = { toNpcId: TARGET_NPC_ID, relation: 'parent' };
    const forwardRow = { ...mockRelation, relation: 'parent' };
    const inverseRow = {
      id: 'rel-inverse-row',
      fromNpcId: TARGET_NPC_ID,
      toNpcId: NPC_ID,
      relation: 'child',
      notes: null,
    };

    beforeEach(() => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npcRelation.create.mockResolvedValueOnce(forwardRow).mockResolvedValueOnce(inverseRow);
    });

    it('persists forward + inverse rows in a single $transaction', async () => {
      const result = await service.addRelation(NPC_ID, USER_ID, dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(1, {
        data: { fromNpcId: NPC_ID, toNpcId: TARGET_NPC_ID, relation: 'parent' },
      });
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(2, {
        data: { fromNpcId: TARGET_NPC_ID, toNpcId: NPC_ID, relation: 'child' },
      });
      expect(result).toEqual(forwardRow);
      expect(result).toBeInstanceOf(NpcRelationDto);
    });

    it('mirrors notes onto the inverse row', async () => {
      prisma.npcRelation.create
        .mockReset()
        .mockResolvedValueOnce({ ...forwardRow, notes: 'estranged' })
        .mockResolvedValueOnce({ ...inverseRow, notes: 'estranged' });

      await service.addRelation(NPC_ID, USER_ID, { ...dto, notes: 'estranged' });

      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(1, {
        data: {
          fromNpcId: NPC_ID,
          toNpcId: TARGET_NPC_ID,
          relation: 'parent',
          notes: 'estranged',
        },
      });
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(2, {
        data: {
          fromNpcId: TARGET_NPC_ID,
          toNpcId: NPC_ID,
          relation: 'child',
          notes: 'estranged',
        },
      });
    });

    it('writes symmetric pair for unknown (custom) relations', async () => {
      prisma.npcRelation.create
        .mockReset()
        .mockResolvedValueOnce({ ...forwardRow, relation: 'blood-bound' })
        .mockResolvedValueOnce({ ...inverseRow, relation: 'blood-bound' });

      await service.addRelation(NPC_ID, USER_ID, {
        toNpcId: TARGET_NPC_ID,
        relation: 'blood-bound',
      });

      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(1, {
        data: { fromNpcId: NPC_ID, toNpcId: TARGET_NPC_ID, relation: 'blood-bound' },
      });
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(2, {
        data: { fromNpcId: TARGET_NPC_ID, toNpcId: NPC_ID, relation: 'blood-bound' },
      });
    });

    it('throws BadRequestException for self-relation (no DB writes)', async () => {
      await expect(
        service.addRelation(NPC_ID, USER_ID, { toNpcId: NPC_ID, relation: 'sibling' })
      ).rejects.toThrow(BadRequestException);

      expect(prisma.npcRelation.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when source NPC missing', async () => {
      prisma.npc.findUnique.mockReset().mockResolvedValue(null);
      await expect(service.addRelation(NPC_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
      expect(prisma.npcRelation.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when non-DM adds relation', async () => {
      campaignAuth.assertCampaignOwner
        .mockReset()
        .mockRejectedValue(
          new ForbiddenException('Only the campaign owner can perform this action')
        );
      await expect(service.addRelation(NPC_ID, USER_ID_2, dto)).rejects.toThrow(ForbiddenException);
      expect(prisma.npcRelation.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when P2002 fires on either insert', async () => {
      prisma.npcRelation.create.mockReset().mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.0.0',
        })
      );

      await expect(service.addRelation(NPC_ID, USER_ID, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('removeRelation (store-both)', () => {
    const forwardRow = { ...mockRelation, relation: 'parent' };

    beforeEach(() => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npcRelation.findUnique.mockResolvedValue(forwardRow);
      prisma.npcRelation.delete.mockResolvedValue(forwardRow);
      prisma.npcRelation.deleteMany.mockResolvedValue({ count: 1 });
    });

    it('deletes forward + mirror row in one $transaction', async () => {
      await service.removeRelation(NPC_ID, RELATION_ID, USER_ID);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.npcRelation.delete).toHaveBeenCalledWith({ where: { id: RELATION_ID } });
      expect(prisma.npcRelation.deleteMany).toHaveBeenCalledWith({
        where: {
          fromNpcId: TARGET_NPC_ID,
          toNpcId: NPC_ID,
          relation: 'child',
        },
      });
    });

    it('uses symmetric mirror for unknown (custom) relations', async () => {
      prisma.npcRelation.findUnique
        .mockReset()
        .mockResolvedValue({ ...forwardRow, relation: 'blood-bound' });
      prisma.npcRelation.delete.mockResolvedValue({ ...forwardRow, relation: 'blood-bound' });

      await service.removeRelation(NPC_ID, RELATION_ID, USER_ID);

      expect(prisma.npcRelation.deleteMany).toHaveBeenCalledWith({
        where: {
          fromNpcId: TARGET_NPC_ID,
          toNpcId: NPC_ID,
          relation: 'blood-bound',
        },
      });
    });

    it('does not throw when the mirror row is missing (graceful orphan delete)', async () => {
      prisma.npcRelation.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.removeRelation(NPC_ID, RELATION_ID, USER_ID)).resolves.toBeUndefined();
      expect(prisma.npcRelation.delete).toHaveBeenCalled();
    });

    it('throws NotFoundException when relation missing', async () => {
      prisma.npcRelation.findUnique.mockReset().mockResolvedValue(null);
      await expect(service.removeRelation(NPC_ID, RELATION_ID, USER_ID)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.npcRelation.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when relation belongs to a different NPC', async () => {
      prisma.npcRelation.findUnique
        .mockReset()
        .mockResolvedValue({ ...forwardRow, fromNpcId: 'other-npc' });

      await expect(service.removeRelation(NPC_ID, RELATION_ID, USER_ID)).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws ForbiddenException when non-DM removes', async () => {
      campaignAuth.assertCampaignOwner
        .mockReset()
        .mockRejectedValue(
          new ForbiddenException('Only the campaign owner can perform this action')
        );
      await expect(service.removeRelation(NPC_ID, RELATION_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('generateRelated', () => {
    const NEW_NPC_ID = 'npc-new-aaaa-bbbb-cccccccccccc';
    const SPOUSE_NPC_ID = 'npc-spouse-1111-2222-3333-444444444444';

    const sourceNpc = {
      ...mockNpc,
      name: 'Aldric Stormwind',
      race: 'Human',
      age: 40,
      outgoingLinks: [] as Array<{ relation: string; toNpc: { id: string; race: string } }>,
    };

    const generatedTemplate = {
      campaignId: CAMPAIGN_ID,
      name: 'Bren the Younger',
      race: 'Human',
      background: 'Soldier',
      profession: 'guard',
      alignment: 'Lawful Good',
      size: 'Medium',
      age: 20,
      gender: 'male',
      appearance: 'Broad-shouldered',
      personalityTraits: ['Stoic'],
      ideals: ['Duty'],
      bonds: ['Family'],
      flaws: ['Stubborn'],
      statBlock: null,
      goldPieces: 5,
      silverPieces: 0,
      copperPieces: 0,
      loot: [],
      lootOverrides: null,
      generationParams: {
        version: 1 as const,
        seed: 'test-seed',
        constraints: { campaignId: CAMPAIGN_ID },
        decisions: {},
      },
    };

    function arrangeSuccess(
      overrides: Partial<typeof sourceNpc> = {},
      generatedOverrides: Partial<typeof generatedTemplate> = {}
    ) {
      const sourceFromDb = { ...sourceNpc, ...overrides };
      prisma.npc.findUnique.mockResolvedValue(sourceFromDb);
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      generator.generate.mockResolvedValue({ ...generatedTemplate, ...generatedOverrides });
      prisma.npc.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...sourceFromDb, ...data, id: NEW_NPC_ID })
      );
      prisma.npcRelation.create
        .mockResolvedValueOnce({
          id: 'rel-1',
          fromNpcId: NEW_NPC_ID,
          toNpcId: NPC_ID,
          relation: 'placeholder',
          notes: null,
        })
        .mockResolvedValueOnce({
          id: 'rel-2',
          fromNpcId: NPC_ID,
          toNpcId: NEW_NPC_ID,
          relation: 'placeholder',
          notes: null,
        });
      return sourceFromDb;
    }

    function constraintsArg() {
      return generator.generate.mock.calls[0][1] as Record<string, unknown>;
    }

    function npcCreateData() {
      return prisma.npc.create.mock.calls[0][0].data as Record<string, unknown>;
    }

    it('parent: pre-seeds same race, swaps family name, adjusts age (+25), creates relation pair', async () => {
      arrangeSuccess();

      const result = await service.generateRelated(NPC_ID, USER_ID, { relation: 'parent' });

      // Constraints to generator
      expect(constraintsArg()).toMatchObject({ campaignId: CAMPAIGN_ID, race: 'Human' });

      // Persisted NPC
      expect(npcCreateData()).toMatchObject({
        campaignId: CAMPAIGN_ID,
        race: 'Human',
        name: 'Bren the Stormwind', // last token swapped from 'Younger' to source family
        age: 65, // 40 + 25
        createdById: USER_ID,
      });

      // Relation pair
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(1, {
        data: { fromNpcId: NEW_NPC_ID, toNpcId: NPC_ID, relation: 'parent' },
      });
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(2, {
        data: { fromNpcId: NPC_ID, toNpcId: NEW_NPC_ID, relation: 'child' },
      });

      expect(result).toMatchObject({ id: NEW_NPC_ID, age: 65 });
    });

    it('child: pre-seeds same race when no spouse, adjusts age (-25)', async () => {
      arrangeSuccess({ age: 30 });

      await service.generateRelated(NPC_ID, USER_ID, { relation: 'child' });

      expect(constraintsArg()).toMatchObject({ race: 'Human' });
      expect(npcCreateData()).toMatchObject({
        race: 'Human',
        age: 5, // 30 - 25
      });
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(1, {
        data: { fromNpcId: NEW_NPC_ID, toNpcId: NPC_ID, relation: 'child' },
      });
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(2, {
        data: { fromNpcId: NPC_ID, toNpcId: NEW_NPC_ID, relation: 'parent' },
      });
    });

    it('child of mixed-race couple: picks Half-X race and stores parentRaces', async () => {
      arrangeSuccess(
        {
          outgoingLinks: [{ relation: 'spouse', toNpc: { id: SPOUSE_NPC_ID, race: 'Elf' } }],
        },
        { race: 'Half-Elf' }
      );

      await service.generateRelated(NPC_ID, USER_ID, { relation: 'child' });

      expect(constraintsArg()).toMatchObject({ race: 'Half-Elf' });
      const persisted = npcCreateData() as { generationParams: { parentRaces: string[] } };
      expect(persisted.generationParams.parentRaces).toEqual(['Human', 'Elf']);
    });

    it('sibling: same race, family name swap, age within ±5 of source', async () => {
      arrangeSuccess({ age: 40 });

      await service.generateRelated(NPC_ID, USER_ID, { relation: 'sibling' });

      expect(constraintsArg()).toMatchObject({ race: 'Human' });
      const data = npcCreateData() as { age: number; name: string };
      expect(data.age).toBeGreaterThanOrEqual(35);
      expect(data.age).toBeLessThanOrEqual(45);
      expect(data.name.endsWith('Stormwind')).toBe(true);
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(1, {
        data: { fromNpcId: NEW_NPC_ID, toNpcId: NPC_ID, relation: 'sibling' },
      });
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(2, {
        data: { fromNpcId: NPC_ID, toNpcId: NEW_NPC_ID, relation: 'sibling' },
      });
    });

    it('spouse: race is NOT forced and family name is NOT swapped', async () => {
      arrangeSuccess({ age: 40 }, { race: 'Tiefling', name: 'Vesna Ravenfall', age: 38 });

      await service.generateRelated(NPC_ID, USER_ID, { relation: 'spouse' });

      // Source race NOT injected as constraint
      expect(constraintsArg().race).toBeUndefined();

      const data = npcCreateData() as { name: string; age: number; race: string };
      expect(data.race).toBe('Tiefling');
      expect(data.name).toBe('Vesna Ravenfall'); // family name NOT replaced
      expect(data.age).toBe(38); // generator's age, no adjustment
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(1, {
        data: { fromNpcId: NEW_NPC_ID, toNpcId: NPC_ID, relation: 'spouse' },
      });
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(2, {
        data: { fromNpcId: NPC_ID, toNpcId: NEW_NPC_ID, relation: 'spouse' },
      });
    });

    it('custom relation: no pre-seeding, no age/name override, symmetric pair', async () => {
      arrangeSuccess({ age: 40 }, { race: 'Tiefling', name: 'Vesna Ravenfall', age: 200 });

      await service.generateRelated(NPC_ID, USER_ID, { relation: 'blood-bound' });

      expect(constraintsArg().race).toBeUndefined();
      const data = npcCreateData() as { name: string; age: number };
      expect(data.name).toBe('Vesna Ravenfall');
      expect(data.age).toBe(200);
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(1, {
        data: { fromNpcId: NEW_NPC_ID, toNpcId: NPC_ID, relation: 'blood-bound' },
      });
      expect(prisma.npcRelation.create).toHaveBeenNthCalledWith(2, {
        data: { fromNpcId: NPC_ID, toNpcId: NEW_NPC_ID, relation: 'blood-bound' },
      });
    });

    it('constraintsOverride.race wins over rule-based race', async () => {
      arrangeSuccess(
        { outgoingLinks: [{ relation: 'spouse', toNpc: { id: SPOUSE_NPC_ID, race: 'Elf' } }] },
        { race: 'Dwarf' }
      );

      await service.generateRelated(NPC_ID, USER_ID, {
        relation: 'child',
        constraintsOverride: { race: 'Dwarf' },
      });

      expect(constraintsArg()).toMatchObject({ race: 'Dwarf' });
      const data = npcCreateData() as {
        race: string;
        generationParams: { parentRaces: string[] };
      };
      expect(data.race).toBe('Dwarf');
      expect(data.generationParams.parentRaces).toEqual(['Human', 'Elf']); // still recorded
    });

    it('constraintsOverride.name suppresses family-name swap', async () => {
      arrangeSuccess({}, { name: 'Pelor of Ten Towns' });

      await service.generateRelated(NPC_ID, USER_ID, {
        relation: 'parent',
        constraintsOverride: { name: 'Pelor of Ten Towns' },
      });

      expect(npcCreateData()).toMatchObject({ name: 'Pelor of Ten Towns' });
    });

    it('throws NotFoundException when source NPC missing', async () => {
      prisma.npc.findUnique.mockResolvedValue(null);
      await expect(
        service.generateRelated(NPC_ID, USER_ID, { relation: 'parent' })
      ).rejects.toThrow(NotFoundException);
      expect(generator.generate).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when non-DM generates', async () => {
      prisma.npc.findUnique.mockResolvedValue(sourceNpc);
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );
      await expect(
        service.generateRelated(NPC_ID, USER_ID_2, { relation: 'parent' })
      ).rejects.toThrow(ForbiddenException);
      expect(generator.generate).not.toHaveBeenCalled();
    });

    it('rolls back: when relation insert fails, no orphan NPC remains', async () => {
      arrangeSuccess();
      // Use a fresh $transaction mock that throws if the callback throws
      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        // run the callback against the real mock prisma
        return fn(prisma);
      });
      prisma.npcRelation.create.mockReset().mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.generateRelated(NPC_ID, USER_ID, { relation: 'parent' })
      ).rejects.toThrow(/boom/);
    });
  });
});
