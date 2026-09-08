import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { AssetService, MaintenanceService } from '@nexora/domain-eam';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const ASSET_SERVICE = 'ASSET_SERVICE';
export const MAINTENANCE_SERVICE = 'MAINTENANCE_SERVICE';

const createAssetSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(120),
  serialNumber: z.string().max(120).optional(),
  workCenterId: z.string().uuid().optional(),
  value: z.number().nonnegative().optional(),
  purchasedAt: z.string().datetime().optional(),
});
const assetStatusSchema = z.object({
  status: z.enum(['IN_SERVICE', 'UNDER_MAINTENANCE', 'RETIRED']),
});

@Controller('api/v1/assets')
export class AssetsController {
  constructor(@Inject(ASSET_SERVICE) private readonly assets: AssetService) {}

  @Get()
  @RequirePermission('asset.read')
  async list(@Ctx() ctx: RequestContext) {
    return { assets: await this.assets.listAssets(ctx) };
  }

  @Post()
  @RequirePermission('asset.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.assets.createAsset(parseBody(createAssetSchema, body), ctx);
  }

  @Post(':id/transition')
  @RequirePermission('asset.manage')
  async transition(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(assetStatusSchema, body);
    return this.assets.transition(id, input.status, ctx);
  }
}

/** Maintenance (EAM-003..013). */
@Controller('api/v1/maintenance')
export class MaintenanceController {
  constructor(@Inject(MAINTENANCE_SERVICE) private readonly maintenance: MaintenanceService) {}

  @Post('preventive/run')
  @RequirePermission('asset.manage')
  async runPreventive(@Ctx() ctx: RequestContext) {
    return this.maintenance.runPreventive(ctx);
  }

  @Post('assets/:id/breakdown')
  @RequirePermission('asset.manage')
  async breakdown(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ description: z.string().min(5).max(1000) }), body);
    return this.maintenance.reportBreakdown({ assetId: id, ...input }, ctx);
  }

  @Post('assets/:id/complete')
  @RequirePermission('asset.manage')
  async complete(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        completionKey: z.string().min(1).max(64),
        laborHours: z.number().min(0).max(1000),
        laborRate: z.number().nonnegative().optional(),
        parts: z
          .array(
            z.object({
              skuId: z.string().uuid(),
              warehouseId: z.string().uuid(),
              quantity: z.number().positive(),
            }),
          )
          .max(50)
          .optional(),
      }),
      body,
    );
    return this.maintenance.completeMaintenance({ assetId: id, ...input }, ctx);
  }

  @Post('assets/:id/meters')
  @RequirePermission('asset.manage')
  async meter(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        meter: z.string().min(2).max(30),
        value: z.number(),
        readingId: z.string().min(1).max(64),
      }),
      body,
    );
    return this.maintenance.recordMeter({ assetId: id, ...input }, ctx);
  }

  @Post('assets/:id/checkout')
  @RequirePermission('asset.manage')
  async checkout(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({ event: z.enum(['OUT', 'IN']), holder: z.string().min(2).max(120) }),
      body,
    );
    return this.maintenance.toolCheckout({ assetId: id, ...input }, ctx);
  }

  @Get('assets/:id/report')
  @RequirePermission('asset.read')
  async report(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.maintenance.assetReport(id, ctx);
  }
}
