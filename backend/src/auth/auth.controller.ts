import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginResponseDto } from './dto/login-response.dto';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 24 * 60 * 60 * 1000, // 24h
};

@ApiTags('Auth')
@Controller('auth')
@Public()
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Log in with username and password' })
  @ApiResponse({
    status: 200,
    description: 'Returns user info and sets httpOnly auth cookie',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { access_token, user } = await this.authService.login(
      loginDto.username,
      loginDto.password,
    );
    res.cookie('token', access_token, COOKIE_OPTIONS);
    return user;
  }

  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User created, returns user info and sets httpOnly auth cookie',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.usersService.create({
      username: registerDto.username,
      password: registerDto.password,
      displayName: registerDto.displayName,
      email: registerDto.email,
    });
    const { access_token, user } = await this.authService.login(
      registerDto.username,
      registerDto.password,
    );
    res.cookie('token', access_token, COOKIE_OPTIONS);
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out and clear auth cookie' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    });
    return { message: 'Logged out successfully' };
  }
}
