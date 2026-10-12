import { writeAudit } from '@nexora/audit';
import type { EmployeeStatus, Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Employee master (HCM-001/005). Numbered employees with role/title,
 * an optional link to an app user, a validated skills list, and an
 * ACTIVE/INACTIVE lifecycle. All mutations are audited.
 */

export interface EmployeeView {
  id: string;
  employeeNumber: string;
  name: string;
  email: string | null;
  title: string | null;
  status: EmployeeStatus;
  skills: string[];
  hiredAt: string | null;
  /** Linked app user (HCM-018 self-service identity); null when unlinked. */
  userId: string | null;
}

/** Cross-domain contract: users and their permissions are owned by IAM. */
export interface EmployeeUserGate {
  /** Status of a user of the tenant, null when it is not a tenant user. */
  userStatus(tenantId: string, userId: string): Promise<string | null>;
  /** Tenant-wide permission keys of a user. */
  permissionKeys(tenantId: string, userId: string): Promise<string[]>;
}

/**
 * Linking a user to an employee hands that user the employee's private
 * documents, contracts and (when enabled) payslips through self-service,
 * so the linker must already hold those rights (Sprint 253 security review).
 */
const LINK_PERMISSIONS = ['hcm.docs.manage', 'hcm.salary.read'] as const;
const LINKABLE_USER_STATUSES = new Set(['ACTIVE', 'INVITED']);

export class EmployeeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly users?: EmployeeUserGate,
  ) {}

  private toView(e: {
    id: string;
    employeeNumber: string;
    name: string;
    email: string | null;
    title: string | null;
    status: EmployeeStatus;
    skills: unknown;
    hiredAt: Date | null;
    userId?: string | null;
  }): EmployeeView {
    return {
      id: e.id,
      employeeNumber: e.employeeNumber,
      name: e.name,
      email: e.email,
      title: e.title,
      status: e.status,
      skills: Array.isArray(e.skills) ? (e.skills as string[]) : [],
      hiredAt: e.hiredAt ? e.hiredAt.toISOString() : null,
      userId: e.userId ?? null,
    };
  }

  async listEmployees(ctx: RequestContext): Promise<EmployeeView[]> {
    const rows = await this.prisma.employee.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ employeeNumber: 'asc' }],
      take: 200,
    });
    return rows.map((r) => this.toView(r));
  }

  async createEmployee(
    input: {
      name: string;
      email?: string | undefined;
      title?: string | undefined;
      hiredAt?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<EmployeeView> {
    if (!input.name?.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'Name is required');
    }
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.employee.count({ where: { tenantId: ctx.tenantId } });
      const created = await tx.employee.create({
        data: {
          tenantId: ctx.tenantId,
          employeeNumber: `EMP-${String(count + 1).padStart(5, '0')}`,
          name: input.name.trim(),
          email: input.email?.trim() || null,
          title: input.title?.trim() || null,
          hiredAt: input.hiredAt ? new Date(input.hiredAt) : null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'hcm.employee.create',
        objectType: 'Employee',
        objectId: created.id,
        source: 'api',
        newValues: { employeeNumber: created.employeeNumber, name: created.name },
      });
      return this.toView(created);
    });
  }

  /** Replace the validated skills list (HCM-005). */
  async setSkills(
    employeeId: string,
    skills: string[],
    ctx: RequestContext,
  ): Promise<EmployeeView> {
    const cleaned = [...new Set(skills.map((s) => s.trim()).filter(Boolean))];
    if (cleaned.length > 30 || cleaned.some((s) => s.length > 60)) {
      throw new DomainError('VALIDATION_FAILED', 'At most 30 skills of up to 60 characters');
    }
    const row = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('Employee', employeeId);
    const updated = await this.prisma.employee.update({
      where: { id: row.id },
      data: { skills: cleaned as Prisma.InputJsonValue },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'hcm.employee.skills',
      objectType: 'Employee',
      objectId: row.id,
      source: 'api',
      previousValues: { skills: row.skills } as Prisma.InputJsonValue,
      newValues: { skills: cleaned } as Prisma.InputJsonValue,
    });
    return this.toView(updated);
  }

  async setStatus(
    employeeId: string,
    status: EmployeeStatus,
    ctx: RequestContext,
  ): Promise<EmployeeView> {
    const row = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('Employee', employeeId);
    if (row.status === status) {
      throw new DomainError('INVALID_STATE', `Employee is already ${status}`);
    }
    const updated = await this.prisma.employee.update({
      where: { id: row.id },
      data: { status },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'hcm.employee.status',
      objectType: 'Employee',
      objectId: row.id,
      source: 'api',
      previousValues: { status: row.status },
      newValues: { status },
    });
    return this.toView(updated);
  }

  /**
   * HCM-018: link (or unlink with null) the app user who signs in as this
   * employee. One employee per user in a tenant (unique index); the user
   * must belong to the tenant. Audited.
   */
  async linkUser(
    employeeId: string,
    userId: string | null,
    ctx: RequestContext,
  ): Promise<EmployeeView> {
    const row = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('Employee', employeeId);
    if (!this.users) throw new DomainError('INVALID_STATE', 'User directory is not wired');
    if (row.userId === userId) return this.toView(row);
    const keys = new Set(
      ctx.userId ? await this.users.permissionKeys(ctx.tenantId, ctx.userId) : [],
    );
    const missing: string[] = LINK_PERMISSIONS.filter((k) => !keys.has(k));
    if (row.salaryLocked && !keys.has('hcm.salary.management')) {
      missing.push('hcm.salary.management');
    }
    if (missing.length > 0 && !ctx.platformAdmin) {
      throw new DomainError('FORBIDDEN', 'Linking a user needs the rights to the data it opens', {
        missing,
      });
    }
    if (userId !== null) {
      if (userId === ctx.userId) {
        throw new DomainError(
          'FORBIDDEN',
          'You cannot link your own user — another HR person must do it (segregation of duties)',
        );
      }
      if (row.userId !== null) {
        throw new DomainError(
          'CONFLICT',
          'This employee is already linked to a user — unlink first, then link the new user',
        );
      }
      const status = await this.users.userStatus(ctx.tenantId, userId);
      if (status === null) throw notFound('User', userId);
      if (!LINKABLE_USER_STATUSES.has(status)) {
        throw new DomainError('INVALID_STATE', `A ${status} user cannot be linked`);
      }
      const taken = await this.prisma.employee.findFirst({
        where: { tenantId: ctx.tenantId, userId, id: { not: row.id } },
        select: { employeeNumber: true },
      });
      if (taken) {
        throw new DomainError('CONFLICT', 'This user is already linked to another employee', {
          employeeNumber: taken.employeeNumber,
        });
      }
    }
    if (row.userId === userId) return this.toView(row);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const u = await tx.employee.update({ where: { id: row.id }, data: { userId } });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'hcm.employee.user_link',
          objectType: 'Employee',
          objectId: row.id,
          source: 'api',
          previousValues: { userId: row.userId },
          newValues: { userId },
        });
        return u;
      });
      return this.toView(updated);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', 'This user is already linked to another employee');
      }
      throw error;
    }
  }
}
