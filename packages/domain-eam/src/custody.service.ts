import { createHash, randomBytes } from 'node:crypto';
import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * EAM-015/016 (Sprint 238) — equipment custody and QR labels.
 *
 * - A custody document (revers) issues one or more assets to an employee
 *   (HCM-owned, read through a gate). Lines are returned individually with
 *   a condition (OK / DAMAGED / LOST); the document status is derived.
 * - An asset can be in at most ONE open custody line — enforced by a
 *   partial unique index, so concurrent issues of the same asset cannot
 *   both succeed. Issue is idempotent per requestKey.
 * - Printing a revers/label/list is audited (FinTrack parity).
 * - Public QR lookup (EAM-016): an unguessable, revocable token returns
 *   ONLY non-sensitive fields — no value, serial, notes, internal ids or
 *   the holder's name.
 */

export interface CustodyEmployeeGate {
  employee(
    employeeId: string,
    ctx: RequestContext,
  ): Promise<{ id: string; name: string; employeeNumber: string; status: string } | null>;
}

const KEY_RE = /^[A-Za-z0-9_.:-]{8,80}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
export const RETURN_CONDITIONS = ['OK', 'DAMAGED', 'LOST'] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];
export const PRINT_KINDS = ['REVERS', 'LABEL', 'LIST'] as const;

const STATUS_LABELS: Record<string, string> = {
  IN_SERVICE: 'U upotrebi',
  UNDER_MAINTENANCE: 'Na održavanju',
  RETIRED: 'Rashodovano',
};

const newToken = (): string => randomBytes(16).toString('base64url');

export class CustodyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly employees: CustodyEmployeeGate,
  ) {}

  private async audit(
    action: string,
    objectType: string,
    objectId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext,
    tx?: Prisma.TransactionClient,
  ) {
    await writeAudit(tx ?? this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action,
      objectType,
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
    });
  }

  // ------------------------------------------------------------ asset data

  async setAssetDetails(
    input: { assetId: string; location?: string | null | undefined },
    ctx: RequestContext,
  ) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: input.assetId, tenantId: ctx.tenantId },
    });
    if (!asset) throw notFound('Asset', input.assetId);
    const location = input.location === undefined ? asset.location : input.location?.trim() || null;
    if (location === asset.location) return this.assetQrView(asset.id, ctx);
    await this.prisma.asset.updateMany({
      where: { id: asset.id, tenantId: ctx.tenantId },
      data: { location },
    });
    await this.audit(
      'eam.asset.location',
      'Asset',
      asset.id,
      { location, previous: asset.location },
      ctx,
    );
    return this.assetQrView(asset.id, ctx);
  }

  /** Issue (or reissue = revoke the old one) the public QR token. */
  async issueQrToken(assetId: string, ctx: RequestContext, rotate = false) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId: ctx.tenantId },
    });
    if (!asset) throw notFound('Asset', assetId);
    if (asset.qrToken && !rotate) return this.assetQrView(asset.id, ctx);
    const token = newToken();
    await this.prisma.asset.updateMany({
      where: { id: asset.id, tenantId: ctx.tenantId },
      data: { qrToken: token },
    });
    await this.audit(
      rotate ? 'eam.asset.qr_rotate' : 'eam.asset.qr_issue',
      'Asset',
      asset.id,
      {},
      ctx,
    );
    return this.assetQrView(asset.id, ctx);
  }

  async revokeQrToken(assetId: string, ctx: RequestContext) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId: ctx.tenantId },
    });
    if (!asset) throw notFound('Asset', assetId);
    if (!asset.qrToken) return this.assetQrView(asset.id, ctx);
    await this.prisma.asset.updateMany({
      where: { id: asset.id, tenantId: ctx.tenantId },
      data: { qrToken: null },
    });
    await this.audit('eam.asset.qr_revoke', 'Asset', asset.id, {}, ctx);
    return this.assetQrView(asset.id, ctx);
  }

  async assetQrView(assetId: string, ctx: RequestContext) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId: ctx.tenantId },
    });
    if (!asset) throw notFound('Asset', assetId);
    const open = await this.prisma.equipmentCustodyLine.findFirst({
      where: { tenantId: ctx.tenantId, assetId: asset.id, returnedAt: null },
      include: { custody: true },
    });
    return {
      assetId: asset.id,
      assetNumber: asset.assetNumber,
      name: asset.name,
      location: asset.location,
      qrToken: asset.qrToken,
      custody: open
        ? {
            custodyId: open.custodyId,
            custodyNumber: open.custody.custodyNumber,
            employeeId: open.custody.employeeId,
            issuedAt: open.custody.issuedAt.toISOString(),
          }
        : null,
    };
  }

  // ------------------------------------------------------------ custody

  async issue(
    input: {
      employeeId: string;
      assetIds: string[];
      note?: string | undefined;
      requestKey: string;
    },
    ctx: RequestContext,
  ) {
    if (!KEY_RE.test(input.requestKey)) {
      throw new DomainError('VALIDATION_FAILED', 'requestKey: 8-80 safe characters');
    }
    const assetIds = [...new Set(input.assetIds)].sort();
    if (!assetIds.length || assetIds.length > 100) {
      throw new DomainError('VALIDATION_FAILED', 'A custody needs 1-100 assets');
    }
    const requestHash = createHash('sha256')
      .update(JSON.stringify([input.employeeId, assetIds, input.note?.trim() ?? null]))
      .digest('hex');
    const existing = await this.prisma.equipmentCustody.findFirst({
      where: { tenantId: ctx.tenantId, requestKey: input.requestKey },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new DomainError('CONFLICT', 'This requestKey was used for a different custody');
      }
      return this.view(existing.id, ctx);
    }
    const employee = await this.employees.employee(input.employeeId, ctx);
    if (!employee) throw notFound('Employee', input.employeeId);
    if (employee.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', 'Equipment can only be issued to an active employee');
    }
    const assets = await this.prisma.asset.findMany({
      where: { tenantId: ctx.tenantId, id: { in: assetIds } },
    });
    if (assets.length !== assetIds.length) {
      throw new DomainError('VALIDATION_FAILED', 'One or more assets do not exist');
    }
    const retired = assets.filter((a) => a.status === 'RETIRED');
    if (retired.length) {
      throw new DomainError(
        'INVALID_STATE',
        `Retired assets cannot be issued: ${retired.map((a) => a.assetNumber).join(', ')}`,
      );
    }
    const busy = await this.prisma.equipmentCustodyLine.findMany({
      where: { tenantId: ctx.tenantId, assetId: { in: assetIds }, returnedAt: null },
      include: { custody: true },
    });
    if (busy.length) {
      throw new DomainError(
        'CONFLICT',
        `Already issued: ${busy.map((b) => `${b.assetNumber} (${b.custody.custodyNumber})`).join(', ')}`,
      );
    }
    const year = new Date().getUTCFullYear();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const last = await this.prisma.equipmentCustody.findFirst({
        where: { tenantId: ctx.tenantId, custodyNumber: { startsWith: `ZD-${year}-` } },
        orderBy: { custodyNumber: 'desc' },
      });
      const custodyNumber = `ZD-${year}-${String(last ? Number(last.custodyNumber.slice(-4)) + 1 : 1).padStart(4, '0')}`;
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const row = await tx.equipmentCustody.create({
            data: {
              tenantId: ctx.tenantId,
              custodyNumber,
              employeeId: employee.id,
              groupToken: newToken(),
              note: input.note?.trim() || null,
              requestKey: input.requestKey,
              requestHash,
              issuedBy: ctx.userId ?? null,
            },
          });
          await tx.equipmentCustodyLine.createMany({
            data: assets.map((a) => ({
              tenantId: ctx.tenantId,
              custodyId: row.id,
              assetId: a.id,
              assetNumber: a.assetNumber,
              assetName: a.name,
            })),
          });
          await this.audit(
            'eam.custody.issue',
            'EquipmentCustody',
            row.id,
            { custodyNumber, employeeId: employee.id, assets: assets.map((a) => a.assetNumber) },
            ctx,
            tx,
          );
          return row;
        });
        return this.view(created.id, ctx);
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        const same = await this.prisma.equipmentCustody.findFirst({
          where: { tenantId: ctx.tenantId, requestKey: input.requestKey },
        });
        if (same) {
          if (same.requestHash !== requestHash) {
            throw new DomainError('CONFLICT', 'This requestKey was used for a different custody');
          }
          return this.view(same.id, ctx);
        }
        // The one-open-line-per-asset index: a concurrent issue won.
        const taken = await this.prisma.equipmentCustodyLine.findFirst({
          where: { tenantId: ctx.tenantId, assetId: { in: assetIds }, returnedAt: null },
        });
        if (taken) {
          throw new DomainError('CONFLICT', `Already issued: ${taken.assetNumber}`);
        }
        // Otherwise a custody-number race — retry with the next number.
      }
    }
    throw new DomainError('CONFLICT', 'Custody numbering is busy — retry with the same requestKey');
  }

  /**
   * Return lines (idempotent per line: an already returned line is left as
   * it was). The document becomes PARTIALLY_RETURNED or CLOSED.
   */
  async returnItems(
    input: {
      custodyId: string;
      items: Array<{ assetId: string; condition: ReturnCondition; note?: string | undefined }>;
    },
    ctx: RequestContext,
  ) {
    if (!input.items.length) throw new DomainError('VALIDATION_FAILED', 'Nothing to return');
    for (const item of input.items) {
      if (!(RETURN_CONDITIONS as readonly string[]).includes(item.condition)) {
        throw new DomainError('VALIDATION_FAILED', `Unknown condition '${item.condition}'`);
      }
      if (item.condition !== 'OK' && !item.note?.trim()) {
        throw new DomainError('VALIDATION_FAILED', 'Damaged or lost equipment needs a note');
      }
    }
    const custody = await this.prisma.equipmentCustody.findFirst({
      where: { id: input.custodyId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!custody) throw notFound('EquipmentCustody', input.custodyId);
    const byAsset = new Map(custody.lines.map((l) => [l.assetId, l]));
    for (const item of input.items) {
      if (!byAsset.has(item.assetId)) {
        throw new DomainError('VALIDATION_FAILED', 'An item is not part of this custody');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      let returned = 0;
      for (const item of input.items) {
        const line = byAsset.get(item.assetId)!;
        const done = await tx.equipmentCustodyLine.updateMany({
          where: { id: line.id, tenantId: ctx.tenantId, returnedAt: null },
          data: {
            returnedAt: new Date(),
            returnCondition: item.condition,
            returnNote: item.note?.trim() || null,
            returnedBy: ctx.userId ?? null,
          },
        });
        if (done.count) {
          returned += 1;
          await this.audit(
            'eam.custody.return',
            'EquipmentCustody',
            custody.id,
            { assetNumber: line.assetNumber, condition: item.condition },
            ctx,
            tx,
          );
        }
      }
      if (!returned) return;
      const open = await tx.equipmentCustodyLine.count({
        where: { tenantId: ctx.tenantId, custodyId: custody.id, returnedAt: null },
      });
      await tx.equipmentCustody.updateMany({
        where: { id: custody.id, tenantId: ctx.tenantId },
        data: { status: open === 0 ? 'CLOSED' : 'PARTIALLY_RETURNED' },
      });
    });
    return this.view(custody.id, ctx);
  }

  async recordPrint(
    input: {
      custodyId?: string | undefined;
      assetId?: string | undefined;
      kind: (typeof PRINT_KINDS)[number];
    },
    ctx: RequestContext,
  ) {
    if (!(PRINT_KINDS as readonly string[]).includes(input.kind)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown print kind '${input.kind}'`);
    }
    if (input.custodyId) {
      const c = await this.prisma.equipmentCustody.findFirst({
        where: { id: input.custodyId, tenantId: ctx.tenantId },
      });
      if (!c) throw notFound('EquipmentCustody', input.custodyId);
      await this.audit('eam.custody.print', 'EquipmentCustody', c.id, { kind: input.kind }, ctx);
    } else if (input.assetId) {
      const a = await this.prisma.asset.findFirst({
        where: { id: input.assetId, tenantId: ctx.tenantId },
      });
      if (!a) throw notFound('Asset', input.assetId);
      await this.audit('eam.asset.print', 'Asset', a.id, { kind: input.kind }, ctx);
    } else {
      throw new DomainError('VALIDATION_FAILED', 'Give a custody or an asset');
    }
    return { ok: true };
  }

  async view(id: string, ctx: RequestContext) {
    const c = await this.prisma.equipmentCustody.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lines: { orderBy: { assetNumber: 'asc' } } },
    });
    if (!c) throw notFound('EquipmentCustody', id);
    const employee = await this.employees.employee(c.employeeId, ctx);
    return {
      id: c.id,
      custodyNumber: c.custodyNumber,
      employeeId: c.employeeId,
      employeeName: employee?.name ?? null,
      employeeNumber: employee?.employeeNumber ?? null,
      status: c.status,
      groupToken: c.groupToken,
      note: c.note,
      issuedAt: c.issuedAt.toISOString(),
      lines: c.lines.map((l) => ({
        assetId: l.assetId,
        assetNumber: l.assetNumber,
        assetName: l.assetName,
        returnedAt: l.returnedAt?.toISOString() ?? null,
        returnCondition: l.returnCondition,
        returnNote: l.returnNote,
      })),
    };
  }

  async list(
    params: {
      employeeId?: string | undefined;
      status?: string | undefined;
      assetId?: string | undefined;
    },
    ctx: RequestContext,
  ) {
    const rows = await this.prisma.equipmentCustody.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(params.employeeId ? { employeeId: params.employeeId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.assetId ? { lines: { some: { assetId: params.assetId } } } : {}),
      },
      include: { lines: true },
      orderBy: { issuedAt: 'desc' },
      take: 500,
    });
    const names = new Map<string, { name: string; employeeNumber: string } | null>();
    for (const r of rows) {
      if (!names.has(r.employeeId))
        names.set(r.employeeId, await this.employees.employee(r.employeeId, ctx));
    }
    return rows.map((r) => ({
      id: r.id,
      custodyNumber: r.custodyNumber,
      employeeId: r.employeeId,
      employeeName: names.get(r.employeeId)?.name ?? null,
      status: r.status,
      issuedAt: r.issuedAt.toISOString(),
      items: r.lines.length,
      open: r.lines.filter((l) => !l.returnedAt).length,
    }));
  }

  // ------------------------------------------------------------ public lookup

  /**
   * Anonymous QR lookup: by token only, NO tenant context from the caller.
   * Returns strictly non-sensitive fields.
   */
  async publicAsset(token: string) {
    if (!TOKEN_RE.test(token)) throw notFound('Asset', 'token');
    const asset = await this.prisma.asset.findFirst({
      where: { qrToken: token },
      include: { tenant: { select: { name: true } } },
    });
    if (!asset) throw notFound('Asset', 'token');
    const issued = await this.prisma.equipmentCustodyLine.count({
      where: { tenantId: asset.tenantId, assetId: asset.id, returnedAt: null },
    });
    return {
      organization: asset.tenant.name,
      assetNumber: asset.assetNumber,
      name: asset.name,
      category: asset.category,
      status: STATUS_LABELS[asset.status] ?? asset.status,
      location: asset.location,
      issued: issued > 0,
    };
  }

  async publicCustody(token: string) {
    if (!TOKEN_RE.test(token)) throw notFound('EquipmentCustody', 'token');
    const c = await this.prisma.equipmentCustody.findFirst({
      where: { groupToken: token },
      include: { lines: { orderBy: { assetNumber: 'asc' } }, tenant: { select: { name: true } } },
    });
    if (!c) throw notFound('EquipmentCustody', 'token');
    return {
      organization: c.tenant.name,
      custodyNumber: c.custodyNumber,
      status: c.status,
      issuedOn: c.issuedAt.toISOString().slice(0, 10),
      items: c.lines.map((l) => ({
        assetNumber: l.assetNumber,
        name: l.assetName,
        returned: l.returnedAt !== null,
      })),
    };
  }
}
