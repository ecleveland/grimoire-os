import { Prisma } from '../../generated/prisma/client';
import { sqlStateOf, violatedConstraint, violatedFields } from './prisma-errors';

/**
 * Each `meta` below is copied verbatim from an error the pg driver adapter
 * (Prisma 7.10) raised against Postgres 16. If an adapter upgrade moves these
 * keys, this spec is meant to fail before the call sites silently stop matching.
 */
const MEASURED_P2002 = {
  driverAdapterError: {
    name: 'DriverAdapterError',
    cause: {
      originalCode: '23505',
      originalMessage: 'duplicate key value violates unique constraint "users_username_key"',
      kind: 'UniqueConstraintViolation',
      constraint: { index: 'users_username_key' },
      table: 'users',
    },
  },
  modelName: 'User',
};

const MEASURED_P2003 = {
  modelName: 'ClassFeature',
  driverAdapterError: {
    name: 'DriverAdapterError',
    cause: {
      originalCode: '23503',
      originalMessage:
        'insert or update on table "class_features" violates foreign key constraint "class_features_classId_fkey"',
      kind: 'ForeignKeyConstraintViolation',
      constraint: { index: 'class_features_classId_fkey' },
    },
  },
};

const MEASURED_P2039 = {
  modelName: 'User',
  driverAdapterError: {
    name: 'DriverAdapterError',
    cause: {
      originalCode: '23514',
      originalMessage:
        'new row for relation "srd_classes" violates check constraint "srd_classes_homebrew_has_creator_check"',
      kind: 'postgres',
      code: '23514',
      severity: 'ERROR',
      message:
        'new row for relation "srd_classes" violates check constraint "srd_classes_homebrew_has_creator_check"',
    },
  },
};

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Prisma failure', {
    code,
    clientVersion: '7.10.0',
    meta,
  });
}

describe('violatedConstraint', () => {
  it('names the index of a measured unique violation', () => {
    expect(violatedConstraint(knownError('P2002', MEASURED_P2002))).toBe('users_username_key');
  });

  it('names the index of a measured foreign key violation', () => {
    expect(violatedConstraint(knownError('P2003', MEASURED_P2003))).toBe(
      'class_features_classId_fkey'
    );
  });

  it('names nothing for a measured CHECK violation, which carries no constraint key', () => {
    expect(violatedConstraint(knownError('P2039', MEASURED_P2039))).toBeUndefined();
  });

  // The adapter's typings allow a column list in place of an index name.
  it('joins the column list when the adapter reports fields instead of an index', () => {
    const meta = {
      driverAdapterError: {
        cause: {
          kind: 'UniqueConstraintViolation',
          constraint: { fields: ['classId', 'name', 'level'] },
        },
      },
    };

    expect(violatedConstraint(knownError('P2002', meta))).toBe('classId, name, level');
  });

  it('returns undefined when the error carries no adapter cause', () => {
    expect(violatedConstraint(knownError('P2025'))).toBeUndefined();
  });
});

describe('violatedFields', () => {
  it('returns the column list when the adapter reports one', () => {
    const meta = {
      driverAdapterError: {
        cause: {
          kind: 'UniqueConstraintViolation',
          constraint: { fields: ['classId', 'name', 'level'] },
        },
      },
    };

    expect(violatedFields(knownError('P2002', meta))).toEqual(['classId', 'name', 'level']);
  });

  it('returns undefined for a measured violation that names an index instead', () => {
    expect(violatedFields(knownError('P2002', MEASURED_P2002))).toBeUndefined();
  });

  it('ignores a fields value that is not a list of strings', () => {
    const meta = { driverAdapterError: { cause: { constraint: { fields: [1, 2] } } } };

    expect(violatedFields(knownError('P2002', meta))).toBeUndefined();
  });
});

describe('sqlStateOf', () => {
  it('reads the SQLSTATE of a measured CHECK violation', () => {
    expect(sqlStateOf(knownError('P2039', MEASURED_P2039))).toBe('23514');
  });

  it('reads the SQLSTATE of a measured unique violation', () => {
    expect(sqlStateOf(knownError('P2002', MEASURED_P2002))).toBe('23505');
  });

  it('returns undefined when the error carries no adapter cause', () => {
    expect(sqlStateOf(knownError('P2025'))).toBeUndefined();
  });
});
