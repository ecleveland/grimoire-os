import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ContentSource } from '@grimoire-os/shared';
import { ContentActor } from './content-access.service';
import type { JwtUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../common/enums';

/**
 * Shared plumbing for the per-type homebrew CRUD services and controllers
 * (monsters VEG-293, spells VEG-294; feats and magic items queued as
 * VEG-295/296). Extracted so the write-path error semantics and the
 * JwtUser→ContentActor mapping cannot drift between content types.
 */

/** Display label stored in the legacy `source` column for user-authored rows. */
export const HOMEBREW_SOURCE_LABEL = 'Homebrew';

/** Map the request's JWT user to the actor shape ContentAccessService expects. */
export function toActor(user: JwtUser): ContentActor {
  return { userId: user.userId, isAdmin: user.role === Role.ADMIN };
}

function isPrismaError(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

/**
 * Map the write-path Prisma errors to HTTP semantics: a duplicate name (P2002,
 * per-owner for homebrew / global for shared — see the partial unique indexes
 * in the schema's content migrations) becomes 409 with tier-appropriate copy,
 * and a row that vanished between authorize and write (P2025 race) becomes the
 * same 404 it would have been a moment earlier. Everything else rethrows.
 *
 * `noun` is the lowercase entity name used in the user-facing copy
 * (e.g. 'monster', 'spell').
 */
export function mapWriteError(err: unknown, contentSource: ContentSource, noun: string): never {
  if (isPrismaError(err, 'P2002')) {
    throw new ConflictException(
      contentSource === 'shared'
        ? `A shared ${noun} with this name already exists`
        : `You already have a ${noun} with this name`
    );
  }
  if (isPrismaError(err, 'P2025')) {
    throw new NotFoundException(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} not found`);
  }
  throw err;
}
