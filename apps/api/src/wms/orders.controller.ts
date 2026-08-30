import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { RoleService } from '@nexora/domain-iam';
import type { WmsOrderService } from '@nexora/domain-wms';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission, ROLE_SERVICE } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const WMS_ORDER_SERVICE = 'WMS_ORDER_SERVICE';

const createOrderSchema = z.object({
  orderType: z.enum(['RECEIVING', 'TRANSFER', 'COUNT', 'PICK']),
  warehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid().optional(),
  reference: z.string().max(100).optional(),
  lines: z
    .array(z.object({ skuId: z.string().uuid(), expectedQty: z.number().positive() }))
    .min(1)
    .max(200),
});

const processLineSchema = z.object({
  quantity: z.number().positive(),
  idempotencyKey: z.string().min(8).max(120),
});

/** Order type -> required permission (specs/permissions.csv). */
const ORDER_PERMISSION: Record<string, string> = {
  RECEIVING: 'inventory.receive',
  TRANSFER: 'inventory.transfer',
  COUNT: 'inventory.count',
  PICK: 'inventory.pick',
};

@Controller('api/v1/wms/orders')
export class WmsOrdersController {
  constructor(
    @Inject(WMS_ORDER_SERVICE) private readonly orders: WmsOrderService,
    @Inject(ROLE_SERVICE) private readonly roles: RoleService,
  ) {}

  @Get()
  @RequirePermission('inventory.read')
  async list(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    const params = parseBody(
      z.object({
        status: z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
      }),
      { ...(status ? { status } : {}) },
    );
    return { orders: await this.orders.listOrders(params, ctx) };
  }

  @Get(':id')
  @RequirePermission('inventory.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.orders.getOrder(id, ctx);
  }

  /** Permission depends on the order type (receive/transfer/count/pick). */
  @Post()
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(createOrderSchema, body);
    await this.authorizeForType(ctx, input.orderType);
    return this.orders.createOrder(input, ctx);
  }

  @Post(':id/start')
  @RequirePermission('inventory.read')
  async start(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.orders.startOrder(id, ctx);
  }

  @Post(':id/lines/:lineId/process')
  async processLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(processLineSchema, body);
    const order = await this.orders.getOrder(id, ctx);
    await this.authorizeForType(ctx, order.orderType);
    return this.orders.processLine({ orderId: id, lineId, ...input }, ctx);
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    const order = await this.orders.getOrder(id, ctx);
    await this.authorizeForType(ctx, order.orderType);
    return this.orders.completeOrder(id, ctx);
  }

  private async authorizeForType(ctx: RequestContext, orderType: string): Promise<void> {
    const permission = ORDER_PERMISSION[orderType] as string;
    if (!(await this.roles.authorize(ctx, permission))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Missing permission',
        details: { permission },
      });
    }
  }
}
