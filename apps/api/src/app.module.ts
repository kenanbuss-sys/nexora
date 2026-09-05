import type { OnApplicationShutdown } from '@nestjs/common';
import { Inject, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { Env } from '@nexora/config';
import { loadEnv } from '@nexora/config';
import type { PrismaClient } from '@nexora/db';
import { createDb } from '@nexora/db';
import {
  ConfigurationService,
  ImportExportService,
  OrganizationService,
  TaskService,
  TenantService,
} from '@nexora/domain-core';
import { PdfService, DocumentTemplateService } from '@nexora/domain-doc';
import { DiscountRuleService, PricingService, QuoteService } from '@nexora/domain-cpq';
import { CrmService, Customer360Service } from '@nexora/domain-crm';
import { DeviceService } from '@nexora/domain-dev';
import { PartyService } from '@nexora/domain-mdm';
import { ReturnsService, OrderService } from '@nexora/domain-oms';
import { ProcurementService } from '@nexora/domain-proc';
import { EngineeringService } from '@nexora/domain-eng';
import { PlanningService } from '@nexora/domain-plan';
import { ShopFloorService, MesService } from '@nexora/domain-mes';
import { QualityService } from '@nexora/domain-qc';
import { FinanceService, TreasuryService } from '@nexora/domain-fin';
import { AnalyticsService } from '@nexora/domain-bi';
import { PortalService } from '@nexora/domain-b2b';
import { CollaborationService, SearchService } from '@nexora/domain-collab';
import { IntegrationService } from '@nexora/domain-int';
import { MerchandisingService, CatalogService, SubstitutionService } from '@nexora/domain-pim';
import { VerificationService } from '@nexora/domain-ver';
import { CountService, InventoryService, WmsOrderService } from '@nexora/domain-wms';
import { ApprovalService, RuleService as WfRuleService, WorkflowService } from '@nexora/domain-wf';
import {
  CredentialService,
  ServiceAccountService,
  RoleService,
  UserService,
} from '@nexora/domain-iam';
import type { IdentityPort } from '@nexora/tenancy';
import { DevIdentityAdapter } from '@nexora/tenancy';
import Redis from 'ioredis';
import { SERVICE_ACCOUNT_SERVICE, AuthGuard, IDENTITY_PORT, PRISMA } from './auth/auth.guard';
import { PermissionsGuard, ROLE_SERVICE } from './auth/permissions.guard';
import { CanonicalErrorFilter } from './common/domain-error.filter';
import { HEALTH_SERVICE, HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import {
  CONFIGURATION_SERVICE,
  ConfigController,
  VocabularyController,
} from './config/config.controller';
import { PartiesController, PARTY_SERVICE } from './mdm/mdm.controller';
import {
  DEVICE_SERVICE,
  DevicesController,
  ScanEventsController,
  VERIFICATION_SERVICE,
} from './dev/dev.controller';
import {
  CRM_SERVICE,
  CUSTOMER360_SERVICE,
  CrmAccountsController,
  CrmActivitiesController,
  CrmLeadsController,
  CrmOpportunitiesController,
} from './crm/crm.controller';
import {
  DISCOUNT_SERVICE,
  DiscountRulesController,
  PRICING_SERVICE,
  PriceListsController,
  QUOTE_SERVICE,
  QuotesController,
} from './cpq/cpq.controller';
import { WMS_ORDER_SERVICE, WmsOrdersController } from './wms/orders.controller';
import { ORDER_SERVICE, OrdersController } from './oms/orders.controller';
import { RETURNS_SERVICE, ReturnsController } from './oms/returns.controller';
import { COUNT_SERVICE, CountsController } from './wms/counts.controller';
import { DataController, IMPORT_EXPORT_SERVICE } from './data/data.controller';
import { ModulesGuard } from './auth/modules.guard';
import {
  CREDENTIAL_SERVICE,
  LocalAuthController,
  TOKEN_SIGNER,
  UserPasswordController,
  type TokenSigner,
} from './iam/local-auth.controller';
import { SHOPFLOOR_SERVICE, ShopFloorController } from './mes/shopfloor.controller';
import {
  BomsController,
  ENGINEERING_SERVICE,
  EngineeringChangesController,
  RoutingsController,
} from './eng/eng.controller';
import { PLANNING_SERVICE, PlanningController } from './plan/plan.controller';
import { MES_SERVICE, WorkOrdersController } from './mes/mes.controller';
import {
  NcrsController,
  QcInspectionsController,
  QcPlansController,
  QUALITY_SERVICE,
} from './qc/qc.controller';
import {
  FINANCE_SERVICE,
  TREASURY_SERVICE,
  TreasuryController,
  FinanceController,
} from './fin/fin.controller';
import { ANALYTICS_SERVICE, AnalyticsController } from './bi/bi.controller';
import { PORTAL_SERVICE, PortalController, PortalUsersController } from './b2b/b2b.controller';
import {
  AttachmentsController,
  COLLAB_SERVICE,
  CommentsController,
  SEARCH_SERVICE,
  SearchController,
} from './collab/collab.controller';
import { INTEGRATION_SERVICE, IntegrationsController } from './int/int.controller';
import { PDF_SERVICE, PdfController } from './documents/pdf.controller';
import {
  PlatformUsageController,
  ServiceAccountsController,
  TenantExportController,
} from './iam/service-accounts.controller';
import {
  PROCUREMENT_SERVICE,
  PurchaseOrdersController,
  RequisitionsController,
  SuppliersController,
} from './proc/proc.controller';
import { INVENTORY_SERVICE, StockController, WarehousesController } from './wms/wms.controller';
import {
  BarcodesController,
  CATALOG_SERVICE,
  MERCHANDISING_SERVICE,
  SUBSTITUTION_SERVICE,
  MerchandisingController,
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
    VocabularyController,
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
    DiscountRulesController,
    OrdersController,
    SuppliersController,
    RequisitionsController,
    PurchaseOrdersController,
    BomsController,
    RoutingsController,
    EngineeringChangesController,
    PlanningController,
    WorkOrdersController,
    QcPlansController,
    QcInspectionsController,
    NcrsController,
    FinanceController,
    TreasuryController,
    AnalyticsController,
    PortalUsersController,
    PortalController,
    CommentsController,
    AttachmentsController,
    SearchController,
    IntegrationsController,
    ServiceAccountsController,
    TenantExportController,
    PlatformUsageController,
    PdfController,
    MerchandisingController,
    ReturnsController,
    CountsController,
    ShopFloorController,
    DataController,
    LocalAuthController,
    UserPasswordController,
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
      provide: CUSTOMER360_SERVICE,
      useFactory: (prisma: PrismaClient) => new Customer360Service(prisma),
      inject: [PRISMA],
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
        discounts: DiscountRuleService,
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
          { bestDiscount: (t, a, sk, q) => discounts.bestDiscount(t, a, sk, q) },
        ),
      inject: [
        PRISMA,
        PRICING_SERVICE,
        CRM_SERVICE,
        APPROVAL_SERVICE,
        CATALOG_SERVICE,
        DISCOUNT_SERVICE,
      ],
    },
    {
      provide: DISCOUNT_SERVICE,
      useFactory: (prisma: PrismaClient) => new DiscountRuleService(prisma),
      inject: [PRISMA],
    },
    {
      provide: ORDER_SERVICE,
      useFactory: (
        prisma: PrismaClient,
        crm: CrmService,
        catalog: CatalogService,
        inventory: InventoryService,
        customer360: Customer360Service,
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
          { checkCredit: (t, a, amount) => customer360.checkCredit(t, a, amount) },
        ),
      inject: [PRISMA, CRM_SERVICE, CATALOG_SERVICE, INVENTORY_SERVICE, CUSTOMER360_SERVICE],
    },
    {
      provide: PROCUREMENT_SERVICE,
      useFactory: (
        prisma: PrismaClient,
        party: PartyService,
        approvals: ApprovalService,
        catalog: CatalogService,
        inventory: InventoryService,
        tenants: TenantService,
      ) => {
        const serviceCtx = (tenantId: string) => ({
          tenantId,
          tenantSlug: '',
          tenantStatus: 'ACTIVE' as const,
          actorType: 'SERVICE' as const,
          userId: undefined,
          userStatus: undefined,
          platformAdmin: false,
        });
        return new ProcurementService(
          prisma,
          {
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
          },
          {
            requestApproval: (input, ctx) => approvals.requestApproval(input, ctx),
            getApprovalStatus: (t, id) => approvals.getApprovalStatus(t, id),
          },
          { getSkuInfo: (t, s) => catalog.getSkuInfo(t, s) },
          { postMovement: (input, ctx) => inventory.postMovement(input, ctx) },
          {
            requisitionThreshold: async (tenantId) => {
              const { config } = await tenants.getEffectiveConfiguration(tenantId);
              const raw = (config as { approvals?: { requisitionThreshold?: unknown } })?.approvals
                ?.requisitionThreshold;
              return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;
            },
          },
        );
      },
      inject: [
        PRISMA,
        PARTY_SERVICE,
        APPROVAL_SERVICE,
        CATALOG_SERVICE,
        INVENTORY_SERVICE,
        TENANT_SERVICE,
      ],
    },
    {
      provide: ENGINEERING_SERVICE,
      useFactory: (prisma: PrismaClient, catalog: CatalogService) =>
        new EngineeringService(prisma, { getSkuInfo: (t, s) => catalog.getSkuInfo(t, s) }),
      inject: [PRISMA, CATALOG_SERVICE],
    },
    {
      provide: PLANNING_SERVICE,
      useFactory: (prisma: PrismaClient) => new PlanningService(prisma),
      inject: [PRISMA],
    },
    {
      provide: QUALITY_SERVICE,
      useFactory: (prisma: PrismaClient) => new QualityService(prisma),
      inject: [PRISMA],
    },
    {
      provide: MES_SERVICE,
      useFactory: (prisma: PrismaClient, inventory: InventoryService, quality: QualityService) =>
        new MesService(
          prisma,
          { postMovement: (input, ctx) => inventory.postMovement(input, ctx) },
          { getQcState: (t, w, s) => quality.getQcState(t, w, s) },
        ),
      inject: [PRISMA, INVENTORY_SERVICE, QUALITY_SERVICE],
    },
    {
      provide: FINANCE_SERVICE,
      useFactory: (prisma: PrismaClient) => new FinanceService(prisma),
      inject: [PRISMA],
    },
    {
      provide: TREASURY_SERVICE,
      useFactory: (prisma: PrismaClient) => new TreasuryService(prisma),
      inject: [PRISMA],
    },
    {
      provide: ANALYTICS_SERVICE,
      useFactory: (prisma: PrismaClient) => new AnalyticsService(prisma),
      inject: [PRISMA],
    },
    {
      provide: PORTAL_SERVICE,
      useFactory: (prisma: PrismaClient) => new PortalService(prisma),
      inject: [PRISMA],
    },
    {
      provide: COLLAB_SERVICE,
      useFactory: (prisma: PrismaClient, tasks: TaskService) =>
        new CollaborationService(prisma, {
          notifyMention: async (tenantId, userId, input) => {
            await tasks.notifyInTx(prisma, tenantId, {
              userId,
              type: 'mention',
              title: input.title,
              body: input.body,
              relatedObjectType: input.entityType,
              relatedObjectId: input.entityId,
            });
          },
        }),
      inject: [PRISMA, TASK_SERVICE],
    },
    {
      provide: SEARCH_SERVICE,
      useFactory: (prisma: PrismaClient) => new SearchService(prisma),
      inject: [PRISMA],
    },
    {
      provide: INTEGRATION_SERVICE,
      useFactory: (prisma: PrismaClient) => new IntegrationService(prisma),
      inject: [PRISMA],
    },
    {
      provide: SERVICE_ACCOUNT_SERVICE,
      useFactory: (prisma: PrismaClient) => new ServiceAccountService(prisma),
      inject: [PRISMA],
    },
    {
      provide: PDF_SERVICE,
      useFactory: (prisma: PrismaClient) => new PdfService(prisma),
      inject: [PRISMA],
    },
    {
      provide: MERCHANDISING_SERVICE,
      useFactory: (prisma: PrismaClient) => new MerchandisingService(prisma),
      inject: [PRISMA],
    },
    {
      provide: SUBSTITUTION_SERVICE,
      useFactory: (prisma: PrismaClient, inventory: InventoryService) =>
        new SubstitutionService(prisma, {
          totalAvailability: (tenantId, skuId) =>
            inventory.totalAvailability(skuId, {
              tenantId,
              tenantSlug: '',
              tenantStatus: 'ACTIVE',
              actorType: 'SERVICE',
              userId: undefined,
              userStatus: undefined,
              platformAdmin: false,
            }),
        }),
      inject: [PRISMA, INVENTORY_SERVICE],
    },
    {
      provide: RETURNS_SERVICE,
      useFactory: (prisma: PrismaClient, inventory: InventoryService) =>
        new ReturnsService(prisma, {
          reserveStock: (input, ctx) => inventory.reserveStock(input, ctx),
          releaseReservation: (id, ctx) => inventory.releaseReservation(id, ctx),
          postMovement: (input, ctx) => inventory.postMovement(input, ctx),
        }),
      inject: [PRISMA, INVENTORY_SERVICE],
    },
    {
      provide: COUNT_SERVICE,
      useFactory: (prisma: PrismaClient, inventory: InventoryService) =>
        new CountService(prisma, inventory),
      inject: [PRISMA, INVENTORY_SERVICE],
    },
    {
      provide: SHOPFLOOR_SERVICE,
      useFactory: (prisma: PrismaClient) => new ShopFloorService(prisma),
      inject: [PRISMA],
    },
    {
      provide: CREDENTIAL_SERVICE,
      useFactory: (prisma: PrismaClient) => new CredentialService(prisma),
      inject: [PRISMA],
    },
    {
      provide: TOKEN_SIGNER,
      useFactory: (env: Env): TokenSigner => {
        const adapter = new DevIdentityAdapter(env.DEV_AUTH_SECRET);
        return { sign: (claims) => adapter.signToken(claims) };
      },
      inject: [ENV],
    },
    {
      provide: IMPORT_EXPORT_SERVICE,
      useFactory: (
        prisma: PrismaClient,
        catalog: CatalogService,
        party: PartyService,
        crm: CrmService,
        procurement: ProcurementService,
        inventory: InventoryService,
      ) =>
        new ImportExportService(
          prisma,
          {
            createProduct: (input, ctx) => catalog.createProduct(input, ctx),
            createSku: (input, ctx) => catalog.createSku(input, ctx),
            activateSku: (skuId, ctx) => catalog.activateSku(skuId, ctx),
          },
          {
            createOrganization: async (tenantId, name, email) => {
              const view = await party.createParty(
                { partyType: 'ORGANIZATION', name, ...(email ? { email } : {}) },
                {
                  tenantId,
                  tenantSlug: '',
                  tenantStatus: 'ACTIVE',
                  actorType: 'SERVICE',
                  userId: undefined,
                  userStatus: undefined,
                  platformAdmin: false,
                },
              );
              return { partyId: view.id };
            },
            createAccount: (input, ctx) => crm.createAccount(input, ctx),
          },
          {
            createSupplier: (input, ctx) => procurement.createSupplier(input, ctx),
          },
          {
            postMovement: (input, ctx) => inventory.postMovement(input, ctx),
          },
        ),
      inject: [
        PRISMA,
        CATALOG_SERVICE,
        PARTY_SERVICE,
        CRM_SERVICE,
        PROCUREMENT_SERVICE,
        INVENTORY_SERVICE,
      ],
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
    { provide: APP_GUARD, useClass: ModulesGuard },
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
