import { Injectable } from '@nestjs/common';
import { Feat, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentAccessService } from './content-access.service';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from './content-crud.base';
import { CreateFeatDto } from './dto/create-feat.dto';
import { UpdateFeatDto } from './dto/update-feat.dto';

/**
 * CRUD for user-authored (homebrew) feats (VEG-295). The authorization skeleton
 * lives in {@link ContentCrudService}; this class supplies the feat column
 * mapping and the referential cleanup a feat delete needs.
 */
@Injectable()
export class HomebrewFeatsService extends ContentCrudService<Feat, CreateFeatDto, UpdateFeatDto> {
  protected readonly tier = 'homebrew' as const;
  protected readonly noun = 'feat';

  constructor(prisma: PrismaService, contentAccess: ContentAccessService) {
    super(prisma, contentAccess);
  }

  protected get delegate(): ContentWriteDelegate<Feat> {
    return this.prisma.feat;
  }

  /**
   * The Background→originFeat FK is SET NULL, which nulls only the id on delete;
   * the sibling originFeatOption would be left orphaned (an option is meaningless
   * without a feat — VEG-431). Clear it in the same transaction so a failed
   * delete can't half-update referencing rows.
   */
  protected override async performDelete(id: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      await tx.background.updateMany({
        where: { originFeatId: id },
        data: { originFeatOption: null },
      });
      await tx.feat.delete({ where: { id } });
    });
  }

  /**
   * Map a DTO onto Prisma column data, dropping anything that is not a plain
   * feat column — ownership/tier/source fields can never be set by clients,
   * even if a raw payload sneaks past DTO validation. `repeatable` is a
   * non-nullable column, so a null clear (the client's way of resetting an
   * optional field, VEG-316) becomes its false default; `benefits` is a
   * nullable Json column, where Prisma requires an explicit DbNull instead of
   * plain null. Blank `prerequisite`/`category` strings (reachable only via
   * raw API writes — the form already clears to null) normalize to null so
   * the hasPrerequisite/category filters cannot mis-bucket them.
   */
  protected toColumnData(dto: CreateFeatDto | UpdateFeatDto): ColumnData {
    const {
      contentSource: _contentSource,
      createdById: _createdById,
      campaignId: _campaignId,
      source: _source,
      id: _id,
      ...data
    } = dto as ColumnData;
    if ('repeatable' in data && data.repeatable === null) data.repeatable = false;
    if ('benefits' in data && data.benefits === null) data.benefits = Prisma.DbNull;
    if (typeof data.prerequisite === 'string' && !data.prerequisite.trim()) {
      data.prerequisite = null;
    }
    if (typeof data.category === 'string' && !data.category.trim()) data.category = null;
    return data;
  }
}
