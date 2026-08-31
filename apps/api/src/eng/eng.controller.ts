import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { EngineeringService } from '@nexora/domain-eng';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const ENGINEERING_SERVICE = 'ENGINEERING_SERVICE';

const createBomSchema = z.object({
  skuId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});
const bomLineSchema = z.object({
  componentSkuId: z.string().uuid(),
  quantity: z.number().positive(),
  scrapPct: z.number().min(0).max(100).optional(),
});
const createRoutingSchema = z.object({ skuId: z.string().uuid() });
const operationSchema = z.object({
  name: z.string().min(1).max(200),
  workCenter: z.string().min(1).max(100),
  setupMinutes: z.number().min(0).optional(),
  runMinutesPerUnit: z.number().min(0).optional(),
  instructions: z.string().max(2000).optional(),
});
const changeSchema = z.object({
  targetSkuId: z.string().uuid(),
  title: z.string().min(1).max(200),
  note: z.string().max(1000).optional(),
});

@Controller('api/v1/boms')
export class BomsController {
  constructor(@Inject(ENGINEERING_SERVICE) private readonly eng: EngineeringService) {}

  @Get()
  @RequirePermission('bom.read')
  async list(@Ctx() ctx: RequestContext, @Query('skuId') skuId?: string) {
    return { boms: await this.eng.listBoms(skuId || undefined, ctx) };
  }

  @Post()
  @RequirePermission('bom.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.eng.createBom(parseBody(createBomSchema, body), ctx);
  }

  @Get('explode')
  @RequirePermission('bom.read')
  async explode(
    @Ctx() ctx: RequestContext,
    @Query('skuId') skuId?: string,
    @Query('quantity') quantity?: string,
  ) {
    const params = parseBody(
      z.object({ skuId: z.string().uuid(), quantity: z.coerce.number().positive() }),
      { ...(skuId ? { skuId } : {}), ...(quantity ? { quantity } : {}) },
    );
    return { components: await this.eng.explodeBom(params.skuId, params.quantity, ctx) };
  }

  @Get('standard-time')
  @RequirePermission('bom.read')
  async standardTime(
    @Ctx() ctx: RequestContext,
    @Query('skuId') skuId?: string,
    @Query('quantity') quantity?: string,
  ) {
    const params = parseBody(
      z.object({ skuId: z.string().uuid(), quantity: z.coerce.number().positive() }),
      { ...(skuId ? { skuId } : {}), ...(quantity ? { quantity } : {}) },
    );
    return this.eng.standardTime(params.skuId, params.quantity, ctx);
  }

  @Get(':id')
  @RequirePermission('bom.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.eng.getBom(id, ctx);
  }

  @Post(':id/lines')
  @RequirePermission('bom.manage')
  async addLine(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(bomLineSchema, body);
    return this.eng.addBomLine({ bomId: id, ...input }, ctx);
  }

  @Post(':id/release')
  @RequirePermission('bom.release')
  async release(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.eng.releaseBom(id, ctx);
  }
}

@Controller('api/v1/routings')
export class RoutingsController {
  constructor(@Inject(ENGINEERING_SERVICE) private readonly eng: EngineeringService) {}

  @Get()
  @RequirePermission('bom.read')
  async list(@Ctx() ctx: RequestContext, @Query('skuId') skuId?: string) {
    return { routings: await this.eng.listRoutings(skuId || undefined, ctx) };
  }

  @Post()
  @RequirePermission('bom.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.eng.createRouting(parseBody(createRoutingSchema, body), ctx);
  }

  @Post(':id/operations')
  @RequirePermission('bom.manage')
  async addOperation(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(operationSchema, body);
    return this.eng.addOperation({ routingId: id, ...input }, ctx);
  }

  @Post(':id/release')
  @RequirePermission('bom.release')
  async release(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.eng.releaseRouting(id, ctx);
  }
}

@Controller('api/v1/engineering-changes')
export class EngineeringChangesController {
  constructor(@Inject(ENGINEERING_SERVICE) private readonly eng: EngineeringService) {}

  @Get()
  @RequirePermission('bom.read')
  async list(@Ctx() ctx: RequestContext) {
    return { changes: await this.eng.listChanges(ctx) };
  }

  @Post()
  @RequirePermission('bom.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.eng.requestChange(parseBody(changeSchema, body), ctx);
  }

  @Post(':id/approve')
  @RequirePermission('bom.release')
  async approve(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.eng.decideChange(id, true, ctx);
  }

  @Post(':id/reject')
  @RequirePermission('bom.release')
  async reject(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.eng.decideChange(id, false, ctx);
  }
}
