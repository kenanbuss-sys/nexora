import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import type { ImportExportService } from '@nexora/domain-core';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const IMPORT_EXPORT_SERVICE = 'IMPORT_EXPORT_SERVICE';

const importSchema = z.object({ csv: z.string().min(1).max(600_000) });

/** CSV import/export framework (CORE-019). */
@Controller('api/v1/data')
export class DataController {
  constructor(@Inject(IMPORT_EXPORT_SERVICE) private readonly data: ImportExportService) {}

  // ------------------------------------------------------------- imports

  @Post('import/products')
  @RequirePermission('product.manage')
  async importProducts(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.data.importProducts(parseBody(importSchema, body).csv, ctx);
  }

  @Post('import/skus')
  @RequirePermission('product.manage')
  async importSkus(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.data.importSkus(parseBody(importSchema, body).csv, ctx);
  }

  @Post('import/customers')
  @RequirePermission('crm.manage')
  async importCustomers(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.data.importCustomers(parseBody(importSchema, body).csv, ctx);
  }

  @Post('import/suppliers')
  @RequirePermission('purchase.manage')
  async importSuppliers(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.data.importSuppliers(parseBody(importSchema, body).csv, ctx);
  }

  @Post('import/stock')
  @RequirePermission('inventory.adjust')
  async importStock(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.data.importOpeningStock(parseBody(importSchema, body).csv, ctx);
  }

  // ------------------------------------------------------------- exports

  @Get('export/products')
  @RequirePermission('product.read')
  async exportProducts(@Ctx() ctx: RequestContext) {
    return this.data.exportCsv('products', ctx);
  }

  @Get('export/skus')
  @RequirePermission('product.read')
  async exportSkus(@Ctx() ctx: RequestContext) {
    return this.data.exportCsv('skus', ctx);
  }

  @Get('export/customers')
  @RequirePermission('crm.read')
  async exportCustomers(@Ctx() ctx: RequestContext) {
    return this.data.exportCsv('customers', ctx);
  }

  @Get('export/suppliers')
  @RequirePermission('purchase.read')
  async exportSuppliers(@Ctx() ctx: RequestContext) {
    return this.data.exportCsv('suppliers', ctx);
  }

  @Get('export/stock')
  @RequirePermission('inventory.read')
  async exportStock(@Ctx() ctx: RequestContext) {
    return this.data.exportCsv('stock', ctx);
  }
}
