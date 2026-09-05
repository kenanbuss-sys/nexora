import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { PrismaClient } from '@nexora/db';
import type { ServiceAccountService } from '@nexora/domain-iam';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { writeAudit } from '@nexora/audit';
import { PRISMA, SERVICE_ACCOUNT_SERVICE } from '../auth/auth.guard';
import { Ctx } from '../auth/ctx.decorator';
import { PlatformOnly, RequirePermission } from '../auth/permissions.guard';
import { RequireStepUp } from '../auth/step-up.guard';
import { parseBody } from '../common/validate';

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string().min(3).max(100)).min(1).max(40),
});

/** Service accounts & the security log (IAM-009/013). */
@Controller('api/v1/iam')
export class ServiceAccountsController {
  constructor(
    @Inject(SERVICE_ACCOUNT_SERVICE) private readonly serviceAccounts: ServiceAccountService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  @Get('api-keys')
  @RequirePermission('iam.user.manage')
  async list(@Ctx() ctx: RequestContext) {
    return { apiKeys: await this.serviceAccounts.listKeys(ctx) };
  }

  @Post('api-keys')
  @RequirePermission('iam.user.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.serviceAccounts.createKey(parseBody(createKeySchema, body), ctx);
  }

  @Post('api-keys/:id/revoke')
  @RequirePermission('iam.user.manage')
  async revoke(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    await this.serviceAccounts.revokeKey(id, ctx);
    return { ok: true };
  }

  @Get('security-events')
  @RequirePermission('iam.user.manage')
  async securityEvents(@Ctx() ctx: RequestContext) {
    return { events: await this.serviceAccounts.listSecurityEvents(ctx) };
  }
}

/** Tenant data export (OPS-017): bounded JSON snapshot, audited. */
@Controller('api/v1/tenant')
export class TenantExportController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get('export')
  @RequirePermission('iam.user.manage')
  @RequireStepUp()
  async export(@Ctx() ctx: RequestContext) {
    const take = 1000;
    const where = { tenantId: ctx.tenantId };
    const [parties, products, skus, accounts, orders, invoices, workOrders, suppliers] =
      await Promise.all([
        this.prisma.party.findMany({ where, take }),
        this.prisma.product.findMany({ where, take }),
        this.prisma.sku.findMany({ where, take }),
        this.prisma.crmAccount.findMany({ where, take }),
        this.prisma.salesOrder.findMany({ where, take, include: { lines: true } }),
        this.prisma.invoice.findMany({ where, take }),
        this.prisma.workOrder.findMany({ where, take }),
        this.prisma.supplier.findMany({ where, take }),
      ]);
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'ops.tenant.export',
        objectType: 'Tenant',
        objectId: ctx.tenantId,
        source: 'api',
        newValues: { entities: ['parties', 'products', 'skus', 'accounts', 'orders'] },
      });
      await tx.securityEvent.create({
        data: {
          tenantId: ctx.tenantId,
          eventType: 'tenant.exported',
          subject: ctx.userId ?? null,
          detail: `${orders.length} orders, ${invoices.length} invoices`,
        },
      });
    });
    return {
      exportedAt: new Date().toISOString(),
      tenantSlug: ctx.tenantSlug,
      parties,
      products,
      skus,
      accounts,
      orders,
      invoices,
      workOrders,
      suppliers,
    };
  }
}

/** Platform usage analytics (OPS-014): per-tenant footprint. */
@Controller('api/v1/platform')
export class PlatformUsageController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get('usage')
  @PlatformOnly()
  async usage() {
    const tenants = await this.prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
    const rows = [];
    for (const tenant of tenants) {
      const where = { tenantId: tenant.id };
      const [users, orders, invoices, workOrders, events, attachments] = await Promise.all([
        this.prisma.user.count({ where }),
        this.prisma.salesOrder.count({ where }),
        this.prisma.invoice.count({ where }),
        this.prisma.workOrder.count({ where }),
        this.prisma.outboxEvent.count({ where }),
        this.prisma.attachment.aggregate({
          where,
          _sum: { sizeBytes: true },
          _count: { _all: true },
        }),
      ]);
      rows.push({
        tenantId: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        users,
        orders,
        invoices,
        workOrders,
        events,
        attachments: attachments._count._all,
        attachmentBytes: attachments._sum.sizeBytes ?? 0,
      });
    }
    return { tenants: rows };
  }
}
