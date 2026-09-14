import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Subclass } from '@prisma/client';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from './content-crud.base';
import { ContentActor } from './content-access.service';
import {
  DUPLICATE_FEATURE_MESSAGE,
  assertNoDuplicateFeatures,
  isFeatureConflict,
  takeFeatures,
  toFeatureRows,
} from './feature-rows';
import { CreateSubclassDto } from './dto/create-subclass.dto';
import { UpdateSubclassDto } from './dto/update-subclass.dto';

/**
 * CRUD for user-authored (homebrew) subclasses (VEG-509). The authorization
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
   * form. Both for the reasons {@link HomebrewClassesService.beforeCreate} gives:
   * the update path needs the rows as a plain array so it can delete-then-insert
   * them, and a duplicate (name, level) has to be refused before the write
   * because `create` is final and the skeleton maps its failures with the parent
   * noun.
   */
  protected override async beforeCreate(
    data: ColumnData,
    actor: ContentActor
  ): Promise<ColumnData> {
    await this.assertParentClassVisible(data.classId as string, actor);
    const features = takeFeatures(data);
    if (features) {
      assertNoDuplicateFeatures(features);
      data.features = { create: features };
    }
    return data;
  }

  /**
   * Drop any `classId` the payload carries. The DTO omits the field and the
   * global pipe has `forbidNonWhitelisted`, so an HTTP caller gets a 400 before
   * reaching here; this is the copy of that rule for the seed and import callers
   * the write skeleton documents as sitting outside the pipe. Without it a
   * reparent would move the row under a class the create-time check never saw.
   */
  protected override beforeUpdate(data: ColumnData): ColumnData {
    delete data.classId;
    return data;
  }

  /**
   * Replace the subclass's features in the same transaction as the parent
   * update, exactly as {@link HomebrewClassesService.performUpdate} does for a
   * class: full replacement rather than a merge, because the row's only natural
   * key is `(name, level)` and a rename is indistinguishable from a delete plus
   * an add. Feature ids are therefore not stable across a write, with the same
   * consequence for print-tray entries recorded there.
   *
   * The transaction is what makes the replacement safe: without it a failure
   * between the delete and the insert would leave the subclass with no features
   * at all, having been asked to change two of them.
   *
   * Returns the row the parent update produced, per the hook's contract, and
   * without its features: the delegate's `create` cannot include them, so
   * including them here would make POST and PATCH disagree about what a subclass
   * response carries.
   */
  protected override async performUpdate(id: string, data: ColumnData): Promise<Subclass> {
    const features = takeFeatures(data);
    if (!features) return this.delegate.update({ where: { id }, data });

    return this.prisma.$transaction(async tx => {
      const updated = await tx.subclass.update({ where: { id }, data });
      await tx.subclassFeature.deleteMany({ where: { subclassId: id } });
      if (features.length > 0) {
        try {
          await tx.subclassFeature.createMany({
            // `subclassId` last so a row cannot override the parent id. The
            // named-field mapping in `toFeatureRows` already holds that line;
            // this keeps the question local rather than two functions away.
            data: features.map(f => ({ ...f, subclassId: id })),
          });
        } catch (err) {
          // Unreachable through the HTTP boundary today: the DTO's @ArrayUnique
          // rejects a repeated (name, level), and the deleteMany above clears
          // the only other rows the index could collide with. Kept because
          // `update` maps every failure with the parent's noun, so without this
          // a duplicate *feature* would reach the client as "you already have a
          // subclass with this name".
          if (isFeatureConflict(err)) {
            throw new ConflictException(DUPLICATE_FEATURE_MESSAGE);
          }
          throw err;
        }
      }
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
    // fields per VEG-316) would otherwise reach Prisma and 500.
    if ('name' in data && data.name === null) {
      throw new BadRequestException('Name cannot be cleared');
    }
    if (typeof data.description === 'string' && !data.description.trim()) {
      data.description = null;
    }
    // Keyed on the VALUE, never on `'features' in data`: a pipe-produced DTO
    // carries every declared field as an own key holding undefined (ES2023
    // [[Define]] semantics on class fields), so a presence check would read
    // "the client sent features" on every write and make an unrelated PATCH
    // delete the subclass's whole feature list. See the longer note in
    // {@link HomebrewClassesService.toColumnData}.
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
  private async assertParentClassVisible(classId: string, actor: ContentActor): Promise<void> {
    // Refused before the query, not by it: Prisma drops an undefined `id` from
    // the where clause, so a create with no parent would match the first class
    // the actor can see and be authorized against a class nobody named. Same
    // copy as a parent that does not resolve, so the two are still one answer.
    if (!classId) {
      throw new BadRequestException('Parent class not found or not accessible');
    }

    const parent = await this.prisma.srdClass.findFirst({
      where: { id: classId, ...this.contentAccess.visibleTo(actor.userId) },
    });
    if (!parent) {
      throw new BadRequestException('Parent class not found or not accessible');
    }
  }
}
