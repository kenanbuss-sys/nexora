import { Module } from '@nestjs/common';
import type { Env } from '@nexora/config';
import { loadEnv } from '@nexora/config';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { HEALTH_SERVICE, HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

export const ENV = 'ENV';
export const PG_POOL = 'PG_POOL';
export const REDIS = 'REDIS';

// Note (Sprint 000): the platform standard for persistence is PostgreSQL +
// Prisma (docs/architecture/00_DECISIONS_LOCKED.md); schema and migrations
// live in /prisma. Sprint 000 has no domain models yet, so the only database
// access is this infrastructure health ping over the raw driver. Domain code
// from Sprint 001 onward uses the generated Prisma client, never this pool.
@Module({
  controllers: [HealthController],
  providers: [
    { provide: ENV, useFactory: (): Env => loadEnv() },
    {
      provide: PG_POOL,
      useFactory: (env: Env): Pool =>
        new Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 2_000 }),
      inject: [ENV],
    },
    {
      provide: REDIS,
      useFactory: (env: Env): Redis =>
        new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }),
      inject: [ENV],
    },
    {
      provide: HEALTH_SERVICE,
      useFactory: (pool: Pool, redis: Redis): HealthService =>
        new HealthService(
          {
            ping: async () => {
              await pool.query('SELECT 1');
            },
          },
          {
            ping: async () => {
              await redis.ping();
            },
          },
        ),
      inject: [PG_POOL, REDIS],
    },
  ],
})
export class AppModule {}
