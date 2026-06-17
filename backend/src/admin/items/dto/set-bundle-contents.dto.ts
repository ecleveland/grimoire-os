import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

/** One component line of a pack bundle: a catalog item id with a quantity. */
export class BundleContentEntryDto {
  @ApiProperty({ format: 'uuid', description: 'Catalog item id of the component' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ example: 10, minimum: 1, description: 'How many of the component the pack holds' })
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity!: number;
}

/**
 * Body for replacing an equipment pack's contents (VEG-309). The full desired
 * set is sent and the service rewrites the bundle entries (delete + recreate),
 * mirroring the seed's idempotent two-pass bundle write. An empty array clears
 * the pack. The array is capped so a payload cannot smuggle unbounded entries.
 */
export class SetBundleContentsDto {
  @ApiProperty({ type: [BundleContentEntryDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BundleContentEntryDto)
  contents!: BundleContentEntryDto[];
}
