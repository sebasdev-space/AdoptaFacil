import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from '@adoptafacil/contracts';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * GET /health → 200 { status, db, redis }.
   * Used both by orchestration and by the web walking skeleton to prove the
   * end-to-end path (browser → api → postgres/redis).
   */
  @Get()
  check(): Promise<HealthStatus> {
    return this.health.check();
  }
}
