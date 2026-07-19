import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Append-only audit (RNF04). `@Global` so any module can inject
 * {@link AuditService} to record events without importing this module.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
