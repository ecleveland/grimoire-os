import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { classFeatureIdentity } from '@grimoire-os/shared';
import { ClassFeatureDto, MAX_CLASS_FEATURES } from './create-class.dto';

/**
 * Body for creating a homebrew subclass (VEG-509). Ownership and tier columns
 * are never accepted from the client; {@link ContentCrudService} stamps
 * `contentSource: 'homebrew'` and the actor's `createdById`, and strips those
 * keys from the payload regardless.
 *
 * `classId` is the one field with a rule of its own: the parent must be a class
 * the author can see (SRD, admin-published shared, or their own homebrew), which
 * {@link HomebrewSubclassesService} checks against the database. It is required,
 * and only on create. A subclass cannot be reparented afterwards, so
 * {@link UpdateSubclassDto} omits it.
 *
 * `spellList` and `spellcasting` are on the table but not here. The seed writes
 * them for the SRD rows; accepting them from an author means validating two more
 * Json shapes, and the editor offers neither.
 *
 * `features` are written as child `SubclassFeature` rows in the same request,
 * with the same PATCH semantics as a class's: the array is a full replacement,
 * omitting the key leaves the existing rows alone, and `[]` or `null` clears
 * them. Both write responses carry the subclass row without its features; re-read
 * `GET /srd/subclasses/:id` for those.
 */
export class CreateSubclassDto {
  @ApiProperty({ example: 'Path of Ash' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ format: 'uuid', description: 'The class this subclass hangs off' })
  @IsUUID()
  classId!: string;

  @ApiPropertyOptional({ example: 'Barbarians who burn what they cannot carry.' })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ApiPropertyOptional({
    type: [ClassFeatureDto],
    description:
      'Per-level features. Replaces the subclass’s existing features outright; ' +
      'omit to leave them alone, send [] or null to clear them.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CLASS_FEATURES)
  // `@ValidateNested({ each: true })` does not reject an element that is itself
  // an array: it treats one as a nested collection and validates its members, so
  // `features: [[]]` passes every constraint below with nothing to check.
  // `@IsObject` excludes arrays, which closes it.
  @IsObject({ each: true })
  // Rejects here what the [subclassId, name, level] index would reject at the
  // write, so the author gets a 400 naming the field rather than a duplicate
  // -*subclass*-name conflict from the shared error mapper, which keys
  // everything to the parent noun.
  @ArrayUnique(classFeatureIdentity)
  @ValidateNested({ each: true })
  @Type(() => ClassFeatureDto)
  // `| null` because null is a real, tested input here, not a stray: it is how
  // the client clears the list (VEG-316).
  features?: ClassFeatureDto[] | null;
}
