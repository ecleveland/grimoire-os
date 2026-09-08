import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, SrdClass } from '@prisma/client';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from './content-crud.base';
import { ClassFeatureDto, CreateClassDto } from './dto/create-class.dto';
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

/** Copy for a repeated (name, level) pairing, shared by both write paths. */
const DUPLICATE_FEATURE_MESSAGE =
  'Two features share a name at the same level; each pairing must be unique';

/** A normalized `ClassFeature` row, parent id excluded. */
interface FeatureRow {
  name: string;
  level: number;
  description: string;
}

/**
 * Pull the normalized feature list off column data, leaving the parent columns
 * behind. `undefined` means the request said nothing about features; an array
 * (possibly empty) means replace the lot.
 *
 * Mutates rather than returning a copy so there is exactly one object in play:
 * a `{ rest, features }` split would leave the caller free to write the wrong
 * half, and `features` reaching `srdClass.update` as a column is a Prisma error
 * at best and a silent nested write at worst.
 */
function takeFeatures(data: ColumnData): FeatureRow[] | undefined {
  const rows = data.features;
  // Always drop the key, even when the value is undefined: `features` reaching
  // `srdClass.update` as a scalar column is a Prisma error at best and a silent
  // nested write at worst, and an undefined own-key is still an own key.
  delete data.features;
  return rows === undefined ? undefined : (rows as FeatureRow[]);
}

/**
 * Whether a Prisma error is a unique violation on the class_features index
 * rather than on the parent class's name.
 *
 * `level` is the discriminator because none of the class-name indexes carry it:
 * the three partial uniques on `srd_classes` key on `name` and `createdById`
 * (VEG-505), while `class_features` keys on `[classId, name, level]`. Prisma
 * reports the field names rather than the index name — verified against a live
 * Postgres, where the duplicate raises `meta.target = ['classId','name','level']`
 * — so this reads the same list the unit spec constructs.
 */
function isFeatureConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) && target.includes('level');
}

/**
 * Refuse a feature list that repeats a (name, level) pairing.
 *
 * Mirrors the DTO's `@ArrayUnique`, for the callers that never meet it. Same
 * copy as the conflict `performUpdate` translates, so the two write paths answer
 * a duplicate feature identically instead of one of them blaming the class.
 */
function assertNoDuplicateFeatures(rows: FeatureRow[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.level}|${row.name}`;
    if (seen.has(key)) throw new ConflictException(DUPLICATE_FEATURE_MESSAGE);
    seen.add(key);
  }
}

/**
 * Normalize the DTO's feature list into insertable rows.
 *
 * `description` is optional on the DTO and NOT NULL on the column, so a missing
 * one becomes the empty string rather than reaching Prisma as undefined — a
 * half-drafted feature is a real state and should not need invented prose. A
 * null list clears every row, matching the `String[]` null-clear convention.
 *
 * Order is preserved from the payload but is not load-bearing: every read path
 * sorts by `(level, name)`.
 */
function toFeatureRows(value: ClassFeatureDto[] | null | undefined): FeatureRow[] {
  if (!value) return [];
  // Named fields, not a spread. A spread into an object literal skips
  // excess-property checking, so `tsc` cannot tell the two apart and any extra
  // key on the payload would ride through to the insert — `id` most of all,
  // which would let a caller choose a row's primary key. The DTO already
  // refuses both over HTTP; this is the copy of that rule that a seed or import
  // caller, which the write skeleton documents as bypassing the pipe, still
  // meets.
  return value.map(f => ({
    name: f.name,
    level: f.level,
    description: f.description ?? '',
  }));
}

/**
 * CRUD for user-authored (homebrew) classes (VEG-506), the first new consumer of
 * the {@link ContentCrudService} skeleton since VEG-336 held it once. The
 * authorization sequence, ownership stamp and tier-keyed error mapping all come
 * from the base; this class supplies the column mapping and the one rule a class
 * delete needs.
 *
 * Features are child `ClassFeature` rows written in the same request (VEG-507),
 * which makes this the first consumer of the skeleton's `performUpdate` seam.
 * Subclasses still arrive with VEG-509.
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
   * Turn the normalized feature list into Prisma's nested-create form.
   *
   * Not done in {@link toColumnData}, which is handed a `CreateClassDto |
   * UpdateClassDto` and cannot tell which: the update path needs the same rows
   * as a plain array so {@link performUpdate} can delete-then-insert them, and
   * a nested `create` there would append to the existing rows instead of
   * replacing them.
   *
   * An absent `features` key stays absent, so a create that says nothing about
   * features writes no child rows rather than an empty relation.
   */
  protected override beforeCreate(data: ColumnData, _actor: ContentActor): ColumnData {
    const features = takeFeatures(data);
    if (features) {
      // Same reasoning as the catch in performUpdate, applied to the path that
      // cannot catch. `create` is final, and the skeleton maps every failure
      // from it with the parent noun, so a P2002 from the nested feature insert
      // would reach the client as "you already have a class with this name" — a
      // message about the wrong entity. There is no seam to translate it after
      // the fact, so the check happens before the write instead. The DTO's
      // @ArrayUnique makes it unreachable over HTTP; the write skeleton names
      // seed and import callers as sitting outside that pipe.
      assertNoDuplicateFeatures(features);
      data.features = { create: features };
    }
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
   * all, having been asked to change two of them.
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
      const updated = await tx.srdClass.update({ where: { id }, data });
      await tx.classFeature.deleteMany({ where: { classId: id } });
      if (features.length > 0) {
        try {
          await tx.classFeature.createMany({
            // `classId` last so a row cannot override the parent id. This is
            // the second of two guards and no test distinguishes it, because
            // the first one already holds: `toFeatureRows` builds each row from
            // three named fields, so a stray `classId` never reaches here. Kept
            // because it is free and it makes the question local — under the
            // other order, whether a feature can reparent itself depends on a
            // whitelist two functions away.
            data: features.map(f => ({ ...f, classId: id })),
          });
        } catch (err) {
          // Unreachable through the HTTP boundary today: the DTO's @ArrayUnique
          // rejects a payload that repeats a (name, level) pair, and the
          // deleteMany above clears the only other rows the index could collide
          // with. Kept because `update` maps every failure with the parent's
          // noun, so without this a duplicate *feature* would reach the client
          // as "you already have a class with this name" — a message about the
          // wrong entity is worse than no message. Anything already an
          // HttpException passes through mapWriteError untouched.
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
