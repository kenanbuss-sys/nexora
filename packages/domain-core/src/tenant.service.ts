import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient, Tenant } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * CORE — tenant lifecycle and versioned tenant configuration.
 * Capabilities: CORE-001 (tenant management), CORE-003 (white-label branding,
 * retrieval part), CORE-007 (configuration versioning), CORE-020 (audit).
 */

export interface CreateTenantInput {
  slug: string;
  name: string;
}

export interface TenantView {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,46})[a-z0-9]$/;

function toView(t: Tenant): TenantView {
  return { id: t.id, slug: t.slug, name: t.name, status: t.status, createdAt: t.createdAt };
}

export class TenantService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Platform-level operation (permission: platform.tenant.manage). */
  async createTenant(input: CreateTenantInput, ctx: RequestContext): Promise<TenantView> {
    if (!SLUG_RE.test(input.slug)) {
      throw new DomainError('VALIDATION_FAILED', 'Tenant slug must be 3-48 chars of a-z, 0-9, -', {
        fieldErrors: { slug: 'invalid format' },
      });
    }
    if (input.name.trim().length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Tenant name is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { slug: input.slug } });
      if (existing) {
        throw new DomainError('CONFLICT', 'A tenant with this slug already exists', {
          slug: input.slug,
        });
      }
      const tenant = await tx.tenant.create({
        data: { slug: input.slug, name: input.name.trim() },
      });
      await writeAudit(tx, {
        tenantId: tenant.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'tenant.create',
        objectType: 'Tenant',
        objectId: tenant.id,
        source: 'api',
        newValues: { slug: tenant.slug, name: tenant.name, status: tenant.status },
      });
      await publishToOutbox(tx, {
        tenantId: tenant.id,
        eventType: EVENT_TYPES.TENANT_CREATED,
        aggregateType: 'Tenant',
        aggregateId: tenant.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { tenantId: tenant.id },
      });
      return toView(tenant);
    });
  }

  /** Platform-level operation. Suspended tenants cannot mutate business state. */
  async suspendTenant(tenantId: string, reason: string, ctx: RequestContext): Promise<TenantView> {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw notFound('Tenant', tenantId);
      if (tenant.status === 'SUSPENDED') {
        throw new DomainError('INVALID_STATE', 'Tenant is already suspended');
      }
      const updated = await tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED', version: { increment: 1 } },
      });
      await writeAudit(tx, {
        tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'tenant.suspend',
        objectType: 'Tenant',
        objectId: tenantId,
        source: 'api',
        previousValues: { status: tenant.status },
        newValues: { status: 'SUSPENDED' },
        reason,
      });
      return toView(updated);
    });
  }

  async getTenant(tenantId: string): Promise<TenantView> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw notFound('Tenant', tenantId);
    return toView(tenant);
  }

  /**
   * Publish a new versioned tenant configuration (brand/terminology/modules…).
   * Permission: configuration.publish. Emits tenant.configuration.changed.
   */
  async publishConfiguration(
    config: Prisma.InputJsonValue,
    ctx: RequestContext,
  ): Promise<{ version: number }> {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.tenantConfigurationVersion.findFirst({
        where: { tenantId: ctx.tenantId },
        orderBy: { version: 'desc' },
      });
      const version = (last?.version ?? 0) + 1;
      await tx.tenantConfigurationVersion.create({
        data: {
          tenantId: ctx.tenantId,
          version,
          config,
          publishedBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'tenant.configuration.publish',
        objectType: 'TenantConfigurationVersion',
        objectId: `${ctx.tenantId}:${version}`,
        source: 'api',
        newValues: { version },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.TENANT_CONFIGURATION_CHANGED,
        aggregateType: 'Tenant',
        aggregateId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { tenantId: ctx.tenantId, configVersion: version },
      });
      return { version };
    });
  }

  /** Latest published configuration (brand retrieval); {} when none published. */
  async getEffectiveConfiguration(tenantId: string): Promise<{ version: number; config: unknown }> {
    const latest = await this.prisma.tenantConfigurationVersion.findFirst({
      where: { tenantId },
      orderBy: { version: 'desc' },
    });
    if (!latest) return { version: 0, config: {} };
    return { version: latest.version, config: latest.config };
  }

  /**
   * White-label branding for every signed-in user of the tenant (CORE-003):
   * the sanitized `branding` subset of the effective configuration. Values
   * that fail validation are dropped rather than rendered.
   */
  async getBranding(tenantId: string): Promise<BrandingView> {
    const { config } = await this.getEffectiveConfiguration(tenantId);
    const branding = (config as { branding?: Record<string, unknown> })?.branding ?? {};
    const color = (value: unknown): string | null =>
      typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
    const name =
      typeof branding.name === 'string' && branding.name.trim().length > 0
        ? branding.name.trim().slice(0, 60)
        : null;
    return {
      name,
      accentColor: color(branding.accentColor),
      accentColor2: color(branding.accentColor2),
    };
  }

  /** Published configuration history, newest first. Permission: configuration.read. */
  async listConfigurationVersions(ctx: RequestContext): Promise<ConfigurationVersionView[]> {
    const versions = await this.prisma.tenantConfigurationVersion.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { version: 'desc' },
      take: 20,
    });
    return versions.map((v) => ({
      version: v.version,
      publishedAt: v.publishedAt.toISOString(),
      publishedBy: v.publishedBy,
    }));
  }
}

export interface BrandingView {
  name: string | null;
  accentColor: string | null;
  accentColor2: string | null;
}

export interface ConfigurationVersionView {
  version: number;
  publishedAt: string;
  publishedBy: string | null;
}
