import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { AssetService } from '@nexora/domain-eam';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const ASSET_SERVICE = 'ASSET_SERVICE';

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
