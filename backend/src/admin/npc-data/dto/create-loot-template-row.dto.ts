import { IsArray, IsObject, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLootTemplateRowDto {
  @ApiProperty({ example: 'merchant' })
  @IsString()
  @Matches(/\S/, { message: 'profession is required' })
  profession!: string;

  @ApiProperty({ example: '0-4' })
  @IsString()
  @Matches(/\S/, { message: 'crBucket is required' })
  crBucket!: string;

  @ApiProperty({ example: { gp: '2d6' }, description: 'Coinage dice by denomination' })
  @IsObject({ message: 'coinage must be an object' })
  coinage!: Record<string, unknown>;

  @ApiProperty({ example: [{ name: 'ledger', chance: 0.5 }], description: 'Item drop entries' })
  @IsArray({ message: 'items must be an array' })
  items!: unknown[];
}
