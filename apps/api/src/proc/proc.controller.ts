import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { ProcurementService } from '@nexora/domain-proc';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const PROCUREMENT_SERVICE = 'PROCUREMENT_SERVICE';

const createSupplierSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional(),
});
const createRequisitionSchema = z.object({
  currency: z.string().length(3),
  note: z.string().max(500).optional(),
});
const requisitionLineSchema = z.object({
  skuId: z.string().uuid(),
  quantity: z.number().positive(),
  estUnitPrice: z.number().nonnegative(),
});
const createPoSchema = z.object({
  requisitionId: z.string().uuid(),
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  expectedAt: z.string().datetime().optional(),
});
const receiveSchema = z.object({
  receiptKey: z.string().min(4).max(64),
  lines: z.array(z.object({ lineId: z.string().uuid(), quantity: z.number().positive() })).min(1),
});

@Controller('api/v1/suppliers')
export class SuppliersController {
  constructor(@Inject(PROCUREMENT_SERVICE) private readonly proc: ProcurementService) {}

  @Get()
  @RequirePermission('purchase.read')
  async list(@Ctx() ctx: RequestContext) {
    return { suppliers: await this.proc.listSuppliers(ctx) };
  }

  @Post()
  @RequirePermission('purchase.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.proc.createSupplier(parseBody(createSupplierSchema, body), ctx);
  }

  @Post(':id/block')
  @RequirePermission('purchase.manage')
  async block(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    await this.proc.setSupplierStatus(id, 'BLOCKED', ctx);
    return { ok: true };
  }

  @Post(':id/activate')
  @RequirePermission('purchase.manage')
  async activate(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    await this.proc.setSupplierStatus(id, 'ACTIVE', ctx);
    return { ok: true };
  }
}

@Controller('api/v1/requisitions')
export class RequisitionsController {
  constructor(@Inject(PROCUREMENT_SERVICE) private readonly proc: ProcurementService) {}

  @Get()
  @RequirePermission('purchase.read')
  async list(@Ctx() ctx: RequestContext) {
    return { requisitions: await this.proc.listRequisitions(ctx) };
  }

  @Post()
  @RequirePermission('purchase.request')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.proc.createRequisition(parseBody(createRequisitionSchema, body), ctx);
  }

  @Post(':id/lines')
  @RequirePermission('purchase.request')
  async addLine(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(requisitionLineSchema, body);
    return this.proc.addRequisitionLine({ requisitionId: id, ...input }, ctx);
  }

  @Post(':id/submit')
  @RequirePermission('purchase.request')
  async submit(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.proc.submitRequisition(id, ctx);
  }

  @Post(':id/sync-approval')
  @RequirePermission('purchase.read')
  async syncApproval(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.proc.syncRequisitionApproval(id, ctx);
  }
}

@Controller('api/v1/purchase-orders')
export class PurchaseOrdersController {
  constructor(@Inject(PROCUREMENT_SERVICE) private readonly proc: ProcurementService) {}

  @Get()
  @RequirePermission('purchase.read')
  async list(@Ctx() ctx: RequestContext) {
    return { purchaseOrders: await this.proc.listPurchaseOrders(ctx) };
  }

  @Post()
  @RequirePermission('purchase.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.proc.createPoFromRequisition(parseBody(createPoSchema, body), ctx);
  }

  @Get('price-history')
  @RequirePermission('purchase.read')
  async priceHistory(@Ctx() ctx: RequestContext, @Query('skuId') skuId?: string) {
    const params = parseBody(z.object({ skuId: z.string().uuid() }), {
      ...(skuId ? { skuId } : {}),
    });
    return { history: await this.proc.getPriceHistory(params.skuId, ctx) };
  }

  @Get(':id')
  @RequirePermission('purchase.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.proc.getPurchaseOrder(id, ctx);
  }

  @Post(':id/receive')
  @RequirePermission('purchase.receive')
  async receive(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(receiveSchema, body);
    return this.proc.receivePo({ poId: id, ...input }, ctx);
  }

  @Post(':id/cancel')
  @RequirePermission('purchase.manage')
  async cancel(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.proc.cancelPo(id, ctx);
  }
}
