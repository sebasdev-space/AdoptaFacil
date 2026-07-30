import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const origins = config
    .get('API_CORS_ORIGIN', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  // Render (and most PaaS) inject PORT and require the app to bind to it;
  // API_PORT stays the source of truth for local dev (docker-compose has no PORT).
  const port = process.env.PORT
    ? Number(process.env.PORT)
    : config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`AdoptaFácil API listening on http://0.0.0.0:${port}`);
}

void bootstrap();
