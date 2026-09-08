import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';

/**
 * Scale adapter (DEV-008). Registered SCALE devices push captured
 * weights for packages — device-authenticated, idempotent per capture
 * id — and the weight lands on the package through one governed path.
 */

export class ScaleService {
  constructor(private readonly prisma: PrismaClient) {}

  async captureWeight(input: {
    tenantId: string;
    deviceId: string;
    packageNumber: string;
    weightKg: number;
    captureId: string;
  }): Promise<{ ok: true; duplicate: boolean; packageId: string }> {
    if (!(input.weightKg > 0) || input.weightKg > 100000) {
      throw new DomainError('VALIDATION_FAILED', 'Weight must be a positive number of kilograms');
    }
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(input.captureId)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid capture id');
    }
    const device = await this.prisma.device.findFirst({
      where: { id: input.deviceId, tenantId: input.tenantId },
      select: { deviceType: true },
    });
    if (device?.deviceType !== 'SCALE') {
      throw new DomainError('INVALID_STATE', 'Weights come only from SCALE devices');
    }
    const pkg = await this.prisma.package.findFirst({
      where: { tenantId: input.tenantId, packageNumber: input.packageNumber.trim() },
    });
    if (!pkg) throw notFound('Package', input.packageNumber);
    if (pkg.status === 'SHIPPED') {
      throw new DomainError('INVALID_STATE', 'Shipped packages are not reweighed');
    }
    const marker = `${input.deviceId}:${input.captureId}`;
    const existing = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: input.tenantId,
        action: 'dev.scale.capture',
        objectType: 'Package',
        objectId: marker,
      },
      select: { id: true },
    });
    if (existing) return { ok: true, duplicate: true, packageId: pkg.id };
    await this.prisma.$transaction(async (tx) => {
      await tx.package.update({
        where: { id: pkg.id },
        data: { weightKg: input.weightKg },
      });
      await writeAudit(tx, {
        tenantId: input.tenantId,
        actorType: 'SERVICE',
        actorId: undefined,
        action: 'dev.scale.capture',
        objectType: 'Package',
        objectId: marker,
        source: 'device',
        previousValues: { weightKg: pkg.weightKg === null ? null : String(pkg.weightKg) },
        newValues: { weightKg: input.weightKg, packageId: pkg.id },
      });
    });
    return { ok: true, duplicate: false, packageId: pkg.id };
  }
}
