import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';

/**
 * Extension platform (EXT-001..005/009/010). Extensions are DATA: a
 * validated manifest registered into tenant configuration — UI slots,
 * custom actions (delivered through declared connectors), and event
 * subscriptions. No tenant-specific code, no permission escalation:
 * a manifest may only reference permissions that already exist, and
 * its actions execute through the same governed connector port as
 * everything else.
 */

export const PLATFORM_EXTENSION_API = 1;

const manifestSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  name: z.string().min(2).max(120),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  /** EXT-009: which platform extension API the pack targets. */
  extensionApi: z.number().int().min(1),
  /** EXT-010: everything the extension touches must be declared. */
  requiredPermissions: z.array(z.string().min(3).max(100)).max(20).default([]),
  uiSlots: z
    .array(
      z.object({
        slot: z.enum(['nav', 'order-detail', 'product-detail', 'dashboard']),
        label: z.string().min(1).max(60),
        url: z.string().min(1).max(300),
        permission: z.string().min(3).max(100).optional(),
      }),
    )
    .max(20)
    .default([]),
  customActions: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/),
        label: z.string().min(1).max(60),
        connectorKey: z.string().min(2).max(40),
        objectType: z.string().min(2).max(40),
        permission: z.string().min(3).max(100),
      }),
    )
    .max(20)
    .default([]),
  eventSubscriptions: z
    .array(z.string().regex(/^[a-z][a-z0-9_.]*$/))
    .max(40)
    .default([]),
});

export type ExtensionManifest = z.infer<typeof manifestSchema>;

/** Cross-domain contract: tenant configuration writes (owned by core). */
export interface ExtensionConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ version: number; config: unknown }>;
  updateConfiguration(
    config: Record<string, unknown>,
    ctx: RequestContext,
  ): Promise<{ version: number }>;
}

/** Cross-domain contract: known permission keys (owned by IAM). */
export interface PermissionCatalogGate {
  knownPermissionKeys(): string[];
}

/** Cross-domain contract: connector push (owned by INT connectors). */
export interface ActionConnectorGate {
  pushObject(
    input: { key: string; objectType: string; objectId: string; payload: Record<string, unknown> },
    ctx: RequestContext,
  ): Promise<{ ok: boolean; reference: string }>;
}

export class ExtensionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ExtensionConfigGate,
    private readonly permissions: PermissionCatalogGate,
    private readonly connectors: ActionConnectorGate,
  ) {}

  private async installed(tenantId: string): Promise<ExtensionManifest[]> {
    const { config } = await this.config.getEffectiveConfiguration(tenantId);
    const ext = ((config as Record<string, unknown>).ext ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(ext.extensions) ? ext.extensions : [];
    const manifests: ExtensionManifest[] = [];
    for (const entry of raw) {
      const parsed = manifestSchema.safeParse(entry);
      if (parsed.success) manifests.push(parsed.data);
    }
    return manifests;
  }

  /** Validate a manifest without installing (EXT-001 SDK loop). */
  validateManifest(raw: unknown): { manifest: ExtensionManifest } {
    const parsed = manifestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid extension manifest', {
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.') || '(root)', issue.message]),
        ),
      });
    }
    if (parsed.data.extensionApi > PLATFORM_EXTENSION_API) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Manifest targets extension API ${parsed.data.extensionApi}; this platform provides ${PLATFORM_EXTENSION_API} (EXT-009)`,
      );
    }
    const known = new Set(this.permissions.knownPermissionKeys());
    const referenced = [
      ...parsed.data.requiredPermissions,
      ...parsed.data.uiSlots.map((slot) => slot.permission).filter((p): p is string => !!p),
      ...parsed.data.customActions.map((action) => action.permission),
    ];
    const unknown = referenced.filter((permission) => !known.has(permission));
    if (unknown.length > 0) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Manifest references unknown permissions (EXT-010): ${[...new Set(unknown)].join(', ')}`,
      );
    }
    return { manifest: parsed.data };
  }

  /** Install/upgrade a manifest into tenant configuration, versioned. */
  async install(raw: unknown, ctx: RequestContext): Promise<{ key: string; version: string }> {
    const { manifest } = this.validateManifest(raw);
    const { config } = await this.config.getEffectiveConfiguration(ctx.tenantId);
    const full = (config ?? {}) as Record<string, unknown>;
    const ext = (full.ext ?? {}) as Record<string, unknown>;
    const existing = Array.isArray(ext.extensions) ? (ext.extensions as unknown[]) : [];
    const others = existing.filter((entry) => (entry as { key?: unknown }).key !== manifest.key);
    const updated = {
      ...full,
      ext: { ...ext, extensions: [...others, manifest] },
    };
    await this.config.updateConfiguration(updated, ctx);
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'ext.install',
      objectType: 'Extension',
      objectId: manifest.key,
      source: 'api',
      newValues: { version: manifest.version, extensionApi: manifest.extensionApi },
    });
    return { key: manifest.key, version: manifest.version };
  }

  async list(ctx: RequestContext): Promise<ExtensionManifest[]> {
    return this.installed(ctx.tenantId);
  }

  /** EXT-003: effective UI slots across installed extensions. */
  async uiSlots(
    ctx: RequestContext,
  ): Promise<
    Array<{
      slot: string;
      label: string;
      url: string;
      permission: string | null;
      extension: string;
    }>
  > {
    const manifests = await this.installed(ctx.tenantId);
    return manifests.flatMap((manifest) =>
      manifest.uiSlots.map((slot) => ({
        slot: slot.slot,
        label: slot.label,
        url: slot.url,
        permission: slot.permission ?? null,
        extension: manifest.key,
      })),
    );
  }

  /** EXT-005: effective event subscriptions across extensions. */
  async eventSubscriptions(
    ctx: RequestContext,
  ): Promise<Array<{ eventType: string; extensions: string[] }>> {
    const manifests = await this.installed(ctx.tenantId);
    const map = new Map<string, string[]>();
    for (const manifest of manifests) {
      for (const eventType of manifest.eventSubscriptions) {
        map.set(eventType, [...(map.get(eventType) ?? []), manifest.key]);
      }
    }
    return [...map.entries()].map(([eventType, extensions]) => ({ eventType, extensions }));
  }

  /**
   * EXT-004: run a declared custom action — the payload travels
   * through the extension's declared connector, audited; nothing
   * outside the manifest is reachable.
   */
  async runCustomAction(
    input: {
      extensionKey: string;
      actionKey: string;
      objectId: string;
      payload: Record<string, unknown>;
    },
    ctx: RequestContext,
  ): Promise<{ ok: boolean; reference: string }> {
    const manifests = await this.installed(ctx.tenantId);
    const manifest = manifests.find((m) => m.key === input.extensionKey);
    if (!manifest) throw notFound('Extension', input.extensionKey);
    const action = manifest.customActions.find((a) => a.key === input.actionKey);
    if (!action) throw notFound('CustomAction', input.actionKey);
    const result = await this.connectors.pushObject(
      {
        key: action.connectorKey,
        objectType: action.objectType,
        objectId: input.objectId,
        payload: { ...input.payload, extension: manifest.key, action: action.key },
      },
      ctx,
    );
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'ext.action.run',
      objectType: 'CustomAction',
      objectId: `${manifest.key}:${action.key}`,
      source: 'api',
      newValues: { objectId: input.objectId, reference: result.reference } as Prisma.InputJsonValue,
    });
    return result;
  }
}
