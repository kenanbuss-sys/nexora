import { Body, Controller, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import type { CatalogService, MerchandisingService, SubstitutionService } from '@nexora/domain-pim';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const CATALOG_SERVICE = 'CATALOG_SERVICE';
export const MERCHANDISING_SERVICE = 'MERCHANDISING_SERVICE';
export const SUBSTITUTION_SERVICE = 'SUBSTITUTION_SERVICE';

const createProductSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
});
const addSubstitutionSchema = z.object({
  substituteSkuId: z.string().uuid(),
  priority: z.number().int().min(1).max(100).optional(),
  note: z.string().max(300).optional(),
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
  constructor(
    @Inject(CATALOG_SERVICE) private readonly catalog: CatalogService,
    @Inject(SUBSTITUTION_SERVICE) private readonly substitutions: SubstitutionService,
  ) {}

  @Get(':id/substitutions')
  @RequirePermission('product.read')
  async listSubstitutions(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { substitutions: await this.substitutions.listSubstitutions(id, ctx) };
  }

  /** Active substitutes with live availability (used on backordered lines). */
  @Get(':id/alternatives')
  @RequirePermission('product.read')
  async listAlternatives(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { alternatives: await this.substitutions.listAlternatives(id, ctx) };
  }

  @Post(':id/substitutions')
  @RequirePermission('product.manage')
  async addSubstitution(
    @Param('id') id: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(addSubstitutionSchema, body);
    return this.substitutions.addSubstitution(
      {
        skuId: id,
        substituteSkuId: input.substituteSkuId,
        priority: input.priority,
        note: input.note,
      },
      ctx,
    );
  }

  @Post(':id/substitutions/:subId/remove')
  @RequirePermission('product.manage')
  async removeSubstitution(@Param('subId') subId: string, @Ctx() ctx: RequestContext) {
    await this.substitutions.removeSubstitution(subId, ctx);
    return { removed: true };
  }

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

const createCategorySchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().optional(),
});
const assignCategorySchema = z.object({ categoryId: z.string().uuid().nullable() });
const attributesSchema = z.object({ attributes: z.record(z.unknown()) });
const generateVariantsSchema = z.object({
  axes: z.record(z.array(z.string().min(1).max(40)).min(1).max(20)),
  baseUom: z.string().min(1).max(16),
});

/** Merchandising: categories, attributes, variants (Sprint 025). */
@Controller('api/v1/catalog')
export class MerchandisingController {
  constructor(
    @Inject(MERCHANDISING_SERVICE) private readonly merchandising: MerchandisingService,
  ) {}

  @Get('categories')
  @RequirePermission('product.read')
  async categories(@Ctx() ctx: RequestContext) {
    return { categories: await this.merchandising.listCategories(ctx) };
  }

  @Post('categories')
  @RequirePermission('product.manage')
  async createCategory(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.merchandising.createCategory(parseBody(createCategorySchema, body), ctx);
  }

  @Post('products/:id/category')
  @RequirePermission('product.manage')
  async assignCategory(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const { categoryId } = parseBody(assignCategorySchema, body);
    await this.merchandising.assignCategory(id, categoryId, ctx);
    return { ok: true };
  }

  @Post('products/:id/attributes')
  @RequirePermission('product.manage')
  async setAttributes(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const { attributes } = parseBody(attributesSchema, body);
    await this.merchandising.setAttributes(id, attributes, ctx);
    return { ok: true };
  }

  @Post('products/:id/variants')
  @RequirePermission('product.manage')
  async generateVariants(
    @Param('id') id: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    return this.merchandising.generateVariants(id, parseBody(generateVariantsSchema, body), ctx);
  }
}
