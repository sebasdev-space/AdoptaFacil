import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AUTH_CONFIG, loadAuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * M02 authentication. Registers a GLOBAL JwtModule (so the tenant middleware and
 * the guard can verify access tokens anywhere) and a per-IP throttler used by
 * the auth controller. In-memory throttler storage is fine for Ola 0; a Redis
 * store would be swapped in for multi-instance deployments.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({ secret: loadAuthConfig().jwtSecret }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
  ],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: loadAuthConfig },
    PasswordService,
    TokenService,
    AuthService,
    JwtAuthGuard,
  ],
  exports: [AUTH_CONFIG, JwtAuthGuard],
})
export class AuthModule {}
