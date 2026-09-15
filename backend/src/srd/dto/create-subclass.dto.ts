import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ClassFeatureDto, IsFeatureList } from './create-class.dto';

/**
 * Body for creating a homebrew subclass. Ownership and tier columns
 * are never accepted from the client; {@link ContentCrudService} stamps
 * `contentSource: 'homebrew'` and the actor's `createdById`, and strips those
 * keys from the payload regardless.
 *
 * `classId` is the one field with a rule of its own. The parent must be a class
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
      "Per-level features. Replaces the subclass's existing features outright; " +
      'omit to leave them alone, send [] or null to clear them.',
    // Stated here rather than read off `ArrayUnique`, because the Swagger CLI
    // plugin only sees decorators written on the property and `IsFeatureList`
    // composes that one through `applyDecorators`.
    uniqueItems: true,
  })
  @IsFeatureList()
  // `| null` because null is a real, tested input here, not a stray: it is how
  // the client clears the list.
  features?: ClassFeatureDto[] | null;
}
