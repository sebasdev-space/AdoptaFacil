import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './core/auth/auth.module';
import { TenantModule } from './core/tenant/tenant.module';
import { HealthModule } from './health/health.module';
import { NotificationModule } from './notifications/notification.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queues/queue.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // The single .env lives at the repo root; also allow a package-local one.
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), '..', '..', '.env')],
    }),
    // AuthModule registers the global JwtModule, so it is imported before
    // TenantModule whose middleware verifies the access token to resolve the
    // tenant. TenantModule is in turn before PrismaModule so its global
    // TenantContextService is available for PrismaService injection.
    AuthModule,
    TenantModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    NotificationModule,
    HealthModule,
  ],
})
export class AppModule {}
