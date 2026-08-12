import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type {
  AuthSession,
  AuthTokens,
  AuthenticatedUser,
  LoginDto,
  LogoutDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RefreshDto,
  RegisterOrganizationDto,
  RegisterPersonDto,
} from '@adoptafacil/contracts';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { RequestUser } from './auth.types';
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from './refresh-cookie.util';
import {
  loginSchema,
  logoutSchema,
  passwordResetConfirmSchema,
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
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
  ) {}

  // Same source as auth.config.ts's loadAuthConfig() — kept a plain env read
  // (not a ConfigService injection) to match that existing convention.
  private get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private mirrorRefreshCookie(res: Response, refreshToken: string): void {
    setRefreshCookie(res, refreshToken, this.authConfig.refreshTtlSeconds, this.isProduction);
  }

  @Post('register/organization')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async registerOrganization(
    @Body(new ZodValidationPipe(registerOrganizationSchema)) dto: RegisterOrganizationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const session = await this.auth.registerOrganization(dto);
    this.mirrorRefreshCookie(res, session.tokens.refreshToken);
    return session;
  }

  @Post('register/person')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async registerPerson(
    @Body(new ZodValidationPipe(registerPersonSchema)) dto: RegisterPersonDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const session = await this.auth.registerPerson(dto);
    this.mirrorRefreshCookie(res, session.tokens.refreshToken);
    return session;
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const session = await this.auth.login(dto);
    this.mirrorRefreshCookie(res, session.tokens.refreshToken);
    return session;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    const tokens = await this.auth.refresh(dto.refreshToken);
    this.mirrorRefreshCookie(res, tokens.refreshToken);
    return tokens;
  }

  /**
   * Cookie-only bootstrap refresh (T-session-persistence): the ONLY endpoint
   * that reads the httpOnly `af_refresh` cookie instead of a request body — it
   * exists so a hard reload / new tab can silently resume a session without
   * ever putting a token in page-readable storage. Never an error response:
   * "no cookie" / "cookie invalid or expired" both resolve to `null`, which
   * the frontend treats identically to "start at the login screen."
   */
  @Post('refresh/silent')
  @HttpCode(200)
  async refreshSilent(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    // `null` is a real JSON value ("no session"), but Nest's automatic
    // passthrough serialization treats a `null`/`undefined` return as
    // "nothing to send" and leaves the body empty — so every branch here
    // writes the response explicitly instead of relying on the return value.
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof refreshToken !== 'string' || !refreshToken) {
      res.json(null);
      return;
    }
    try {
      const tokens = await this.auth.refresh(refreshToken);
      this.mirrorRefreshCookie(res, tokens.refreshToken);
      res.json(tokens);
    } catch {
      clearRefreshCookie(res, this.isProduction);
      res.json(null);
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(dto.refreshToken);
    clearRefreshCookie(res, this.isProduction);
  }

  @Post('password-reset')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestPasswordReset(
    @Body(new ZodValidationPipe(passwordResetRequestSchema)) dto: PasswordResetRequestDto,
  ): Promise<void> {
    await this.auth.requestPasswordReset(dto.email);
  }

  // Consume the single-use token from the emailed link and set the new password.
  // Tightly throttled (like the request endpoint) to blunt brute-forcing the
  // token. 204 on success; a bad/expired/used token → generic 400.
  @Post('password-reset/confirm')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async confirmPasswordReset(
    @Body(new ZodValidationPipe(passwordResetConfirmSchema)) dto: PasswordResetConfirmDto,
  ): Promise<void> {
    await this.auth.confirmPasswordReset(dto.token, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: RequestUser): Promise<AuthenticatedUser> {
    return this.auth.getAuthenticatedUser(user);
  }
}
