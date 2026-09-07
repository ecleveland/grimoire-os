import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, SrdClass } from '@prisma/client';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from './content-crud.base';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

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
 * A class created here has no features and no subclasses. Those arrive with
 * VEG-507 and VEG-509.
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
    return data;
  }
}
