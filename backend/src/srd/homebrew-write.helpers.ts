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

/**
 * Display label stored in the legacy `source` column for admin-published
 * `shared` rows (VEG-309). Distinct from the seed's "SRD 5.2.1" default so the
 * provenance of an admin-authored catalog row is self-evident.
 */
export const SHARED_SOURCE_LABEL = 'Shared';

/** Map the request's JWT user to the actor shape ContentAccessService expects. */
export function toActor(user: JwtUser): ContentActor {
  return { userId: user.userId, isAdmin: user.role === Role.ADMIN };
}

/**
 * Map an item DTO onto Prisma column data, shared by the homebrew (VEG-296) and
 * admin shared-tier (VEG-309) item writers so the same `Item` entity normalizes
 * identically in both. Drops ownership/tier/source fields a client must never
 * set, even if a raw payload sneaks past DTO validation. `stealthDisadvantage`,
 * `requiresAttunement`, and `isMagic` are non-nullable columns, so a null clear
 * (the client's way of resetting an optional field, VEG-316) becomes their false
 * default; `properties` likewise resets to its empty-array default. A blank
 * `rarity` string (reachable only via raw API writes — the form already clears
 * to null) normalizes to null so the rarity filter cannot mis-bucket it.
 */
export function toItemColumnData(dto: object): Record<string, unknown> {
  // Copy so the caller's DTO is never mutated. Reserved ownership/tier columns
  // are stripped by ContentCrudService, not here.
  const data: Record<string, unknown> = { ...dto };
  for (const flag of ['stealthDisadvantage', 'requiresAttunement', 'isMagic'] as const) {
    if (flag in data && data[flag] === null) data[flag] = false;
  }
  if ('properties' in data && data.properties === null) data.properties = [];
  if (typeof data.rarity === 'string' && !data.rarity.trim()) data.rarity = null;
  return data;
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
    const article = /^[aeiou]/i.test(noun) ? 'an' : 'a';
    throw new ConflictException(
      contentSource === 'shared'
        ? `A shared ${noun} with this name already exists`
        : `You already have ${article} ${noun} with this name`
    );
  }
  if (isPrismaError(err, 'P2025')) {
    throw new NotFoundException(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} not found`);
  }
  throw err;
}
