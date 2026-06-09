import { IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SetActiveDto {
  @ApiProperty({ example: false })
  // Restore the raw body value: without this, the global pipe's
  // enableImplicitConversion coerces any non-empty string (including 'false')
  // to true before @IsBoolean runs. The transform's `value` is already coerced;
  // only `obj` still holds the original.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.isActive)
  @IsBoolean()
  isActive!: boolean;
}
