import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Import/export framework (CORE-019): governed CSV onboarding of master
 * data and opening stock, plus CSV extracts of the same entities.
 *
 * All writes go through the owning domains' public interfaces (gates), so
 * every imported row carries the same validation, audit and events as a
 * row created by hand. Imports are re-runnable: existing records are
 * skipped and stock rows are idempotent, so loading the same file twice
 * never duplicates data.
 */

export interface RowResult {
  row: number;
  status: 'CREATED' | 'SKIPPED' | 'ERROR';
  message: string;
}

export interface ImportReport {
  entity: string;
  total: number;
  created: number;
  skipped: number;
  errors: number;
  results: RowResult[];
}

export interface CatalogImportGate {
  createProduct(
    input: { code: string; name: string; description?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
  createSku(
    input: { productId: string; code: string; name: string; baseUom: string },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
  activateSku(skuId: string, ctx: RequestContext): Promise<unknown>;
}

export interface CustomerImportGate {
  createOrganization(tenantId: string, name: string, email?: string): Promise<{ partyId: string }>;
  createAccount(
    input: { partyId: string; creditLimit?: number | undefined },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
}

export interface SupplierImportGate {
  createSupplier(
    input: { name: string; email?: string | undefined; leadTimeDays?: number | undefined },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
}

export interface StockImportGate {
  postMovement(
    input: {
      warehouseId: string;
      skuId: string;
      movementType: 'RECEIPT';
      quantity: number;
      idempotencyKey: string;
      reference?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ movementId: string; duplicate: boolean }>;
}

const MAX_ROWS = 2000;
const MAX_CSV_BYTES = 512 * 1024;

/** Minimal RFC-4180 CSV parser: quoted fields, embedded commas/newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
}

interface ParsedTable {
  /** Column index per lowercased header name. */
  col: Record<string, number>;
  rows: string[][];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export class ImportExportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly catalog: CatalogImportGate,
    private readonly customers: CustomerImportGate,
    private readonly suppliers: SupplierImportGate,
    private readonly stock: StockImportGate,
  ) {}

  private parseTable(csv: string, required: string[]): ParsedTable {
    if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
      throw new DomainError('VALIDATION_FAILED', 'CSV larger than 512KB — split the file');
    }
    const parsed = parseCsv(csv);
    if (parsed.length < 2) {
      throw new DomainError('VALIDATION_FAILED', 'CSV needs a header row and at least one row');
    }
    if (parsed.length - 1 > MAX_ROWS) {
      throw new DomainError('VALIDATION_FAILED', `CSV has more than ${MAX_ROWS} rows — split it`);
    }
    const col: Record<string, number> = {};
    parsed[0]!.forEach((h, i) => {
      col[h.trim().toLowerCase()] = i;
    });
    for (const name of required) {
      if (col[name] === undefined) {
        throw new DomainError('VALIDATION_FAILED', `CSV is missing the '${name}' column`);
      }
    }
    return { col, rows: parsed.slice(1) };
  }

  private cell(table: ParsedTable, row: string[], name: string): string {
    const index = table.col[name];
    return index === undefined ? '' : (row[index] ?? '').trim();
  }

  private async run(
    entity: string,
    table: ParsedTable,
    ctx: RequestContext,
    handler: (row: string[], rowNumber: number) => Promise<RowResult>,
  ): Promise<ImportReport> {
    const results: RowResult[] = [];
    for (let i = 0; i < table.rows.length; i++) {
      const rowNumber = i + 2; // 1-based, after the header
      try {
        results.push(await handler(table.rows[i]!, rowNumber));
      } catch (error) {
        const message =
          error instanceof DomainError ? error.message : 'Unexpected error — row not imported';
        results.push({ row: rowNumber, status: 'ERROR', message });
      }
    }
    const report: ImportReport = {
      entity,
      total: results.length,
      created: results.filter((r) => r.status === 'CREATED').length,
      skipped: results.filter((r) => r.status === 'SKIPPED').length,
      errors: results.filter((r) => r.status === 'ERROR').length,
      results,
    };
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'data.import',
        objectType: 'ImportRun',
        objectId: entity,
        source: 'api',
        newValues: {
          entity,
          total: report.total,
          created: report.created,
          skipped: report.skipped,
          errors: report.errors,
        },
      });
    });
    return report;
  }

  // ---------------------------------------------------------------- imports

  /** Columns: code, name, description? */
  async importProducts(csv: string, ctx: RequestContext): Promise<ImportReport> {
    const table = this.parseTable(csv, ['code', 'name']);
    return this.run('products', table, ctx, async (row, rowNumber) => {
      const code = this.cell(table, row, 'code');
      const name = this.cell(table, row, 'name');
      if (!code || !name) {
        return { row: rowNumber, status: 'ERROR', message: 'code and name are required' };
      }
      const existing = await this.prisma.product.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code } },
      });
      if (existing) {
        return { row: rowNumber, status: 'SKIPPED', message: `Product '${code}' already exists` };
      }
      const description = this.cell(table, row, 'description');
      await this.catalog.createProduct({ code, name, description: description || undefined }, ctx);
      return { row: rowNumber, status: 'CREATED', message: `Product '${code}'` };
    });
  }

  /** Columns: productcode, code, name, baseuom, activate? (yes/no) */
  async importSkus(csv: string, ctx: RequestContext): Promise<ImportReport> {
    const table = this.parseTable(csv, ['productcode', 'code', 'name', 'baseuom']);
    return this.run('skus', table, ctx, async (row, rowNumber) => {
      const productCode = this.cell(table, row, 'productcode');
      const code = this.cell(table, row, 'code');
      const name = this.cell(table, row, 'name');
      const baseUom = this.cell(table, row, 'baseuom');
      if (!productCode || !code || !name || !baseUom) {
        return {
          row: rowNumber,
          status: 'ERROR',
          message: 'productCode, code, name and baseUom are required',
        };
      }
      const product = await this.prisma.product.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: productCode } },
      });
      if (!product) {
        return { row: rowNumber, status: 'ERROR', message: `Product '${productCode}' not found` };
      }
      const existing = await this.prisma.sku.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code } },
      });
      if (existing) {
        return { row: rowNumber, status: 'SKIPPED', message: `SKU '${code}' already exists` };
      }
      const sku = await this.catalog.createSku({ productId: product.id, code, name, baseUom }, ctx);
      const activate = this.cell(table, row, 'activate').toLowerCase();
      if (activate === 'yes' || activate === 'true' || activate === '1') {
        await this.catalog.activateSku(sku.id, ctx);
      }
      return { row: rowNumber, status: 'CREATED', message: `SKU '${code}'` };
    });
  }

  /** Columns: name, email?, creditlimit? */
  async importCustomers(csv: string, ctx: RequestContext): Promise<ImportReport> {
    const table = this.parseTable(csv, ['name']);
    return this.run('customers', table, ctx, async (row, rowNumber) => {
      const name = this.cell(table, row, 'name');
      if (!name) return { row: rowNumber, status: 'ERROR', message: 'name is required' };
      const namesakes = await this.prisma.party.findMany({
        where: { tenantId: ctx.tenantId, normalizedName: normalizeName(name), status: 'ACTIVE' },
        select: { id: true },
      });
      const duplicate =
        namesakes.length > 0 &&
        (await this.prisma.crmAccount.findFirst({
          where: { tenantId: ctx.tenantId, partyId: { in: namesakes.map((p) => p.id) } },
        }));
      if (duplicate) {
        return {
          row: rowNumber,
          status: 'SKIPPED',
          message: `Customer '${name}' already has an account`,
        };
      }
      const email = this.cell(table, row, 'email');
      const creditLimitRaw = this.cell(table, row, 'creditlimit');
      let creditLimit: number | undefined;
      if (creditLimitRaw) {
        creditLimit = Number(creditLimitRaw);
        if (!Number.isFinite(creditLimit) || creditLimit < 0) {
          return { row: rowNumber, status: 'ERROR', message: 'creditLimit must be a number ≥ 0' };
        }
      }
      const { partyId } = await this.customers.createOrganization(
        ctx.tenantId,
        name,
        email || undefined,
      );
      await this.customers.createAccount({ partyId, creditLimit }, ctx);
      return { row: rowNumber, status: 'CREATED', message: `Customer '${name}'` };
    });
  }

  /** Columns: name, email?, leadtimedays? */
  async importSuppliers(csv: string, ctx: RequestContext): Promise<ImportReport> {
    const table = this.parseTable(csv, ['name']);
    return this.run('suppliers', table, ctx, async (row, rowNumber) => {
      const name = this.cell(table, row, 'name');
      if (!name) return { row: rowNumber, status: 'ERROR', message: 'name is required' };
      const namesakes = await this.prisma.party.findMany({
        where: { tenantId: ctx.tenantId, normalizedName: normalizeName(name), status: 'ACTIVE' },
        select: { id: true },
      });
      const duplicate =
        namesakes.length > 0 &&
        (await this.prisma.supplier.findFirst({
          where: { tenantId: ctx.tenantId, partyId: { in: namesakes.map((p) => p.id) } },
        }));
      if (duplicate) {
        return {
          row: rowNumber,
          status: 'SKIPPED',
          message: `Supplier '${name}' already exists`,
        };
      }
      const email = this.cell(table, row, 'email');
      const leadRaw = this.cell(table, row, 'leadtimedays');
      let leadTimeDays: number | undefined;
      if (leadRaw) {
        leadTimeDays = Number(leadRaw);
        if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0) {
          return {
            row: rowNumber,
            status: 'ERROR',
            message: 'leadTimeDays must be a whole number ≥ 0',
          };
        }
      }
      await this.suppliers.createSupplier({ name, email: email || undefined, leadTimeDays }, ctx);
      return { row: rowNumber, status: 'CREATED', message: `Supplier '${name}'` };
    });
  }

  /** Columns: warehousecode, skucode, quantity. Idempotent per (warehouse, sku). */
  async importOpeningStock(csv: string, ctx: RequestContext): Promise<ImportReport> {
    const table = this.parseTable(csv, ['warehousecode', 'skucode', 'quantity']);
    return this.run('stock', table, ctx, async (row, rowNumber) => {
      const warehouseCode = this.cell(table, row, 'warehousecode');
      const skuCode = this.cell(table, row, 'skucode');
      const quantity = Number(this.cell(table, row, 'quantity'));
      if (!warehouseCode || !skuCode || !Number.isFinite(quantity) || quantity <= 0) {
        return {
          row: rowNumber,
          status: 'ERROR',
          message: 'warehouseCode, skuCode and a positive quantity are required',
        };
      }
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { tenantId: ctx.tenantId, code: warehouseCode },
      });
      if (!warehouse) {
        return {
          row: rowNumber,
          status: 'ERROR',
          message: `Warehouse '${warehouseCode}' not found`,
        };
      }
      const sku = await this.prisma.sku.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: skuCode } },
      });
      if (!sku) return { row: rowNumber, status: 'ERROR', message: `SKU '${skuCode}' not found` };
      const posted = await this.stock.postMovement(
        {
          warehouseId: warehouse.id,
          skuId: sku.id,
          movementType: 'RECEIPT',
          quantity,
          idempotencyKey: `import:stock:${warehouseCode}:${skuCode}`,
          reference: 'opening-stock-import',
        },
        ctx,
      );
      if (posted.duplicate) {
        return {
          row: rowNumber,
          status: 'SKIPPED',
          message: `Opening stock for '${skuCode}' in '${warehouseCode}' was already loaded`,
        };
      }
      return { row: rowNumber, status: 'CREATED', message: `${quantity} × '${skuCode}'` };
    });
  }

  // ---------------------------------------------------------------- exports

  async exportCsv(
    entity: 'products' | 'skus' | 'customers' | 'suppliers' | 'stock',
    ctx: RequestContext,
  ): Promise<{ fileName: string; csv: string }> {
    switch (entity) {
      case 'products': {
        const products = await this.prisma.product.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { code: 'asc' },
          take: 5000,
        });
        return {
          fileName: 'products.csv',
          csv: toCsv(
            ['code', 'name', 'description', 'status'],
            products.map((p) => [p.code, p.name, p.description ?? '', p.status]),
          ),
        };
      }
      case 'skus': {
        const skus = await this.prisma.sku.findMany({
          where: { tenantId: ctx.tenantId },
          include: { product: true },
          orderBy: { code: 'asc' },
          take: 5000,
        });
        return {
          fileName: 'skus.csv',
          csv: toCsv(
            ['productCode', 'code', 'name', 'baseUom', 'status'],
            skus.map((s) => [s.product.code, s.code, s.name, s.baseUom, s.status]),
          ),
        };
      }
      case 'customers': {
        const accounts = await this.prisma.crmAccount.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { accountNumber: 'asc' },
          take: 5000,
        });
        const parties = await this.prisma.party.findMany({
          where: { tenantId: ctx.tenantId, id: { in: accounts.map((a) => a.partyId) } },
        });
        const partyById = new Map(parties.map((p) => [p.id, p]));
        return {
          fileName: 'customers.csv',
          csv: toCsv(
            ['accountNumber', 'name', 'email', 'creditLimit', 'creditHold'],
            accounts.map((a) => {
              const party = partyById.get(a.partyId);
              return [
                a.accountNumber,
                party?.name ?? '',
                party?.email ?? '',
                a.creditLimit?.toString() ?? '',
                a.creditHold ? 'yes' : 'no',
              ];
            }),
          ),
        };
      }
      case 'suppliers': {
        const suppliers = await this.prisma.supplier.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { supplierNumber: 'asc' },
          take: 5000,
        });
        const parties = await this.prisma.party.findMany({
          where: { tenantId: ctx.tenantId, id: { in: suppliers.map((s) => s.partyId) } },
        });
        const partyById = new Map(parties.map((p) => [p.id, p]));
        return {
          fileName: 'suppliers.csv',
          csv: toCsv(
            ['supplierNumber', 'name', 'email', 'status', 'leadTimeDays'],
            suppliers.map((s) => [
              s.supplierNumber,
              partyById.get(s.partyId)?.name ?? '',
              partyById.get(s.partyId)?.email ?? '',
              s.status,
              s.leadTimeDays?.toString() ?? '',
            ]),
          ),
        };
      }
      case 'stock': {
        const grouped = await this.prisma.stockMovement.groupBy({
          by: ['warehouseId', 'skuId', 'movementType'],
          where: { tenantId: ctx.tenantId },
          _sum: { quantity: true },
        });
        const inbound = new Set(['RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN']);
        const onHand = new Map<string, number>();
        for (const g of grouped) {
          const key = `${g.warehouseId}|${g.skuId}`;
          const qty = Number(g._sum.quantity ?? 0);
          const signed = inbound.has(g.movementType) ? qty : -qty;
          onHand.set(key, (onHand.get(key) ?? 0) + signed);
        }
        const warehouses = await this.prisma.warehouse.findMany({
          where: { tenantId: ctx.tenantId },
        });
        const skus = await this.prisma.sku.findMany({ where: { tenantId: ctx.tenantId } });
        const warehouseById = new Map(warehouses.map((w) => [w.id, w.code]));
        const skuById = new Map(skus.map((s) => [s.id, s.code]));
        const rows = [...onHand.entries()]
          .filter(([, qty]) => qty !== 0)
          .map(([key, qty]) => {
            const [warehouseId, skuId] = key.split('|') as [string, string];
            return [warehouseById.get(warehouseId) ?? '', skuById.get(skuId) ?? '', String(qty)];
          })
          .sort((a, b) => a[0]!.localeCompare(b[0]!) || a[1]!.localeCompare(b[1]!));
        return { fileName: 'stock.csv', csv: toCsv(['warehouseCode', 'skuCode', 'onHand'], rows) };
      }
    }
  }
}
