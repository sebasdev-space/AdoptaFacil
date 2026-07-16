import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.validation';
import { REDIS_CLIENT, RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis => {
        const url = config.get('REDIS_URL', { infer: true });
        // lazyConnect keeps boot resilient when Redis is not yet up; the health
        // probe triggers the actual connection.
        return new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 2,
          enableOfflineQueue: true,
        });
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
