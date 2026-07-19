import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { RolesGuard } from './roles.guard';

/**
 * RBAC (§13). `@Global` so {@link RolesGuard} and {@link RbacService} are
 * available to every module (each module — this app's and Fabián's — protects
 * its own endpoints with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`).
 * Imports AuthModule for the JwtAuthGuard used by this controller.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [RbacController],
  providers: [RbacService, RolesGuard],
  exports: [RbacService, RolesGuard],
})
export class RbacModule {}
