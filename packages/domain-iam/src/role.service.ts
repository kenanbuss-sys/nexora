import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import { isAllowed, type GrantedPermission, type ScopeRef } from './permissions';

/**
 * IAM — RBAC (IAM-002) and scoped permissions (IAM-003).
 * Role/permission changes are audited and emit permission.changed.
 */

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export type AssignScopeType = 'TENANT' | 'LEGAL_ENTITY' | 'BUSINESS_UNIT' | 'BRANCH' | 'FACTORY';

const PERMISSION_KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

export class RoleService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Permission: iam.role.manage. */
  async listRoles(ctx: RequestContext): Promise<RoleView[]> {
    const roles = await this.prisma.role.findMany({
      where: { tenantId: ctx.tenantId },
      include: { permissions: { orderBy: { permissionKey: 'asc' } } },
      orderBy: { name: 'asc' },
      take: 200,
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions.map((p) => p.permissionKey),
    }));
  }

  /** Permission: iam.role.manage. */
  async createRole(
    input: { name: string; description?: string | undefined; permissions?: string[] | undefined },
    ctx: RequestContext,
  ): Promise<RoleView> {
    const name = input.name.trim();
    if (name.length === 0) throw new DomainError('VALIDATION_FAILED', 'Role name is required');
    const permissions = [...new Set(input.permissions ?? [])];
    for (const key of permissions) {
      if (!PERMISSION_KEY_RE.test(key)) {
        throw new DomainError('VALIDATION_FAILED', `Invalid permission key: ${key}`);
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.role.findUnique({
        where: { tenantId_name: { tenantId: ctx.tenantId, name } },
      });
      if (existing) throw new DomainError('CONFLICT', 'A role with this name already exists');
      const role = await tx.role.create({
        data: {
          tenantId: ctx.tenantId,
          name,
          description: input.description ?? null,
          permissions: {
            create: permissions.map((permissionKey) => ({
              tenantId: ctx.tenantId,
              permissionKey,
            })),
          },
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'role.create',
        objectType: 'Role',
        objectId: role.id,
        source: 'api',
        newValues: { name, permissions },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PERMISSION_CHANGED,
        aggregateType: 'Role',
        aggregateId: role.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { subjectId: role.id, scope: 'role.created' },
      });
      return { id: role.id, name, description: role.description, permissions };
    });
  }

  /** Replace a role's permission set. Permission: iam.permission.manage. */
  async setRolePermissions(
    roleId: string,
    permissions: string[],
    ctx: RequestContext,
  ): Promise<RoleView> {
    const unique = [...new Set(permissions)];
    for (const key of unique) {
      if (!PERMISSION_KEY_RE.test(key)) {
        throw new DomainError('VALIDATION_FAILED', `Invalid permission key: ${key}`);
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, tenantId: ctx.tenantId },
        include: { permissions: true },
      });
      if (!role) throw notFound('Role', roleId);
      const previous = role.permissions.map((p) => p.permissionKey).sort();
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: unique.map((permissionKey) => ({
          tenantId: ctx.tenantId,
          roleId: role.id,
          permissionKey,
        })),
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'role.permissions.set',
        objectType: 'Role',
        objectId: role.id,
        source: 'api',
        previousValues: { permissions: previous },
        newValues: { permissions: [...unique].sort() },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PERMISSION_CHANGED,
        aggregateType: 'Role',
        aggregateId: role.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { subjectId: role.id, scope: 'role.permissions' },
      });
      return { id: role.id, name: role.name, description: role.description, permissions: unique };
    });
  }

  /** Assign a role to a user, tenant-wide or scoped to an org node. */
  async assignRole(
    input: {
      userId: string;
      roleId: string;
      scopeType?: AssignScopeType | undefined;
      scopeId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ assignmentId: string }> {
    const scopeType = input.scopeType ?? 'TENANT';
    if (scopeType !== 'TENANT' && !input.scopeId) {
      throw new DomainError('VALIDATION_FAILED', 'scopeId is required for org-scoped assignments');
    }
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: input.userId, tenantId: ctx.tenantId },
      });
      if (!user) throw notFound('User', input.userId);
      const role = await tx.role.findFirst({
        where: { id: input.roleId, tenantId: ctx.tenantId },
      });
      if (!role) throw notFound('Role', input.roleId);

      const scopeId = scopeType === 'TENANT' ? ctx.tenantId : (input.scopeId as string);
      if (scopeType !== 'TENANT') {
        const scopeExists = await this.scopeNodeExists(tx, ctx.tenantId, scopeType, scopeId);
        if (!scopeExists) throw notFound(scopeType, scopeId);
      }

      const assignment = await tx.userRoleAssignment.upsert({
        where: {
          tenantId_userId_roleId_scopeType_scopeId: {
            tenantId: ctx.tenantId,
            userId: user.id,
            roleId: role.id,
            scopeType,
            scopeId,
          },
        },
        create: {
          tenantId: ctx.tenantId,
          userId: user.id,
          roleId: role.id,
          scopeType,
          scopeId,
        },
        update: {},
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'role.assign',
        objectType: 'UserRoleAssignment',
        objectId: assignment.id,
        source: 'api',
        newValues: { userId: user.id, roleId: role.id, scopeType, scopeId },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PERMISSION_CHANGED,
        aggregateType: 'User',
        aggregateId: user.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { subjectId: user.id, scope: `${scopeType}:${scopeId}` },
      });
      return { assignmentId: assignment.id };
    });
  }

  /** All grants effective for a user (server-side; used by the authorizer). */
  async getEffectivePermissions(userId: string, tenantId: string): Promise<GrantedPermission[]> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { tenantId, userId },
      include: { role: { include: { permissions: true } } },
    });
    const grants: GrantedPermission[] = [];
    for (const assignment of assignments) {
      for (const permission of assignment.role.permissions) {
        grants.push({
          permissionKey: permission.permissionKey,
          scopeType: assignment.scopeType,
          scopeId: assignment.scopeId,
        });
      }
    }
    return grants;
  }

  /** Default-deny authorization check for the API guard. */
  async authorize(ctx: RequestContext, permissionKey: string, scope?: ScopeRef): Promise<boolean> {
    if (ctx.tenantStatus !== 'ACTIVE') return false;
    if (!ctx.userId || ctx.userStatus !== 'ACTIVE') return false;
    const grants = await this.getEffectivePermissions(ctx.userId, ctx.tenantId);
    return isAllowed(grants, permissionKey, scope);
  }

  private async scopeNodeExists(
    tx: Pick<PrismaClient, 'legalEntity' | 'businessUnit' | 'branch' | 'factory'>,
    tenantId: string,
    scopeType: Exclude<AssignScopeType, 'TENANT'>,
    scopeId: string,
  ): Promise<boolean> {
    const where = { id: scopeId, tenantId };
    switch (scopeType) {
      case 'LEGAL_ENTITY':
        return (await tx.legalEntity.findFirst({ where })) !== null;
      case 'BUSINESS_UNIT':
        return (await tx.businessUnit.findFirst({ where })) !== null;
      case 'BRANCH':
        return (await tx.branch.findFirst({ where })) !== null;
      case 'FACTORY':
        return (await tx.factory.findFirst({ where })) !== null;
    }
  }
}
