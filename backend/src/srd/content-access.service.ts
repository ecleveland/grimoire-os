import { ForbiddenException, Injectable } from '@nestjs/common';
import { ContentSource } from '@grimoire-os/shared';

/** Minimal view of a content row needed to authorize reads/writes against it. */
export interface OwnedContentRow {
  contentSource: ContentSource;
  createdById: string | null;
}

/** The acting user for write/create authorization. */
export interface ContentActor {
  userId: string;
  isAdmin: boolean;
}

/** Content sources that form the globally-visible catalog (everyone sees these). */
export const GLOBAL_CONTENT_SOURCES = ['srd', 'shared'] as const;

export type GlobalWhere = { contentSource: { in: ContentSource[] } };
export type VisibleWhere = GlobalWhere | { OR: [GlobalWhere, { createdById: string }] };

function isGlobal(source: ContentSource): boolean {
  return (GLOBAL_CONTENT_SOURCES as readonly string[]).includes(source);
}

/**
 * Deny a content source the tier switches below do not handle.
 *
 * The parameter is `never`, so a `ContentSource` that no `case` has narrowed away
 * fails to compile. That matters because `WritableTier` (`content-crud.base.ts`)
 * is `Exclude<ContentSource, 'srd'>` and widens on its own when a member is added,
 * so a new tier would otherwise reach these switches through the shared write
 * skeleton with nobody opting in. Both switches authorize by returning, so
 * falling out of one reads as a pass.
 *
 * Returns `never` rather than a message so the deny cannot be forgotten at a call
 * site, and so TypeScript treats the `default` as terminating.
 */
function denyUnknownSource(value: never): never {
  throw new ForbiddenException(`Unknown content source: ${String(value)}`);
}

/**
 * Query-layer and authorization helpers for reference content across all three
 * tiers — monsters, spells, feats, magic items (VEG-292, VEG-310). This is the
 * foundation the per-type CRUD tickets build on: they apply these where-fragments
 * to their Prisma queries and call the assert helpers before mutating a row.
 *
 * Tiers (see {@link ContentSource}):
 * - `srd`      — seed content; globally visible; immutable.
 * - `shared`   — admin-published; globally visible like SRD; any admin may edit.
 * - `homebrew` — user-authored; visible to and writable by its owner only.
 *
 * The global catalog everyone sees is `srd + shared`. The reserved `campaignId`
 * column is not consulted yet; per-campaign scoping is a deliberate future
 * extension that needs no further migration.
 */
@Injectable()
export class ContentAccessService {
  /**
   * Where-fragment matching the global catalog: SRD plus admin-published shared
   * content. Visible to everyone, including anonymous callers.
   */
  globalWhere(): GlobalWhere {
    return { contentSource: { in: [...GLOBAL_CONTENT_SOURCES] } };
  }

  /**
   * Where-fragment matching everything `userId` may read: the global catalog
   * plus their own homebrew. An anonymous caller sees the global catalog only.
   */
  visibleTo(userId?: string): VisibleWhere {
    if (!userId) return this.globalWhere();
    return { OR: [this.globalWhere(), { createdById: userId }] };
  }

  /** Whether `userId` may read `row` (global content, or their own homebrew). */
  canRead(row: OwnedContentRow, userId?: string): boolean {
    if (isGlobal(row.contentSource)) return true;
    return userId !== undefined && row.createdById === userId;
  }

  /**
   * Authorize a create/update/delete against an existing `row`:
   * - `srd`      → never (seed content is immutable).
   * - `shared`   → any admin (admin-curated global catalog).
   * - `homebrew` → only the owner (admins do NOT get write access to user homebrew).
   *
   * Throws {@link ForbiddenException} otherwise.
   */
  assertWritable(row: OwnedContentRow, actor: ContentActor): void {
    switch (row.contentSource) {
      case 'srd':
        throw new ForbiddenException('SRD content cannot be modified');
      case 'shared':
        if (!actor.isAdmin) {
          throw new ForbiddenException('Only an admin can modify shared content');
        }
        return;
      case 'homebrew':
        if (row.createdById !== actor.userId) {
          throw new ForbiddenException('You can only modify your own homebrew content');
        }
        return;
      default:
        denyUnknownSource(row.contentSource);
    }
  }

  /**
   * Authorize creating content of a given source:
   * - `srd`      → never (only the seed creates SRD rows).
   * - `shared`   → admins only.
   * - `homebrew` → any authenticated user (for themselves).
   *
   * Throws {@link ForbiddenException} otherwise.
   */
  assertCanCreate(contentSource: ContentSource, actor: ContentActor): void {
    switch (contentSource) {
      case 'srd':
        throw new ForbiddenException('SRD content can only be created by the seed');
      case 'shared':
        if (!actor.isAdmin) {
          throw new ForbiddenException('Only an admin can publish shared content');
        }
        return;
      case 'homebrew':
        return;
      default:
        denyUnknownSource(contentSource);
    }
  }
}
