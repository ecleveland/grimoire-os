import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Background, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentAccessService, ContentActor } from './content-access.service';
import { HOMEBREW_SOURCE_LABEL, mapWriteError } from './homebrew-write.helpers';
import { CreateBackgroundDto } from './dto/create-background.dto';
import { UpdateBackgroundDto } from './dto/update-background.dto';

/**
 * CRUD for user-authored (homebrew) backgrounds (VEG-431), following the
 * {@link HomebrewFeatsService} pattern. Authorization is delegated to
 * {@link ContentAccessService}: any authenticated user may create homebrew for
 * themselves; rows are writable per their tier (owner for homebrew, admins for
 * shared, never for SRD).
 *
 * The one background-specific rule: `originFeatId` may reference an SRD feat
 * or one of the actor's own homebrew feats. The lookup is visibility-scoped
 * (`visibleTo`), so another owner's homebrew feat is simply unresolvable —
 * rejected as 400 without leaking its existence.
 */
@Injectable()
export class HomebrewBackgroundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentAccess: ContentAccessService
  ) {}

  async create(dto: CreateBackgroundDto, actor: ContentActor): Promise<Background> {
    this.contentAccess.assertCanCreate('homebrew', actor);
    const data = this.toColumnData(dto);
    // A create that sets no feat can't carry an option for it (an update may:
    // option-only PATCHes retarget the option of the already-linked feat).
    if (data.originFeatId == null) data.originFeatOption = null;
    await this.assertOriginFeatVisible(data, actor);

    try {
      return await this.prisma.background.create({
        data: {
          ...data,
          source: HOMEBREW_SOURCE_LABEL,
          contentSource: 'homebrew',
          createdById: actor.userId,
        } as Prisma.BackgroundUncheckedCreateInput,
      });
    } catch (err) {
      mapWriteError(err, 'homebrew', 'background');
    }
  }

  async update(id: string, dto: UpdateBackgroundDto, actor: ContentActor): Promise<Background> {
    const row = await this.findWritableRow(id, actor);
    const data = this.toColumnData(dto);
    await this.assertOriginFeatVisible(data, actor);

    try {
      return await this.prisma.background.update({
        where: { id },
        data: data as Prisma.BackgroundUpdateInput,
      });
    } catch (err) {
      mapWriteError(err, row.contentSource, 'background');
    }
  }

  async remove(id: string, actor: ContentActor): Promise<void> {
    const row = await this.findWritableRow(id, actor);
    try {
      await this.prisma.background.delete({ where: { id } });
    } catch (err) {
      mapWriteError(err, row.contentSource, 'background');
    }
  }

  /**
   * Load the row and authorize the write. Rows the actor cannot even read
   * (someone else's homebrew) 404 rather than 403 so their existence does not
   * leak; visible-but-immutable rows (SRD, shared for non-admins) 403.
   */
  private async findWritableRow(id: string, actor: ContentActor): Promise<Background> {
    const row = await this.prisma.background.findUnique({ where: { id } });
    if (!row || !this.contentAccess.canRead(row, actor.userId)) {
      throw new NotFoundException('Background not found');
    }
    this.contentAccess.assertWritable(row, actor);
    return row;
  }

  /**
   * When the write sets an origin feat, require it to be visible to the actor
   * (SRD, shared, or their own homebrew — VEG-431 AC). The visibility-scoped
   * lookup means a foreign homebrew feat and a nonexistent id are
   * indistinguishable: both 400 with the same copy, leaking nothing. Skipped
   * when the key is absent (PATCH leaves the link untouched) or null (clear).
   */
  private async assertOriginFeatVisible(
    data: Record<string, unknown>,
    actor: ContentActor
  ): Promise<void> {
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
   * Map a DTO onto Prisma column data, dropping anything that is not a plain
   * background column — ownership/tier/source fields can never be set by
   * clients, even if a raw payload sneaks past DTO validation. `languages` and
   * the string-array columns are non-nullable, so a null clear (the client's
   * way of resetting an optional field, VEG-316) becomes their empty default.
   * Blank optional strings (reachable only via raw API writes — the form
   * already clears to null) normalize to null. Clearing `originFeatId` also
   * clears `originFeatOption` — an option without a feat is meaningless — and
   * an option supplied on a write that carries no feat id is dropped the same
   * way.
   */
  private toColumnData(dto: CreateBackgroundDto | UpdateBackgroundDto): Record<string, unknown> {
    const {
      contentSource: _contentSource,
      createdById: _createdById,
      campaignId: _campaignId,
      source: _source,
      id: _id,
      ...data
    } = dto as Record<string, unknown>;

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
