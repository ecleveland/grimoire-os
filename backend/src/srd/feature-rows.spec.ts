import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DUPLICATE_FEATURE_MESSAGE,
  assertNoDuplicateFeatures,
  isFeatureConflict,
  takeFeatures,
} from './feature-rows';

/**
 * The helpers both feature-writing services share. Each service spec drives
 * them through a whole write, where a mock that throws the right error in the
 * right place can make a weakened helper look correct. These pin the helpers'
 * own decisions directly.
 */

function knownError(code: string, target?: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Prisma failure', {
    code,
    clientVersion: 'test',
    meta: target ? { target } : undefined,
  });
}

describe('isFeatureConflict', () => {
  // The two targets Prisma reports for a duplicate feature, one per table.
  it.each([[['subclassId', 'name', 'level']], [['classId', 'name', 'level']]])(
    'recognizes a unique violation on the feature index %p',
    target => {
      expect(isFeatureConflict(knownError('P2002', target))).toBe(true);
    }
  );

  // The homebrew subclass name index. Reading this as a feature conflict would
  // tell an author their features collide when their subclass name does.
  it('does not claim a duplicate parent name', () => {
    expect(isFeatureConflict(knownError('P2002', ['name', 'createdById', 'classId']))).toBe(false);
  });

  it('does not claim a different error code that happens to carry a level target', () => {
    expect(isFeatureConflict(knownError('P2001', ['subclassId', 'name', 'level']))).toBe(false);
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
