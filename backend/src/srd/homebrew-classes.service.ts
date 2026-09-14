import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, SrdClass } from '@prisma/client';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from './content-crud.base';
import {
  lockFeatureParent,
  nestFeaturesForCreate,
  replaceFeatures,
  takeFeatures,
  toFeatureRows,
} from './feature-rows';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { ContentActor } from './content-access.service';

/** `numSkillChoices` is `Int @default(2)`; a null clear resets to that. */
const DEFAULT_NUM_SKILL_CHOICES = 2;

/** Non-nullable `String[]` columns: a null clear becomes the empty default. */
const STRING_ARRAY_COLUMNS = [
  'primaryAbilities',
  'savingThrows',
  'armorProficiencies',
  'weaponProficiencies',
  'skillChoices',
  'toolProficiencies',
] as const;

/** Nullable `Json?` columns: Prisma wants DbNull, not a plain null. */
const JSON_COLUMNS = ['spellcasting', 'equipmentChoices', 'multiclassing'] as const;

/**
 * CRUD for user-authored (homebrew) classes (VEG-506), the first new consumer of
 * the {@link ContentCrudService} skeleton since VEG-336 held it once. The
 * authorization sequence, ownership stamp and tier-keyed error mapping all come
 * from the base; this class supplies the column mapping and the one rule a class
 * delete needs.
 *
 * Features are child `ClassFeature` rows written in the same request (VEG-507),
 * which makes this the first consumer of the skeleton's `performUpdate` seam.
 * {@link HomebrewSubclassesService} shares that feature handling
 * through `feature-rows.ts`.
 */
@Injectable()
export class HomebrewClassesService extends ContentCrudService<
  SrdClass,
  CreateClassDto,
  UpdateClassDto
> {
  protected readonly tier = 'homebrew' as const;
  protected readonly noun = 'class';

  protected get delegate(): ContentWriteDelegate<SrdClass> {
    return this.prisma.srdClass;
  }

  /**
   * Turn the normalized feature list into Prisma's nested-create form, refusing a
   * duplicate (name, level) before the write. {@link nestFeaturesForCreate} says
   * why both happen here rather than in {@link toColumnData} or after the insert.
   */
  protected override beforeCreate(data: ColumnData, _actor: ContentActor): ColumnData {
    nestFeaturesForCreate(data);
    return data;
  }

  /**
   * Replace the class's features in the same transaction as the parent update.
   *
   * Full replacement, not a merge — see the `features` docs on
   * {@link CreateClassDto}. Delete-then-insert rather than a diff: the row's
   * only natural key is `(name, level)`, so a rename is indistinguishable from
   * a delete plus an add and any merge would have to guess which the author
   * meant.
   *
   * Feature ids are therefore not stable across a write, and one consumer does
   * hold them across one: the print tray persists `{ type, id }` pairs to
   * localStorage indefinitely (`print-tray-context.tsx:137`). A class feature
   * toggled into the tray and then edited by its owner leaves behind an id that
   * no longer resolves, and `hydrateFeatures` drops unresolvable ids silently,
   * so the card disappears from `/srd/print` without explanation. That is the
   * accepted cost of replacement over merge — a merge would have to guess
   * whether a changed name is an edit or a delete plus an add — and it is
   * bounded to the owner's own tray entries for the class they just edited.
   * Recorded rather than papered over: stable ids would need a client-supplied
   * key on each row, which is a design change and not a fix.
   *
   * The transaction is what makes the replacement safe: without it a failure
   * between the delete and the insert would leave the class with no features at
   * all, having been asked to change two of them. The row lock taken first is
   * what keeps two overlapping replacements from merging; see
   * {@link lockFeatureParent}.
   *
   * Returns the row the parent update produced, per the hook's contract — not a
   * re-read, and not the row `update` authorized, either of which would serve
   * the caller state it just replaced. Features are deliberately not included:
   * the delegate's `create` cannot include them, so including them here would
   * make POST and PATCH disagree about what a class response contains.
   */
  protected override async performUpdate(id: string, data: ColumnData): Promise<SrdClass> {
    const features = takeFeatures(data);
    if (!features) return this.delegate.update({ where: { id }, data });

    return this.prisma.$transaction(async tx => {
      await lockFeatureParent(tx, 'srd_classes', id);
      const updated = await tx.srdClass.update({ where: { id }, data });
      await replaceFeatures(tx.classFeature, 'classId', id, features);
      return updated;
    });
  }

  /**
   * Refuse to delete a class that still has subclasses, rather than cascading.
   *
   * The database already refuses: `subclasses_classId_fkey` is ON DELETE RESTRICT
   * (the original schema migration), so the delete raises P2003. What was missing
   * is that P2003 is not one of the codes `mapWriteError` translates, so the
   * refusal reached the client as an opaque 500. Both halves below answer 409.
   *
   * The pre-check exists for the message, not for the guarantee: it can say how
   * many subclasses are in the way, which the constraint cannot. The constraint is
   * what actually holds the line, because read-committed isolation lets a subclass
   * be inserted between the count and the delete. That is why this is a check plus
   * a mapped catch rather than a transaction: wrapping both in one would not close
   * the race (a concurrent insert commits independently), so it would buy nothing
   * but the appearance of atomicity.
   */
  protected override async performDelete(id: string): Promise<void> {
    const blocking = await this.prisma.subclass.count({ where: { classId: id } });
    if (blocking > 0) {
      const plural = blocking === 1 ? 'subclass' : 'subclasses';
      throw new ConflictException(
        `This class still has ${blocking} ${plural}. Delete ${blocking === 1 ? 'it' : 'them'} first.`
      );
    }

    try {
      await this.delegate.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          'A subclass was added while this class was being deleted; refresh and try again'
        );
      }
      throw err;
    }
  }

  /**
   * Normalize a DTO into Prisma column data.
   *
   * The null-clear convention (VEG-316) means the client sends null to reset an
   * optional field, so every non-nullable column needs its null mapped to that
   * column's default: the string arrays to `[]` and `numSkillChoices` to 2. The
   * three `Json?` columns are nullable but need `Prisma.DbNull`, since Prisma
   * rejects a plain null there. `subclassLevel` is genuinely nullable, so its null
   * passes through untouched — a class with no subclass level is a real state.
   *
   * `features` is normalized here into a plain row array and reshaped for Prisma
   * by whichever hook runs next, since create and update need different shapes.
   * A null clears the list, the same convention the six `String[]` columns above
   * follow.
   */
  protected toColumnData(dto: CreateClassDto | UpdateClassDto): ColumnData {
    // Copy so the caller's DTO is never mutated. Reserved ownership/tier columns
    // are stripped by the base, not here.
    const data: ColumnData = { ...dto };

    // `name` is required and non-nullable; a null clear (valid for optional fields)
    // would otherwise reach Prisma and 500.
    if ('name' in data && data.name === null) {
      throw new BadRequestException('Name cannot be cleared');
    }

    for (const column of STRING_ARRAY_COLUMNS) {
      if (column in data && data[column] === null) data[column] = [];
    }
    if ('numSkillChoices' in data && data.numSkillChoices === null) {
      data.numSkillChoices = DEFAULT_NUM_SKILL_CHOICES;
    }
    for (const column of JSON_COLUMNS) {
      if (column in data && data[column] === null) data[column] = Prisma.DbNull;
    }
    if (typeof data.description === 'string' && !data.description.trim()) {
      data.description = null;
    }
    // Keyed on the VALUE, never on `'features' in data`. Under `target: ES2023`
    // TypeScript gives declared class fields [[Define]] semantics, so a
    // pipe-produced CreateClassDto carries `features` as an OWN key holding
    // undefined even when the body never mentioned it — measured, not assumed.
    // A presence check therefore reads "the client sent features" on every
    // single create. Today that only writes an empty nested relation, a Prisma
    // no-op. On the update path it would mean `deleteMany` on every unrelated
    // PATCH, wiping a class's whole feature list; that path is safe right now
    // only because `PartialType` happens to emit a class with no field
    // declarations, which is an accident of a library and not a decision anyone
    // recorded. Reading the value makes the rule independent of both.
    //
    // undefined -> absent, leave the rows alone. null -> clear them. An array
    // replaces them.
    if (dto.features !== undefined) data.features = toFeatureRows(dto.features);
    else delete data.features;
    return data;
  }
}
