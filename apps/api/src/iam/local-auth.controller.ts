import { Body, Controller, Inject, Param, Post } from '@nestjs/common';
import type { CredentialService } from '@nexora/domain-iam';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Public } from '../auth/auth.guard';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const CREDENTIAL_SERVICE = 'CREDENTIAL_SERVICE';
export const TOKEN_SIGNER = 'TOKEN_SIGNER';

/** Signs a bearer token for a verified local login. */
export interface TokenSigner {
  sign(claims: { tenantSlug: string; subject: string; email?: string }): string;
}

const loginSchema = z.object({
  tenantSlug: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(1).max(200),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});
const setPasswordSchema = z.object({ password: z.string().min(1).max(200) });

/** Local password sign-in (IAM hardening for self-hosted installs). */
@Controller('api/v1/auth')
export class LocalAuthController {
  constructor(
    @Inject(CREDENTIAL_SERVICE) private readonly credentials: CredentialService,
    @Inject(TOKEN_SIGNER) private readonly signer: TokenSigner,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: unknown) {
    const input = parseBody(loginSchema, body);
    const result = await this.credentials.login(input.tenantSlug, input.email, input.password);
    const token = this.signer.sign({
      tenantSlug: input.tenantSlug,
      subject: result.subject,
      email: result.email,
    });
    return {
      token,
      tenantSlug: input.tenantSlug,
      subject: result.subject,
      email: result.email,
      displayName: result.displayName,
      mustChangePassword: result.mustChangePassword,
    };
  }

  @Post('change-password')
  async changePassword(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(changePasswordSchema, body);
    await this.credentials.changePassword(input.currentPassword, input.newPassword, ctx);
    return { changed: true };
  }
}

/** Admin password management on the users collection. */
@Controller('api/v1/users')
export class UserPasswordController {
  constructor(@Inject(CREDENTIAL_SERVICE) private readonly credentials: CredentialService) {}

  @Post(':id/password')
  @RequirePermission('iam.user.manage')
  async setPassword(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    await this.credentials.setPassword(id, parseBody(setPasswordSchema, body).password, ctx);
    return { set: true };
  }
}
