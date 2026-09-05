import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
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

// ------------------------------------------------------------------- TOTP

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of input.toUpperCase().replace(/=+$/, '')) {
    const index = BASE32_ALPHABET.indexOf(ch);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30s steps). */
export function totpCode(secretBase32: string, timeStepOffset = 0): string {
  const counter = Math.floor(Date.now() / 30_000) + timeStepOffset;
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secretBase32)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}

/** Accepts the current step and one step either side (clock drift). */
export function verifyTotp(secretBase32: string, code: string): boolean {
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  for (const offset of [0, -1, 1]) {
    const expected = totpCode(secretBase32, offset);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
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
  async login(
    tenantSlug: string,
    email: string,
    password: string,
    otp?: string,
  ): Promise<LoginResult> {
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
    // Second factor (Sprint 044): armed accounts require a valid TOTP code.
    if (credential.mfaEnabled && credential.totpSecret) {
      if (!otp) {
        await this.securityEvent(tenant.id, 'auth.mfa.challenged', email, null);
        throw new DomainError('FORBIDDEN', 'MFA code required');
      }
      if (!verifyTotp(credential.totpSecret, otp)) {
        await this.securityEvent(tenant.id, 'auth.mfa.failed', email, 'Wrong TOTP code');
        throw invalid();
      }
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

  // ---------------------------------------------------------------- MFA

  /** Generates a TOTP secret; MFA arms only after the first code verifies. */
  async startMfaEnrollment(
    ctx: RequestContext,
    tenantSlug: string,
  ): Promise<{ secret: string; otpauthUri: string }> {
    if (!ctx.userId) throw new DomainError('FORBIDDEN', 'Only signed-in users enroll in MFA');
    const credential = await this.prisma.userCredential.findFirst({
      where: { userId: ctx.userId, tenantId: ctx.tenantId },
      include: { user: true },
    });
    if (!credential) {
      throw new DomainError('INVALID_STATE', 'Set a password before enabling MFA');
    }
    const secret = base32Encode(randomBytes(20));
    await this.prisma.userCredential.update({
      where: { userId: ctx.userId },
      data: { totpSecret: secret, mfaEnabled: false },
    });
    await this.securityEvent(ctx.tenantId, 'auth.mfa.enrollment_started', ctx.userId, null);
    const label = encodeURIComponent(`NexoraOS:${credential.user.email}`);
    const issuer = encodeURIComponent(`NexoraOS (${tenantSlug})`);
    return {
      secret,
      otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&digits=6&period=30`,
    };
  }

  /** Verifies the first code and arms MFA. Audited. */
  async confirmMfa(code: string, ctx: RequestContext): Promise<void> {
    if (!ctx.userId) throw new DomainError('FORBIDDEN', 'Only signed-in users enroll in MFA');
    const credential = await this.prisma.userCredential.findFirst({
      where: { userId: ctx.userId, tenantId: ctx.tenantId },
    });
    if (!credential?.totpSecret) {
      throw new DomainError('INVALID_STATE', 'Start MFA enrollment first');
    }
    if (!verifyTotp(credential.totpSecret, code)) {
      await this.securityEvent(ctx.tenantId, 'auth.mfa.failed', ctx.userId, 'Enrollment code');
      throw new DomainError('FORBIDDEN', 'The code did not match — try again');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userCredential.update({
        where: { userId: ctx.userId! },
        data: { mfaEnabled: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'iam.mfa.enable',
        objectType: 'User',
        objectId: ctx.userId!,
        source: 'api',
        newValues: { mfaEnabled: true },
      });
    });
    await this.securityEvent(ctx.tenantId, 'auth.mfa.enabled', ctx.userId, null);
  }

  /** Disables MFA after re-verifying the password. Audited. */
  async disableMfa(currentPassword: string, ctx: RequestContext): Promise<void> {
    if (!ctx.userId) throw new DomainError('FORBIDDEN', 'Only signed-in users change MFA');
    const credential = await this.prisma.userCredential.findFirst({
      where: { userId: ctx.userId, tenantId: ctx.tenantId },
    });
    if (!credential) throw new DomainError('INVALID_STATE', 'No local credential');
    if (!verifyPassword(currentPassword, credential.passwordHash)) {
      await this.securityEvent(ctx.tenantId, 'auth.mfa.disable_failed', ctx.userId, null);
      throw new DomainError('FORBIDDEN', 'Current password is incorrect');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userCredential.update({
        where: { userId: ctx.userId! },
        data: { mfaEnabled: false, totpSecret: null },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'iam.mfa.disable',
        objectType: 'User',
        objectId: ctx.userId!,
        source: 'api',
        newValues: { mfaEnabled: false },
      });
    });
    await this.securityEvent(ctx.tenantId, 'auth.mfa.disabled', ctx.userId, null);
  }

  /** Whether the signed-in user has a credential and armed MFA. */
  async mfaStatus(ctx: RequestContext): Promise<{ hasPassword: boolean; mfaEnabled: boolean }> {
    if (!ctx.userId) return { hasPassword: false, mfaEnabled: false };
    const credential = await this.prisma.userCredential.findFirst({
      where: { userId: ctx.userId, tenantId: ctx.tenantId },
    });
    return { hasPassword: !!credential, mfaEnabled: credential?.mfaEnabled ?? false };
  }
}
