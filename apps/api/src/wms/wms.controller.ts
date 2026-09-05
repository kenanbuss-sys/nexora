import { Body, Controller, ForbiddenException, Get, Inject, Post, Query } from '@nestjs/common';
import type { RoleService } from '@nexora/domain-iam';
import type { InventoryService } from '@nexora/domain-wms';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission, ROLE_SERVICE } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const INVENTORY_SERVICE = 'INVENTORY_SERVICE';

const createWarehouseSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
});
const createLocationSchema = z.object({
  warehouseId: z.string().uuid(),
  code: z.string().min(1).max(64),
});
const movementSchema = z.object({
  warehouseId: z.string().uuid(),
  skuId: z.string().uuid(),
  movementType: z.enum([
    'RECEIPT',
    'ISSUE',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'TRANSFER_IN',
    'TRANSFER_OUT',
  ]),
  quantity: z.number().positive(),
  idempotencyKey: z.string().min(8).max(128),
  locationId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
  lotNumber: z.string().min(1).max(64).optional(),
  expiresAt: z.string().datetime().optional(),
});
const reserveSchema = z.object({
  warehouseId: z.string().uuid(),
  skuId: z.string().uuid(),
  quantity: z.number().positive(),
  reference: z.string().max(100).optional(),
});

/** Movement type -> required permission (specs/permissions.csv). */
const MOVEMENT_PERMISSION: Record<string, string> = {
  RECEIPT: 'inventory.receive',
  ISSUE: 'inventory.pick',
  ADJUSTMENT_IN: 'inventory.adjust',
  ADJUSTMENT_OUT: 'inventory.adjust',
  TRANSFER_IN: 'inventory.transfer',
  TRANSFER_OUT: 'inventory.transfer',
};

@Controller('api/v1/warehouses')
export class WarehousesController {
  constructor(@Inject(INVENTORY_SERVICE) private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermission('inventory.read')
  async list(@Ctx() ctx: RequestContext) {
    return { warehouses: await this.inventory.listWarehouses(ctx) };
  }

  @Post()
  @RequirePermission('inventory.adjust')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.inventory.createWarehouse(parseBody(createWarehouseSchema, body), ctx);
  }

  @Post('locations')
  @RequirePermission('inventory.adjust')
  async createLocation(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.inventory.createLocation(parseBody(createLocationSchema, body), ctx);
  }
}

@Controller('api/v1/stock')
export class StockController {
  constructor(
    @Inject(INVENTORY_SERVICE) private readonly inventory: InventoryService,
    @Inject(ROLE_SERVICE) private readonly roles: RoleService,
  ) {}

  /** Permission depends on the movement type (receive/pick/adjust/transfer). */
  @Post('movements')
  async postMovement(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(movementSchema, body);
    const permission = MOVEMENT_PERMISSION[input.movementType] as string;
    if (!(await this.roles.authorize(ctx, permission))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Missing permission',
        details: { permission },
      });
    }
    const { expiresAt, ...rest } = input;
    return this.inventory.postMovement(
      { ...rest, ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}) },
      ctx,
    );
  }

  @Get('lots')
  @RequirePermission('inventory.read')
  async lots(
    @Query('warehouseId') warehouseId: string,
    @Query('skuId') skuId: string,
    @Ctx() ctx: RequestContext,
  ) {
    const params = parseBody(
      z.object({ warehouseId: z.string().uuid(), skuId: z.string().uuid() }),
      { warehouseId, skuId },
    );
    return { lots: await this.inventory.lotBalances(params.warehouseId, params.skuId, ctx) };
  }

  @Post('reservations')
  @RequirePermission('inventory.pick')
  async reserve(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.inventory.reserveStock(parseBody(reserveSchema, body), ctx);
  }

  @Post('reservations/release')
  @RequirePermission('inventory.pick')
  async release(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ reservationId: z.string().uuid() }), body);
    await this.inventory.releaseReservation(input.reservationId, ctx);
    return { ok: true };
  }

  @Get('movements')
  @RequirePermission('inventory.read')
  async listMovements(
    @Ctx() ctx: RequestContext,
    @Query('warehouseId') warehouseId?: string,
    @Query('skuId') skuId?: string,
  ) {
    const params = parseBody(
      z.object({ warehouseId: z.string().uuid().optional(), skuId: z.string().uuid().optional() }),
      { ...(warehouseId ? { warehouseId } : {}), ...(skuId ? { skuId } : {}) },
    );
    return { movements: await this.inventory.listMovements(params, ctx) };
  }

  @Get('reservations')
  @RequirePermission('inventory.read')
  async listReservations(
    @Ctx() ctx: RequestContext,
    @Query('warehouseId') warehouseId?: string,
    @Query('skuId') skuId?: string,
  ) {
    const params = parseBody(
      z.object({ warehouseId: z.string().uuid().optional(), skuId: z.string().uuid().optional() }),
      { ...(warehouseId ? { warehouseId } : {}), ...(skuId ? { skuId } : {}) },
    );
    return { reservations: await this.inventory.listReservations(params, ctx) };
  }

  @Get('position')
  @RequirePermission('inventory.read')
  async position(
    @Ctx() ctx: RequestContext,
    @Query('warehouseId') warehouseId?: string,
    @Query('skuId') skuId?: string,
  ) {
    const params = parseBody(
      z.object({ warehouseId: z.string().uuid(), skuId: z.string().uuid() }),
      { warehouseId, skuId },
    );
    return this.inventory.getStockPosition(params.warehouseId, params.skuId, ctx);
  }
}
