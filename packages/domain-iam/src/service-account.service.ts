import { createHash, randomBytes } from 'node:crypto';
import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Service accounts (IAM-009) and the security event log (IAM-013).
 *
 * API keys carry an explicit permission allowlist, are stored only as
 * SHA-256 hashes and are revocable; every use, denial and revocation
 * lands in the append-only security log.
 */

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  accountId: string | null;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface SecurityEventView {
  id: string;
  eventType: string;
  subject: string | null;
  detail: string | null;
  createdAt: string;
}

export interface ResolvedApiKey {
  tenantId: string;
  apiKeyId: string;
  name: string;
  permissions: string[];
  accountId: string | null;
}

const KEY_PATTERN = /^nxk_[a-f0-9]{48}$/;

/** The only permissions a customer-bound key may carry (B2B-014). */
export const CUSTOMER_KEY_PERMISSIONS = new Set([
  'order.create',
  'order.read',
  'product.read',
  'inventory.read',
]);

/** The only permissions a supplier-bound key may carry (PROC-008). */
export const SUPPLIER_KEY_PERMISSIONS = new Set(['purchase.read']);

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export class ServiceAccountService {
  constructor(private readonly prisma: PrismaClient) {}

  async listKeys(ctx: RequestContext): Promise<ApiKeyView[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      permissions: k.permissions,
      accountId: k.accountId,
      active: k.active,
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      createdAt: k.createdAt.toISOString(),
    }));
  }

  /**
   * Creates a key; the full secret is returned exactly once. A key
   * bound to a customer account (B2B-014) may only carry the
   * customer-safe permission set and acts on that account's behalf.
   */
  async createKey(
    input: {
      name: string;
      permissions: string[];
      accountId?: string | undefined;
      supplierId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<ApiKeyView & { key: string }> {
    if (input.permissions.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Grant at least one permission');
    }
    if (input.accountId && input.supplierId) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Bind a key to an account or a supplier, not both',
      );
    }
    if (input.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: input.supplierId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!supplier) throw notFound('Supplier', input.supplierId);
      const disallowed = input.permissions.filter((p) => !SUPPLIER_KEY_PERMISSIONS.has(p));
      if (disallowed.length > 0) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `Supplier keys cannot carry: ${disallowed.join(', ')}`,
        );
      }
    }
    if (input.accountId) {
      const account = await this.prisma.crmAccount.findFirst({
        where: { id: input.accountId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!account) throw notFound('CrmAccount', input.accountId);
      const disallowed = input.permissions.filter((p) => !CUSTOMER_KEY_PERMISSIONS.has(p));
      if (disallowed.length > 0) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `Customer keys cannot carry: ${disallowed.join(', ')}`,
        );
      }
    }
    const key = `nxk_${randomBytes(24).toString('hex')}`;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.apiKey.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            prefix: key.slice(0, 9),
            keyHash: hashKey(key),
            permissions: [...new Set(input.permissions)],
            accountId: input.accountId ?? input.supplierId ?? null,
            createdBy: ctx.userId ?? null,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'iam.api_key.create',
          objectType: 'ApiKey',
          objectId: row.id,
          source: 'api',
          newValues: { name: input.name, permissions: input.permissions },
        });
        await tx.securityEvent.create({
          data: {
            tenantId: ctx.tenantId,
            eventType: 'api_key.created',
            subject: ctx.userId ?? null,
            detail: `key '${input.name}' (${key.slice(0, 9)}…)`,
          },
        });
        return row;
      });
      return {
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        permissions: created.permissions,
        accountId: created.accountId,
        active: created.active,
        lastUsedAt: null,
        createdAt: created.createdAt.toISOString(),
        key,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', `API key '${input.name}' already exists`);
      }
      throw error;
    }
  }

  async revokeKey(apiKeyId: string, ctx: RequestContext): Promise<void> {
    const updated = await this.prisma.apiKey.updateMany({
      where: { id: apiKeyId, tenantId: ctx.tenantId },
      data: { active: false },
    });
    if (updated.count === 0) throw notFound('ApiKey', apiKeyId);
    await this.logSecurityEvent(ctx.tenantId, 'api_key.revoked', ctx.userId ?? null, apiKeyId);
  }

  /** AuthGuard hook: resolves a presented key, or null. Uses hash lookup. */
  async resolveKey(presentedKey: string): Promise<ResolvedApiKey | null> {
    if (!KEY_PATTERN.test(presentedKey)) return null;
    const row = await this.prisma.apiKey.findFirst({
      where: { keyHash: hashKey(presentedKey), active: true },
    });
    if (!row) return null;
    await this.prisma.apiKey.updateMany({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      tenantId: row.tenantId,
      apiKeyId: row.id,
      name: row.name,
      permissions: row.permissions,
      accountId: row.accountId,
    };
  }

  // --------------------------------------------------------- security events

  async logSecurityEvent(
    tenantId: string | null,
    eventType: string,
    subject: string | null,
    detail: string | null,
  ): Promise<void> {
    await this.prisma.securityEvent.create({
      data: { tenantId, eventType, subject, detail },
    });
  }

  async listSecurityEvents(ctx: RequestContext): Promise<SecurityEventView[]> {
    const events = await this.prisma.securityEvent.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      subject: e.subject,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
