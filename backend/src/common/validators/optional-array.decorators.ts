import { applyDecorators } from '@nestjs/common';
import { ArrayUnique, IsString, ValidateIf } from 'class-validator';
import { IsEachInCatalog } from './is-each-in-catalog.decorator';
import { IsStrictArray } from './is-strict-array.decorator';

/**
 * The optionality rule shared by every non-null `String[]` column: an absent key
 * is fine, an explicit null is not.
 *
 * `@IsOptional()` can't express that — it skips every constraint for null as
 * well as undefined — and null is not a legal value for these columns. Left
 * alone it reaches Prisma and 500s; coerced to `[]` it silently erases whatever
 * the row held, which is how a client that serialises unset optional fields as
 * null could wipe a character's proficiencies and get a 200 back. Clearing stays
 * available, explicitly, as `[]`.
 *
 * Note this must be declared on the class that PATCH actually validates:
 * `PartialType` (`@nestjs/swagger`) re-applies `@IsOptional()` to every property
 * it inherits, and class-validator requires all conditional-validation metadata
 * to agree before it validates — so the most permissive condition wins and a
 * base-class `@ValidateIf` is silently defeated. UpdateCharacterDto therefore
 * omits these fields from the type it extends and redeclares them.
 */
const OptionalButNotNull = () => ValidateIf((_object, value) => value !== undefined);

/**
 * A closed-catalog proficiency array: `skills`, `savingThrows`.
 *
 * Absent is fine; null, a non-array, a duplicate, and an unknown name are all
 * 400s that name what was wrong.
 */
export function IsCatalogArray(catalog: readonly string[], noun: string): PropertyDecorator {
  return applyDecorators(OptionalButNotNull(), ArrayUnique(), IsEachInCatalog(catalog, noun));
}

/**
 * A free-text string array on a non-null column: `languages`, `proficiencies`,
 * `armorTraining`. Same null and shape rules as {@link IsCatalogArray}, without
 * the catalog.
 */
export function IsOptionalStringArray(): PropertyDecorator {
  return applyDecorators(OptionalButNotNull(), IsStrictArray(), IsString({ each: true }));
}
