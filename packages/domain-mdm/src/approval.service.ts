import { writeAudit } from '@nexora/audit';
import type { MasterDataRequestStatus, Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Master data approvals (MDM-006). Governed changes to master records
 * travel as change requests holding the proposed payload; a steward
 * OTHER than the requester decides (segregation of duties), and only
 * an approval applies the change — through the owning domain's public
 * interface, never by writing foreign tables.
 */

export interface ChangeRequestView {
  id: string;
  entityType: string;
  entityId: string;
  changeType: string;
  payload: Record<string, unknown>;
  status: MasterDataRequestStatus;
  requestedBy: string;
  decidedBy: string | null;
  decisionNote: string | null;
  createdAt: string;
}

/** Cross-domain contract: parties are owned by MDM's PartyService. */
export interface PartyUpdateGate {
  exists(tenantId: string, partyId: string): Promise<boolean>;
  applyGovernedUpdate(
    partyId: string,
    changes: { name?: string | undefined; email?: string | undefined },
    ctx: RequestContext,
  ): Promise<void>;
}

/** Cross-domain contract: products are owned by PIM. */
export interface ProductUpdateGate {
  exists(tenantId: string, productId: string): Promise<boolean>;
  applyGovernedUpdate(
    productId: string,
    changes: { name?: string | undefined; description?: string | undefined },
    ctx: RequestContext,
  ): Promise<void>;
}

const PARTY_FIELDS = new Set(['name', 'email']);
const PRODUCT_FIELDS = new Set(['name', 'description']);

export class MasterDataApprovalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly parties: PartyUpdateGate,
    private readonly products: ProductUpdateGate,
  ) {}

  private toView(r: {
    id: string;
    entityType: string;
    entityId: string;
    changeType: string;
    payload: unknown;
    status: MasterDataRequestStatus;
    requestedBy: string;
    decidedBy: string | null;
    decisionNote: string | null;
    createdAt: Date;
  }): ChangeRequestView {
    return {
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      changeType: r.changeType,
      payload: (r.payload ?? {}) as Record<string, unknown>,
      status: r.status,
      requestedBy: r.requestedBy,
      decidedBy: r.decidedBy,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async listRequests(
    status: MasterDataRequestStatus | undefined,
    ctx: RequestContext,
  ): Promise<ChangeRequestView[]> {
    const rows = await this.prisma.masterDataRequest.findMany({
      where: { tenantId: ctx.tenantId, ...(status ? { status } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return rows.map((r) => this.toView(r));
  }

  async submitRequest(
    input: { entityType: string; entityId: string; payload: Record<string, unknown> },
    ctx: RequestContext,
  ): Promise<ChangeRequestView> {
    if (!ctx.userId) {
      throw new DomainError('FORBIDDEN', 'A user session is required to request changes');
    }
    const fields =
      input.entityType === 'party'
        ? PARTY_FIELDS
        : input.entityType === 'product'
          ? PRODUCT_FIELDS
          : null;
    if (!fields) {
      throw new DomainError('VALIDATION_FAILED', 'Entity type must be party or product');
    }
    const keys = Object.keys(input.payload);
    if (keys.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'The change payload is empty');
    }
    for (const key of keys) {
      if (!fields.has(key)) {
        throw new DomainError('VALIDATION_FAILED', `Field ${key} is not governed for this entity`);
      }
      const value = input.payload[key];
      if (typeof value !== 'string' || !value.trim() || value.length > 300) {
        throw new DomainError('VALIDATION_FAILED', `Field ${key} must be a short non-empty text`);
      }
    }
    const exists =
      input.entityType === 'party'
        ? await this.parties.exists(ctx.tenantId, input.entityId)
        : await this.products.exists(ctx.tenantId, input.entityId);
    if (!exists) throw notFound(input.entityType, input.entityId);

    const open = await this.prisma.masterDataRequest.findFirst({
      where: {
        tenantId: ctx.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        status: 'PENDING',
      },
    });
    if (open) {
      throw new DomainError('CONFLICT', 'A pending change request already exists for this record');
    }
    const created = await this.prisma.masterDataRequest.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        changeType: 'update',
        payload: input.payload as Prisma.InputJsonValue,
        requestedBy: ctx.userId,
      },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'mdm.change_request.submit',
      objectType: 'MasterDataRequest',
      objectId: created.id,
      source: 'api',
      newValues: {
        entityType: input.entityType,
        entityId: input.entityId,
        payload: input.payload,
      } as Prisma.InputJsonValue,
    });
    return this.toView(created);
  }

  async decide(
    requestId: string,
    input: { approve: boolean; note?: string | undefined },
    ctx: RequestContext,
  ): Promise<ChangeRequestView> {
    if (!ctx.userId) {
      throw new DomainError('FORBIDDEN', 'A user session is required to decide');
    }
    const row = await this.prisma.masterDataRequest.findFirst({
      where: { id: requestId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('MasterDataRequest', requestId);
    if (row.status !== 'PENDING') {
      throw new DomainError('INVALID_STATE', 'This request is already decided');
    }
    if (row.requestedBy === ctx.userId) {
      throw new DomainError(
        'FORBIDDEN',
        'Segregation of duties: the requester cannot decide their own change',
      );
    }
    if (input.approve) {
      const payload = (row.payload ?? {}) as Record<string, string>;
      if (row.entityType === 'party') {
        await this.parties.applyGovernedUpdate(
          row.entityId,
          { name: payload.name, email: payload.email },
          ctx,
        );
      } else {
        await this.products.applyGovernedUpdate(
          row.entityId,
          { name: payload.name, description: payload.description },
          ctx,
        );
      }
    }
    const updated = await this.prisma.masterDataRequest.update({
      where: { id: row.id },
      data: {
        status: input.approve ? 'APPROVED' : 'REJECTED',
        decidedBy: ctx.userId,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
      },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'mdm.change_request.decide',
      objectType: 'MasterDataRequest',
      objectId: row.id,
      source: 'api',
      newValues: { approve: input.approve, note: input.note ?? null },
    });
    return this.toView(updated);
  }
}
