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
import type { QuarantineService, InventoryService, PackingService } from '@nexora/domain-wms';
import type { PrintService } from '@nexora/domain-dev';
import { zplSsccLabel } from '@nexora/domain-dev';
import { PRINT_SERVICE } from '../dev/dev.controller';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission, ROLE_SERVICE } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const INVENTORY_SERVICE = 'INVENTORY_SERVICE';
export const PACKING_SERVICE = 'PACKING_SERVICE';
export const QUARANTINE_SERVICE = 'QUARANTINE_SERVICE';

const createWarehouseSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
});
const createLocationSchema = z.object({
  warehouseId: z.string().uuid(),
  code: z.string().min(1).max(64),
});
const putawaySchema = z.object({
  warehouseId: z.string().uuid(),
  skuId: z.string().uuid(),
  quantity: z.number().positive(),
  toLocationId: z.string().uuid(),
  putawayKey: z.string().min(6).max(64),
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

  @Get('locations')
  @RequirePermission('inventory.read')
  async listLocations(@Query('warehouseId') warehouseId: string, @Ctx() ctx: RequestContext) {
    return { locations: await this.inventory.listLocations(warehouseId ?? '', ctx) };
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

  /** Channel availability feed (COM-010): sellable quantities in one call. */
  @Get('channel-availability')
  @RequirePermission('inventory.read')
  async channelAvailability(@Ctx() ctx: RequestContext, @Query('skuIds') skuIds?: string) {
    const ids = skuIds
      ? skuIds
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : undefined;
    return { availability: await this.inventory.channelAvailability(ids, ctx) };
  }

  /** Permission depends on the movement type (receive/pick/adjust/transfer). */
  @Get('by-location')
  @RequirePermission('inventory.read')
  async byLocation(@Query('warehouseId') warehouseId: string, @Ctx() ctx: RequestContext) {
    return { rows: await this.inventory.stockByLocation(warehouseId ?? '', ctx) };
  }

  @Post('putaway')
  @RequirePermission('inventory.adjust')
  async putaway(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.inventory.putaway(parseBody(putawaySchema, body), ctx);
  }

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

const placeHoldSchema = z.object({
  warehouseId: z.string().uuid(),
  skuId: z.string().uuid(),
  quantity: z.number().positive(),
  reason: z.string().min(1).max(300),
});
const decideHoldSchema = z.object({ decision: z.enum(['RELEASE', 'SCRAP']) });

@Controller('api/v1/quarantine')
export class QuarantineController {
  constructor(@Inject(QUARANTINE_SERVICE) private readonly quarantine: QuarantineService) {}

  @Get()
  @RequirePermission('inventory.read')
  async list(@Ctx() ctx: RequestContext) {
    return { holds: await this.quarantine.listHolds(ctx) };
  }

  @Post()
  @RequirePermission('inventory.adjust')
  async place(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.quarantine.placeHold(parseBody(placeHoldSchema, body), ctx);
  }

  @Post(':id/decide')
  @RequirePermission('qc.approve')
  async decide(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(decideHoldSchema, body);
    return this.quarantine.decide(id, input.decision, ctx);
  }
}

const createPackageSchema = z.object({
  orderId: z.string().uuid(),
  lines: z
    .array(z.object({ orderLineId: z.string().uuid(), quantity: z.number().positive() }))
    .min(1)
    .max(50),
  weightKg: z.number().positive().max(100000).optional(),
});

@Controller('api/v1/packages')
export class PackagesController {
  constructor(
    @Inject(PACKING_SERVICE) private readonly packing: PackingService,
    @Inject(PRINT_SERVICE) private readonly printing: PrintService,
  ) {}

  @Get()
  @RequirePermission('inventory.read')
  async list(@Query('orderId') orderId: string, @Ctx() ctx: RequestContext) {
    return { packages: await this.packing.listPackages({ orderId: orderId || undefined }, ctx) };
  }

  @Post()
  @RequirePermission('inventory.adjust')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.packing.createPackage(parseBody(createPackageSchema, body), ctx);
  }

  @Post(':id/stage')
  @RequirePermission('inventory.adjust')
  async stage(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.packing.transition(id, 'STAGED', ctx);
  }

  @Post(':id/ship')
  @RequirePermission('inventory.adjust')
  async ship(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.packing.transition(id, 'SHIPPED', ctx);
  }

  /** DEV-006 — render + queue the SSCC label on a printer device. */
  @Post(':id/print-label')
  @RequirePermission('inventory.adjust')
  async printLabel(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ deviceId: z.string().uuid() }), body);
    const pkg = await this.packing.assignSscc(id, ctx);
    const zpl = zplSsccLabel({
      packageNumber: pkg.packageNumber,
      ssccCode: pkg.ssccCode ?? '',
      orderNumber: pkg.orderNumber || null,
    });
    const queued = await this.printing.queueLabel(
      { deviceId: input.deviceId, jobKey: `sscc:${pkg.id}`, zpl },
      ctx,
    );
    return { ...queued, zpl };
  }

  /** WMS-020 — assign the GS1 SSCC-18 logistics label code. */
  @Post(':id/sscc')
  @RequirePermission('inventory.adjust')
  async assignSscc(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.packing.assignSscc(id, ctx);
  }
}
