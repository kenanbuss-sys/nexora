import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Product configurator (CPQ-007). Configurable models live in tenant
 * configuration (`cpq.configurator.models`) — options, choices, price
 * deltas and incompatibility constraints — so every tenant configures
 * its own catalogue without code changes. `configure` validates a
 * selection against the model and prices it deterministically:
 * base price + the sum of the chosen deltas.
 */

export interface ConfiguratorChoice {
  code: string;
  name: string;
  priceDelta: number;
}

export interface ConfiguratorOption {
  key: string;
  name: string;
  required: boolean;
  choices: ConfiguratorChoice[];
}

export interface ConfiguratorModel {
  skuCode: string;
  name: string;
  basePrice: number;
  options: ConfiguratorOption[];
  /** Pairs of `optionKey:choiceCode` that may not be combined. */
  incompatible: Array<[string, string]>;
}

export interface ConfigurationResult {
  skuCode: string;
  description: string;
  unitPrice: string;
  selections: Record<string, string>;
}

/** Cross-domain contract: tenant configuration (owned by core). */
export interface ConfiguratorConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

function parseModels(config: unknown): ConfiguratorModel[] {
  const cpq = ((config as Record<string, unknown>).cpq ?? {}) as Record<string, unknown>;
  const configurator = (cpq.configurator ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(configurator.models) ? configurator.models : [];
  const models: ConfiguratorModel[] = [];
  for (const entry of raw) {
    const m = entry as Record<string, unknown>;
    if (typeof m.skuCode !== 'string' || !Array.isArray(m.options)) continue;
    models.push({
      skuCode: m.skuCode,
      name: typeof m.name === 'string' ? m.name : m.skuCode,
      basePrice: Number(m.basePrice) || 0,
      options: (m.options as Array<Record<string, unknown>>)
        .filter((o) => typeof o.key === 'string' && Array.isArray(o.choices))
        .map((o) => ({
          key: o.key as string,
          name: typeof o.name === 'string' ? o.name : (o.key as string),
          required: o.required !== false,
          choices: (o.choices as Array<Record<string, unknown>>)
            .filter((c) => typeof c.code === 'string')
            .map((c) => ({
              code: c.code as string,
              name: typeof c.name === 'string' ? c.name : (c.code as string),
              priceDelta: Number(c.priceDelta) || 0,
            })),
        })),
      incompatible: Array.isArray(m.incompatible)
        ? (m.incompatible as unknown[])
            .filter(
              (p): p is [string, string] =>
                Array.isArray(p) &&
                p.length === 2 &&
                typeof p[0] === 'string' &&
                typeof p[1] === 'string',
            )
            .map((p) => [p[0], p[1]])
        : [],
    });
  }
  return models;
}

export class ConfiguratorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: ConfiguratorConfigGate,
  ) {}

  async listModels(ctx: RequestContext): Promise<ConfiguratorModel[]> {
    const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
    return parseModels(config);
  }

  async getModel(skuCode: string, ctx: RequestContext): Promise<ConfiguratorModel> {
    const model = (await this.listModels(ctx)).find((m) => m.skuCode === skuCode);
    if (!model) throw notFound('ConfiguratorModel', skuCode);
    return model;
  }

  /** Validate a selection and price it. Audited (quote traceability). */
  async configure(
    input: { skuCode: string; selections: Record<string, string> },
    ctx: RequestContext,
  ): Promise<ConfigurationResult> {
    const model = await this.getModel(input.skuCode, ctx);
    const parts: string[] = [];
    let price = model.basePrice;
    const chosen = new Set<string>();

    for (const option of model.options) {
      const selection = input.selections[option.key];
      if (selection === undefined) {
        if (option.required) {
          throw new DomainError('VALIDATION_FAILED', `Option '${option.key}' is required`);
        }
        continue;
      }
      const choice = option.choices.find((c) => c.code === selection);
      if (!choice) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `'${selection}' is not a valid choice for '${option.key}'`,
        );
      }
      chosen.add(`${option.key}:${choice.code}`);
      price += choice.priceDelta;
      parts.push(`${option.name}: ${choice.name}`);
    }
    for (const key of Object.keys(input.selections)) {
      if (!model.options.some((o) => o.key === key)) {
        throw new DomainError('VALIDATION_FAILED', `Unknown option '${key}'`);
      }
    }
    for (const [a, b] of model.incompatible) {
      if (chosen.has(a) && chosen.has(b)) {
        throw new DomainError('INVALID_STATE', `Incompatible combination: ${a} + ${b}`);
      }
    }
    const result: ConfigurationResult = {
      skuCode: model.skuCode,
      description: `${model.name} (${parts.join(', ')})`,
      unitPrice: price.toFixed(2),
      selections: input.selections,
    };
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'cpq.configurator.configure',
      objectType: 'ConfiguratorModel',
      objectId: model.skuCode,
      source: 'api',
      newValues: { selections: input.selections, unitPrice: result.unitPrice },
    });
    return result;
  }
}
