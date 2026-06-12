import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HomebrewMonstersService } from './homebrew-monsters.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateMonsterDto } from './dto/create-monster.dto';

const OWNER = { userId: 'owner-1', isAdmin: false };
const STRANGER = { userId: 'stranger-1', isAdmin: false };
const ADMIN = { userId: 'admin-1', isAdmin: true };

function makeCreateDto(over: Partial<CreateMonsterDto> = {}): CreateMonsterDto {
  return {
    name: 'Cave Troll',
    size: 'Large',
    type: 'Giant',
    armorClass: 15,
    hitPoints: 84,
    speed: '30 ft.',
    str: 18,
    dex: 13,
    con: 20,
    int: 7,
    wis: 9,
    cha: 7,
    challengeRating: 5,
    ...over,
  } as CreateMonsterDto;
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('HomebrewMonstersService', () => {
  let service: HomebrewMonstersService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HomebrewMonstersService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(HomebrewMonstersService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  describe('create', () => {
    it('creates a homebrew monster owned by the actor with source "Homebrew"', async () => {
      const created = { id: 'm1', name: 'Cave Troll' };
      prisma.monster.create.mockResolvedValue(created);

      const result = await service.create(makeCreateDto(), OWNER);

      expect(prisma.monster.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Cave Troll',
          contentSource: 'homebrew',
          createdById: 'owner-1',
          source: 'Homebrew',
        }),
      });
      expect(result).toEqual(created);
    });

    it('defaults actions to an empty array when omitted', async () => {
      prisma.monster.create.mockResolvedValue({ id: 'm1' });

      await service.create(makeCreateDto(), OWNER);

      expect(prisma.monster.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ actions: [] }),
      });
    });

    it('passes through actions when provided', async () => {
      prisma.monster.create.mockResolvedValue({ id: 'm1' });
      const actions = [{ name: 'Slam', description: 'Melee Weapon Attack: +7 to hit.' }];

      await service.create(makeCreateDto({ actions }), OWNER);

      expect(prisma.monster.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ actions }),
      });
    });

    it('maps a duplicate-name P2002 to ConflictException', async () => {
      prisma.monster.create.mockRejectedValue(p2002());

      await expect(service.create(makeCreateDto(), OWNER)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    const homebrewRow = { id: 'm1', contentSource: 'homebrew', createdById: 'owner-1' };

    it('updates the owner’s own homebrew monster', async () => {
      prisma.monster.findUnique.mockResolvedValue(homebrewRow);
      const updated = { ...homebrewRow, name: 'Bridge Troll' };
      prisma.monster.update.mockResolvedValue(updated);

      const result = await service.update('m1', { name: 'Bridge Troll' }, OWNER);

      expect(prisma.monster.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: expect.objectContaining({ name: 'Bridge Troll' }),
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFound when the monster does not exist', async () => {
      prisma.monster.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'X' }, OWNER)).rejects.toThrow(NotFoundException);
      expect(prisma.monster.update).not.toHaveBeenCalled();
    });

    it('throws NotFound (not Forbidden) for someone else’s homebrew — invisible rows must not leak existence', async () => {
      prisma.monster.findUnique.mockResolvedValue(homebrewRow);

      await expect(service.update('m1', { name: 'X' }, STRANGER)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.monster.update).not.toHaveBeenCalled();
    });

    it('throws Forbidden for SRD rows (visible but immutable)', async () => {
      prisma.monster.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.update('s1', { name: 'X' }, OWNER)).rejects.toThrow(ForbiddenException);
    });

    it('forbids non-admins from editing shared rows but allows admins', async () => {
      const sharedRow = { id: 'sh1', contentSource: 'shared', createdById: 'someone' };
      prisma.monster.findUnique.mockResolvedValue(sharedRow);

      await expect(service.update('sh1', { name: 'X' }, OWNER)).rejects.toThrow(ForbiddenException);

      prisma.monster.update.mockResolvedValue({ ...sharedRow, name: 'X' });
      await expect(service.update('sh1', { name: 'X' }, ADMIN)).resolves.toEqual(
        expect.objectContaining({ name: 'X' })
      );
    });

    it('never lets an update change ownership or tier fields', async () => {
      prisma.monster.findUnique.mockResolvedValue(homebrewRow);
      prisma.monster.update.mockResolvedValue(homebrewRow);

      await service.update(
        'm1',
        { name: 'X', contentSource: 'shared', createdById: 'evil' } as never,
        OWNER
      );

      const data = prisma.monster.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('contentSource');
      expect(data).not.toHaveProperty('createdById');
    });

    it('maps null Json fields to Prisma.DbNull so clearing them actually persists', async () => {
      prisma.monster.findUnique.mockResolvedValue(homebrewRow);
      prisma.monster.update.mockResolvedValue(homebrewRow);

      await service.update('m1', { savingThrows: null, skills: null } as never, OWNER);

      const data = prisma.monster.update.mock.calls[0][0].data;
      expect(data.savingThrows).toBe(Prisma.DbNull);
      expect(data.skills).toBe(Prisma.DbNull);
    });

    it('coerces a null actions update to [] — the read-side type requires an array', async () => {
      prisma.monster.findUnique.mockResolvedValue(homebrewRow);
      prisma.monster.update.mockResolvedValue(homebrewRow);

      await service.update('m1', { actions: null } as never, OWNER);

      const data = prisma.monster.update.mock.calls[0][0].data;
      expect(data.actions).toEqual([]);
    });

    it('maps a concurrent-delete P2025 on update to NotFound (not 500)', async () => {
      prisma.monster.findUnique.mockResolvedValue(homebrewRow);
      prisma.monster.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        })
      );

      await expect(service.update('m1', { name: 'X' }, OWNER)).rejects.toThrow(NotFoundException);
    });

    it('uses tier-aware conflict copy for shared-content collisions', async () => {
      prisma.monster.findUnique.mockResolvedValue({
        id: 'sh1',
        contentSource: 'shared',
        createdById: 'someone',
      });
      prisma.monster.update.mockRejectedValue(p2002());

      await expect(service.update('sh1', { name: 'Dup' }, ADMIN)).rejects.toThrow(
        'A shared monster with this name already exists'
      );
    });

    it('maps a duplicate-name P2002 on update to ConflictException', async () => {
      prisma.monster.findUnique.mockResolvedValue(homebrewRow);
      prisma.monster.update.mockRejectedValue(p2002());

      await expect(service.update('m1', { name: 'Dup' }, OWNER)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    const homebrewRow = { id: 'm1', contentSource: 'homebrew', createdById: 'owner-1' };

    it('deletes the owner’s own homebrew monster', async () => {
      prisma.monster.findUnique.mockResolvedValue(homebrewRow);
      prisma.monster.delete.mockResolvedValue(homebrewRow);

      await service.remove('m1', OWNER);

      expect(prisma.monster.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });

    it('throws NotFound when the monster does not exist', async () => {
      prisma.monster.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope', OWNER)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for someone else’s homebrew', async () => {
      prisma.monster.findUnique.mockResolvedValue(homebrewRow);

      await expect(service.remove('m1', STRANGER)).rejects.toThrow(NotFoundException);
      expect(prisma.monster.delete).not.toHaveBeenCalled();
    });

    it('throws Forbidden for SRD rows', async () => {
      prisma.monster.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.remove('s1', OWNER)).rejects.toThrow(ForbiddenException);
    });

    it('maps a concurrent-delete P2025 to NotFound (not 500)', async () => {
      prisma.monster.findUnique.mockResolvedValue(homebrewRow);
      prisma.monster.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        })
      );

      await expect(service.remove('m1', OWNER)).rejects.toThrow(NotFoundException);
    });
  });
});
