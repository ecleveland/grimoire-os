import { IsArray, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNonBlankString } from '../../../common/validators/non-blank-string.decorator';

export class CreateLootTemplateRowDto {
  @ApiProperty({ example: 'merchant' })
  @IsNonBlankString()
  profession!: string;

  @ApiProperty({ example: '0-4' })
  @IsNonBlankString()
  crBucket!: string;

  @ApiProperty({ example: { gp: '2d6' }, description: 'Coinage dice by denomination' })
  @IsObject({ message: 'coinage must be an object' })
  coinage!: Record<string, unknown>;

  @ApiProperty({ example: [{ name: 'ledger', chance: 0.5 }], description: 'Item drop entries' })
  @IsArray({ message: 'items must be an array' })
  items!: unknown[];
}
