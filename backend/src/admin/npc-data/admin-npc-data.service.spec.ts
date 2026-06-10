import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminNpcDataService } from './admin-npc-data.service';
import { USER_ID } from '../../test/fixtures';

type MockModel = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

function makeMockModel(): MockModel {
  return {
    findMany: jest.fn(),
    findUnique: jest.fn(),
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
  };

  beforeEach(async () => {
    prisma = {
      npcNamePool: makeMockModel(),
      npcAppearanceTrait: makeMockModel(),
      npcLootTemplate: makeMockModel(),
      trinket: makeMockModel(),
      npcCustomPersonality: makeMockModel(),
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
  });
});
