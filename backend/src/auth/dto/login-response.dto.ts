import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  email?: string | null;
}
