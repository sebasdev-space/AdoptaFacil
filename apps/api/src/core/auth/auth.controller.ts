import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type {
  AuthSession,
  AuthTokens,
  AuthenticatedUser,
  LoginDto,
  LogoutDto,
  PasswordResetRequestDto,
  RefreshDto,
  RegisterOrganizationDto,
  RegisterPersonDto,
} from '@adoptafacil/contracts';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { RequestUser } from './auth.types';
import {
  loginSchema,
  logoutSchema,
  passwordResetRequestSchema,
  refreshSchema,
  registerOrganizationSchema,
  registerPersonSchema,
} from './auth.schemas';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Auth endpoints. Rate limiting (ThrottlerGuard) is scoped to this controller —
 * the sensitive credential/token endpoints get a tighter per-IP budget so
 * brute-force and abuse are throttled without limiting the rest of the API.
 */
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register/organization')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  registerOrganization(
    @Body(new ZodValidationPipe(registerOrganizationSchema)) dto: RegisterOrganizationDto,
  ): Promise<AuthSession> {
    return this.auth.registerOrganization(dto);
  }

  @Post('register/person')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  registerPerson(
    @Body(new ZodValidationPipe(registerPersonSchema)) dto: RegisterPersonDto,
  ): Promise<AuthSession> {
    return this.auth.registerPerson(dto);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto): Promise<AuthSession> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('password-reset')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestPasswordReset(
    @Body(new ZodValidationPipe(passwordResetRequestSchema)) dto: PasswordResetRequestDto,
  ): Promise<void> {
    await this.auth.requestPasswordReset(dto.email);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: RequestUser): Promise<AuthenticatedUser> {
    return this.auth.getAuthenticatedUser(user);
  }
}
