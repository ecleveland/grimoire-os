import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  DUPLICATE_FEATURE_MESSAGE,
  assertNoDuplicateFeatures,
  isFeatureConflict,
  lockFeatureParent,
  nestFeaturesForCreate,
  replaceFeatures,
  takeFeatures,
} from './feature-rows';

/**
 * The helpers both feature-writing services share. Each service spec drives
 * them through a whole write, where a mock that throws the right error in the
 * right place can make a weakened helper look correct. These pin the helpers'
 * own decisions directly.
 */

/** A known request error shaped the way the pg driver adapter reports a violated index. */
function knownError(code: string, index?: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Prisma failure', {
    code,
    clientVersion: 'test',
    meta: index
      ? {
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: { kind: 'UniqueConstraintViolation', constraint: { index } },
          },
        }
      : undefined,
  });
}

describe('isFeatureConflict', () => {
  // The two indexes Postgres names for a duplicate feature, one per table.
  it.each(['subclass_features_subclassId_name_level_key', 'class_features_classId_name_level_key'])(
    'recognizes a unique violation on the feature index %p',
    index => {
      expect(isFeatureConflict(knownError('P2002', index))).toBe(true);
    }
  );

  // The parent-name indexes. Reading one as a feature conflict would tell an
  // author their features collide when their class or subclass name does.
  it.each([
    'subclasses_homebrew_owner_name_key',
    'srd_classes_homebrew_owner_name_key',
    'srd_classes_srd_name_key',
  ])('does not claim a duplicate parent name on %p', index => {
    expect(isFeatureConflict(knownError('P2002', index))).toBe(false);
  });

  it('does not claim a different error code that happens to name a feature index', () => {
    expect(
      isFeatureConflict(knownError('P2001', 'subclass_features_subclassId_name_level_key'))
    ).toBe(false);
  });

  // The adapter's typings also allow a column list in place of the index name.
  function fieldsError(fields: string[]): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Prisma failure', {
      code: 'P2002',
      clientVersion: 'test',
      meta: {
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: { kind: 'UniqueConstraintViolation', constraint: { fields } },
        },
      },
    });
  }

  it.each([[['classId', 'name', 'level']], [['subclassId', 'name', 'level']]])(
    'recognizes a feature violation reported as the column list %p',
    fields => {
      expect(isFeatureConflict(fieldsError(fields))).toBe(true);
    }
  );

  it('does not claim a parent-name violation reported as a column list', () => {
    expect(isFeatureConflict(fieldsError(['name', 'createdById', 'classId']))).toBe(false);
  });

  it('does not claim a unique violation that names no constraint', () => {
    expect(isFeatureConflict(knownError('P2002'))).toBe(false);
  });

  it('does not claim an error that is not a Prisma known error', () => {
    expect(isFeatureConflict(new Error('Unique constraint failed on level'))).toBe(false);
  });
});

describe('takeFeatures', () => {
  // An own key holding undefined is what a pipe-produced DTO carries for every
  // field the body never mentioned. Left on the data, it reaches the parent's
  // update as a column named `features`.
  it('removes an own features key even when it holds undefined', () => {
    const data: Record<string, unknown> = { name: 'Path of Ash', features: undefined };

    expect(takeFeatures(data)).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(data, 'features')).toBe(false);
  });
});

describe('assertNoDuplicateFeatures', () => {
  it('refuses a repeated (name, level) with the feature copy', () => {
    const rows = [
      { name: 'Ashen Step', level: 3, description: '' },
      { name: 'Ashen Step', level: 3, description: 'again' },
    ];

    expect(() => assertNoDuplicateFeatures(rows)).toThrow(ConflictException);
    expect(() => assertNoDuplicateFeatures(rows)).toThrow(DUPLICATE_FEATURE_MESSAGE);
  });

  it('allows one name at two levels', () => {
    expect(() =>
      assertNoDuplicateFeatures([
        { name: 'Ashen Step', level: 3, description: '' },
        { name: 'Ashen Step', level: 10, description: '' },
      ])
    ).not.toThrow();
  });
});

describe('nestFeaturesForCreate', () => {
  it('reshapes a feature list into a nested create, leaving the other columns alone', () => {
    const data: Record<string, unknown> = {
      name: 'Path of Ash',
      features: [{ name: 'Ashen Step', level: 3, description: '' }],
    };

    nestFeaturesForCreate(data);

    expect(data).toEqual({
      name: 'Path of Ash',
      features: { create: [{ name: 'Ashen Step', level: 3, description: '' }] },
    });
  });

  // A create that says nothing about features must write no relation at all,
  // and a pipe-produced DTO carries the key as an own undefined.
  it('drops an undefined features key rather than nesting it', () => {
    const data: Record<string, unknown> = { name: 'Path of Ash', features: undefined };

    nestFeaturesForCreate(data);

    expect(Object.prototype.hasOwnProperty.call(data, 'features')).toBe(false);
  });

  it('nests an explicitly empty list as an empty create', () => {
    const data: Record<string, unknown> = { features: [] };

    nestFeaturesForCreate(data);

    expect(data.features).toEqual({ create: [] });
  });

  // `create` is final and the skeleton maps its failures with the parent noun,
  // so the duplicate has to be refused here, before the write.
  it('refuses a repeated (name, level) before anything is nested', () => {
    const data: Record<string, unknown> = {
      features: [
        { name: 'Ashen Step', level: 3, description: '' },
        { name: 'Ashen Step', level: 3, description: '' },
      ],
    };

    expect(() => nestFeaturesForCreate(data)).toThrow(DUPLICATE_FEATURE_MESSAGE);
  });
});

describe('replaceFeatures', () => {
  function makeChildren() {
    return {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
  }

  const ROWS = [{ name: 'Ashen Step', level: 3, description: 'Step through cinders.' }];

  it("deletes only the parent's rows, then inserts the replacement under that parent", async () => {
    const children = makeChildren();

    await replaceFeatures(children, 'subclassId', 'sc1', ROWS);

    expect(children.deleteMany).toHaveBeenCalledWith({ where: { subclassId: 'sc1' } });
    expect(children.createMany).toHaveBeenCalledWith({
      data: [
        { name: 'Ashen Step', level: 3, description: 'Step through cinders.', subclassId: 'sc1' },
      ],
    });
    expect(children.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      children.createMany.mock.invocationCallOrder[0]
    );
  });

  it('keys the rows on whichever parent column it is given', async () => {
    const children = makeChildren();

    await replaceFeatures(children, 'classId', 'c1', ROWS);

    expect(children.deleteMany).toHaveBeenCalledWith({ where: { classId: 'c1' } });
    expect(children.createMany.mock.calls[0][0].data[0].classId).toBe('c1');
  });

  // The parent key is written after the row's own fields, so a row that
  // somehow carries one cannot move itself under another parent.
  it('writes the parent key last, so a row cannot override it', async () => {
    const children = makeChildren();
    const smuggled = [{ ...ROWS[0], subclassId: 'other-subclass' }];

    await replaceFeatures(children, 'subclassId', 'sc1', smuggled);

    expect(children.createMany.mock.calls[0][0].data[0].subclassId).toBe('sc1');
  });

  it('clears without an insert when the replacement list is empty', async () => {
    const children = makeChildren();

    await replaceFeatures(children, 'subclassId', 'sc1', []);

    expect(children.deleteMany).toHaveBeenCalledWith({ where: { subclassId: 'sc1' } });
    expect(children.createMany).not.toHaveBeenCalled();
  });

  it('turns a level-keyed unique violation into the feature conflict', async () => {
    const children = makeChildren();
    children.createMany.mockRejectedValue(
      knownError('P2002', 'subclass_features_subclassId_name_level_key')
    );

    const err = await replaceFeatures(children, 'subclassId', 'sc1', ROWS).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).message).toBe(DUPLICATE_FEATURE_MESSAGE);
  });

  it.each([
    [
      'a unique violation on another index',
      knownError('P2002', 'subclasses_homebrew_owner_name_key'),
    ],
    ['a different Prisma error', knownError('P2003')],
    ['a plain error', new Error('connection reset')],
  ])('rethrows %s untouched', async (_label, failure) => {
    const children = makeChildren();
    children.createMany.mockRejectedValue(failure);

    await expect(replaceFeatures(children, 'subclassId', 'sc1', ROWS)).rejects.toBe(failure);
  });
});

describe('lockFeatureParent', () => {
  it.each([['subclasses'], ['srd_classes']] as const)(
    'takes a row lock on the %s row, with the id bound rather than interpolated',
    async table => {
      const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };

      await lockFeatureParent(tx, table, 'row-1; DROP TABLE users');

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      const [query] = tx.$queryRaw.mock.calls[0] as [Prisma.Sql];
      expect(query.sql).toBe(`SELECT 1 FROM "${table}" WHERE "id" = ? FOR UPDATE`);
      expect(query.values).toEqual(['row-1; DROP TABLE users']);
    }
  );
});
