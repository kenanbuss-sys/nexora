import { writeAudit } from '@nexora/audit';
import type { ContractStatus, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { SignaturePort } from './signature';

/**
 * Contract repository (DOC-007/009). Numbered contracts against a
 * master-data party with lifecycle DRAFT -> ACTIVE -> TERMINATED,
 * validity dates, value and a renewal notice window. The renewals
 * report derives live: ACTIVE contracts whose end date falls within
 * their notice window (or already passed).
 */

export interface ContractView {
  id: string;
  contractNumber: string;
  title: string;
  partyId: string;
  partyName: string;
  status: ContractStatus;
  startsAt: string;
  endsAt: string | null;
  renewalNoticeDays: number;
  value: string | null;
  currency: string | null;
}

/** Cross-domain contract: approvals are owned by WF (DOC-008). */
export interface ContractApprovalGate {
  requestApproval(
    input: { title: string; subjectObjectType: string; subjectObjectId: string },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
  getStatusFor(
    tenantId: string,
    subjectObjectType: string,
    subjectObjectId: string,
  ): Promise<'NONE' | 'REQUESTED' | 'GRANTED' | 'REJECTED'>;
}

/** Cross-domain contract: effective configuration is owned by CORE. */
export interface ContractConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ version: number; config: unknown }>;
}

export class ContractService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly approvals?: ContractApprovalGate,
    private readonly config?: ContractConfigGate,
    private readonly signatures?: SignaturePort,
  ) {}

  private async approvalThreshold(tenantId: string): Promise<number | null> {
    if (!this.config) return null;
    try {
      const { config } = await this.config.getEffectiveConfiguration(tenantId);
      const raw = (config as { doc?: { contractApprovalThreshold?: unknown } })?.doc
        ?.contractApprovalThreshold;
      return typeof raw === 'number' && raw > 0 ? raw : null;
    } catch {
      return null;
    }
  }

  private toView(
    c: {
      id: string;
      contractNumber: string;
      title: string;
      partyId: string;
      status: ContractStatus;
      startsAt: Date;
      endsAt: Date | null;
      renewalNoticeDays: number;
      value: { toString(): string } | null;
      currency: string | null;
    },
    partyName: string,
  ): ContractView {
    return {
      id: c.id,
      contractNumber: c.contractNumber,
      title: c.title,
      partyId: c.partyId,
      partyName,
      status: c.status,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt ? c.endsAt.toISOString() : null,
      renewalNoticeDays: c.renewalNoticeDays,
      value: c.value ? c.value.toString() : null,
      currency: c.currency,
    };
  }

  async listContracts(ctx: RequestContext): Promise<ContractView[]> {
    const rows = await this.prisma.contract.findMany({
      where: { tenantId: ctx.tenantId },
      include: { party: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return rows.map((r) => this.toView(r, r.party.name));
  }

  async createContract(
    input: {
      title: string;
      partyId: string;
      startsAt: string;
      endsAt?: string | undefined;
      renewalNoticeDays?: number | undefined;
      value?: number | undefined;
      currency?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<ContractView> {
    if (!input.title?.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'Title is required');
    }
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid start date');
    }
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)) {
      throw new DomainError('VALIDATION_FAILED', 'End date must come after the start date');
    }
    if (
      input.renewalNoticeDays !== undefined &&
      (!Number.isInteger(input.renewalNoticeDays) ||
        input.renewalNoticeDays < 0 ||
        input.renewalNoticeDays > 365)
    ) {
      throw new DomainError('VALIDATION_FAILED', 'Notice window must be 0-365 days');
    }
    if (input.value !== undefined && input.value < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Value cannot be negative');
    }
    if (input.currency !== undefined && !/^[A-Z]{3}$/.test(input.currency.toUpperCase())) {
      throw new DomainError('VALIDATION_FAILED', 'Currency must be a 3-letter ISO code');
    }
    const party = await this.prisma.party.findFirst({
      where: { id: input.partyId, tenantId: ctx.tenantId },
    });
    if (!party) throw notFound('Party', input.partyId);

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.contract.count({ where: { tenantId: ctx.tenantId } });
      const created = await tx.contract.create({
        data: {
          tenantId: ctx.tenantId,
          contractNumber: `CT-${String(count + 1).padStart(6, '0')}`,
          title: input.title.trim(),
          partyId: party.id,
          startsAt,
          endsAt,
          renewalNoticeDays: input.renewalNoticeDays ?? 30,
          value: input.value ?? null,
          currency: input.currency ? input.currency.toUpperCase() : null,
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'doc.contract.create',
        objectType: 'Contract',
        objectId: created.id,
        source: 'api',
        newValues: { contractNumber: created.contractNumber, title: created.title },
      });
      return this.toView(created, party.name);
    });
  }

  async transition(
    contractId: string,
    status: 'ACTIVE' | 'TERMINATED',
    ctx: RequestContext,
  ): Promise<ContractView> {
    const row = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId: ctx.tenantId },
      include: { party: { select: { name: true } } },
    });
    if (!row) throw notFound('Contract', contractId);
    const allowed: Record<ContractStatus, ContractStatus[]> = {
      DRAFT: ['ACTIVE'],
      ACTIVE: ['TERMINATED'],
      TERMINATED: [],
    };
    if (!allowed[row.status].includes(status)) {
      throw new DomainError(
        'INVALID_STATE',
        `A contract cannot go from ${row.status} to ${status}`,
      );
    }
    // Contract approvals (DOC-008): activating a contract at or above
    // the configured value threshold needs a granted WF approval — the
    // first activation attempt raises the request; SoD lives in WF.
    if (status === 'ACTIVE' && this.approvals && this.config) {
      const threshold = await this.approvalThreshold(ctx.tenantId);
      if (threshold !== null && row.value !== null && Number(row.value) >= threshold) {
        const state = await this.approvals.getStatusFor(ctx.tenantId, 'contract', row.id);
        if (state === 'NONE') {
          await this.approvals.requestApproval(
            {
              title: `Contract ${row.contractNumber} (${Number(row.value).toFixed(2)})`,
              subjectObjectType: 'contract',
              subjectObjectId: row.id,
            },
            ctx,
          );
          throw new DomainError(
            'INVALID_STATE',
            'Contract activation needs approval — request raised',
          );
        }
        if (state === 'REQUESTED') {
          throw new DomainError('INVALID_STATE', 'Contract approval is still pending');
        }
        if (state === 'REJECTED') {
          throw new DomainError('INVALID_STATE', 'Contract approval was rejected');
        }
      }
    }
    const updated = await this.prisma.contract.update({
      where: { id: row.id },
      data: { status },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'doc.contract.transition',
      objectType: 'Contract',
      objectId: row.id,
      source: 'api',
      previousValues: { status: row.status },
      newValues: { status },
    });
    return this.toView(updated, row.party.name);
  }

  /** ACTIVE contracts inside their renewal notice window (or overdue). */
  /**
   * Electronic signature (DOC-006): send a contract for signature
   * through the provider-neutral port. One envelope per contract —
   * a repeat request is a CONFLICT; polling records SIGNED once.
   */
  async requestSignature(
    contractId: string,
    input: { signerEmail: string },
    ctx: RequestContext,
  ): Promise<{ envelopeId: string; status: string }> {
    if (!this.signatures) {
      throw new DomainError('INVALID_STATE', 'No signature provider is configured');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.signerEmail)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid signer email');
    }
    const row = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('Contract', contractId);
    if (row.status === 'TERMINATED') {
      throw new DomainError('INVALID_STATE', 'Terminated contracts cannot be signed');
    }
    const existing = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'doc.contract.sign_request',
        objectType: 'Contract',
        objectId: row.id,
      },
      select: { id: true },
    });
    if (existing) {
      throw new DomainError('CONFLICT', 'A signature was already requested for this contract');
    }
    const envelope = await this.signatures.createEnvelope({
      documentRef: `contract:${row.id}`,
      signerEmail: input.signerEmail,
      title: row.title,
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'doc.contract.sign_request',
      objectType: 'Contract',
      objectId: row.id,
      source: 'api',
      newValues: { envelopeId: envelope.envelopeId, signerEmail: input.signerEmail },
    });
    return { envelopeId: envelope.envelopeId, status: envelope.status };
  }

  /** Poll the provider and record completion exactly once. */
  async signatureStatus(
    contractId: string,
    ctx: RequestContext,
  ): Promise<{ status: 'NONE' | 'REQUESTED' | 'SIGNED' | 'DECLINED' }> {
    const row = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!row) throw notFound('Contract', contractId);
    const signed = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'doc.contract.signed',
        objectType: 'Contract',
        objectId: row.id,
      },
      select: { id: true },
    });
    if (signed) return { status: 'SIGNED' };
    const request = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'doc.contract.sign_request',
        objectType: 'Contract',
        objectId: row.id,
      },
      orderBy: { occurredAt: 'desc' },
    });
    if (!request) return { status: 'NONE' };
    const envelopeId = (request.newValues as { envelopeId?: string } | null)?.envelopeId;
    if (!envelopeId || !this.signatures) return { status: 'REQUESTED' };
    const envelope = await this.signatures.getEnvelope(envelopeId);
    if (!envelope) return { status: 'REQUESTED' };
    if (envelope.status === 'SIGNED') {
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'doc.contract.signed',
        objectType: 'Contract',
        objectId: row.id,
        source: 'api',
        newValues: { envelopeId },
      });
      return { status: 'SIGNED' };
    }
    if (envelope.status === 'DECLINED') return { status: 'DECLINED' };
    return { status: 'REQUESTED' };
  }

  async renewalsDue(ctx: RequestContext): Promise<ContractView[]> {
    const rows = await this.prisma.contract.findMany({
      where: { tenantId: ctx.tenantId, status: 'ACTIVE', endsAt: { not: null } },
      include: { party: { select: { name: true } } },
      orderBy: [{ endsAt: 'asc' }],
      take: 200,
    });
    const now = Date.now();
    return rows
      .filter((r) => {
        const end = r.endsAt as Date;
        return end.getTime() - r.renewalNoticeDays * 86_400_000 <= now;
      })
      .map((r) => this.toView(r, r.party.name));
  }
}
