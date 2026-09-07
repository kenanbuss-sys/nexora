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
  CustomObjectService,
} from '@nexora/domain-core';
import { ContractService, PdfService, DocumentTemplateService } from '@nexora/domain-doc';
import { EmployeeService } from '@nexora/domain-hcm';
import { AssetService } from '@nexora/domain-eam';
import {
  DiscountRuleService,
  PricingService,
  PromotionService,
  QuoteService,
} from '@nexora/domain-cpq';
import {
  OnboardingService,
  SupportCaseService,
  LoyaltyService,
  CrmService,
  Customer360Service,
  SalesTeamService,
  TerritoryService,
} from '@nexora/domain-crm';
import { DeviceService } from '@nexora/domain-dev';
import {
  MasterDataApprovalService,
  ConsentService,
  DataQualityService,
  PartyService,
  UomService,
  LocationMasterService,
} from '@nexora/domain-mdm';
import { ReturnsService, OrderService } from '@nexora/domain-oms';
import { ProcurementService, RfqService } from '@nexora/domain-proc';
import { EngineeringService } from '@nexora/domain-eng';
import { PlanningService } from '@nexora/domain-plan';
import { ShopFloorService, MesService } from '@nexora/domain-mes';
import { QualityService } from '@nexora/domain-qc';
import {
  ValuationService,
  ExchangeRateService,
  FinanceService,
  TreasuryService,
} from '@nexora/domain-fin';
import { AnalyticsService } from '@nexora/domain-bi';
import { PortalService } from '@nexora/domain-b2b';
import { CollaborationService, SearchService } from '@nexora/domain-collab';
import {
  ConnectorService,
  IntegrationService,
  fetchTransport,
  webhookAdapter,
} from '@nexora/domain-int';
import {
  SerialService,
  BundleService,
  MerchandisingService,
  CatalogService,
  PackagingService,
  SubstitutionService,
} from '@nexora/domain-pim';
import { VerificationService } from '@nexora/domain-ver';
import {
  QuarantineService,
  CountService,
  InventoryService,
  WmsOrderService,
  PackingService,
  LaborService,
} from '@nexora/domain-wms';
import { ApprovalService, RuleService as WfRuleService, WorkflowService } from '@nexora/domain-wf';
import {
  BreakGlassService,
  CredentialService,
  ServiceAccountService,
  RoleService,
  UserService,
  FieldPolicyService,
} from '@nexora/domain-iam';
import type { IdentityPort } from '@nexora/tenancy';
import { DevIdentityAdapter, OidcIdentityAdapter } from '@nexora/tenancy';
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
  CUSTOM_OBJECT_SERVICE,
  CustomObjectsController,
} from './config/config.controller';
import {
  ChangeRequestsController,
  MDM_APPROVAL_SERVICE,
  CONSENT_SERVICE,
  DATA_QUALITY_SERVICE,
  PartiesController,
  PARTY_SERVICE,
  UOM_SERVICE,
  UomsController,
  FIELD_POLICY_SERVICE,
  LOCATION_MASTER_SERVICE,
  SitesController,
} from './mdm/mdm.controller';
import {
  DEVICE_SERVICE,
  DevicesController,
  ScanEventsController,
  VERIFICATION_SERVICE,
} from './dev/dev.controller';
import { CONTRACT_SERVICE, ContractsController } from './documents/contracts.controller';
import { EMPLOYEE_SERVICE, EmployeesController } from './hcm/hcm.controller';
import { OpsController } from './health/ops.controller';
import { OpenApiController } from './health/openapi.controller';
import { ASSET_SERVICE, AssetsController } from './eam/eam.controller';
import {
  ONBOARDING_SERVICE,
  OnboardingController,
  SUPPORT_CASE_SERVICE,
  SupportCasesController,
  LOYALTY_SERVICE,
  LoyaltyController,
  CRM_SERVICE,
  CUSTOMER360_SERVICE,
  SALES_TEAM_SERVICE,
  SalesTeamsController,
  TERRITORY_SERVICE,
  TerritoriesController,
  TerritoryTeamController,
  CrmAccountsController,
  CrmActivitiesController,
  CrmLeadsController,
  CrmOpportunitiesController,
} from './crm/crm.controller';
import {
  DISCOUNT_SERVICE,
  DiscountRulesController,
  PROMOTION_SERVICE,
  PromotionsController,
  PRICING_SERVICE,
  PriceListsController,
  QUOTE_SERVICE,
  QuotesController,
} from './cpq/cpq.controller';
import { LABOR_SERVICE, WMS_ORDER_SERVICE, WmsOrdersController } from './wms/orders.controller';
import { ORDER_SERVICE, OrdersController } from './oms/orders.controller';
import { RETURNS_SERVICE, ReturnsController } from './oms/returns.controller';
import { COUNT_SERVICE, CountsController } from './wms/counts.controller';
import { DataController, IMPORT_EXPORT_SERVICE } from './data/data.controller';
import { ModulesGuard } from './auth/modules.guard';
import { StepUpGuard } from './auth/step-up.guard';
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
  VALUATION_SERVICE,
  ValuationController,
  EXCHANGE_RATE_SERVICE,
  ExchangeRatesController,
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
import {
  CONNECTOR_SERVICE,
  ConnectorsController,
  INTEGRATION_SERVICE,
  IntegrationsController,
} from './int/int.controller';
import { PDF_SERVICE, PdfController } from './documents/pdf.controller';
import {
  PlatformUsageController,
  ServiceAccountsController,
  TenantExportController,
} from './iam/service-accounts.controller';
import {
  PROCUREMENT_SERVICE,
  RFQ_SERVICE,
  RfqsController,
  PurchaseOrdersController,
  RequisitionsController,
  SuppliersController,
  FrameworkAgreementsController,
} from './proc/proc.controller';
import {
  QUARANTINE_SERVICE,
  QuarantineController,
  INVENTORY_SERVICE,
  StockController,
  WarehousesController,
  PACKING_SERVICE,
  PackagesController,
} from './wms/wms.controller';
import {
  SERIAL_SERVICE,
  BUNDLE_SERVICE,
  BarcodesController,
  CATALOG_SERVICE,
  MERCHANDISING_SERVICE,
  PACKAGING_SERVICE,
  SUBSTITUTION_SERVICE,
  MerchandisingController,
  ProductsController,
  SkusController,
} from './pim/pim.controller';
import { DocumentTemplatesController, TEMPLATE_SERVICE } from './documents/templates.controller';
import {
  BREAK_GLASS_SERVICE,
  BreakGlassController,
  MeController,
  RolesController,
  USER_SERVICE,
  UsersController,
} from './iam/iam.controller';
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
    BreakGlassController,
    UsersController,
    RolesController,
    MeController,
    ConfigController,
    CustomObjectsController,
    VocabularyController,
    TasksController,
    InboxController,
    NotificationsController,
    WorkflowsController,
    WfRulesController,
    ApprovalsController,
    DocumentTemplatesController,
    ChangeRequestsController,
    PartiesController,
    UomsController,
    SitesController,
    ProductsController,
    SkusController,
    BarcodesController,
    WarehousesController,
    StockController,
    PackagesController,
    QuarantineController,
    WmsOrdersController,
    DevicesController,
    ScanEventsController,
    CrmAccountsController,
    LoyaltyController,
    SupportCasesController,
    OnboardingController,
    ContractsController,
    EmployeesController,
    OpsController,
    OpenApiController,
    AssetsController,
    CrmLeadsController,
    CrmOpportunitiesController,
    CrmActivitiesController,
    TerritoriesController,
    SalesTeamsController,
    TerritoryTeamController,
    PriceListsController,
    QuotesController,
    DiscountRulesController,
    PromotionsController,
    OrdersController,
    SuppliersController,
    RequisitionsController,
    PurchaseOrdersController,
    RfqsController,
    FrameworkAgreementsController,
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
    ExchangeRatesController,
    ValuationController,
    AnalyticsController,
    PortalUsersController,
    PortalController,
    CommentsController,
    AttachmentsController,
    SearchController,
    IntegrationsController,
    ConnectorsController,
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
          if (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE || !env.OIDC_JWKS_URL) {
            throw new Error('AUTH_MODE=oidc needs OIDC_ISSUER, OIDC_AUDIENCE and OIDC_JWKS_URL');
          }
          return new OidcIdentityAdapter({
            issuer: env.OIDC_ISSUER,
            audience: env.OIDC_AUDIENCE,
            jwksUrl: env.OIDC_JWKS_URL,
            tenantClaim: env.OIDC_TENANT_CLAIM,
          });
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
      provide: BREAK_GLASS_SERVICE,
      useFactory: (prisma: PrismaClient) => new BreakGlassService(prisma),
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
      provide: DATA_QUALITY_SERVICE,
      useFactory: (prisma: PrismaClient) => new DataQualityService(prisma),
      inject: [PRISMA],
    },
    {
      provide: CONSENT_SERVICE,
      useFactory: (prisma: PrismaClient) => new ConsentService(prisma),
      inject: [PRISMA],
    },
    {
      provide: MDM_APPROVAL_SERVICE,
      useFactory: (prisma: PrismaClient, party: PartyService, catalog: CatalogService) =>
        new MasterDataApprovalService(
          prisma,
          {
            exists: async (tenantId, partyId) =>
              (await prisma.party.findFirst({
                where: { id: partyId, tenantId },
                select: { id: true },
              })) !== null,
            applyGovernedUpdate: (id, changes, ctx) => party.applyGovernedUpdate(id, changes, ctx),
          },
          {
            exists: async (tenantId, productId) =>
              (await prisma.product.findFirst({
                where: { id: productId, tenantId },
                select: { id: true },
              })) !== null,
            applyGovernedUpdate: (id, changes, ctx) =>
              catalog.applyGovernedUpdate(id, changes, ctx),
          },
        ),
      inject: [PRISMA, PARTY_SERVICE, CATALOG_SERVICE],
    },
    {
      provide: CATALOG_SERVICE,
      useFactory: (prisma: PrismaClient, uoms: UomService) =>
        new CatalogService(prisma, {
          assertValid: (tenantId, code) => uoms.assertValid(tenantId, code),
        }),
      inject: [PRISMA, UOM_SERVICE],
    },
    {
      provide: INVENTORY_SERVICE,
      useFactory: (prisma: PrismaClient, catalog: CatalogService) => {
        // Late binding breaks the WMS-internal cycle: inventory consults
        // quarantine for availability, quarantine posts through inventory.
        const holder: { quarantine: QuarantineService | null } = { quarantine: null };
        const inventory = new InventoryService(
          prisma,
          { getSkuState: (tenantId, skuId) => catalog.getSkuState(tenantId, skuId) },
          {
            activeHeld: (t, w, sk) =>
              holder.quarantine ? holder.quarantine.activeHeld(t, w, sk) : Promise.resolve(0),
            activeHeldBySku: (t, ids) =>
              holder.quarantine
                ? holder.quarantine.activeHeldBySku(t, ids)
                : Promise.resolve(new Map()),
          },
        );
        holder.quarantine = new QuarantineService(prisma, {
          postMovement: (input, ctx) => inventory.postMovement(input, ctx),
          totalOnHand: async (tenantId, warehouseId, skuId) => {
            const position = await inventory.getStockPosition(warehouseId, skuId, {
              tenantId,
              tenantSlug: '',
              tenantStatus: 'ACTIVE',
              actorType: 'SERVICE',
              userId: undefined,
              userStatus: undefined,
              platformAdmin: false,
            });
            return Number(position.onHand);
          },
        });
        (inventory as unknown as { __quarantine: QuarantineService }).__quarantine =
          holder.quarantine;
        return inventory;
      },
      inject: [PRISMA, CATALOG_SERVICE],
    },
    {
      provide: QUARANTINE_SERVICE,
      useFactory: (inventory: InventoryService) =>
        (inventory as unknown as { __quarantine: QuarantineService }).__quarantine,
      inject: [INVENTORY_SERVICE],
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
      useFactory: (prisma: PrismaClient, party: PartyService, fieldPolicy: FieldPolicyService) => {
        const serviceCtx = (tenantId: string) => ({
          tenantId,
          tenantSlug: '',
          tenantStatus: 'ACTIVE' as const,
          actorType: 'SERVICE' as const,
          userId: undefined,
          userStatus: undefined,
          platformAdmin: false,
        });
        return new CrmService(
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
          { recordScope: (objectType, ctx) => fieldPolicy.recordScope(objectType, ctx) },
        );
      },
      inject: [PRISMA, PARTY_SERVICE, FIELD_POLICY_SERVICE],
    },
    {
      provide: CUSTOMER360_SERVICE,
      useFactory: (prisma: PrismaClient) => new Customer360Service(prisma),
      inject: [PRISMA],
    },
    {
      provide: TERRITORY_SERVICE,
      useFactory: (prisma: PrismaClient) => new TerritoryService(prisma),
      inject: [PRISMA],
    },
    {
      provide: LOYALTY_SERVICE,
      useFactory: (prisma: PrismaClient) => new LoyaltyService(prisma),
      inject: [PRISMA],
    },
    {
      provide: UOM_SERVICE,
      useFactory: (prisma: PrismaClient, tenants: TenantService) =>
        new UomService(prisma, {
          getEffectiveConfiguration: (t) => tenants.getEffectiveConfiguration(t),
        }),
      inject: [PRISMA, TENANT_SERVICE],
    },
    {
      provide: LABOR_SERVICE,
      useFactory: (prisma: PrismaClient, tasks: TaskService) =>
        new LaborService(prisma, {
          createTask: async (input, ctx) => {
            const view = await tasks.createTask(input, ctx);
            return { id: view.id };
          },
        }),
      inject: [PRISMA, TASK_SERVICE],
    },
    {
      provide: FIELD_POLICY_SERVICE,
      useFactory: (tenants: TenantService, roles: RoleService) =>
        new FieldPolicyService(
          { getEffectiveConfiguration: (t) => tenants.getEffectiveConfiguration(t) },
          {
            getPermissionKeys: async (userId, tenantId) => {
              const grants = await roles.getEffectivePermissions(userId, tenantId);
              return grants.map((g) => g.permissionKey);
            },
          },
        ),
      inject: [TENANT_SERVICE, ROLE_SERVICE],
    },
    {
      provide: LOCATION_MASTER_SERVICE,
      useFactory: (prisma: PrismaClient) => new LocationMasterService(prisma),
      inject: [PRISMA],
    },
    {
      provide: CUSTOM_OBJECT_SERVICE,
      useFactory: (prisma: PrismaClient) => new CustomObjectService(prisma),
      inject: [PRISMA],
    },
    {
      provide: PACKING_SERVICE,
      useFactory: (prisma: PrismaClient) => new PackingService(prisma),
      inject: [PRISMA],
    },
    {
      provide: RFQ_SERVICE,
      useFactory: (prisma: PrismaClient) => new RfqService(prisma),
      inject: [PRISMA],
    },
    {
      provide: SUPPORT_CASE_SERVICE,
      useFactory: (prisma: PrismaClient) => new SupportCaseService(prisma),
      inject: [PRISMA],
    },
    {
      provide: EMPLOYEE_SERVICE,
      useFactory: (prisma: PrismaClient) => new EmployeeService(prisma),
      inject: [PRISMA],
    },
    {
      provide: ASSET_SERVICE,
      useFactory: (prisma: PrismaClient) => new AssetService(prisma),
      inject: [PRISMA],
    },
    {
      provide: CONTRACT_SERVICE,
      useFactory: (prisma: PrismaClient) => new ContractService(prisma),
      inject: [PRISMA],
    },
    {
      provide: ONBOARDING_SERVICE,
      useFactory: (prisma: PrismaClient, tasks: TaskService, tenants: TenantService) =>
        new OnboardingService(
          prisma,
          { createTask: (input, ctx) => tasks.createTask(input, ctx) },
          { getEffectiveConfiguration: (t) => tenants.getEffectiveConfiguration(t) },
        ),
      inject: [PRISMA, TASK_SERVICE, TENANT_SERVICE],
    },
    {
      provide: SALES_TEAM_SERVICE,
      useFactory: (prisma: PrismaClient) => new SalesTeamService(prisma),
      inject: [PRISMA],
    },
    {
      provide: PRICING_SERVICE,
      useFactory: (prisma: PrismaClient, tenants: TenantService) =>
        new PricingService(prisma, {
          getPricingFormulas: async (t) => {
            const { config } = await tenants.getEffectiveConfiguration(t);
            const raw = (config as { sales?: { pricingFormulas?: unknown } })?.sales
              ?.pricingFormulas;
            if (!Array.isArray(raw)) return [];
            const formulas: Array<{ skuCode: string; formula: string }> = [];
            for (const entry of raw) {
              const skuCode = (entry as { skuCode?: unknown })?.skuCode;
              const formula = (entry as { formula?: unknown })?.formula;
              if (typeof skuCode === 'string' && typeof formula === 'string') {
                formulas.push({ skuCode, formula });
              }
            }
            return formulas;
          },
        }),
      inject: [PRISMA, TENANT_SERVICE],
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
        tenants: TenantService,
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
          {
            getStandardCost: async (t, skuId) => {
              const sku = await prisma.sku.findFirst({
                where: { id: skuId, tenantId: t },
                select: { standardCost: true },
              });
              return sku?.standardCost === null || sku?.standardCost === undefined
                ? null
                : Number(sku.standardCost);
            },
            getMinMarginPct: async (t) => {
              const { config } = await tenants.getEffectiveConfiguration(t);
              const pct = (config as { sales?: { minMarginPct?: unknown } })?.sales?.minMarginPct;
              return typeof pct === 'number' && pct >= 0 && pct <= 500 ? pct : 0;
            },
          },
          {
            getIncompatiblePairs: async (t) => {
              const { config } = await tenants.getEffectiveConfiguration(t);
              const raw = (config as { sales?: { incompatibleSkuPairs?: unknown } })?.sales
                ?.incompatibleSkuPairs;
              if (!Array.isArray(raw)) return [];
              const pairs: Array<[string, string]> = [];
              for (const entry of raw) {
                if (
                  Array.isArray(entry) &&
                  entry.length === 2 &&
                  typeof entry[0] === 'string' &&
                  typeof entry[1] === 'string'
                ) {
                  pairs.push([entry[0], entry[1]]);
                }
              }
              return pairs;
            },
          },
        ),
      inject: [
        PRISMA,
        PRICING_SERVICE,
        CRM_SERVICE,
        APPROVAL_SERVICE,
        CATALOG_SERVICE,
        DISCOUNT_SERVICE,
        TENANT_SERVICE,
      ],
    },
    {
      provide: DISCOUNT_SERVICE,
      useFactory: (prisma: PrismaClient) => new DiscountRuleService(prisma),
      inject: [PRISMA],
    },
    {
      provide: PROMOTION_SERVICE,
      useFactory: (prisma: PrismaClient) => new PromotionService(prisma),
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
        promotions: PromotionService,
        inventory2: InventoryService,
        planning: PlanningService,
        substitution: SubstitutionService,
        loyalty: LoyaltyService,
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
          {
            redeem: (code, orderId, total, ctx) => promotions.redeem(code, orderId, total, ctx),
            discountFor: (t, orderId) => promotions.discountFor(t, orderId),
          },
          {
            totalAvailability: (tenantId, skuId) =>
              inventory2.totalAvailability(skuId, {
                tenantId,
                tenantSlug: '',
                tenantStatus: 'ACTIVE',
                actorType: 'SERVICE',
                userId: undefined,
                userStatus: undefined,
                platformAdmin: false,
              }),
          },
          { leadTimeFor: (tenantId, skuId) => planning.leadTimeFor(tenantId, skuId) },
          {
            listAlternatives: (skuId, ctx) => substitution.listAlternatives(skuId, ctx),
          },
          {
            accrueForOrder: (input, ctx) => loyalty.accrueForOrder(input, ctx),
          },
        ),
      inject: [
        PRISMA,
        CRM_SERVICE,
        CATALOG_SERVICE,
        INVENTORY_SERVICE,
        CUSTOMER360_SERVICE,
        PROMOTION_SERVICE,
        INVENTORY_SERVICE,
        PLANNING_SERVICE,
        SUBSTITUTION_SERVICE,
        LOYALTY_SERVICE,
      ],
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
      useFactory: (
        prisma: PrismaClient,
        inventory: InventoryService,
        quality: QualityService,
        tenants: TenantService,
      ) =>
        new MesService(
          prisma,
          { postMovement: (input, ctx) => inventory.postMovement(input, ctx) },
          { getQcState: (t, w, s) => quality.getQcState(t, w, s) },
          { getEffectiveConfiguration: (t) => tenants.getEffectiveConfiguration(t) },
        ),
      inject: [PRISMA, INVENTORY_SERVICE, QUALITY_SERVICE, TENANT_SERVICE],
    },
    {
      provide: FINANCE_SERVICE,
      useFactory: (prisma: PrismaClient) => new FinanceService(prisma),
      inject: [PRISMA],
    },
    {
      provide: EXCHANGE_RATE_SERVICE,
      useFactory: (prisma: PrismaClient) => new ExchangeRateService(prisma),
      inject: [PRISMA],
    },
    {
      provide: VALUATION_SERVICE,
      useFactory: (prisma: PrismaClient) => new ValuationService(prisma),
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
      useFactory: (
        prisma: PrismaClient,
        orders: OrderService,
        cases: SupportCaseService,
        approvals: ApprovalService,
        tenants: TenantService,
      ) =>
        new PortalService(
          prisma,
          {
            createOrder: async (input, ctx) => {
              const view = await orders.createOrder(input, ctx);
              return { id: view.id, orderNumber: view.orderNumber };
            },
            addLine: (input, ctx) => orders.addLine(input, ctx),
          },
          {
            createCase: async (input, ctx) => {
              const view = await cases.createCase(input, ctx);
              return { id: view.id, caseNumber: view.caseNumber, status: view.status };
            },
          },
          {
            requestApproval: async (input, ctx) => {
              const view = await approvals.requestApproval(input, ctx);
              return { id: view.id };
            },
            decide: async (approvalId, decision, reason, ctx) => {
              const view = await approvals.decide(approvalId, decision, reason, ctx);
              return { status: view.status };
            },
          },
          { getEffectiveConfiguration: (t) => tenants.getEffectiveConfiguration(t) },
          {
            setDraftHold: (orderId, reason, ctx) => orders.setDraftHold(orderId, reason, ctx),
            clearDraftHold: (orderId, ctx) => orders.clearDraftHold(orderId, ctx),
          },
        ),
      inject: [PRISMA, ORDER_SERVICE, SUPPORT_CASE_SERVICE, APPROVAL_SERVICE, TENANT_SERVICE],
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
      provide: CONNECTOR_SERVICE,
      useFactory: (
        prisma: PrismaClient,
        tenants: TenantService,
        inventory: InventoryService,
        omsOrders: OrderService,
      ) =>
        new ConnectorService(
          prisma,
          { getEffectiveConfiguration: (t) => tenants.getEffectiveConfiguration(t) },
          { webhook: webhookAdapter(fetchTransport) },
          {
            channelAvailability: async (ctx) => {
              const rows = await inventory.channelAvailability(undefined, ctx);
              return rows.map((r) => ({ skuId: r.skuId, code: r.code, available: r.available }));
            },
          },
          {
            quickOrder: async (input, ctx) => {
              const result = await omsOrders.quickOrder(input, ctx);
              return {
                orderId: result.order.id,
                orderNumber: result.order.orderNumber,
                unknownCodes: result.unknownCodes,
              };
            },
          },
        ),
      inject: [PRISMA, TENANT_SERVICE, INVENTORY_SERVICE, ORDER_SERVICE],
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
      provide: PACKAGING_SERVICE,
      useFactory: (prisma: PrismaClient) => new PackagingService(prisma),
      inject: [PRISMA],
    },
    {
      provide: SERIAL_SERVICE,
      useFactory: (prisma: PrismaClient) => new SerialService(prisma),
      inject: [PRISMA],
    },
    {
      provide: BUNDLE_SERVICE,
      useFactory: (prisma: PrismaClient, inventory: InventoryService) =>
        new BundleService(
          prisma,
          {
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
          },
          { postMovement: (input, ctx) => inventory.postMovement(input, ctx) },
        ),
      inject: [PRISMA, INVENTORY_SERVICE],
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
    { provide: APP_GUARD, useClass: StepUpGuard },
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
