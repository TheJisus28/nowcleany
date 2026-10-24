import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { Permission, Public } from '../../../platform/security/decorators.js';
import type { ProfileView } from '../users/user-view.js';
import { type AuthResult, AuthService } from './auth.service.js';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto.js';

// Brute-force protection on the credential endpoints (per client IP).
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly currentActor: CurrentActor,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto): Promise<AuthResult> {
    return this.auth.login(body.email, body.password);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: RefreshTokenDto): Promise<AuthResult> {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: RefreshTokenDto): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  @ApiBearerAuth()
  @Permission('profile:read')
  @Get('me')
  me(): Promise<ProfileView> {
    return this.auth.profile(this.currentActor.require().id);
  }
}
