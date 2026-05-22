import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenResponseDto } from './dto/access-token-response.dto';

// Per-endpoint throttle defaults are tighter than the global limit because
// login/register are abuse-prone. THROTTLE_AUTH_LIMIT lifts both for trusted
// environments (E2E suite) without weakening production defaults.
const authOverride = process.env.THROTTLE_AUTH_LIMIT
  ? parseInt(process.env.THROTTLE_AUTH_LIMIT, 10)
  : null;
const LOGIN_LIMIT = authOverride ?? 5;
const REGISTER_LIMIT = authOverride ?? 3;

@ApiTags('Auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60000 } })
  @ApiOperation({ summary: 'Log in with username and password' })
  @ApiResponse({
    status: 200,
    description: 'Returns access token',
    type: AccessTokenResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.username, loginDto.password);
  }

  @Post('register')
  @Throttle({ default: { limit: REGISTER_LIMIT, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User created, returns access token',
    type: AccessTokenResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async register(@Body() registerDto: RegisterDto) {
    await this.usersService.create({
      username: registerDto.username,
      password: registerDto.password,
      displayName: registerDto.displayName,
      email: registerDto.email,
    });
    return this.authService.login(registerDto.username, registerDto.password);
  }
}
