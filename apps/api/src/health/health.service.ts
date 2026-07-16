import { Injectable } from '@nestjs/common';
import type { HealthStatus } from '@adoptafacil/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthStatus> {
    const [dbUp, redisUp] = await Promise.all([this.prisma.ping(), this.redis.ping()]);
    return {
      status: dbUp && redisUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
    };
  }
}
