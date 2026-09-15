import { BadRequestException, Injectable } from '@nestjs/common';
import { Subclass } from '@prisma/client';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from './content-crud.base';
import { ContentActor } from './content-access.service';
import {
  lockFeatureParent,
  nestFeaturesForCreate,
  replaceFeatures,
  takeFeatures,
  toFeatureRows,
} from './feature-rows';
import { CreateSubclassDto } from './dto/create-subclass.dto';
import { UpdateSubclassDto } from './dto/update-subclass.dto';

/** Refusal for a parent the author cannot use, whether it is hidden or missing. */
const PARENT_NOT_VISIBLE_MESSAGE = 'Parent class not found or not accessible';

/**
 * CRUD for user-authored (homebrew) subclasses. The authorization
 * skeleton lives in {@link ContentCrudService}; this class supplies the column
 * mapping, the feature replacement it shares with
 * {@link HomebrewClassesService}, and the one rule a subclass adds.
 *
 * That rule: `classId` must name a class visible to the author (SRD,
 * admin-published shared, or their own homebrew). The lookup is
 * visibility-scoped, so another owner's homebrew class is simply unresolvable,
 * rejected as 400 with the same copy as a nonexistent id, leaking nothing. It is
 * checked on create only, because the parent is fixed there: `UpdateSubclassDto`
 * omits `classId`, so there is no second write that could move a subclass across
 * the boundary this decides.
 *
 * Reads are already scoped two hops (the subclass's tier AND its parent class's)
 * in {@link SrdService.visibleSubclassWhere}, which is what stops a subclass
 * written under a visible parent from leaking when that parent is not.
 */
@Injectable()
export class HomebrewSubclassesService extends ContentCrudService<
  Subclass,
  CreateSubclassDto,
  UpdateSubclassDto
> {
  protected readonly tier = 'homebrew' as const;
  protected readonly noun = 'subclass';

  protected get delegate(): ContentWriteDelegate<Subclass> {
    return this.prisma.subclass;
  }

  /**
   * Authorize the parent, then reshape the features for Prisma's nested-create
   * form; {@link nestFeaturesForCreate} says why the reshaping happens here.
   */
  protected override async beforeCreate(
    data: ColumnData,
    actor: ContentActor
  ): Promise<ColumnData> {
    await this.assertParentClassVisible(data.classId, actor);
    nestFeaturesForCreate(data);
    return data;
  }

  /**
   * Drop both ways a payload can name a new parent: the `classId` scalar and the
   * `srdClass` relation form (`srdClass: { connect: { id } }`), which sets the
   * same column without the string `classId` appearing anywhere, the reason the
   * base strips `createdBy` alongside `createdById`. The DTO omits both and the
   * global pipe has `forbidNonWhitelisted`, so an HTTP caller gets a 400 before
   * reaching here; this is the copy of that rule for the seed and import callers
   * the write skeleton documents as sitting outside the pipe. Without it a
   * reparent would move the row under a class the create-time check never saw.
   */
  protected override beforeUpdate(data: ColumnData): ColumnData {
    delete data.classId;
    delete data.srdClass;
    return data;
  }

  /**
   * Replace the subclass's features in the same transaction as the parent
   * update. See {@link replaceFeatures} for why the list is replaced whole
   * rather than merged, and {@link lockFeatureParent} for why the lock is taken
   * first; {@link HomebrewClassesService.performUpdate} records what unstable
   * feature ids cost the print tray, which holds for these rows too.
   *
   * Returns the row the parent update produced, per the hook's contract, and
   * without its features, because the delegate's `create` cannot include them
   * and POST and PATCH have to agree on what a subclass response carries.
   */
  protected override async performUpdate(id: string, data: ColumnData): Promise<Subclass> {
    const features = takeFeatures(data);
    if (!features) return this.delegate.update({ where: { id }, data });

    return this.prisma.$transaction(async tx => {
      await lockFeatureParent(tx, 'subclasses', id);
      const updated = await tx.subclass.update({ where: { id }, data });
      await replaceFeatures(tx.subclassFeature, 'subclassId', id, features);
      return updated;
    });
  }

  /**
   * Normalize a DTO into Prisma column data.
   *
   * Short, because a subclass has four writable columns and none of them is a
   * non-nullable array or a Json blob: `description` is genuinely nullable, and
   * a blank string normalizes to null so an empty editor field and a cleared one
   * store the same thing.
   *
   * `features` is normalized into a plain row array and reshaped for Prisma by
   * whichever hook runs next, since create and update need different shapes.
   */
  protected toColumnData(dto: CreateSubclassDto | UpdateSubclassDto): ColumnData {
    // Copy so the caller's DTO is never mutated. Reserved ownership/tier columns
    // are stripped by the base, not here.
    const data: ColumnData = { ...dto };

    // `name` is required and non-nullable; a null clear (valid for optional
    // fields) would otherwise reach Prisma and 500.
    if ('name' in data && data.name === null) {
      throw new BadRequestException('Name cannot be cleared');
    }
    if (typeof data.description === 'string' && !data.description.trim()) {
      data.description = null;
    }
    // Keyed on the VALUE, never on `'features' in data`. A pipe-produced
    // CreateSubclassDto carries every declared field as an own key holding
    // undefined (ES2023 [[Define]] semantics on class fields), so a presence
    // check would read "the client sent features" on every create. The longer
    // note in {@link HomebrewClassesService.toColumnData} has the measurement
    // and says why the update path must not lean on `PartialType` behaving
    // differently.
    //
    // undefined -> absent, leave the rows alone. null -> clear them. An array
    // replaces them.
    if (dto.features !== undefined) data.features = toFeatureRows(dto.features);
    else delete data.features;
    return data;
  }

  /**
   * Require the parent class to be visible to the author (SRD, admin-published
   * shared, or their own homebrew). The visibility-scoped lookup means another
   * owner's homebrew class and an id that never existed are indistinguishable:
   * both 400 with the same copy, so nothing here confirms a class exists.
   */
  private async assertParentClassVisible(classId: unknown, actor: ContentActor): Promise<void> {
    // Refused before the query, not by it. Prisma drops an undefined `id` from
    // the where clause, so a create with no parent would match the first class
    // the actor can see, and a non-string reaches the query as a filter object
    // rather than an id. Same copy as a parent that does not resolve, so the
    // cases stay one answer.
    if (typeof classId !== 'string' || !classId) {
      throw new BadRequestException(PARENT_NOT_VISIBLE_MESSAGE);
    }

    const parent = await this.prisma.srdClass.findFirst({
      where: { id: classId, ...this.contentAccess.visibleTo(actor.userId) },
      select: { id: true },
    });
    if (!parent) {
      throw new BadRequestException(PARENT_NOT_VISIBLE_MESSAGE);
    }
  }
}
