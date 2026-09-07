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
}

/** No-op adapter: accepts everything; useful for staging and tests. */
export const noopAdapter: ConnectorAdapter = {
  validate: () => null,
  test: async () => ({ ok: true, detail: 'noop adapter always connects' }),
  push: async (objectType) => ({ ok: true, reference: `noop:${objectType}:${Date.now()}` }),
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
    const result = await adapter.push(input.objectType, input.payload, entry.config);
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
