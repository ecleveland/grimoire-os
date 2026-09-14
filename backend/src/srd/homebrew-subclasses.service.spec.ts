import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HomebrewSubclassesService } from './homebrew-subclasses.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateSubclassDto } from './dto/create-subclass.dto';

/**
 * Subclass-specific write behavior only. The authorization skeleton (the
 * 404-vs-403 split, the ownership stamp, the tier-keyed error mapping) is
 * asserted for every tiered service in `content-write.contract.spec.ts`, which
 * this service is enrolled in. What stays here is the parent-class visibility
 * rule and the feature replacement.
 */

const OWNER = { userId: 'owner-1', isAdmin: false };
const CLASS_ID = 'c1';
const VISIBLE_CLASS = { id: CLASS_ID, contentSource: 'srd', createdById: null };

function makeCreateDto(over: Partial<CreateSubclassDto> = {}): CreateSubclassDto {
  return { name: 'Path of Ash', classId: CLASS_ID, ...over } as CreateSubclassDto;
}

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('HomebrewSubclassesService', () => {
  let service: HomebrewSubclassesService;
  let prisma: MockPrismaService;
  const homebrewRow = {
    id: 'sc1',
    contentSource: 'homebrew',
    createdById: 'owner-1',
    classId: CLASS_ID,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HomebrewSubclassesService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(HomebrewSubclassesService);
    prisma = module.get<MockPrismaService>(PrismaService as never);
    prisma.srdClass.findFirst.mockResolvedValue(VISIBLE_CLASS);
  });

  describe('the parent class', () => {
    it('passes the subclass columns through once the parent resolves', async () => {
      prisma.subclass.create.mockResolvedValue({ id: 'sc1' });

      await service.create(makeCreateDto({ description: 'Ash and cinders.' }), OWNER);

      expect(prisma.subclass.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Path of Ash',
          classId: CLASS_ID,
          description: 'Ash and cinders.',
        }),
      });
    });

    it('looks the parent up scoped to what the author may see', async () => {
      prisma.subclass.create.mockResolvedValue({ id: 'sc1' });

      await service.create(makeCreateDto(), OWNER);

      expect(prisma.srdClass.findFirst).toHaveBeenCalledWith({
        where: {
          id: CLASS_ID,
          OR: [{ contentSource: { in: ['srd', 'shared'] } }, { createdById: 'owner-1' }],
        },
        // The check only asks whether a row exists. Without the select it would
        // pull the parent's three Json blobs to throw them away.
        select: { id: true },
      });
    });

    // One mock serves both the foreign-homebrew class and the class that never
    // existed, which is the point: the lookup is visibility-scoped, so the two
    // are the same query returning the same null and the same 400. Nothing in
    // the response says which one it was.
    it('refuses a parent it cannot resolve, without writing', async () => {
      prisma.srdClass.findFirst.mockResolvedValue(null);

      await expect(service.create(makeCreateDto(), OWNER)).rejects.toThrow(
        /not found or not accessible/
      );
      await expect(service.create(makeCreateDto(), OWNER)).rejects.toThrow(BadRequestException);
      expect(prisma.subclass.create).not.toHaveBeenCalled();
    });

    // A create with no classId at all must not reach the query: Prisma drops an
    // undefined `id` from the where, so the lookup would return the first class
    // the actor can see and authorize a parent nobody asked for. @IsUUID closes
    // this over HTTP; a seed or import caller sits outside that pipe.
    it('refuses a create that names no parent, without querying for one', async () => {
      await expect(service.create({ name: 'Path of Ash' } as never, OWNER)).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.srdClass.findFirst).not.toHaveBeenCalled();
      expect(prisma.subclass.create).not.toHaveBeenCalled();
    });

    // A value that is present but not a string passes a falsy check and reaches
    // Prisma as a filter object (`{ id: {} }`) or a type error, neither of which
    // is the refusal a missing parent gets.
    it.each([{}, 42, ['c1']])(
      'refuses a non-string classId %p without querying for it',
      async classId => {
        await expect(
          service.create({ name: 'Path of Ash', classId } as never, OWNER)
        ).rejects.toThrow(BadRequestException);
        expect(prisma.srdClass.findFirst).not.toHaveBeenCalled();
      }
    );

    it('never lets an update move a subclass to another class', async () => {
      prisma.subclass.findUnique.mockResolvedValue(homebrewRow);
      prisma.subclass.update.mockResolvedValue(homebrewRow);

      await service.update('sc1', { classId: 'other-class', description: 'x' } as never, OWNER);

      const { data } = prisma.subclass.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).not.toHaveProperty('classId');
      expect(data.description).toBe('x');
    });

    // Prisma's relation form sets `classId` without that string appearing in the
    // payload, so dropping the scalar alone leaves this path open.
    it('never lets an update reparent through the relation form either', async () => {
      prisma.subclass.findUnique.mockResolvedValue(homebrewRow);
      prisma.subclass.update.mockResolvedValue(homebrewRow);

      await service.update(
        'sc1',
        { srdClass: { connect: { id: 'other-class' } }, description: 'x' } as never,
        OWNER
      );

      const { data } = prisma.subclass.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).not.toHaveProperty('srdClass');
      expect(data.description).toBe('x');
    });

    // The create side of the same alias. There is no scalar `classId` to check,
    // so the narrowing refuses it before the lookup, and the connect never
    // reaches the insert to attach the row to a class nobody authorized.
    it('refuses a create that names its parent only through the relation form', async () => {
      await expect(
        service.create(
          { name: 'Path of Ash', srdClass: { connect: { id: 'other-class' } } } as never,
          OWNER
        )
      ).rejects.toThrow('Parent class not found or not accessible');
      expect(prisma.srdClass.findFirst).not.toHaveBeenCalled();
      expect(prisma.subclass.create).not.toHaveBeenCalled();
    });
  });

  describe('column normalization', () => {
    beforeEach(() => {
      prisma.subclass.findUnique.mockResolvedValue(homebrewRow);
      prisma.subclass.update.mockResolvedValue(homebrewRow);
    });

    it('rejects clearing name to null, since the column is non-nullable and required', async () => {
      await expect(service.update('sc1', { name: null } as never, OWNER)).rejects.toThrow(
        BadRequestException
      );
    });

    it('normalizes a blank description to null', async () => {
      await service.update('sc1', { description: '   ' } as never, OWNER);

      const { data } = prisma.subclass.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data.description).toBeNull();
    });
  });

  describe('features on create', () => {
    beforeEach(() => {
      prisma.subclass.create.mockResolvedValue({ id: 'sc1' });
    });

    it('writes them as a nested create alongside the subclass columns', async () => {
      await service.create(
        makeCreateDto({
          features: [{ name: 'Ashen Step', level: 3, description: 'Step through cinders.' }],
        }),
        OWNER
      );

      expect(prisma.subclass.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          features: {
            create: [{ name: 'Ashen Step', level: 3, description: 'Step through cinders.' }],
          },
        }),
      });
    });

    it('defaults a missing description to the empty string, since the column is NOT NULL', async () => {
      await service.create(makeCreateDto({ features: [{ name: 'Ashen Step', level: 3 }] }), OWNER);

      const { data } = prisma.subclass.create.mock.calls[0][0] as {
        data: { features: { create: { description: string }[] } };
      };
      expect(data.features.create[0].description).toBe('');
    });

    it('sends no features key at all when the body omits it', async () => {
      await service.create(makeCreateDto(), OWNER);

      const { data } = prisma.subclass.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data).not.toHaveProperty('features');
    });

    // `create` is final and the skeleton maps its failures with the parent noun,
    // so a P2002 from the nested insert would reach the client as "you already
    // have a subclass with this name". The check runs before the write instead.
    it('refuses a repeated (name, level) with feature copy, before any write', async () => {
      await expect(
        service.create(
          makeCreateDto({
            features: [
              { name: 'Ashen Step', level: 3 },
              { name: 'Ashen Step', level: 3 },
            ],
          }),
          OWNER
        )
      ).rejects.toThrow(/feature/i);

      expect(prisma.subclass.create).not.toHaveBeenCalled();
    });

    it('allows the same name at different levels, which is the point', async () => {
      await service.create(
        makeCreateDto({
          features: [
            { name: 'Ashen Step', level: 3 },
            { name: 'Ashen Step', level: 10 },
          ],
        }),
        OWNER
      );

      expect(prisma.subclass.create).toHaveBeenCalled();
    });
  });

  describe('features on update', () => {
    beforeEach(() => {
      prisma.subclass.findUnique.mockResolvedValue(homebrewRow);
      prisma.subclass.update.mockResolvedValue(homebrewRow);
      prisma.subclassFeature.deleteMany.mockResolvedValue({ count: 0 });
      prisma.subclassFeature.createMany.mockResolvedValue({ count: 0 });
    });

    it('replaces the whole list: delete every row, then insert the payload', async () => {
      await service.update(
        'sc1',
        { features: [{ name: 'Ashen Step', level: 3, description: 'Rewritten.' }] } as never,
        OWNER
      );

      expect(prisma.subclassFeature.deleteMany).toHaveBeenCalledWith({
        where: { subclassId: 'sc1' },
      });
      expect(prisma.subclassFeature.createMany).toHaveBeenCalledWith({
        data: [{ subclassId: 'sc1', name: 'Ashen Step', level: 3, description: 'Rewritten.' }],
      });
    });

    // A features-only PATCH leaves the parent update with no columns, which Prisma
    // runs as a SELECT that locks nothing. Without the row lock first, two
    // overlapping replacements merge their lists instead of one replacing the other.
    it('locks the parent row inside the transaction before touching it', async () => {
      await service.update('sc1', { features: [{ name: 'Ashen Step', level: 3 }] } as never, OWNER);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const [query] = prisma.$queryRaw.mock.calls[0] as [{ sql: string; values: unknown[] }];
      expect(query.sql).toBe('SELECT 1 FROM "subclasses" WHERE "id" = ? FOR UPDATE');
      expect(query.values).toEqual(['sc1']);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.subclass.update.mock.invocationCallOrder[0]
      );
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.subclassFeature.deleteMany.mock.invocationCallOrder[0]
      );
    });

    // The lock belongs to the replacement. A scalar-only PATCH runs a real UPDATE,
    // which locks the row itself, and opens no transaction to hold another one.
    it('takes no lock when the body omits features', async () => {
      await service.update('sc1', { description: 'New prose.' } as never, OWNER);

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('runs the parent update and both child writes inside one transaction', async () => {
      await service.update('sc1', { features: [{ name: 'Ashen Step', level: 3 }] } as never, OWNER);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const order = [
        prisma.subclass.update.mock.invocationCallOrder[0],
        prisma.subclassFeature.deleteMany.mock.invocationCallOrder[0],
        prisma.subclassFeature.createMany.mock.invocationCallOrder[0],
      ];
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it('leaves the existing rows alone when the body omits features', async () => {
      await service.update('sc1', { description: 'New prose.' } as never, OWNER);

      expect(prisma.subclassFeature.deleteMany).not.toHaveBeenCalled();
      expect(prisma.subclassFeature.createMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('clears every row for an empty array, without an empty insert', async () => {
      await service.update('sc1', { features: [] } as never, OWNER);

      expect(prisma.subclassFeature.deleteMany).toHaveBeenCalledWith({
        where: { subclassId: 'sc1' },
      });
      expect(prisma.subclassFeature.createMany).not.toHaveBeenCalled();
    });

    it('clears every row for a null, matching the null-clear convention', async () => {
      await service.update('sc1', { features: null } as never, OWNER);

      expect(prisma.subclassFeature.deleteMany).toHaveBeenCalledWith({
        where: { subclassId: 'sc1' },
      });
      expect(prisma.subclassFeature.createMany).not.toHaveBeenCalled();
    });

    // Pins the field mapping: replacing its named fields with a spread makes
    // this fail. tsc cannot see the loss, because a spread into an object
    // literal skips excess-property checking.
    it('never lets a row reparent itself or smuggle an id past the field mapping', async () => {
      await service.update(
        'sc1',
        {
          features: [{ name: 'Ashen Step', level: 3, subclassId: 'other-subclass', id: 'f9' }],
        } as never,
        OWNER
      );

      expect(prisma.subclassFeature.createMany).toHaveBeenCalledWith({
        data: [{ subclassId: 'sc1', name: 'Ashen Step', level: 3, description: '' }],
      });
    });

    // Asserted on what the caller receives, not on the mock's arguments: the
    // write skeleton hands this value straight back as the response body, and
    // POST cannot include features, so PATCH must not either.
    it('resolves to the subclass row without its features', async () => {
      const result = await service.update(
        'sc1',
        { features: [{ name: 'Ashen Step', level: 3 }] } as never,
        OWNER
      );

      expect(result).toEqual(homebrewRow);
      expect(result).not.toHaveProperty('features');
    });

    it('keeps features out of the parent column data', async () => {
      await service.update(
        'sc1',
        { description: 'New prose.', features: [{ name: 'Ashen Step', level: 3 }] } as never,
        OWNER
      );

      const { data } = prisma.subclass.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).not.toHaveProperty('features');
    });

    it('reports a duplicate feature as a feature conflict, not a duplicate subclass name', async () => {
      prisma.subclassFeature.createMany.mockRejectedValue(p2002(['subclassId', 'name', 'level']));

      await expect(
        service.update('sc1', { features: [{ name: 'Ashen Step', level: 3 }] } as never, OWNER)
      ).rejects.toThrow(/feature/i);
    });

    it('still maps a duplicate subclass name to the subclass-level conflict copy', async () => {
      prisma.subclass.update.mockRejectedValue(p2002(['name', 'createdById', 'classId']));

      await expect(service.update('sc1', { name: 'Berserker' } as never, OWNER)).rejects.toThrow(
        /subclass with this name/i
      );
    });
  });

  describe('remove', () => {
    // SubclassFeature is ON DELETE CASCADE, so the child rows go with the
    // parent. A hand-rolled cleanup here would be a second rule to keep in sync
    // with the schema.
    it('deletes the row and leaves the feature rows to the cascade', async () => {
      prisma.subclass.findUnique.mockResolvedValue(homebrewRow);
      prisma.subclass.delete.mockResolvedValue(homebrewRow);

      await service.remove('sc1', OWNER);

      expect(prisma.subclass.delete).toHaveBeenCalledWith({ where: { id: 'sc1' } });
      expect(prisma.subclassFeature.deleteMany).not.toHaveBeenCalled();
    });
  });
});
