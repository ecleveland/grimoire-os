import { Injectable } from '@nestjs/common';
import { Feat, Prisma } from '@prisma/client';
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
   * Normalize a DTO into Prisma column data. `repeatable` is a
   * non-nullable column, so a null clear (the client's way of resetting an
   * optional field, VEG-316) becomes its false default; `benefits` is a
   * nullable Json column, where Prisma requires an explicit DbNull instead of
   * plain null. Blank `prerequisite`/`category` strings (reachable only via
   * raw API writes — the form already clears to null) normalize to null so
   * the hasPrerequisite/category filters cannot mis-bucket them.
   */
  protected toColumnData(dto: CreateFeatDto | UpdateFeatDto): ColumnData {
    // Copy so the caller's DTO is never mutated. Reserved ownership/tier
    // columns are stripped by the base, not here.
    const data: ColumnData = { ...dto };
    if ('repeatable' in data && data.repeatable === null) data.repeatable = false;
    if ('benefits' in data && data.benefits === null) data.benefits = Prisma.DbNull;
    if (typeof data.prerequisite === 'string' && !data.prerequisite.trim()) {
      data.prerequisite = null;
    }
    if (typeof data.category === 'string' && !data.category.trim()) data.category = null;
    return data;
  }
}
