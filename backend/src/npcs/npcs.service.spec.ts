import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NpcsService } from './npcs.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { USER_ID, USER_ID_2, CAMPAIGN_ID } from '../test/fixtures';

describe('NpcsService', () => {
  let service: NpcsService;
  let prisma: MockPrismaService;
  let campaignAuth: { assertCampaignOwner: jest.Mock };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NpcsService,
        prismaMockProvider(),
        { provide: CampaignAuthService, useValue: campaignAuth },
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
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({ data: [mockNpc], total: 1, page: 1, lastPage: 1 });
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
        include: { outgoingLinks: true, incomingLinks: true },
      });
      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(result).toEqual(withRelations);
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

  describe('addRelation', () => {
    const dto = { toNpcId: TARGET_NPC_ID, relation: 'sibling' };

    it('creates relation and verifies DM', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npcRelation.create.mockResolvedValue(mockRelation);

      const result = await service.addRelation(NPC_ID, USER_ID, dto);

      expect(prisma.npcRelation.create).toHaveBeenCalledWith({
        data: { fromNpcId: NPC_ID, toNpcId: TARGET_NPC_ID, relation: 'sibling' },
      });
      expect(result).toEqual(mockRelation);
    });

    it('throws NotFoundException when source NPC missing', async () => {
      prisma.npc.findUnique.mockResolvedValue(null);
      await expect(service.addRelation(NPC_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-DM adds relation', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );
      await expect(service.addRelation(NPC_ID, USER_ID_2, dto)).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when relation already exists (P2002)', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npcRelation.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.0.0',
        })
      );

      await expect(service.addRelation(NPC_ID, USER_ID, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('removeRelation', () => {
    it('deletes relation when DM owns source NPC', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npcRelation.findUnique.mockResolvedValue(mockRelation);
      prisma.npcRelation.delete.mockResolvedValue(mockRelation);

      await service.removeRelation(NPC_ID, RELATION_ID, USER_ID);

      expect(prisma.npcRelation.delete).toHaveBeenCalledWith({ where: { id: RELATION_ID } });
    });

    it('throws NotFoundException when relation missing', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npcRelation.findUnique.mockResolvedValue(null);

      await expect(service.removeRelation(NPC_ID, RELATION_ID, USER_ID)).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws NotFoundException when relation belongs to a different NPC', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.npcRelation.findUnique.mockResolvedValue({ ...mockRelation, fromNpcId: 'other-npc' });

      await expect(service.removeRelation(NPC_ID, RELATION_ID, USER_ID)).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws ForbiddenException when non-DM removes', async () => {
      prisma.npc.findUnique.mockResolvedValue({ id: NPC_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );
      await expect(service.removeRelation(NPC_ID, RELATION_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
    });
  });
});
