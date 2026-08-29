import type { OnApplicationShutdown } from '@nestjs/common';
import { Inject, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { Env } from '@nexora/config';
import { loadEnv } from '@nexora/config';
import type { PrismaClient } from '@nexora/db';
import { createDb } from '@nexora/db';
import {
  ConfigurationService,
  OrganizationService,
  TaskService,
  TenantService,
} from '@nexora/domain-core';
import { DocumentTemplateService } from '@nexora/domain-doc';
import { PartyService } from '@nexora/domain-mdm';
import { CatalogService } from '@nexora/domain-pim';
import { InventoryService } from '@nexora/domain-wms';
import { ApprovalService, RuleService as WfRuleService, WorkflowService } from '@nexora/domain-wf';
import { RoleService, UserService } from '@nexora/domain-iam';
import type { IdentityPort } from '@nexora/tenancy';
import { DevIdentityAdapter } from '@nexora/tenancy';
import Redis from 'ioredis';
import { AuthGuard, IDENTITY_PORT, PRISMA } from './auth/auth.guard';
import { PermissionsGuard, ROLE_SERVICE } from './auth/permissions.guard';
import { CanonicalErrorFilter } from './common/domain-error.filter';
import { HEALTH_SERVICE, HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { CONFIGURATION_SERVICE, ConfigController } from './config/config.controller';
import { PartiesController, PARTY_SERVICE } from './mdm/mdm.controller';
import { INVENTORY_SERVICE, StockController, WarehousesController } from './wms/wms.controller';
import {
  BarcodesController,
  CATALOG_SERVICE,
  ProductsController,
  SkusController,
} from './pim/pim.controller';
import { DocumentTemplatesController, TEMPLATE_SERVICE } from './documents/templates.controller';
import { MeController, RolesController, USER_SERVICE, UsersController } from './iam/iam.controller';
import {
  APPROVAL_SERVICE,
  InboxController,
  NotificationsController,
  TASK_SERVICE,
  TasksController,
} from './tasks/tasks.controller';
import {
  ApprovalsController,
  RulesController as WfRulesController,
  WF_RULE_SERVICE,
  WorkflowsController,
  WORKFLOW_SERVICE,
} from './workflow/workflow.controller';
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
    ConfigController,
    TasksController,
    InboxController,
    NotificationsController,
    WorkflowsController,
    WfRulesController,
    ApprovalsController,
    DocumentTemplatesController,
    PartiesController,
    ProductsController,
    SkusController,
    BarcodesController,
    WarehousesController,
    StockController,
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
      provide: CONFIGURATION_SERVICE,
      useFactory: (prisma: PrismaClient) => new ConfigurationService(prisma),
      inject: [PRISMA],
    },
    {
      provide: TASK_SERVICE,
      useFactory: (prisma: PrismaClient) => new TaskService(prisma),
      inject: [PRISMA],
    },
    {
      provide: WORKFLOW_SERVICE,
      useFactory: (prisma: PrismaClient) => new WorkflowService(prisma),
      inject: [PRISMA],
    },
    {
      provide: WF_RULE_SERVICE,
      useFactory: (prisma: PrismaClient) => new WfRuleService(prisma),
      inject: [PRISMA],
    },
    {
      provide: APPROVAL_SERVICE,
      useFactory: (prisma: PrismaClient) => new ApprovalService(prisma),
      inject: [PRISMA],
    },
    {
      provide: TEMPLATE_SERVICE,
      useFactory: (prisma: PrismaClient) => new DocumentTemplateService(prisma),
      inject: [PRISMA],
    },
    {
      provide: PARTY_SERVICE,
      useFactory: (prisma: PrismaClient) => new PartyService(prisma),
      inject: [PRISMA],
    },
    {
      provide: CATALOG_SERVICE,
      useFactory: (prisma: PrismaClient) => new CatalogService(prisma),
      inject: [PRISMA],
    },
    {
      provide: INVENTORY_SERVICE,
      useFactory: (prisma: PrismaClient, catalog: CatalogService) =>
        new InventoryService(prisma, {
          getSkuState: (tenantId, skuId) => catalog.getSkuState(tenantId, skuId),
        }),
      inject: [PRISMA, CATALOG_SERVICE],
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
