import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context.service';

/**
 * Wires the multi-tenant request context. It is `@Global` so any module
 * (notably the global PrismaModule) can inject {@link TenantContextService}
 * without importing this module explicitly, and it applies
 * {@link TenantContextMiddleware} to every route so a tenant context is
 * established for the whole request pipeline.
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
