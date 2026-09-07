import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HomebrewClassesService } from './homebrew-classes.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateClassDto } from './dto/create-class.dto';

/**
 * Class-specific write behavior only. The authorization skeleton — the 404-vs-403
 * split, the ownership stamp, the tier-keyed error mapping — is asserted for every
 * tiered service in `content-write.contract.spec.ts`, which this service is
 * enrolled in. What stays here is the column normalization and the subclass guard
 * a class delete performs.
 */

const OWNER = { userId: 'owner-1', isAdmin: false };

function makeCreateDto(over: Partial<CreateClassDto> = {}): CreateClassDto {
  return { name: 'Warden', hitDie: 'd10', ...over } as CreateClassDto;
}

function p2003(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
    code: 'P2003',
    clientVersion: 'test',
  });
}

describe('HomebrewClassesService', () => {
  let service: HomebrewClassesService;
  let prisma: MockPrismaService;
  const homebrewRow = { id: 'c1', contentSource: 'homebrew', createdById: 'owner-1' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HomebrewClassesService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(HomebrewClassesService);
    prisma = module.get<MockPrismaService>(PrismaService as never);
  });

  it('passes class columns through to the create', async () => {
    prisma.srdClass.create.mockResolvedValue({ id: 'c1' });

    await service.create(makeCreateDto({ subclassLevel: 3 }), OWNER);

    expect(prisma.srdClass.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Warden', hitDie: 'd10', subclassLevel: 3 }),
    });
  });

  describe('column normalization', () => {
    beforeEach(() => {
      prisma.srdClass.findUnique.mockResolvedValue(homebrewRow);
      prisma.srdClass.update.mockResolvedValue(homebrewRow);
    });

    const updateWith = async (patch: Record<string, unknown>) => {
      await service.update('c1', patch as never, OWNER);
      return (prisma.srdClass.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    };

    it('rejects clearing name to null — the column is non-nullable and required', async () => {
      await expect(service.update('c1', { name: null } as never, OWNER)).rejects.toThrow(
        BadRequestException
      );
    });

    it('coerces null string arrays to [] — the columns are non-nullable', async () => {
      const data = await updateWith({
        primaryAbilities: null,
        savingThrows: null,
        armorProficiencies: null,
        weaponProficiencies: null,
        skillChoices: null,
        toolProficiencies: null,
      });

      expect(data).toMatchObject({
        primaryAbilities: [],
        savingThrows: [],
        armorProficiencies: [],
        weaponProficiencies: [],
        skillChoices: [],
        toolProficiencies: [],
      });
    });

    it('coerces null numSkillChoices to the schema default rather than writing null', async () => {
      expect(await updateWith({ numSkillChoices: null })).toMatchObject({ numSkillChoices: 2 });
    });

    it('maps null Json columns to DbNull — Prisma rejects plain null on Json fields', async () => {
      const data = await updateWith({
        spellcasting: null,
        equipmentChoices: null,
        multiclassing: null,
      });

      expect(data.spellcasting).toBe(Prisma.DbNull);
      expect(data.equipmentChoices).toBe(Prisma.DbNull);
      expect(data.multiclassing).toBe(Prisma.DbNull);
    });

    it('normalizes a blank description to null', async () => {
      expect(await updateWith({ description: '   ' })).toMatchObject({ description: null });
    });

    it('leaves a subclassLevel of null alone — the column is nullable', async () => {
      expect(await updateWith({ subclassLevel: null })).toMatchObject({ subclassLevel: null });
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      prisma.srdClass.findUnique.mockResolvedValue(homebrewRow);
    });

    it('deletes a class that has no subclasses', async () => {
      prisma.subclass.count.mockResolvedValue(0);
      prisma.srdClass.delete.mockResolvedValue(homebrewRow);

      await service.remove('c1', OWNER);

      expect(prisma.srdClass.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('refuses while subclasses still point at it, and does not attempt the delete', async () => {
      prisma.subclass.count.mockResolvedValue(2);

      await expect(service.remove('c1', OWNER)).rejects.toThrow(ConflictException);
      expect(prisma.srdClass.delete).not.toHaveBeenCalled();
    });

    it('says how many subclasses are blocking, so the message is actionable', async () => {
      prisma.subclass.count.mockResolvedValue(3);

      await expect(service.remove('c1', OWNER)).rejects.toThrow(/3 subclasses/);
    });

    it('counts only this class’s subclasses', async () => {
      prisma.subclass.count.mockResolvedValue(0);
      prisma.srdClass.delete.mockResolvedValue(homebrewRow);

      await service.remove('c1', OWNER);

      expect(prisma.subclass.count).toHaveBeenCalledWith({ where: { classId: 'c1' } });
    });

    it('maps the FK violation to the same 409 when a subclass lands after the check', async () => {
      // The pre-check gives the good message; the ON DELETE RESTRICT constraint is
      // what actually holds the line, because read-committed lets a subclass be
      // inserted between the count and the delete.
      prisma.subclass.count.mockResolvedValue(0);
      prisma.srdClass.delete.mockRejectedValue(p2003());

      await expect(service.remove('c1', OWNER)).rejects.toThrow(ConflictException);
    });

    it('does not swallow an unrelated Prisma failure', async () => {
      prisma.subclass.count.mockResolvedValue(0);
      prisma.srdClass.delete.mockRejectedValue(new Error('connection reset'));

      await expect(service.remove('c1', OWNER)).rejects.toThrow('connection reset');
    });
  });
});
