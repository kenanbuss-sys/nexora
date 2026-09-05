import { Body, Controller, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import type { CatalogService } from '@nexora/domain-pim';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const CATALOG_SERVICE = 'CATALOG_SERVICE';

const createProductSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
});
const createSkuSchema = z.object({
  productId: z.string().uuid(),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  baseUom: z.string().min(1).max(16),
});
const assignBarcodeSchema = z.object({
  skuId: z.string().uuid(),
  value: z.string().min(4).max(64),
  barcodeType: z.string().max(20).optional(),
});
const uomSchema = z.object({
  fromUom: z.string().min(1).max(16),
  toUom: z.string().min(1).max(16),
  factor: z.number().positive(),
});

@Controller('api/v1/products')
export class ProductsController {
  constructor(@Inject(CATALOG_SERVICE) private readonly catalog: CatalogService) {}

  @Post()
  @RequirePermission('product.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.catalog.createProduct(parseBody(createProductSchema, body), ctx);
  }

  @Post(':id/publish')
  @RequirePermission('product.publish')
  async publish(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.catalog.publishProduct(id, ctx);
  }

  @Get('search')
  @RequirePermission('product.read')
  async search(@Ctx() ctx: RequestContext, @Query('q') q?: string) {
    return { products: await this.catalog.searchCatalog(q ?? '', ctx) };
  }

  @Get(':id')
  @RequirePermission('product.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.catalog.getProduct(id, ctx);
  }
}

@Controller('api/v1/skus')
export class SkusController {
  constructor(@Inject(CATALOG_SERVICE) private readonly catalog: CatalogService) {}

  @Post()
  @RequirePermission('product.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.catalog.createSku(parseBody(createSkuSchema, body), ctx);
  }

  @Post(':id/activate')
  @RequirePermission('product.publish')
  async activate(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.catalog.activateSku(id, ctx);
  }

  @Post(':id/discontinue')
  @RequirePermission('product.manage')
  async discontinue(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.catalog.discontinueSku(id, ctx);
  }

  @Post(':id/lot-policy')
  @RequirePermission('product.manage')
  async setLotPolicy(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        lotTracked: z.boolean(),
        shelfLifeDays: z.number().int().min(1).max(3650).nullable().optional(),
      }),
      body,
    );
    await this.catalog.setLotPolicy(id, input, ctx);
    return { ok: true };
  }

  @Put(':id/uom-conversions')
  @RequirePermission('product.manage')
  async setUom(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(uomSchema, body);
    return this.catalog.setUomConversion({ skuId: id, ...input }, ctx);
  }

  @Get(':id/uom-conversions')
  @RequirePermission('product.read')
  async getUom(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { conversions: await this.catalog.getUomConversions(id, ctx) };
  }
}

@Controller('api/v1/barcodes')
export class BarcodesController {
  constructor(@Inject(CATALOG_SERVICE) private readonly catalog: CatalogService) {}

  @Post()
  @RequirePermission('product.barcode.manage')
  async assign(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.catalog.assignBarcode(parseBody(assignBarcodeSchema, body), ctx);
  }

  @Get(':value')
  @RequirePermission('product.read')
  async lookup(@Param('value') value: string, @Ctx() ctx: RequestContext) {
    return this.catalog.lookupBarcode(value, ctx);
  }
}
