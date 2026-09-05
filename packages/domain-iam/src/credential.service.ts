import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Local password authentication (IAM hardening for self-hosted
 * deployments). Only scrypt hashes are stored — never the password —
 * and repeated failures lock the account for a cooling-off period.
 * Every outcome lands in the security event log.
 */

const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;
const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export interface LoginResult {
  userId: string;
  subject: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return `scrypt:${SCRYPT_N}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, nRaw, saltHex, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !nRaw || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N: Number(nRaw),
  });
  return timingSafeEqual(actual, expected);
}

export class CredentialService {
  constructor(private readonly prisma: PrismaClient) {}

  private assertStrength(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
    if (password.length > 200) {
      throw new DomainError('VALIDATION_FAILED', 'Password is too long');
    }
  }

  private async securityEvent(
    tenantId: string | null,
    eventType: string,
    subject: string | null,
    detail: string | null,
  ): Promise<void> {
    await this.prisma.securityEvent.create({
      data: { tenantId, eventType, subject, detail },
    });
  }

  /** Admin sets (or resets) a user's password; the user must change it. */
  async setPassword(userId: string, password: string, ctx: RequestContext): Promise<void> {
    this.assertStrength(password);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: ctx.tenantId },
    });
    if (!user) throw notFound('User', userId);
    const passwordHash = hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.userCredential.upsert({
        where: { userId: user.id },
        create: { tenantId: ctx.tenantId, userId: user.id, passwordHash },
        update: { passwordHash, mustChangePassword: true, failedAttempts: 0, lockedUntil: null },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'iam.password.set',
        objectType: 'User',
        objectId: user.id,
        source: 'api',
        newValues: { mustChangePassword: true },
      });
    });
    await this.securityEvent(ctx.tenantId, 'password.set', user.email, 'Set by administrator');
  }

  /** Self-service change: the current password must verify. */
  async changePassword(
    currentPassword: string,
    newPassword: string,
    ctx: RequestContext,
  ): Promise<void> {
    if (!ctx.userId) throw new DomainError('FORBIDDEN', 'Only signed-in users change passwords');
    this.assertStrength(newPassword);
    const credential = await this.prisma.userCredential.findFirst({
      where: { userId: ctx.userId, tenantId: ctx.tenantId },
    });
    if (!credential) {
      throw new DomainError('INVALID_STATE', 'No local password is set for this user');
    }
    if (!verifyPassword(currentPassword, credential.passwordHash)) {
      await this.securityEvent(
        ctx.tenantId,
        'password.change.failed',
        ctx.userId,
        'Current password did not match',
      );
      throw new DomainError('FORBIDDEN', 'Current password is incorrect');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userCredential.update({
        where: { userId: ctx.userId! },
        data: {
          passwordHash: hashPassword(newPassword),
          mustChangePassword: false,
          failedAttempts: 0,
          lockedUntil: null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'iam.password.change',
        objectType: 'User',
        objectId: ctx.userId!,
        source: 'api',
        newValues: { mustChangePassword: false },
      });
    });
    await this.securityEvent(ctx.tenantId, 'password.changed', ctx.userId, null);
  }

  /**
   * Verifies a tenant/email/password triple. Fails closed: unknown tenant,
   * unknown user, missing credential and wrong password all read the same
   * to the caller, while lockout is explicit.
   */
  async login(tenantSlug: string, email: string, password: string): Promise<LoginResult> {
    const invalid = () => new DomainError('FORBIDDEN', 'Invalid e-mail or password');
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant || tenant.status !== 'ACTIVE') {
      await this.securityEvent(null, 'auth.login.failed', email, `Unknown tenant '${tenantSlug}'`);
      throw invalid();
    }
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });
    if (!user || user.status === 'SUSPENDED' || !user.idpSubject) {
      await this.securityEvent(tenant.id, 'auth.login.failed', email, 'Unknown or suspended user');
      throw invalid();
    }
    const credential = await this.prisma.userCredential.findUnique({
      where: { userId: user.id },
    });
    if (!credential) {
      await this.securityEvent(tenant.id, 'auth.login.failed', email, 'No local password set');
      throw invalid();
    }
    if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
      await this.securityEvent(tenant.id, 'auth.login.locked', email, 'Account is locked');
      throw new DomainError('INVALID_STATE', `Account is locked — try again in a few minutes`);
    }
    if (!verifyPassword(password, credential.passwordHash)) {
      const attempts = credential.failedAttempts + 1;
      const lock = attempts >= MAX_FAILED_ATTEMPTS;
      await this.prisma.userCredential.update({
        where: { userId: user.id },
        data: {
          failedAttempts: lock ? 0 : attempts,
          ...(lock ? { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : {}),
        },
      });
      await this.securityEvent(
        tenant.id,
        lock ? 'auth.login.lockout' : 'auth.login.failed',
        email,
        lock ? `Locked after ${MAX_FAILED_ATTEMPTS} failed attempts` : 'Wrong password',
      );
      throw invalid();
    }
    await this.prisma.userCredential.update({
      where: { userId: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    await this.securityEvent(tenant.id, 'auth.login.succeeded', email, null);
    return {
      userId: user.id,
      subject: user.idpSubject,
      email: user.email,
      displayName: user.displayName,
      mustChangePassword: credential.mustChangePassword,
    };
  }
}
