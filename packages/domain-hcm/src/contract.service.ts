import { createHash } from 'node:crypto';
import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import { amountInWordsBs } from './localization/amount-in-words-bs';
import { SALARY_PERMISSIONS, type SalaryPermissionGate } from './payroll.service';
import type { WorkforceConfigGate } from './workforce.service';

/**
 * HCM-016 (Sprint 236) — employment contracts from DOC templates, expiry
 * alerts and private employee documents.
 *
 * - The template (DOC-owned, versioned) is rendered with a WHITELIST of
 *   placeholders; the rendered text and the template version are frozen
 *   on the contract (immutable; correction = terminate + new contract).
 * - A template using salary placeholders needs the salary contract scope
 *   (hcm.salary.contract or hcm.salary.read), and such contract text is
 *   readable only with that scope. The employee management lock
 *   (employee.salaryLocked, ODL "management lock") also covers contracts
 *   and private documents: hcm.salary.management is required.
 * - Employee documents live in the COLLAB store as a PRIVATE entity type
 *   (never reachable through the generic attachment API); access needs
 *   hcm.docs.read / hcm.docs.manage, and every read is audited.
 */

export const HCM_DOC_PERMISSIONS = { read: 'hcm.docs.read', manage: 'hcm.docs.manage' } as const;

export interface ContractTemplateGate {
  getTemplate(
    key: string,
    ctx: RequestContext,
  ): Promise<{ key: string; version: number; content: string; status: string }>;
}

export interface ExpiryTaskGate {
  createTaskInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: {
      title: string;
      description?: string | undefined;
      dueAt?: Date | undefined;
      relatedObjectType?: string | undefined;
      relatedObjectId?: string | undefined;
      createdByUserId?: string | undefined;
    },
  ): Promise<{ id: string }>;
}

export interface PrivateDocumentGate {
  storePrivateDocument(
    input: {
      ownerType: 'hcm_employee';
      entityId: string;
      fileName: string;
      contentType: string;
      dataBase64: string;
    },
    ctx: RequestContext,
  ): Promise<{
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    createdAt: string;
  }>;
  listPrivateDocuments(
    ownerType: 'hcm_employee',
    entityId: string,
    ctx: RequestContext,
  ): Promise<
    Array<{
      id: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
      createdAt: string;
    }>
  >;
  readPrivateDocument(
    ownerType: 'hcm_employee',
    attachmentId: string,
    ctx: RequestContext,
  ): Promise<{
    id: string;
    entityId: string;
    fileName: string;
    contentType: string;
    dataBase64: string;
  }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[A-Za-z0-9_.:-]{8,80}$/;
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z.]*)\s*\}\}/g;
const SALARY_KEYS = new Set(['salary.net', 'salary.netWords', 'salary.currency']);
export const CONTRACT_PLACEHOLDERS = [
  'company.name',
  'employee.name',
  'employee.number',
  'employee.title',
  'contract.number',
  'contract.type',
  'contract.position',
  'contract.startDate',
  'contract.endDate',
  'today',
  'salary.net',
  'salary.netWords',
  'salary.currency',
] as const;
const ALLOWED = new Set<string>(CONTRACT_PLACEHOLDERS);
const CONTRACT_TYPES = { INDEFINITE: 'na neodređeno vrijeme', FIXED_TERM: 'na određeno vrijeme' };

const day = (d: Date): string => d.toISOString().slice(0, 10);
const bsDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}.`;
};

interface Access {
  salary: boolean;
  management: boolean;
  docsRead: boolean;
  docsManage: boolean;
}

export class EmploymentContractService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly permissions: SalaryPermissionGate,
    private readonly templates: ContractTemplateGate,
    private readonly tasks: ExpiryTaskGate,
    private readonly documents: PrivateDocumentGate,
    private readonly configuration: WorkforceConfigGate,
  ) {}

  private async access(ctx: RequestContext): Promise<Access> {
    const keys = new Set(
      ctx.userId ? await this.permissions.getPermissionKeys(ctx.userId, ctx.tenantId) : [],
    );
    return {
      salary: keys.has(SALARY_PERMISSIONS.contract) || keys.has(SALARY_PERMISSIONS.read),
      management: keys.has(SALARY_PERMISSIONS.management),
      docsRead: keys.has(HCM_DOC_PERMISSIONS.read),
      docsManage: keys.has(HCM_DOC_PERMISSIONS.manage),
    };
  }

  /** Locked employees behave as non-existent without the management layer. */
  private async employee(employeeId: string, access: Access, ctx: RequestContext) {
    const e = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: ctx.tenantId },
    });
    if (!e || (e.salaryLocked && !access.management)) throw notFound('Employee', employeeId);
    return e;
  }

  private async audit(
    action: string,
    objectType: string,
    objectId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext,
    reason?: string,
  ) {
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action,
      objectType,
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
      ...(reason !== undefined ? { reason } : {}),
    });
  }

  // ------------------------------------------------------------ rendering

  /** Validates a template body: only whitelisted placeholders. */
  static placeholdersOf(content: string): { used: string[]; unknown: string[] } {
    const used = new Set<string>();
    for (const m of content.matchAll(PLACEHOLDER_RE)) used.add(m[1]!);
    return { used: [...used], unknown: [...used].filter((k) => !ALLOWED.has(k)) };
  }

  private render(content: string, values: Record<string, string>): string {
    return content.replace(PLACEHOLDER_RE, (_, key: string) => values[key] ?? '');
  }

  // ------------------------------------------------------------ contracts

  async generate(
    input: {
      employeeId: string;
      templateKey: string;
      contractType: 'INDEFINITE' | 'FIXED_TERM';
      startDate: string;
      endDate?: string | undefined;
      position?: string | undefined;
      requestKey: string;
    },
    ctx: RequestContext,
  ) {
    if (!KEY_RE.test(input.requestKey)) {
      throw new DomainError('VALIDATION_FAILED', 'requestKey: 8-80 safe characters');
    }
    if (!DATE_RE.test(input.startDate) || (input.endDate && !DATE_RE.test(input.endDate))) {
      throw new DomainError('VALIDATION_FAILED', 'Dates must be YYYY-MM-DD');
    }
    if (input.contractType === 'FIXED_TERM') {
      if (!input.endDate) {
        throw new DomainError('VALIDATION_FAILED', 'A fixed-term contract needs an end date');
      }
      if (input.endDate < input.startDate) {
        throw new DomainError('VALIDATION_FAILED', 'The end date is before the start date');
      }
    } else if (input.endDate) {
      throw new DomainError('VALIDATION_FAILED', 'An indefinite contract has no end date');
    }
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify([
          input.employeeId,
          input.templateKey,
          input.contractType,
          input.startDate,
          input.endDate ?? null,
          input.position?.trim() ?? null,
        ]),
      )
      .digest('hex');
    const access = await this.access(ctx);
    const existing = await this.prisma.employmentContract.findFirst({
      where: { tenantId: ctx.tenantId, requestKey: input.requestKey },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new DomainError('CONFLICT', 'This requestKey was used for a different contract');
      }
      return this.view(existing.id, ctx);
    }
    const employee = await this.employee(input.employeeId, access, ctx);
    const template = await this.templates.getTemplate(input.templateKey, ctx);
    if (template.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', `Template '${input.templateKey}' is not active`);
    }
    const { used, unknown } = EmploymentContractService.placeholdersOf(template.content);
    if (unknown.length) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Unknown template placeholders: ${unknown.join(', ')}`,
        { allowed: [...CONTRACT_PLACEHOLDERS] },
      );
    }
    const containsSalary = used.some((k) => SALARY_KEYS.has(k));
    let salary: { netAmount: Prisma.Decimal; currency: string } | null = null;
    if (containsSalary) {
      if (!access.salary) {
        throw new DomainError(
          'FORBIDDEN',
          `The template prints the salary — it requires '${SALARY_PERMISSIONS.contract}'`,
        );
      }
      salary = await this.prisma.employeeSalary.findFirst({
        where: {
          tenantId: ctx.tenantId,
          employeeId: employee.id,
          validFrom: { lte: new Date(input.startDate) },
        },
        orderBy: { validFrom: 'desc' },
      });
      if (!salary) {
        throw new DomainError(
          'INVALID_STATE',
          `No salary is effective on ${input.startDate} for this employee`,
        );
      }
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
    const year = Number(input.startDate.slice(0, 4));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const last = await this.prisma.employmentContract.findFirst({
        where: { tenantId: ctx.tenantId, contractNumber: { startsWith: `UR-${year}-` } },
        orderBy: { contractNumber: 'desc' },
      });
      const seq = last ? Number(last.contractNumber.slice(-4)) + 1 : 1;
      const contractNumber = `UR-${year}-${String(seq).padStart(4, '0')}`;
      const values: Record<string, string> = {
        'company.name': tenant?.name ?? '',
        'employee.name': employee.name,
        'employee.number': employee.employeeNumber,
        'employee.title': employee.title ?? '',
        'contract.number': contractNumber,
        'contract.type': CONTRACT_TYPES[input.contractType],
        'contract.position': input.position?.trim() || employee.title || '',
        'contract.startDate': bsDate(input.startDate),
        'contract.endDate': input.endDate ? bsDate(input.endDate) : '—',
        today: bsDate(new Date().toISOString().slice(0, 10)),
        ...(salary
          ? {
              'salary.net': Number(salary.netAmount).toFixed(2),
              'salary.netWords': amountInWordsBs(
                Number(salary.netAmount),
                salary.currency === 'BAM' ? 'KM' : salary.currency,
              ),
              'salary.currency': salary.currency === 'BAM' ? 'KM' : salary.currency,
            }
          : {}),
      };
      try {
        const row = await this.prisma.employmentContract.create({
          data: {
            tenantId: ctx.tenantId,
            employeeId: employee.id,
            contractNumber,
            contractType: input.contractType,
            startDate: new Date(input.startDate),
            endDate: input.endDate ? new Date(input.endDate) : null,
            position: input.position?.trim() || null,
            templateKey: template.key,
            templateVersion: template.version,
            content: this.render(template.content, values),
            containsSalary,
            requestKey: input.requestKey,
            requestHash,
            createdBy: ctx.userId ?? null,
          },
        });
        // Fact only — never the rendered text or the salary.
        await this.audit(
          'hcm.contract.issue',
          'EmploymentContract',
          row.id,
          {
            employeeId: employee.id,
            contractNumber,
            templateKey: template.key,
            templateVersion: template.version,
            containsSalary,
          },
          ctx,
        );
        return this.view(row.id, ctx);
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        const same = await this.prisma.employmentContract.findFirst({
          where: { tenantId: ctx.tenantId, requestKey: input.requestKey },
        });
        if (same) {
          if (same.requestHash !== requestHash) {
            throw new DomainError('CONFLICT', 'This requestKey was used for a different contract');
          }
          return this.view(same.id, ctx);
        }
      }
    }
    throw new DomainError(
      'CONFLICT',
      'Contract numbering is busy — retry with the same requestKey',
    );
  }

  private toView(
    c: Prisma.EmploymentContractGetPayload<object>,
    employee: { name: string; employeeNumber: string; salaryLocked: boolean },
    access: Access,
  ) {
    const restricted =
      (c.containsSalary && !access.salary) || (employee.salaryLocked && !access.management);
    return {
      id: c.id,
      employeeId: c.employeeId,
      employeeName: employee.name,
      employeeNumber: employee.employeeNumber,
      contractNumber: c.contractNumber,
      contractType: c.contractType,
      startDate: day(c.startDate),
      endDate: c.endDate ? day(c.endDate) : null,
      position: c.position,
      templateKey: c.templateKey,
      templateVersion: c.templateVersion,
      containsSalary: c.containsSalary,
      status: c.status,
      terminatedOn: c.terminatedOn ? day(c.terminatedOn) : null,
      terminationReason: c.terminationReason,
      restricted,
      content: restricted ? null : c.content,
    };
  }

  async view(id: string, ctx: RequestContext) {
    const access = await this.access(ctx);
    const c = await this.prisma.employmentContract.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!c) throw notFound('EmploymentContract', id);
    const e = await this.prisma.employee.findFirst({
      where: { id: c.employeeId, tenantId: ctx.tenantId },
    });
    if (!e || (e.salaryLocked && !access.management)) throw notFound('EmploymentContract', id);
    return this.toView(c, e, access);
  }

  async list(params: { employeeId?: string | undefined }, ctx: RequestContext) {
    const access = await this.access(ctx);
    const rows = await this.prisma.employmentContract.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(params.employeeId ? { employeeId: params.employeeId } : {}),
      },
      orderBy: [{ startDate: 'desc' }, { contractNumber: 'desc' }],
      take: 500,
    });
    const employees = await this.prisma.employee.findMany({
      where: { tenantId: ctx.tenantId, id: { in: [...new Set(rows.map((r) => r.employeeId))] } },
    });
    const byId = new Map(employees.map((e) => [e.id, e]));
    return rows
      .filter((r) => {
        const e = byId.get(r.employeeId);
        return e && (!e.salaryLocked || access.management);
      })
      .map((r) => this.toView(r, byId.get(r.employeeId)!, access));
  }

  async terminate(
    input: { contractId: string; terminatedOn: string; reason: string },
    ctx: RequestContext,
  ) {
    if (!DATE_RE.test(input.terminatedOn)) {
      throw new DomainError('VALIDATION_FAILED', 'terminatedOn must be YYYY-MM-DD');
    }
    if (input.reason.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'Termination needs a reason (min. 5 characters)');
    }
    const current = await this.view(input.contractId, ctx);
    if (current.status === 'TERMINATED') return current;
    if (input.terminatedOn < current.startDate) {
      throw new DomainError('VALIDATION_FAILED', 'Termination is before the contract start');
    }
    const flipped = await this.prisma.employmentContract.updateMany({
      where: { id: input.contractId, tenantId: ctx.tenantId, status: 'ISSUED' },
      data: {
        status: 'TERMINATED',
        terminatedOn: new Date(input.terminatedOn),
        terminationReason: input.reason.trim(),
      },
    });
    if (flipped.count > 0) {
      await this.audit(
        'hcm.contract.terminate',
        'EmploymentContract',
        input.contractId,
        { terminatedOn: input.terminatedOn },
        ctx,
        input.reason.trim(),
      );
    }
    return this.view(input.contractId, ctx);
  }

  // ------------------------------------------------------------ expiry

  private async expiryDays(ctx: RequestContext): Promise<number> {
    try {
      const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
      const hcm = ((config as Record<string, unknown>).hcm ?? {}) as Record<string, unknown>;
      const d = hcm.contractExpiryDays;
      return typeof d === 'number' && Number.isInteger(d) && d > 0 && d <= 365 ? d : 30;
    } catch {
      return 30;
    }
  }

  /** Fixed-term ISSUED contracts ending within N days (metadata only). */
  async expiring(
    params: { days?: number | undefined; asOf?: string | undefined },
    ctx: RequestContext,
  ) {
    const days = params.days ?? (await this.expiryDays(ctx));
    const asOf = params.asOf && DATE_RE.test(params.asOf) ? params.asOf : day(new Date());
    const from = new Date(asOf);
    const to = new Date(from.getTime() + days * 86_400_000);
    const access = await this.access(ctx);
    const rows = await this.prisma.employmentContract.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'ISSUED',
        contractType: 'FIXED_TERM',
        endDate: { gte: from, lte: to },
      },
      orderBy: { endDate: 'asc' },
      take: 500,
    });
    const employees = await this.prisma.employee.findMany({
      where: { tenantId: ctx.tenantId, id: { in: [...new Set(rows.map((r) => r.employeeId))] } },
    });
    const byId = new Map(employees.map((e) => [e.id, e]));
    return {
      asOf,
      days,
      contracts: rows
        .filter((r) => {
          const e = byId.get(r.employeeId);
          return e && (!e.salaryLocked || access.management);
        })
        .map((r) => {
          const e = byId.get(r.employeeId)!;
          return {
            id: r.id,
            contractNumber: r.contractNumber,
            employeeId: r.employeeId,
            employeeName: e.name,
            endDate: day(r.endDate!),
            daysLeft: Math.round((r.endDate!.getTime() - from.getTime()) / 86_400_000),
            taskId: r.expiryTaskId,
          };
        }),
    };
  }

  /**
   * Creates ONE follow-up task per expiring contract (row lock + CAS on
   * expiryTaskId): repeated or concurrent scans never duplicate tasks.
   * Task text carries no salary. Locked employees get a neutral title.
   */
  async scanExpiry(params: { asOf?: string | undefined }, ctx: RequestContext) {
    const days = await this.expiryDays(ctx);
    const asOf = params.asOf && DATE_RE.test(params.asOf) ? params.asOf : day(new Date());
    const from = new Date(asOf);
    const to = new Date(from.getTime() + days * 86_400_000);
    const due = await this.prisma.employmentContract.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'ISSUED',
        contractType: 'FIXED_TERM',
        endDate: { gte: from, lte: to },
        expiryTaskId: null,
      },
      take: 500,
    });
    let created = 0;
    for (const c of due) {
      const made = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ expiry_task_id: string | null }>>`
          SELECT expiry_task_id FROM employment_contract
          WHERE id = ${c.id}::uuid AND tenant_id = ${ctx.tenantId}::uuid FOR UPDATE`;
        if (!locked[0] || locked[0].expiry_task_id) return false;
        const employee = await tx.employee.findFirst({
          where: { id: c.employeeId, tenantId: ctx.tenantId },
        });
        const task = await this.tasks.createTaskInTx(tx, ctx.tenantId, {
          title: employee?.salaryLocked
            ? `Ugovor ${c.contractNumber} ističe ${bsDate(day(c.endDate!))}`
            : `Ugovor ${c.contractNumber} (${employee?.name ?? ''}) ističe ${bsDate(day(c.endDate!))}`,
          description: 'Odlučite o produženju, novom ugovoru ili prestanku radnog odnosa.',
          dueAt: c.endDate!,
          relatedObjectType: 'hcm_contract',
          relatedObjectId: c.id,
          ...(ctx.userId ? { createdByUserId: ctx.userId } : {}),
        });
        await tx.employmentContract.updateMany({
          where: { id: c.id, tenantId: ctx.tenantId, expiryTaskId: null },
          data: { expiryTaskId: task.id },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'hcm.contract.expiry_task',
          objectType: 'EmploymentContract',
          objectId: c.id,
          source: 'api',
          newValues: { taskId: task.id },
        });
        return true;
      });
      if (made) created += 1;
    }
    return { asOf, days, created };
  }

  // ------------------------------------------------------------ documents

  private assertDocs(access: Access, write: boolean) {
    if (write ? !access.docsManage : !access.docsRead) {
      throw new DomainError(
        'FORBIDDEN',
        `Employee documents require '${write ? HCM_DOC_PERMISSIONS.manage : HCM_DOC_PERMISSIONS.read}'`,
      );
    }
  }

  async uploadDocument(
    input: { employeeId: string; fileName: string; contentType: string; dataBase64: string },
    ctx: RequestContext,
  ) {
    const access = await this.access(ctx);
    this.assertDocs(access, true);
    const employee = await this.employee(input.employeeId, access, ctx);
    const doc = await this.documents.storePrivateDocument(
      {
        ownerType: 'hcm_employee',
        entityId: employee.id,
        fileName: input.fileName,
        contentType: input.contentType,
        dataBase64: input.dataBase64,
      },
      ctx,
    );
    await this.audit(
      'hcm.employee_document.upload',
      'Employee',
      employee.id,
      {
        attachmentId: doc.id,
        fileName: doc.fileName,
      },
      ctx,
    );
    return doc;
  }

  async listDocuments(employeeId: string, ctx: RequestContext) {
    const access = await this.access(ctx);
    this.assertDocs(access, false);
    const employee = await this.employee(employeeId, access, ctx);
    return this.documents.listPrivateDocuments('hcm_employee', employee.id, ctx);
  }

  async downloadDocument(attachmentId: string, ctx: RequestContext) {
    const access = await this.access(ctx);
    this.assertDocs(access, false);
    const doc = await this.documents.readPrivateDocument('hcm_employee', attachmentId, ctx);
    // Re-check the employee (management lock) BEFORE returning any bytes.
    await this.employee(doc.entityId, access, ctx);
    await this.audit(
      'hcm.employee_document.read',
      'Employee',
      doc.entityId,
      {
        attachmentId: doc.id,
      },
      ctx,
    );
    return doc;
  }
}
