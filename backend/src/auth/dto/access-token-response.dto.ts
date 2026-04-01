import { ApiProperty } from '@nestjs/swagger';
import { AccessTokenResponse } from '@grimoire-os/shared';

export class AccessTokenResponseDto implements AccessTokenResponse {
  @ApiProperty()
  access_token!: string;
}
