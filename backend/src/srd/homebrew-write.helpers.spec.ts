import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mapWriteError } from './homebrew-write.helpers';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });
}

describe('mapWriteError', () => {
  it('maps P2002 to Conflict with owner-scoped copy for homebrew', () => {
    expect(() => mapWriteError(prismaError('P2002'), 'homebrew', 'feat')).toThrow(
      'You already have a feat with this name'
    );
  });

  it('uses "an" for vowel-initial nouns in the homebrew conflict copy', () => {
    expect(() => mapWriteError(prismaError('P2002'), 'homebrew', 'item')).toThrow(
      'You already have an item with this name'
    );
  });

  it('maps P2002 to Conflict with global copy for shared', () => {
    expect(() => mapWriteError(prismaError('P2002'), 'shared', 'feat')).toThrow(
      'A shared feat with this name already exists'
    );
    expect(() => mapWriteError(prismaError('P2002'), 'shared', 'feat')).toThrow(ConflictException);
  });

  it('maps P2025 (authorize/write race) to NotFound with a capitalized noun', () => {
    expect(() => mapWriteError(prismaError('P2025'), 'homebrew', 'feat')).toThrow(
      NotFoundException
    );
    expect(() => mapWriteError(prismaError('P2025'), 'homebrew', 'feat')).toThrow('Feat not found');
  });

  // The anti-silent-failure guarantee: anything that is not one of the two
  // mapped codes must surface unchanged, never be swallowed or rewrapped.
  it('rethrows other Prisma errors unchanged', () => {
    const err = prismaError('P2003');
    expect(() => mapWriteError(err, 'homebrew', 'feat')).toThrow(err);
  });

  it('rethrows non-Prisma errors unchanged', () => {
    const err = new Error('connection reset');
    expect(() => mapWriteError(err, 'homebrew', 'spell')).toThrow(err);
  });
});
