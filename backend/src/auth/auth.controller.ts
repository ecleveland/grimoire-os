import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AUTH_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  authCookieOptions,
  clearAuthCookieOptions,
  clearRefreshCookieOptions,
  refreshCookieOptions,
} from './auth-cookie.config';
import {
  CSRF_COOKIE_NAME,
  clearCsrfCookieOptions,
  csrfCookieOptions,
  generateCsrfToken,
} from './csrf-cookie.config';
import { SkipCsrf } from './guards/csrf.guard';

// Per-endpoint throttle defaults are tighter than the global limit because
// login/register are abuse-prone. THROTTLE_AUTH_LIMIT lifts both for trusted
// environments (E2E suite) without weakening production defaults.
const authOverride = process.env.THROTTLE_AUTH_LIMIT
  ? parseInt(process.env.THROTTLE_AUTH_LIMIT, 10)
  : null;
const LOGIN_LIMIT = authOverride ?? 5;
const REGISTER_LIMIT = authOverride ?? 3;
const REFRESH_LIMIT = authOverride ?? 30;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private refreshTokenService: RefreshTokenService
  ) {}

  @Post('login')
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60000 } })
  @ApiOperation({ summary: 'Log in with username and password' })
  @ApiResponse({
    status: 200,
    description: 'Sets httpOnly access_token and refresh_token cookies and returns the public user',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { access_token, user } = await this.authService.login(
      loginDto.username,
      loginDto.password
    );
    const { token: refresh_token } = await this.refreshTokenService.issue(user.id);
    // Opportunistic cleanup of expired refresh-token rows (VEG-317).
    // Fire-and-forget: this is pure housekeeping, so the login response must not
    // wait on an unbounded DELETE, and lost cleanup is fine — the next login
    // retries. Failures only log.
    void this.refreshTokenService
      .purgeExpired()
      .catch((err: unknown) =>
        this.logger.warn(
          `Expired refresh-token purge failed: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined
        )
      );
    res.cookie(AUTH_COOKIE_NAME, access_token, authCookieOptions());
    res.cookie(REFRESH_COOKIE_NAME, refresh_token, refreshCookieOptions());
    res.cookie(CSRF_COOKIE_NAME, generateCsrfToken(), csrfCookieOptions());
    return { user };
  }

  @Post('register')
  @SkipCsrf()
  @Throttle({ default: { limit: REGISTER_LIMIT, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User created; sets access and refresh cookies and returns the public user',
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
    const { token: refresh_token } = await this.refreshTokenService.issue(user.id);
    res.cookie(AUTH_COOKIE_NAME, access_token, authCookieOptions());
    res.cookie(REFRESH_COOKIE_NAME, refresh_token, refreshCookieOptions());
    res.cookie(CSRF_COOKIE_NAME, generateCsrfToken(), csrfCookieOptions());
    return { user };
  }

  @Post('refresh')
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: REFRESH_LIMIT, ttl: 60000 } })
  @ApiOperation({ summary: 'Rotate refresh + access tokens' })
  @ApiResponse({
    status: 200,
    description: 'Issues a fresh access and refresh cookie pair and returns the public user',
  })
  @ApiResponse({ status: 401, description: 'Missing/invalid/expired/reused refresh token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof presented !== 'string' || presented.length === 0) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const { token: newRefresh, userId } = await this.refreshTokenService.rotate(presented);
    const { access_token, user } = await this.authService.signAccessTokenForUserId(userId);
    res.cookie(AUTH_COOKIE_NAME, access_token, authCookieOptions());
    res.cookie(REFRESH_COOKIE_NAME, newRefresh, refreshCookieOptions());
    res.cookie(CSRF_COOKIE_NAME, generateCsrfToken(), csrfCookieOptions());
    return { user };
  }

  @Post('logout')
  @SkipCsrf()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the refresh token and clear auth cookies' })
  @ApiResponse({ status: 204, description: 'Logged out' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const presented: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof presented === 'string' && presented.length > 0) {
      try {
        await this.refreshTokenService.revoke(presented);
      } catch {
        // Logout must succeed from the client's perspective even if the DB
        // hiccups — the cookies will still be cleared below.
      }
    }
    res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions());
    res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
    res.clearCookie(CSRF_COOKIE_NAME, clearCsrfCookieOptions());
  }
}
