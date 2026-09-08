import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HomebrewClassesService } from './homebrew-classes.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { ValidationPipe } from '@nestjs/common';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../bootstrap-config';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

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

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
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

    it('says "1 subclass", not "1 subclasses", when exactly one is blocking', async () => {
      prisma.subclass.count.mockResolvedValue(1);

      await expect(service.remove('c1', OWNER)).rejects.toThrow(/1 subclass\. Delete it first/);
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

  // ── Features as child rows (VEG-507) ────────────────────

  // Everything else in this file builds DTOs as plain object literals cast with
  // `as CreateClassDto`. That is what let the create path's invariant be wrong
  // and documented as right: a literal has no `features` key, while a real
  // pipe-produced DTO carries every declared field as an own key holding
  // undefined (ES2023 [[Define]] semantics on class fields). These two cases run
  // the production pipe so the service sees what the controller actually hands
  // it.
  describe('against a real pipe-produced DTO', () => {
    const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
    const transform = <T>(body: object, metatype: T) =>
      pipe.transform(body, { type: 'body' as const, metatype: metatype as never });

    it('writes no features relation when the create body never mentioned them', async () => {
      prisma.srdClass.create.mockResolvedValue({ id: 'c1' });
      const dto = await transform({ name: 'Warden', hitDie: 'd10' }, CreateClassDto);

      // Guard the premise rather than assume it: if this stops holding, the
      // assertion below stops testing anything.
      expect('features' in (dto as object)).toBe(true);
      expect((dto as { features?: unknown }).features).toBeUndefined();

      await service.create(dto as CreateClassDto, OWNER);

      const { data } = prisma.srdClass.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data).not.toHaveProperty('features');
    });

    it('leaves existing rows alone when the patch body never mentioned features', async () => {
      prisma.srdClass.findUnique.mockResolvedValue(homebrewRow);
      prisma.srdClass.update.mockResolvedValue(homebrewRow);
      const dto = await transform({ description: 'Rewritten.' }, UpdateClassDto);

      await service.update('c1', dto as UpdateClassDto, OWNER);

      expect(prisma.classFeature.deleteMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      const { data } = prisma.srdClass.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data).not.toHaveProperty('features');
    });
  });

  describe('features on create', () => {
    it('writes them as a nested create alongside the class columns', async () => {
      prisma.srdClass.create.mockResolvedValue({ id: 'c1' });

      await service.create(
        makeCreateDto({
          features: [
            { name: 'Rage', level: 1, description: 'Primal ferocity.' },
            { name: 'Extra Attack', level: 5, description: 'Twice, not once.' },
          ],
        }),
        OWNER
      );

      expect(prisma.srdClass.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Warden',
          features: {
            create: [
              { name: 'Rage', level: 1, description: 'Primal ferocity.' },
              { name: 'Extra Attack', level: 5, description: 'Twice, not once.' },
            ],
          },
        }),
      });
    });

    it('defaults a missing description to the empty string — the column is NOT NULL', async () => {
      prisma.srdClass.create.mockResolvedValue({ id: 'c1' });

      await service.create(makeCreateDto({ features: [{ name: 'Rage', level: 1 }] }), OWNER);

      const { data } = prisma.srdClass.create.mock.calls[0][0] as {
        data: { features: { create: { description: string }[] } };
      };
      expect(data.features.create[0].description).toBe('');
    });

    it('sends no features key at all when the body omits it', async () => {
      prisma.srdClass.create.mockResolvedValue({ id: 'c1' });

      await service.create(makeCreateDto(), OWNER);

      const { data } = prisma.srdClass.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data).not.toHaveProperty('features');
    });

    // The create path cannot translate a child conflict after the fact — `create`
    // is final and the skeleton maps its failures with the parent noun — so the
    // check runs before the write. Without it a seed or import caller passing
    // two features at one level is told it has a duplicate CLASS name.
    it('refuses a repeated (name, level) with feature copy, not class copy', async () => {
      prisma.srdClass.create.mockResolvedValue({ id: 'c1' });

      await expect(
        service.create(
          makeCreateDto({
            features: [
              { name: 'Ability Score Improvement', level: 4 },
              { name: 'Ability Score Improvement', level: 4 },
            ],
          } as Partial<CreateClassDto>),
          OWNER
        )
      ).rejects.toThrow(/feature/i);

      expect(prisma.srdClass.create).not.toHaveBeenCalled();
    });

    it('allows the same name at different levels, which is the point', async () => {
      prisma.srdClass.create.mockResolvedValue({ id: 'c1' });

      await service.create(
        makeCreateDto({
          features: [
            { name: 'Ability Score Improvement', level: 4 },
            { name: 'Ability Score Improvement', level: 8 },
          ],
        } as Partial<CreateClassDto>),
        OWNER
      );

      expect(prisma.srdClass.create).toHaveBeenCalled();
    });

    it('sends an empty nested create for an explicitly empty list', async () => {
      prisma.srdClass.create.mockResolvedValue({ id: 'c1' });

      await service.create(makeCreateDto({ features: [] }), OWNER);

      const { data } = prisma.srdClass.create.mock.calls[0][0] as {
        data: { features: { create: unknown[] } };
      };
      expect(data.features.create).toEqual([]);
    });
  });

  describe('features on update', () => {
    beforeEach(() => {
      prisma.srdClass.findUnique.mockResolvedValue(homebrewRow);
      prisma.srdClass.update.mockResolvedValue(homebrewRow);
      prisma.classFeature.deleteMany.mockResolvedValue({ count: 0 });
      prisma.classFeature.createMany.mockResolvedValue({ count: 0 });
    });

    it('replaces the whole list: delete every row, then insert the payload', async () => {
      await service.update(
        'c1',
        { features: [{ name: 'Rage', level: 1, description: 'Rewritten.' }] } as never,
        OWNER
      );

      expect(prisma.classFeature.deleteMany).toHaveBeenCalledWith({ where: { classId: 'c1' } });
      expect(prisma.classFeature.createMany).toHaveBeenCalledWith({
        data: [{ classId: 'c1', name: 'Rage', level: 1, description: 'Rewritten.' }],
      });
    });

    it('keeps features out of the parent column data', async () => {
      await service.update(
        'c1',
        { description: 'New prose.', features: [{ name: 'Rage', level: 1 }] } as never,
        OWNER
      );

      const { data } = prisma.srdClass.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).not.toHaveProperty('features');
      expect(data.description).toBe('New prose.');
    });

    it('leaves the existing rows alone when the body omits features', async () => {
      await service.update('c1', { description: 'New prose.' } as never, OWNER);

      expect(prisma.classFeature.deleteMany).not.toHaveBeenCalled();
      expect(prisma.classFeature.createMany).not.toHaveBeenCalled();
    });

    it('clears every row for an empty array, without an empty insert', async () => {
      await service.update('c1', { features: [] } as never, OWNER);

      expect(prisma.classFeature.deleteMany).toHaveBeenCalledWith({ where: { classId: 'c1' } });
      expect(prisma.classFeature.createMany).not.toHaveBeenCalled();
    });

    it('clears every row for a null, matching the null-clear convention', async () => {
      await service.update('c1', { features: null } as never, OWNER);

      expect(prisma.classFeature.deleteMany).toHaveBeenCalledWith({ where: { classId: 'c1' } });
      expect(prisma.classFeature.createMany).not.toHaveBeenCalled();
    });

    // Pins the field mapping, which is the guard that actually enforces this:
    // replacing its named fields with a spread makes this test fail. (The
    // `classId`-last ordering at the insert is a second, cheaper layer that no
    // test distinguishes, precisely because this one holds first.) Worth a test
    // because tsc cannot see the loss — a spread into an object literal skips
    // excess-property checking, so the mapping can be widened silently.
    it('never lets a row reparent itself or smuggle an id past the field mapping', async () => {
      await service.update(
        'c1',
        {
          features: [{ name: 'Rage', level: 1, classId: 'other-class', id: 'f9' }],
        } as never,
        OWNER
      );

      expect(prisma.classFeature.createMany).toHaveBeenCalledWith({
        data: [{ classId: 'c1', name: 'Rage', level: 1, description: '' }],
      });
    });

    // The NOT NULL column's default on the update path. Create already pins it;
    // update went through a different helper call and did not.
    it('defaults a missing description to the empty string on the update path', async () => {
      await service.update('c1', { features: [{ name: 'Rage', level: 1 }] } as never, OWNER);

      const { data } = prisma.classFeature.createMany.mock.calls[0][0] as {
        data: { description: string }[];
      };
      expect(data[0].description).toBe('');
    });

    // A features-only PATCH leaves nothing for the parent columns, so Prisma is
    // asked to update with an empty object. It works, but until now only the
    // E2E proved that — the slowest gate in the project for a one-line fact.
    it('still issues the parent update when only features changed', async () => {
      await service.update('c1', { features: [{ name: 'Rage', level: 1 }] } as never, OWNER);

      expect(prisma.srdClass.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: {} });
    });

    it('runs the parent update and both child writes inside one transaction', async () => {
      await service.update('c1', { features: [{ name: 'Rage', level: 1 }] } as never, OWNER);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // A failure part-way through must not leave the parent updated and the
      // children half-rewritten, which is the whole reason VEG-512 added the seam.
      const order = [
        prisma.srdClass.update.mock.invocationCallOrder[0],
        prisma.classFeature.deleteMany.mock.invocationCallOrder[0],
        prisma.classFeature.createMany.mock.invocationCallOrder[0],
      ];
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it('returns the row the update produced, not the row it authorized', async () => {
      const written = { ...homebrewRow, description: 'Rewritten.' };
      prisma.srdClass.update.mockResolvedValue(written);

      await expect(
        service.update('c1', { description: 'Rewritten.' } as never, OWNER)
      ).resolves.toEqual(written);
    });

    it('reports a duplicate feature as a feature conflict, not a duplicate class name', async () => {
      prisma.classFeature.createMany.mockRejectedValue(p2002(['classId', 'name', 'level']));

      await expect(
        service.update('c1', { features: [{ name: 'Rage', level: 1 }] } as never, OWNER)
      ).rejects.toThrow(/feature/i);
    });

    it('still maps a duplicate class name to the class-level conflict copy', async () => {
      prisma.srdClass.update.mockRejectedValue(p2002(['name']));

      await expect(service.update('c1', { name: 'Fighter' } as never, OWNER)).rejects.toThrow(
        /class with this name/i
      );
    });
  });
});
