import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminNpcDataService } from './admin-npc-data.service';
import { USER_ID } from '../../test/fixtures';

type MockModel = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

function makeMockModel(): MockModel {
  return {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

describe('AdminNpcDataService', () => {
  let service: AdminNpcDataService;
  let prisma: {
    npcNamePool: MockModel;
    npcAppearanceTrait: MockModel;
    npcLootTemplate: MockModel;
    trinket: MockModel;
    npcCustomPersonality: MockModel;
    item: MockModel;
  };

  beforeEach(async () => {
    prisma = {
      npcNamePool: makeMockModel(),
      npcAppearanceTrait: makeMockModel(),
      npcLootTemplate: makeMockModel(),
      trinket: makeMockModel(),
      npcCustomPersonality: makeMockModel(),
      item: makeMockModel(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminNpcDataService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AdminNpcDataService>(AdminNpcDataService);
  });

  describe('list', () => {
    it('lists names ordered by race/value', async () => {
      const rows = [{ id: 'n1', race: 'Elf', value: 'Arannis' }];
      prisma.npcNamePool.findMany.mockResolvedValue(rows);

      const result = await service.list('names');

      expect(prisma.npcNamePool.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: expect.any(Array) })
      );
      expect(result).toBe(rows);
    });

    it('lists only npc-category loot templates (monster rows belong to the VEG-304 editor)', async () => {
      prisma.npcLootTemplate.findMany.mockResolvedValue([]);

      await service.list('loot-templates');

      expect(prisma.npcLootTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { category: 'npc' } })
      );
    });

    it('lists only monster-category loot templates under monster-loot, exposing the type key', async () => {
      prisma.npcLootTemplate.findMany.mockResolvedValue([
        { id: 'mlt1', profession: 'beast', crBucket: '0', source: 'curated', isActive: true },
      ]);

      const result = await service.list('monster-loot');

      expect(prisma.npcLootTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { category: 'monster' } })
      );
      expect(result).toEqual([
        { id: 'mlt1', type: 'beast', crBucket: '0', source: 'curated', isActive: true },
      ]);
    });

    it('lists personality rows', async () => {
      prisma.npcCustomPersonality.findMany.mockResolvedValue([]);
      await service.list('personality');
      expect(prisma.npcCustomPersonality.findMany).toHaveBeenCalled();
    });

    it('rejects unknown table', async () => {
      await expect(service.list('bogus' as never)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('create', () => {
    it('creates a name with source=user', async () => {
      const created = { id: 'n1' };
      prisma.npcNamePool.create.mockResolvedValue(created);

      const result = await service.create('names', USER_ID, {
        race: 'Elf',
        kind: 'first',
        value: 'Arannis',
      });

      expect(prisma.npcNamePool.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          race: 'Elf',
          kind: 'first',
          value: 'Arannis',
          source: 'user',
        }),
      });
      expect(result).toBe(created);
    });

    it('creates a trinket', async () => {
      prisma.trinket.create.mockResolvedValue({ id: 't1' });
      await service.create('trinkets', USER_ID, {
        description: 'A glass eye that always faces north.',
      });
      expect(prisma.trinket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          description: 'A glass eye that always faces north.',
          source: 'user',
        }),
      });
    });

    describe('loot templates', () => {
      const structured = {
        profession: 'merchant',
        crBucket: '2–4',
        coinage: { gp: [0, 2], sp: [2, 8], cp: [4, 20] },
        items: [
          { itemName: 'Dagger', weight: 60, qty: [1, 1] },
          { itemName: 'Quarterstaff', weight: 80, qty: [1, 2] },
        ],
      };

      it('creates a template, round-tripping the structured payload to the engine shape', async () => {
        prisma.item.findMany.mockResolvedValue([{ name: 'Dagger' }, { name: 'Quarterstaff' }]);
        prisma.npcLootTemplate.create.mockResolvedValue({ id: 'lt1' });

        await service.create('loot-templates', USER_ID, structured);

        // Stored exactly as the loot engine consumes it (LootTemplate shape).
        expect(prisma.npcLootTemplate.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            category: 'npc',
            profession: 'merchant',
            crBucket: '2–4',
            coinage: { gp: [0, 2], sp: [2, 8], cp: [4, 20] },
            items: [
              { itemName: 'Dagger', weight: 60, qty: [1, 1] },
              { itemName: 'Quarterstaff', weight: 80, qty: [1, 2] },
            ],
            source: 'user',
          }),
        });
      });

      it('rejects item names that do not resolve in the catalog', async () => {
        prisma.item.findMany.mockResolvedValue([{ name: 'Dagger' }]);

        await expect(service.create('loot-templates', USER_ID, structured)).rejects.toMatchObject({
          response: expect.objectContaining({
            message: expect.arrayContaining([expect.stringContaining('Quarterstaff')]),
          }),
        });
        expect(prisma.npcLootTemplate.create).not.toHaveBeenCalled();
      });

      it('rejects an invalid payload with messages naming the nested field', async () => {
        await expect(
          service.create('loot-templates', USER_ID, {
            ...structured,
            coinage: { gp: [5, 2], sp: [2, 8], cp: [4, 20] },
          })
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            message: expect.arrayContaining([expect.stringContaining('gp')]),
          }),
        });
        expect(prisma.npcLootTemplate.create).not.toHaveBeenCalled();
        expect(prisma.item.findMany).not.toHaveBeenCalled();
      });
    });

    describe('monster loot templates', () => {
      const structured = {
        type: 'dragon',
        crBucket: '11+',
        coinage: { gp: [100, 600], sp: [0, 0], cp: [0, 0] },
        items: [{ itemName: 'Dagger', weight: 60, qty: [1, 2] }],
      };

      it('creates a template in the monster category, storing type in the profession column', async () => {
        prisma.item.findMany.mockResolvedValue([{ name: 'Dagger' }]);
        prisma.npcLootTemplate.create.mockResolvedValue({
          id: 'mlt1',
          profession: 'dragon',
          crBucket: '11+',
          source: 'user',
          isActive: true,
        });

        const result = await service.create('monster-loot', USER_ID, structured);

        expect(prisma.npcLootTemplate.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            category: 'monster',
            profession: 'dragon',
            crBucket: '11+',
            coinage: { gp: [100, 600], sp: [0, 0], cp: [0, 0] },
            items: [{ itemName: 'Dagger', weight: 60, qty: [1, 2] }],
            source: 'user',
          }),
        });
        // The API speaks `type`; the shared profession column stays internal.
        expect(result).toEqual(
          expect.objectContaining({ id: 'mlt1', type: 'dragon', crBucket: '11+' })
        );
        expect(result).not.toHaveProperty('profession');
      });

      it('accepts the generic fallback type', async () => {
        prisma.item.findMany.mockResolvedValue([{ name: 'Dagger' }]);
        prisma.npcLootTemplate.create.mockResolvedValue({
          id: 'mlt2',
          profession: '__generic__',
        });

        await service.create('monster-loot', USER_ID, { ...structured, type: '__generic__' });

        expect(prisma.npcLootTemplate.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ category: 'monster', profession: '__generic__' }),
        });
      });

      it('rejects a type outside the canonical monster types', async () => {
        await expect(
          service.create('monster-loot', USER_ID, { ...structured, type: 'merchant' })
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            message: expect.arrayContaining([expect.stringContaining('type')]),
          }),
        });
        expect(prisma.npcLootTemplate.create).not.toHaveBeenCalled();
        expect(prisma.item.findMany).not.toHaveBeenCalled();
      });

      it('rejects item names that do not resolve in the catalog', async () => {
        prisma.item.findMany.mockResolvedValue([]);

        await expect(service.create('monster-loot', USER_ID, structured)).rejects.toMatchObject({
          response: expect.objectContaining({
            message: expect.arrayContaining([expect.stringContaining('Dagger')]),
          }),
        });
        expect(prisma.npcLootTemplate.create).not.toHaveBeenCalled();
      });
    });

    it('creates personality with addedById', async () => {
      prisma.npcCustomPersonality.create.mockResolvedValue({ id: 'p1' });
      await service.create('personality', USER_ID, {
        background: 'Acolyte',
        kind: 'ideals',
        value: 'Faith above all.',
      });
      expect(prisma.npcCustomPersonality.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          background: 'Acolyte',
          kind: 'ideals',
          value: 'Faith above all.',
          addedById: USER_ID,
        }),
      });
    });

    it('rejects personality with invalid kind', async () => {
      await expect(
        service.create('personality', USER_ID, {
          background: 'Acolyte',
          kind: 'nonsense',
          value: 'x',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects missing required field', async () => {
      await expect(
        service.create('names', USER_ID, { race: 'Elf' } as never)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown extra fields', async () => {
      await expect(
        service.create('names', USER_ID, {
          race: 'Elf',
          kind: 'first',
          value: 'Arannis',
          source: 'curated',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.npcNamePool.create).not.toHaveBeenCalled();
    });

    it('rejects a client-supplied addedById on personality rows', async () => {
      await expect(
        service.create('personality', USER_ID, {
          background: 'Acolyte',
          kind: 'ideals',
          value: 'Faith above all.',
          addedById: 'someone-else',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.npcCustomPersonality.create).not.toHaveBeenCalled();
    });
  });

  describe('setActive', () => {
    it('toggles isActive on a name row', async () => {
      prisma.npcNamePool.findUnique.mockResolvedValue({ id: 'n1', isActive: true });
      prisma.npcNamePool.update.mockResolvedValue({ id: 'n1', isActive: false });

      const result = await service.setActive('names', 'n1', false);

      expect(prisma.npcNamePool.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });

    it('404s on missing row', async () => {
      prisma.npcNamePool.findUnique.mockResolvedValue(null);
      await expect(service.setActive('names', 'missing', false)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('resolves loot templates scoped to category=npc', async () => {
      prisma.npcLootTemplate.findFirst.mockResolvedValue({ id: 'lt1', source: 'user' });
      prisma.npcLootTemplate.update.mockResolvedValue({ id: 'lt1', isActive: false });

      await service.setActive('loot-templates', 'lt1', false);

      expect(prisma.npcLootTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: 'lt1', category: 'npc' },
      });
      expect(prisma.npcLootTemplate.update).toHaveBeenCalled();
    });

    it('404s when the id belongs to a monster-category template', async () => {
      // findFirst with the category filter returns null for monster rows.
      prisma.npcLootTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.setActive('loot-templates', 'monster-row', false)
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.npcLootTemplate.update).not.toHaveBeenCalled();
    });

    it('resolves monster-loot rows scoped to category=monster', async () => {
      prisma.npcLootTemplate.findFirst.mockResolvedValue({ id: 'mlt1', source: 'curated' });
      prisma.npcLootTemplate.update.mockResolvedValue({
        id: 'mlt1',
        profession: 'beast',
        isActive: false,
      });

      const result = await service.setActive('monster-loot', 'mlt1', false);

      expect(prisma.npcLootTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: 'mlt1', category: 'monster' },
      });
      expect(result).toEqual(expect.objectContaining({ type: 'beast', isActive: false }));
    });

    it('404s when a monster-loot id belongs to an npc-category template', async () => {
      prisma.npcLootTemplate.findFirst.mockResolvedValue(null);

      await expect(service.setActive('monster-loot', 'npc-row', false)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(prisma.npcLootTemplate.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes a user-source row', async () => {
      prisma.npcNamePool.findUnique.mockResolvedValue({ id: 'n1', source: 'user' });
      prisma.npcNamePool.delete.mockResolvedValue({ id: 'n1' });

      await service.remove('names', 'n1');

      expect(prisma.npcNamePool.delete).toHaveBeenCalledWith({ where: { id: 'n1' } });
    });

    it('forbids deleting curated/SRD rows', async () => {
      prisma.npcNamePool.findUnique.mockResolvedValue({ id: 'n1', source: 'curated' });

      await expect(service.remove('names', 'n1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.npcNamePool.delete).not.toHaveBeenCalled();
    });

    it('always allows deleting personality rows (always user)', async () => {
      prisma.npcCustomPersonality.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.npcCustomPersonality.delete.mockResolvedValue({ id: 'p1' });

      await service.remove('personality', 'p1');

      expect(prisma.npcCustomPersonality.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });

    it('404s on missing row', async () => {
      prisma.npcNamePool.findUnique.mockResolvedValue(null);
      await expect(service.remove('names', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removes a user-source monster-loot row scoped to category=monster', async () => {
      prisma.npcLootTemplate.findFirst.mockResolvedValue({ id: 'mlt1', source: 'user' });
      prisma.npcLootTemplate.delete.mockResolvedValue({ id: 'mlt1' });

      await service.remove('monster-loot', 'mlt1');

      expect(prisma.npcLootTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: 'mlt1', category: 'monster' },
      });
      expect(prisma.npcLootTemplate.delete).toHaveBeenCalledWith({ where: { id: 'mlt1' } });
    });

    it('forbids deleting seeded monster-loot rows', async () => {
      prisma.npcLootTemplate.findFirst.mockResolvedValue({ id: 'mlt1', source: 'curated' });

      await expect(service.remove('monster-loot', 'mlt1')).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(prisma.npcLootTemplate.delete).not.toHaveBeenCalled();
    });
  });
});
