import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { WebhookTransport } from './integration.service';

/**
 * Connector framework (INT-001). External systems sit behind a
 * provider-neutral port: every connector is declared in versioned
 * tenant configuration (int.connectors) with a kind (what business
 * area it serves) and an adapter (how it talks). Adapters are
 * registered in code; connectors are pure configuration — adding a
 * tenant's accounting system never means a code fork.
 */

export type ConnectorKind = 'accounting' | 'commerce' | 'courier' | 'payment' | 'fiscal' | 'other';

export interface ConnectorConfigEntry {
  key: string;
  kind: ConnectorKind;
  adapter: string;
  config: Record<string, unknown>;
}

export interface ConnectorView {
  key: string;
  kind: ConnectorKind;
  adapter: string;
  valid: boolean;
  problem: string | null;
}

/** The provider-neutral port every adapter implements. */
export interface ConnectorAdapter {
  /** Validate the connector's configuration shape. */
  validate(config: Record<string, unknown>): string | null;
  /** Cheap reachability/config probe. */
  test(config: Record<string, unknown>): Promise<{ ok: boolean; detail: string }>;
  /** Push one business object to the external system. */
  push(
    objectType: string,
    payload: Record<string, unknown>,
    config: Record<string, unknown>,
  ): Promise<{ ok: boolean; reference: string }>;
  /** Optional: pull business objects from the external system. */
  pull?(objectType: string, config: Record<string, unknown>): Promise<unknown[]>;
}

/** No-op adapter: accepts everything; useful for staging and tests. */
export const noopAdapter: ConnectorAdapter = {
  validate: () => null,
  test: async () => ({ ok: true, detail: 'noop adapter always connects' }),
  push: async (objectType) => ({ ok: true, reference: `noop:${objectType}:${Date.now()}` }),
  // Staging/tests: sample objects come straight from the connector config.
  pull: async (objectType, config) => {
    const samples = (config as { sampleOrders?: unknown }).sampleOrders;
    return objectType === 'Orders' && Array.isArray(samples) ? samples : [];
  },
};

/** Webhook adapter: pushes JSON to a configured URL. */
export function webhookAdapter(transport: WebhookTransport): ConnectorAdapter {
  return {
    validate: (config) =>
      typeof config.url === 'string' && /^https?:\/\//.test(config.url)
        ? null
        : 'config.url must be an http(s) URL',
    test: async (config) => {
      try {
        const result = await transport.post(String(config.url), JSON.stringify({ ping: true }), {});
        return { ok: result.ok, detail: `HTTP ${result.status}` };
      } catch (error) {
        return { ok: false, detail: (error as Error).message };
      }
    },
    push: async (objectType, payload, config) => {
      const result = await transport.post(
        String(config.url),
        JSON.stringify({ objectType, payload }),
        {},
      );
      if (!result.ok) {
        throw new DomainError('INVALID_STATE', `Connector push failed (HTTP ${result.status})`);
      }
      return { ok: true, reference: `webhook:${result.status}:${Date.now()}` };
    },
  };
}

/**
 * Mapping engine (INT-010): declarative field mappings from versioned
 * configuration (int.mappings: [{ key, rules: [{ from, to, transform? }] }])
 * reshape outbound payloads per connector — integration differences
 * stay configuration, never code.
 */
export interface MappingRule {
  from: string;
  to: string;
  transform?: 'uppercase' | 'lowercase' | 'string' | 'number' | undefined;
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  let value: unknown = source;
  for (const part of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i] ?? '';
    if (cursor[key] === null || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1] ?? ''] = value;
}

export function applyMapping(
  payload: Record<string, unknown>,
  rules: MappingRule[],
): Record<string, unknown> {
  if (rules.length === 0) return payload;
  const out: Record<string, unknown> = {};
  for (const rule of rules) {
    let value = readPath(payload, rule.from);
    if (value === undefined) continue;
    switch (rule.transform) {
      case 'uppercase':
        value = String(value).toUpperCase();
        break;
      case 'lowercase':
        value = String(value).toLowerCase();
        break;
      case 'string':
        value = String(value);
        break;
      case 'number':
        value = Number(value);
        break;
      default:
        break;
    }
    writePath(out, rule.to, value);
  }
  return out;
}

/** Cross-domain contract: order intake is owned by OMS (COM-005). */
export interface MarketplaceOrderGate {
  quickOrder(
    input: {
      accountId: string;
      warehouseId: string;
      currency: string;
      lines: Array<{ code: string; quantity: number }>;
      channel?: string;
    },
    ctx: RequestContext,
  ): Promise<{ orderId: string; orderNumber: string; unknownCodes: string[] }>;
}

/** Cross-domain contract: invoices are owned by FIN (INT-002). */
export interface AccountingExportGate {
  listInvoices(ctx: RequestContext): Promise<
    Array<{
      id: string;
      invoiceNumber: string;
      invoiceType: string;
      status: string;
      currency: string;
      total: string;
      paidAmount: string;
    }>
  >;
}

/** Cross-domain contract: sellable quantities are owned by WMS (COM-001). */
export interface AvailabilityFeedGate {
  channelAvailability(
    ctx: RequestContext,
  ): Promise<Array<{ skuId: string; code: string; available: number }>>;
}

/** Cross-domain contract: effective configuration is owned by CORE. */
export interface ConnectorConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ version: number; config: unknown }>;
}

const KEY_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const KINDS: ReadonlySet<string> = new Set([
  'accounting',
  'commerce',
  'courier',
  'payment',
  'fiscal',
  'other',
]);

export class ConnectorService {
  private readonly adapters = new Map<string, ConnectorAdapter>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ConnectorConfigGate,
    adapters?: Record<string, ConnectorAdapter>,
    private readonly availability?: AvailabilityFeedGate,
    private readonly orders?: MarketplaceOrderGate,
    private readonly invoices?: AccountingExportGate,
  ) {
    this.adapters.set('noop', noopAdapter);
    for (const [name, adapter] of Object.entries(adapters ?? {})) {
      this.adapters.set(name, adapter);
    }
  }

  private async declared(tenantId: string): Promise<ConnectorConfigEntry[]> {
    try {
      const { config } = await this.config.getEffectiveConfiguration(tenantId);
      const raw = (config as { int?: { connectors?: unknown } })?.int?.connectors;
      if (!Array.isArray(raw)) return [];
      const out: ConnectorConfigEntry[] = [];
      for (const entry of raw) {
        const key = (entry as { key?: unknown })?.key;
        const kind = (entry as { kind?: unknown })?.kind;
        const adapter = (entry as { adapter?: unknown })?.adapter;
        const cfg = (entry as { config?: unknown })?.config;
        if (
          typeof key === 'string' &&
          KEY_RE.test(key) &&
          typeof kind === 'string' &&
          KINDS.has(kind) &&
          typeof adapter === 'string'
        ) {
          out.push({
            key,
            kind: kind as ConnectorKind,
            adapter,
            config: cfg !== null && typeof cfg === 'object' ? (cfg as Record<string, unknown>) : {},
          });
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  async listConnectors(ctx: RequestContext): Promise<ConnectorView[]> {
    const entries = await this.declared(ctx.tenantId);
    return entries.map((entry) => {
      const adapter = this.adapters.get(entry.adapter);
      const problem = adapter
        ? adapter.validate(entry.config)
        : `unknown adapter '${entry.adapter}'`;
      return {
        key: entry.key,
        kind: entry.kind,
        adapter: entry.adapter,
        valid: problem === null,
        problem,
      };
    });
  }

  private async resolve(
    key: string,
    tenantId: string,
  ): Promise<{ entry: ConnectorConfigEntry; adapter: ConnectorAdapter }> {
    const entries = await this.declared(tenantId);
    const entry = entries.find((e) => e.key === key);
    if (!entry) throw notFound('Connector', key);
    const adapter = this.adapters.get(entry.adapter);
    if (!adapter) {
      throw new DomainError('INVALID_STATE', `Adapter '${entry.adapter}' is not registered`);
    }
    const problem = adapter.validate(entry.config);
    if (problem) throw new DomainError('VALIDATION_FAILED', `Connector misconfigured: ${problem}`);
    return { entry, adapter };
  }

  async testConnection(key: string, ctx: RequestContext): Promise<{ ok: boolean; detail: string }> {
    const { entry, adapter } = await this.resolve(key, ctx.tenantId);
    const result = await adapter.test(entry.config);
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'int.connector.test',
      objectType: 'Connector',
      objectId: entry.key,
      source: 'api',
      newValues: { ok: result.ok, detail: result.detail },
    });
    return result;
  }

  /**
   * Push one business object through the port. Callers name the object;
   * the adapter decides the wire format — domains never talk to
   * external systems directly.
   */
  /**
   * B2C channel sync (COM-001): push the sellable-quantity feed to
   * every valid commerce connector through the port — storefronts stay
   * in sync without ever reading the database directly.
   */
  async syncChannels(
    ctx: RequestContext,
  ): Promise<Array<{ key: string; ok: boolean; items: number; detail: string }>> {
    if (!this.availability) {
      throw new DomainError('INVALID_STATE', 'Channel sync is not configured');
    }
    const connectors = (await this.listConnectors(ctx)).filter(
      (c) => c.kind === 'commerce' && c.valid,
    );
    if (connectors.length === 0) return [];
    const feed = await this.availability.channelAvailability(ctx);
    const results: Array<{ key: string; ok: boolean; items: number; detail: string }> = [];
    for (const connector of connectors) {
      try {
        const result = await this.pushObject(
          {
            key: connector.key,
            objectType: 'AvailabilityFeed',
            objectId: `sync:${new Date().toISOString().slice(0, 10)}`,
            payload: { items: feed },
          },
          ctx,
        );
        results.push({
          key: connector.key,
          ok: result.ok,
          items: feed.length,
          detail: result.reference,
        });
      } catch (error) {
        results.push({
          key: connector.key,
          ok: false,
          items: feed.length,
          detail: (error as Error).message,
        });
      }
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'int.channel.sync',
      objectType: 'Connector',
      objectId: 'batch',
      source: 'api',
      newValues: {
        connectors: results.length,
        succeeded: results.filter((r) => r.ok).length,
        items: feed.length,
      },
    });
    return results;
  }

  /**
   * Marketplace order import (COM-005): pull orders through the port
   * and land them as DRAFT sales orders, exactly once per external
   * reference — retried imports never duplicate.
   */
  async importMarketplaceOrders(
    key: string,
    ctx: RequestContext,
  ): Promise<{ imported: number; skipped: number; failed: number }> {
    if (!this.orders) {
      throw new DomainError('INVALID_STATE', 'Marketplace import is not configured');
    }
    const { entry, adapter } = await this.resolve(key, ctx.tenantId);
    if (entry.kind !== 'commerce') {
      throw new DomainError('INVALID_STATE', 'Only commerce connectors import orders');
    }
    if (!adapter.pull) {
      throw new DomainError('INVALID_STATE', `Adapter '${entry.adapter}' cannot pull`);
    }
    const accountId = entry.config.accountId;
    const warehouseId = entry.config.warehouseId;
    if (typeof accountId !== 'string' || typeof warehouseId !== 'string') {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Connector config needs accountId and warehouseId for order import',
      );
    }
    const pulled = await adapter.pull('Orders', entry.config);
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    for (const raw of pulled) {
      const externalRef = (raw as { externalRef?: unknown })?.externalRef;
      const lines = (raw as { lines?: unknown })?.lines;
      if (typeof externalRef !== 'string' || !Array.isArray(lines)) {
        failed += 1;
        continue;
      }
      const marker = `${entry.key}:${externalRef}`;
      const already = await this.prisma.auditEvent.findFirst({
        where: { tenantId: ctx.tenantId, action: 'int.marketplace.import', objectId: marker },
        select: { id: true },
      });
      if (already) {
        skipped += 1;
        continue;
      }
      const orderLines = lines
        .map((l) => ({
          code: String((l as { code?: unknown })?.code ?? ''),
          quantity: Number((l as { quantity?: unknown })?.quantity ?? 0),
        }))
        .filter((l) => l.code && l.quantity > 0);
      if (orderLines.length === 0) {
        failed += 1;
        continue;
      }
      try {
        const created = await this.orders.quickOrder(
          { accountId, warehouseId, currency: 'EUR', lines: orderLines, channel: 'marketplace' },
          ctx,
        );
        await writeAudit(this.prisma, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'int.marketplace.import',
          objectType: 'SalesOrder',
          objectId: marker,
          source: 'api',
          newValues: { orderId: created.orderId, orderNumber: created.orderNumber },
        });
        imported += 1;
      } catch {
        failed += 1;
      }
    }
    return { imported, skipped, failed };
  }

  private async mappingRules(tenantId: string, connectorKey: string): Promise<MappingRule[]> {
    try {
      const { config } = await this.config.getEffectiveConfiguration(tenantId);
      const raw = (config as { int?: { mappings?: unknown } })?.int?.mappings;
      if (!Array.isArray(raw)) return [];
      const mapping = raw.find((m) => (m as { key?: unknown })?.key === connectorKey);
      const rules = (mapping as { rules?: unknown })?.rules;
      if (!Array.isArray(rules)) return [];
      const out: MappingRule[] = [];
      for (const rule of rules) {
        const from = (rule as { from?: unknown })?.from;
        const to = (rule as { to?: unknown })?.to;
        const transform = (rule as { transform?: unknown })?.transform;
        if (typeof from === 'string' && typeof to === 'string') {
          out.push({
            from,
            to,
            ...(transform === 'uppercase' ||
            transform === 'lowercase' ||
            transform === 'string' ||
            transform === 'number'
              ? { transform }
              : {}),
          });
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  /** Preview the mapped payload without pushing (INT-010). */
  async previewMapping(
    input: { key: string; payload: Record<string, unknown> },
    ctx: RequestContext,
  ): Promise<{ mapped: Record<string, unknown>; rules: number }> {
    await this.resolve(input.key, ctx.tenantId);
    const rules = await this.mappingRules(ctx.tenantId, input.key);
    return { mapped: applyMapping(input.payload, rules), rules: rules.length };
  }

  /**
   * Accounting export (INT-002): push issued invoices to an
   * accounting connector exactly once each. Only connectors of kind
   * 'accounting' qualify; VOID and DRAFT invoices never leave.
   */
  async exportInvoices(
    key: string,
    ctx: RequestContext,
  ): Promise<{ exported: number; skipped: number; references: string[] }> {
    if (!this.invoices) {
      throw new DomainError('INVALID_STATE', 'Invoice export is not wired');
    }
    const { entry, adapter } = await this.resolve(key, ctx.tenantId);
    if (entry.kind !== 'accounting') {
      throw new DomainError('INVALID_STATE', `Connector '${key}' is not an accounting connector`);
    }
    const rules = await this.mappingRules(ctx.tenantId, entry.key);
    const invoices = await this.invoices.listInvoices(ctx);
    let exported = 0;
    let skipped = 0;
    const references: string[] = [];
    for (const invoice of invoices) {
      if (invoice.status === 'VOID' || invoice.status === 'DRAFT') {
        skipped += 1;
        continue;
      }
      const marker = `${entry.key}:${invoice.id}`;
      const already = await this.prisma.auditEvent.findFirst({
        where: {
          tenantId: ctx.tenantId,
          action: 'int.accounting.export',
          objectType: 'Invoice',
          objectId: marker,
        },
        select: { id: true },
      });
      if (already) {
        skipped += 1;
        continue;
      }
      const payload: Record<string, unknown> = {
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType,
        status: invoice.status,
        currency: invoice.currency,
        total: invoice.total,
        paidAmount: invoice.paidAmount,
      };
      const mapped = rules.length > 0 ? applyMapping(payload, rules) : payload;
      const result = await adapter.push('invoice', mapped, entry.config);
      if (!result.ok) {
        skipped += 1;
        continue;
      }
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'int.accounting.export',
        objectType: 'Invoice',
        objectId: marker,
        source: 'api',
        newValues: { invoiceNumber: invoice.invoiceNumber, reference: result.reference },
      });
      references.push(result.reference);
      exported += 1;
    }
    return { exported, skipped, references };
  }

  /**
   * Commerce catalog export (INT-003): push the sellable catalog —
   * active SKUs with their per-channel commercial copy — to a
   * commerce connector. Sync is upsert-natured and repeatable; each
   * run is audited with its summary.
   */
  async exportCatalog(
    key: string,
    ctx: RequestContext,
  ): Promise<{ pushed: number; withContent: number; reference: string }> {
    const { entry, adapter } = await this.resolve(key, ctx.tenantId);
    if (entry.kind !== 'commerce') {
      throw new DomainError('INVALID_STATE', `Connector '${key}' is not a commerce connector`);
    }
    const channel =
      typeof (entry.config as { channel?: unknown }).channel === 'string'
        ? (entry.config as { channel: string }).channel
        : entry.key;
    const skus = await this.prisma.sku.findMany({
      where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
      select: { id: true, code: true, name: true, baseUom: true },
      take: 1000,
    });
    const contents = await this.prisma.skuChannelContent.findMany({
      where: { tenantId: ctx.tenantId, channel },
    });
    const contentOf = new Map(contents.map((c) => [c.skuId, c]));
    const items = skus.map((sku) => {
      const content = contentOf.get(sku.id);
      return {
        code: sku.code,
        title: content?.title ?? sku.name,
        description: content?.description ?? null,
        uom: sku.baseUom,
        hasChannelContent: content !== undefined,
      };
    });
    const rules = await this.mappingRules(ctx.tenantId, entry.key);
    const payload: Record<string, unknown> = { channel, items };
    const mapped = rules.length > 0 ? applyMapping(payload, rules) : payload;
    const result = await adapter.push('catalog', mapped, entry.config);
    if (!result.ok) {
      throw new DomainError('INVALID_STATE', 'The commerce provider refused the catalog');
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'int.commerce.catalog',
      objectType: 'Connector',
      objectId: entry.key,
      source: 'api',
      newValues: {
        channel,
        pushed: items.length,
        withContent: items.filter((i) => i.hasChannelContent).length,
        reference: result.reference,
      },
    });
    return {
      pushed: items.length,
      withContent: items.filter((i) => i.hasChannelContent).length,
      reference: result.reference,
    };
  }

  /**
   * Courier connectors (INT-005): book a shipment for a packed
   * package — exactly once per (connector, package); a retry returns
   * the existing tracking reference. The SSCC and weight ride along.
   */
  async createShipment(
    input: { key: string; packageId: string },
    ctx: RequestContext,
  ): Promise<{ trackingRef: string; existing: boolean }> {
    const { entry, adapter } = await this.resolve(input.key, ctx.tenantId);
    if (entry.kind !== 'courier') {
      throw new DomainError('INVALID_STATE', `Connector '${input.key}' is not a courier connector`);
    }
    const pkg = await this.prisma.package.findFirst({
      where: { id: input.packageId, tenantId: ctx.tenantId },
    });
    if (!pkg) throw notFound('Package', input.packageId);
    if (pkg.status === 'SHIPPED') {
      throw new DomainError('INVALID_STATE', 'The package already shipped');
    }
    const marker = `${entry.key}:${pkg.id}`;
    const existing = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'int.courier.shipment',
        objectType: 'Package',
        objectId: marker,
      },
      orderBy: { occurredAt: 'desc' },
    });
    if (existing) {
      const trackingRef =
        (existing.newValues as { trackingRef?: string } | null)?.trackingRef ?? '';
      return { trackingRef, existing: true };
    }
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: pkg.orderId, tenantId: ctx.tenantId },
      select: { orderNumber: true },
    });
    const result = await adapter.push(
      'shipment',
      {
        packageNumber: pkg.packageNumber,
        ssccCode: pkg.ssccCode,
        orderNumber: order?.orderNumber ?? null,
        weightKg: pkg.weightKg === null ? null : String(pkg.weightKg),
      },
      entry.config,
    );
    if (!result.ok) {
      throw new DomainError('INVALID_STATE', 'The courier refused the shipment');
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'int.courier.shipment',
      objectType: 'Package',
      objectId: marker,
      source: 'api',
      newValues: { trackingRef: result.reference, packageNumber: pkg.packageNumber },
    });
    return { trackingRef: result.reference, existing: false };
  }

  /**
   * Fiscal / eInvoice connectors (INT-006): fiscalize an issued
   * invoice exactly once per (connector, invoice); a retry returns
   * the existing fiscal reference. VOID invoices never fiscalize.
   */
  async fiscalizeInvoice(
    input: { key: string; invoiceId: string },
    ctx: RequestContext,
  ): Promise<{ fiscalRef: string; existing: boolean }> {
    const { entry, adapter } = await this.resolve(input.key, ctx.tenantId);
    if (entry.kind !== 'fiscal') {
      throw new DomainError('INVALID_STATE', `Connector '${input.key}' is not a fiscal connector`);
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: input.invoiceId, tenantId: ctx.tenantId },
    });
    if (!invoice) throw notFound('Invoice', input.invoiceId);
    if (invoice.status === 'VOID') {
      throw new DomainError('INVALID_STATE', 'VOID invoices cannot be fiscalized');
    }
    const marker = `${entry.key}:${invoice.id}`;
    const existing = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'int.fiscal.invoice',
        objectType: 'Invoice',
        objectId: marker,
      },
      orderBy: { occurredAt: 'desc' },
    });
    if (existing) {
      const fiscalRef = (existing.newValues as { fiscalRef?: string } | null)?.fiscalRef ?? '';
      return { fiscalRef, existing: true };
    }
    const rules = await this.mappingRules(ctx.tenantId, entry.key);
    const payload: Record<string, unknown> = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.invoiceType,
      total: invoice.total.toString(),
      currency: invoice.currency,
      issuedAt: invoice.issuedAt.toISOString(),
    };
    const mapped = rules.length > 0 ? applyMapping(payload, rules) : payload;
    const result = await adapter.push('fiscal_invoice', mapped, entry.config);
    if (!result.ok) {
      throw new DomainError('INVALID_STATE', 'The fiscal provider refused the invoice');
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'int.fiscal.invoice',
      objectType: 'Invoice',
      objectId: marker,
      source: 'api',
      newValues: { fiscalRef: result.reference, invoiceNumber: invoice.invoiceNumber },
    });
    return { fiscalRef: result.reference, existing: false };
  }

  /**
   * Payment connectors (INT-004): create a payment intent for a sales
   * order through a declared payment connector — one intent per
   * (connector, order), a retry returns the existing reference — and
   * record the provider's confirmation exactly once.
   */
  async createPaymentIntent(
    input: { key: string; orderId: string },
    ctx: RequestContext,
  ): Promise<{ reference: string; amount: string; currency: string; existing: boolean }> {
    const { entry, adapter } = await this.resolve(input.key, ctx.tenantId);
    if (entry.kind !== 'payment') {
      throw new DomainError('INVALID_STATE', `Connector '${input.key}' is not a payment connector`);
    }
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: input.orderId, tenantId: ctx.tenantId },
    });
    if (!order) throw notFound('SalesOrder', input.orderId);
    if (order.status === 'CANCELLED' || order.status === 'DRAFT') {
      throw new DomainError('INVALID_STATE', 'Only confirmed orders take payment intents');
    }
    const marker = `${entry.key}:${order.id}`;
    const existing = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'int.payment.intent',
        objectType: 'SalesOrder',
        objectId: marker,
      },
      orderBy: { occurredAt: 'desc' },
    });
    if (existing) {
      const reference = (existing.newValues as { reference?: string } | null)?.reference ?? '';
      return {
        reference,
        amount: order.total.toString(),
        currency: order.currency,
        existing: true,
      };
    }
    const result = await adapter.push(
      'payment_intent',
      { orderNumber: order.orderNumber, amount: order.total.toString(), currency: order.currency },
      entry.config,
    );
    if (!result.ok) {
      throw new DomainError('INVALID_STATE', 'The payment provider refused the intent');
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'int.payment.intent',
      objectType: 'SalesOrder',
      objectId: marker,
      source: 'api',
      newValues: { reference: result.reference, amount: order.total.toString() },
    });
    return {
      reference: result.reference,
      amount: order.total.toString(),
      currency: order.currency,
      existing: false,
    };
  }

  /** Provider confirmation, recorded exactly once per reference. */
  async confirmPayment(
    input: { key: string; reference: string; orderId: string },
    ctx: RequestContext,
  ): Promise<{ confirmed: boolean; duplicate: boolean }> {
    const { entry } = await this.resolve(input.key, ctx.tenantId);
    if (entry.kind !== 'payment') {
      throw new DomainError('INVALID_STATE', `Connector '${input.key}' is not a payment connector`);
    }
    const intent = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'int.payment.intent',
        objectType: 'SalesOrder',
        objectId: `${entry.key}:${input.orderId}`,
      },
    });
    if (!intent) throw notFound('PaymentIntent', input.orderId);
    const already = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'int.payment.confirmed',
        objectType: 'SalesOrder',
        objectId: `${entry.key}:${input.orderId}`,
      },
      select: { id: true },
    });
    if (already) return { confirmed: true, duplicate: true };
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'int.payment.confirmed',
      objectType: 'SalesOrder',
      objectId: `${entry.key}:${input.orderId}`,
      source: 'api',
      newValues: { reference: input.reference },
    });
    return { confirmed: true, duplicate: false };
  }

  async pushObject(
    input: {
      key: string;
      objectType: string;
      objectId: string;
      payload: Record<string, unknown>;
    },
    ctx: RequestContext,
  ): Promise<{ ok: boolean; reference: string }> {
    const { entry, adapter } = await this.resolve(input.key, ctx.tenantId);
    // INT-010: reshape the payload through the connector's mapping.
    const rules = await this.mappingRules(ctx.tenantId, entry.key);
    const mapped = rules.length > 0 ? applyMapping(input.payload, rules) : input.payload;
    const result = await adapter.push(input.objectType, mapped, entry.config);
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'int.connector.push',
      objectType: input.objectType,
      objectId: input.objectId,
      source: 'api',
      newValues: { connector: entry.key, reference: result.reference },
    });
    return result;
  }
}
