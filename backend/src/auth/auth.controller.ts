import { Controller, Post, Body, HttpCode, HttpStatus, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AUTH_COOKIE_NAME, authCookieOptions, clearAuthCookieOptions } from './auth-cookie.config';

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
    description: 'Sets an httpOnly access_token cookie and returns the public user',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { access_token, user } = await this.authService.login(
      loginDto.username,
      loginDto.password
    );
    res.cookie(AUTH_COOKIE_NAME, access_token, authCookieOptions());
    return { user };
  }

  @Post('register')
  @Throttle({ default: { limit: REGISTER_LIMIT, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User created; sets an httpOnly access_token cookie and returns the public user',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    await this.usersService.create({
      username: registerDto.username,
      password: registerDto.password,
      displayName: registerDto.displayName,
      email: registerDto.email,
    });
    const { access_token, user } = await this.authService.login(
      registerDto.username,
      registerDto.password
    );
    res.cookie(AUTH_COOKIE_NAME, access_token, authCookieOptions());
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear the auth cookie' })
  @ApiResponse({ status: 204, description: 'Logged out' })
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions());
  }
}
