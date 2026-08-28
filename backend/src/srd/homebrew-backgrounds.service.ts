import { BadRequestException, Injectable } from '@nestjs/common';
import { Background } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentAccessService, ContentActor } from './content-access.service';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from './content-crud.base';
import { CreateBackgroundDto } from './dto/create-background.dto';
import { UpdateBackgroundDto } from './dto/update-background.dto';

/**
 * CRUD for user-authored (homebrew) backgrounds (VEG-431). The authorization
 * skeleton lives in {@link ContentCrudService}; this class supplies the column
 * mapping and the background-specific origin-feat rules.
 *
 * The one background-specific rule: `originFeatId` may reference any feat
 * visible to the actor — SRD, admin-published shared, or their own homebrew.
 * The lookup is visibility-scoped (`visibleTo`), so another owner's homebrew
 * feat is simply unresolvable — rejected as 400 without leaking its existence.
 *
 * The "option never without a feat" invariant is enforced in three places
 * that must stay in sync: the create hook, the row-aware update hook, and
 * toColumnData's explicit-null clear (plus the feat-delete cleanup in
 * {@link HomebrewFeatsService.performDelete}).
 */
@Injectable()
export class HomebrewBackgroundsService extends ContentCrudService<
  Background,
  CreateBackgroundDto,
  UpdateBackgroundDto
> {
  protected readonly tier = 'homebrew' as const;
  protected readonly noun = 'background';

  constructor(prisma: PrismaService, contentAccess: ContentAccessService) {
    super(prisma, contentAccess);
  }

  protected get delegate(): ContentWriteDelegate<Background> {
    return this.prisma.background;
  }

  protected override async beforeCreate(data: ColumnData, actor: ContentActor): Promise<void> {
    // A create that sets no feat can't carry an option for it (an update may:
    // option-only PATCHes retarget the option of the already-linked feat).
    if (data.originFeatId == null) data.originFeatOption = null;
    await this.assertOriginFeatVisible(data, actor);
  }

  /**
   * Row-aware siblings of the create guard (option ⇒ feat, see toColumnData):
   * an option-only PATCH may retarget the option of an already-linked feat,
   * but on a row with no linked feat it would persist an orphan — and a
   * PATCH that retargets the feat without resending the option must not
   * carry the OLD feat's option onto the new one.
   */
  protected override async beforeUpdate(
    data: ColumnData,
    row: Background,
    actor: ContentActor
  ): Promise<void> {
    if (data.originFeatId === undefined && row.originFeatId === null) {
      if ('originFeatOption' in data) data.originFeatOption = null;
    }
    if (
      typeof data.originFeatId === 'string' &&
      data.originFeatId !== row.originFeatId &&
      !('originFeatOption' in data)
    ) {
      data.originFeatOption = null;
    }
    await this.assertOriginFeatVisible(data, actor);
  }

  /**
   * When the write sets an origin feat, require it to be visible to the actor
   * (SRD, shared, or their own homebrew — VEG-431 AC). The visibility-scoped
   * lookup means a foreign homebrew feat and a nonexistent id are
   * indistinguishable: both 400 with the same copy, leaking nothing. Skipped
   * when the key is absent (PATCH leaves the link untouched) or null (clear).
   */
  private async assertOriginFeatVisible(data: ColumnData, actor: ContentActor): Promise<void> {
    const originFeatId = data.originFeatId;
    if (originFeatId === undefined || originFeatId === null) return;

    const feat = await this.prisma.feat.findFirst({
      where: { id: originFeatId as string, ...this.contentAccess.visibleTo(actor.userId) },
    });
    if (!feat) {
      throw new BadRequestException('Origin feat not found or not accessible');
    }
  }

  /**
   * Normalize a DTO into Prisma column data. `languages` and
   * the string-array columns are non-nullable, so a null clear (the client's
   * way of resetting an optional field, VEG-316) becomes their empty default.
   * Blank optional strings (reachable only via raw API writes — the form
   * already clears to null) normalize to null. Clearing `originFeatId` (an
   * explicit null) also clears `originFeatOption` — an option without a feat
   * is meaningless. Writes that omit the feat id entirely are handled by the
   * create/update hooks, which know whether a feat is (or stays) linked.
   */
  protected toColumnData(dto: CreateBackgroundDto | UpdateBackgroundDto): ColumnData {
    // Copy so the caller's DTO is never mutated. Reserved ownership/tier
    // columns are stripped by the base, not here.
    const data: ColumnData = { ...dto };

    // `name` is required and non-nullable; a null "clear" (valid for optional
    // fields per VEG-316) would otherwise reach Prisma and 500.
    if ('name' in data && data.name === null) {
      throw new BadRequestException('Name cannot be cleared');
    }
    if ('languages' in data && data.languages === null) data.languages = 0;
    for (const field of [
      'skillProficiencies',
      'toolProficiencies',
      'personalityTraits',
      'ideals',
      'bonds',
      'flaws',
    ]) {
      if (field in data && data[field] === null) data[field] = [];
    }
    for (const field of ['equipment', 'description', 'originFeatOption']) {
      const value = data[field];
      if (typeof value === 'string' && !value.trim()) data[field] = null;
    }
    if (data.originFeatId === null) data.originFeatOption = null;
    return data;
  }
}
