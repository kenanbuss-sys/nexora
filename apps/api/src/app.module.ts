import type { OnApplicationShutdown } from '@nestjs/common';
import { Inject, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { Env } from '@nexora/config';
import { loadEnv } from '@nexora/config';
import type { PrismaClient } from '@nexora/db';
import { createDb } from '@nexora/db';
import { OrganizationService, TenantService } from '@nexora/domain-core';
import { RoleService, UserService } from '@nexora/domain-iam';
import type { IdentityPort } from '@nexora/tenancy';
import { DevIdentityAdapter } from '@nexora/tenancy';
import Redis from 'ioredis';
import { AuthGuard, IDENTITY_PORT, PRISMA } from './auth/auth.guard';
import { PermissionsGuard, ROLE_SERVICE } from './auth/permissions.guard';
import { CanonicalErrorFilter } from './common/domain-error.filter';
import { HEALTH_SERVICE, HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { MeController, RolesController, USER_SERVICE, UsersController } from './iam/iam.controller';
import {
  ORGANIZATION_SERVICE,
  OrganizationController,
} from './organization/organization.controller';
import {
  TENANT_SERVICE,
  TenantController,
  TenantsAdminController,
} from './tenants/tenants.controller';

export const ENV = 'ENV';
export const REDIS = 'REDIS';

@Module({
  controllers: [
    HealthController,
    TenantsAdminController,
    TenantController,
    OrganizationController,
    UsersController,
    RolesController,
    MeController,
  ],
  providers: [
    { provide: ENV, useFactory: (): Env => loadEnv() },
    {
      provide: PRISMA,
      useFactory: (env: Env): PrismaClient =>
        createDb({ connectionString: env.DATABASE_URL, max: 5 }),
      inject: [ENV],
    },
    {
      provide: REDIS,
      useFactory: (env: Env): Redis =>
        new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }),
      inject: [ENV],
    },
    {
      provide: IDENTITY_PORT,
      useFactory: (env: Env): IdentityPort => {
        if (env.AUTH_MODE === 'oidc') {
          throw new Error(
            'AUTH_MODE=oidc is not implemented yet; the OIDC adapter arrives in a later sprint',
          );
        }
        return new DevIdentityAdapter(env.DEV_AUTH_SECRET);
      },
      inject: [ENV],
    },
    {
      provide: TENANT_SERVICE,
      useFactory: (prisma: PrismaClient) => new TenantService(prisma),
      inject: [PRISMA],
    },
    {
      provide: ORGANIZATION_SERVICE,
      useFactory: (prisma: PrismaClient) => new OrganizationService(prisma),
      inject: [PRISMA],
    },
    {
      provide: USER_SERVICE,
      useFactory: (prisma: PrismaClient) => new UserService(prisma),
      inject: [PRISMA],
    },
    {
      provide: ROLE_SERVICE,
      useFactory: (prisma: PrismaClient) => new RoleService(prisma),
      inject: [PRISMA],
    },
    {
      provide: HEALTH_SERVICE,
      useFactory: (prisma: PrismaClient, redis: Redis): HealthService =>
        new HealthService(
          {
            ping: async () => {
              await prisma.$queryRaw`SELECT 1`;
            },
          },
          {
            ping: async () => {
              await redis.ping();
            },
          },
        ),
      inject: [PRISMA, REDIS],
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: CanonicalErrorFilter },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
    this.redis.disconnect();
  }
}
