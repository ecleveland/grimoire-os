import { ForbiddenException, Injectable } from '@nestjs/common';
import { ContentSource } from '@grimoire-os/shared';

/** Minimal view of a content row needed to authorize reads/writes against it. */
export interface OwnedContentRow {
  contentSource: ContentSource;
  createdById: string | null;
}

export type SrdOnlyWhere = { contentSource: ContentSource };
export type VisibleWhere = SrdOnlyWhere | { OR: [SrdOnlyWhere, { createdById: string }] };

/**
 * Query-layer and authorization helpers for reference content that can originate
 * from either the SRD seed or a user — monsters, spells, feats, magic items
 * (VEG-292). This is the foundation the per-type homebrew CRUD tickets build on:
 * they apply these where-fragments to their Prisma queries and call the assert
 * helpers before mutating a row.
 *
 * Visibility model — per-user homebrew library: SRD content is visible to
 * everyone; a user's homebrew is visible only to that user, across all of their
 * campaigns. The reserved `campaignId` column is not consulted yet; per-campaign
 * scoping is a deliberate future extension that needs no further migration.
 */
@Injectable()
export class HomebrewContentService {
  /**
   * Where-fragment matching SRD content only. Use for the public, cached
   * `/srd/*` catalog so user homebrew never leaks into anonymous responses.
   */
  srdOnly(): SrdOnlyWhere {
    return { contentSource: 'srd' };
  }

  /**
   * Where-fragment matching everything `userId` may read: all SRD content plus
   * their own homebrew. An anonymous caller (no `userId`) sees SRD only.
   */
  visibleTo(userId?: string): VisibleWhere {
    if (!userId) return this.srdOnly();
    return { OR: [{ contentSource: 'srd' }, { createdById: userId }] };
  }

  /** Whether `userId` may read `row` under the per-user visibility model. */
  canRead(row: OwnedContentRow, userId?: string): boolean {
    return row.contentSource === 'srd' || (userId !== undefined && row.createdById === userId);
  }

  /**
   * Authorize a create/update/delete against `row`. SRD rows are immutable (no
   * one edits seed content); homebrew rows may only be written by their owner.
   * Throws {@link ForbiddenException} otherwise.
   */
  assertWritable(row: OwnedContentRow, userId: string): void {
    if (row.contentSource === 'srd') {
      throw new ForbiddenException('SRD content cannot be modified');
    }
    if (row.createdById !== userId) {
      throw new ForbiddenException('You can only modify your own homebrew content');
    }
  }
}
