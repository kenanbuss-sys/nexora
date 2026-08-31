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
import { PricingService, QuoteService } from '@nexora/domain-cpq';
import { CrmService } from '@nexora/domain-crm';
import { DeviceService } from '@nexora/domain-dev';
import { PartyService } from '@nexora/domain-mdm';
import { OrderService } from '@nexora/domain-oms';
import { CatalogService } from '@nexora/domain-pim';
import { VerificationService } from '@nexora/domain-ver';
import { InventoryService, WmsOrderService } from '@nexora/domain-wms';
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
import {
  DEVICE_SERVICE,
  DevicesController,
  ScanEventsController,
  VERIFICATION_SERVICE,
} from './dev/dev.controller';
import {
  CRM_SERVICE,
  CrmAccountsController,
  CrmActivitiesController,
  CrmLeadsController,
  CrmOpportunitiesController,
} from './crm/crm.controller';
import {
  PRICING_SERVICE,
  PriceListsController,
  QUOTE_SERVICE,
  QuotesController,
} from './cpq/cpq.controller';
import { WMS_ORDER_SERVICE, WmsOrdersController } from './wms/orders.controller';
import { ORDER_SERVICE, OrdersController } from './oms/orders.controller';
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
    WmsOrdersController,
    DevicesController,
    ScanEventsController,
    CrmAccountsController,
    CrmLeadsController,
    CrmOpportunitiesController,
    CrmActivitiesController,
    PriceListsController,
    QuotesController,
    OrdersController,
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
      provide: WMS_ORDER_SERVICE,
      useFactory: (prisma: PrismaClient, inventory: InventoryService) =>
        new WmsOrderService(prisma, inventory),
      inject: [PRISMA, INVENTORY_SERVICE],
    },
    {
      provide: DEVICE_SERVICE,
      useFactory: (prisma: PrismaClient) => new DeviceService(prisma),
      inject: [PRISMA],
    },
    {
      provide: VERIFICATION_SERVICE,
      useFactory: (prisma: PrismaClient, devices: DeviceService, catalog: CatalogService) =>
        new VerificationService(prisma, devices, {
          resolveBarcode: (tenantId, value) => catalog.resolveBarcode(tenantId, value),
        }),
      inject: [PRISMA, DEVICE_SERVICE, CATALOG_SERVICE],
    },
    {
      provide: CRM_SERVICE,
      useFactory: (prisma: PrismaClient, party: PartyService) => {
        const serviceCtx = (tenantId: string) => ({
          tenantId,
          tenantSlug: '',
          tenantStatus: 'ACTIVE' as const,
          actorType: 'SERVICE' as const,
          userId: undefined,
          userStatus: undefined,
          platformAdmin: false,
        });
        return new CrmService(prisma, {
          getPartyState: async (tenantId, partyId) => {
            try {
              const view = await party.getParty(partyId, serviceCtx(tenantId));
              return { exists: true, active: view.status === 'ACTIVE', name: view.name };
            } catch {
              return null;
            }
          },
          createOrganization: async (tenantId, name, email) => {
            const view = await party.createParty(
              { partyType: 'ORGANIZATION', name, ...(email ? { email } : {}) },
              serviceCtx(tenantId),
            );
            return { partyId: view.id };
          },
        });
      },
      inject: [PRISMA, PARTY_SERVICE],
    },
    {
      provide: PRICING_SERVICE,
      useFactory: (prisma: PrismaClient) => new PricingService(prisma),
      inject: [PRISMA],
    },
    {
      provide: QUOTE_SERVICE,
      useFactory: (
        prisma: PrismaClient,
        pricing: PricingService,
        crm: CrmService,
        approvals: ApprovalService,
        catalog: CatalogService,
      ) =>
        new QuoteService(
          prisma,
          pricing,
          { getAccountState: (t, a) => crm.getAccountState(t, a) },
          {
            requestApproval: (input, ctx) => approvals.requestApproval(input, ctx),
            getApprovalStatus: (t, id) => approvals.getApprovalStatus(t, id),
          },
          { getSkuInfo: (t, s) => catalog.getSkuInfo(t, s) },
        ),
      inject: [PRISMA, PRICING_SERVICE, CRM_SERVICE, APPROVAL_SERVICE, CATALOG_SERVICE],
    },
    {
      provide: ORDER_SERVICE,
      useFactory: (
        prisma: PrismaClient,
        crm: CrmService,
        catalog: CatalogService,
        inventory: InventoryService,
      ) =>
        new OrderService(
          prisma,
          { getAccountState: (t, a) => crm.getAccountState(t, a) },
          { getSkuInfo: (t, s) => catalog.getSkuInfo(t, s) },
          {
            reserveStock: (input, ctx) => inventory.reserveStock(input, ctx),
            releaseReservation: (id, ctx) => inventory.releaseReservation(id, ctx),
            postMovement: (input, ctx) => inventory.postMovement(input, ctx),
          },
        ),
      inject: [PRISMA, CRM_SERVICE, CATALOG_SERVICE, INVENTORY_SERVICE],
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
