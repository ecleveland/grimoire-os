import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'gandalf' })
  @IsString()
  username!: string;

  @ApiProperty({ example: 'youshallnotpass' })
  @IsString()
  password!: string;
}
