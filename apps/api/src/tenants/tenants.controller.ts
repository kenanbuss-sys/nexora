import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { TenantService, TenantView } from '@nexora/domain-core';
import type { RoleService, UserService } from '@nexora/domain-iam';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { PlatformOnly, RequirePermission, ROLE_SERVICE } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const TENANT_SERVICE = 'TENANT_SERVICE';
export const USER_SERVICE_FOR_PROVISIONING = 'USER_SERVICE';

/**
 * Baseline permission set granted to the initial tenant administrator during
 * provisioning. Everything else stays default-deny and is granted explicitly.
 */
export const TENANT_ADMIN_PERMISSIONS = [
  'organization.read',
  'organization.manage',
  'configuration.read',
  'configuration.publish',
  'iam.user.manage',
  'iam.role.manage',
  'iam.permission.manage',
  'iam.session.revoke',
  'iam.security.read',
  'audit.read',
  'task.manage',
];

const createTenantSchema = z.object({
  slug: z.string().min(3).max(48),
  name: z.string().min(1).max(200),
  initialAdmin: z
    .object({
      email: z.string().email(),
      displayName: z.string().min(1).max(200),
      idpSubject: z.string().min(1).max(200),
    })
    .optional(),
});

const suspendSchema = z.object({ reason: z.string().min(1).max(500) });

const publishConfigSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});

/** Platform-level tenant provisioning (platform operator only). */
@Controller('api/v1/tenants')
export class TenantsAdminController {
  constructor(
    @Inject(TENANT_SERVICE) private readonly tenants: TenantService,
    @Inject(USER_SERVICE_FOR_PROVISIONING) private readonly users: UserService,
    @Inject(ROLE_SERVICE) private readonly roles: RoleService,
  ) {}

  /**
   * Create a tenant and (optionally) bootstrap its first administrator.
   * Orchestrates CORE and IAM strictly through their public services.
   */
  @Post()
  @PlatformOnly()
  async create(
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ): Promise<{ tenant: TenantView; adminUserId?: string }> {
    const input = parseBody(createTenantSchema, body);
    const tenant = await this.tenants.createTenant({ slug: input.slug, name: input.name }, ctx);
    if (!input.initialAdmin) return { tenant };

    const provisioningCtx: RequestContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantStatus: 'ACTIVE',
      actorType: 'SERVICE',
      userId: undefined,
      userStatus: undefined,
      platformAdmin: true,
    };
    const admin = await this.users.inviteUser(input.initialAdmin, provisioningCtx);
    const role = await this.roles.createRole(
      {
        name: 'tenant-admin',
        description: 'Initial tenant administrator role (provisioned)',
        permissions: TENANT_ADMIN_PERMISSIONS,
      },
      provisioningCtx,
    );
    await this.roles.assignRole({ userId: admin.id, roleId: role.id }, provisioningCtx);
    return { tenant, adminUserId: admin.id };
  }

  @Post(':id/suspend')
  @PlatformOnly()
  async suspend(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(suspendSchema, body);
    return this.tenants.suspendTenant(id, input.reason, ctx);
  }
}

/** Current-tenant operations (resolved from the session, never from the URL). */
@Controller('api/v1/tenant')
export class TenantController {
  constructor(@Inject(TENANT_SERVICE) private readonly tenants: TenantService) {}

  /** White-label brand/config retrieval for the current tenant (CORE-003). */
  @Get('configuration')
  @RequirePermission('configuration.read')
  async getConfiguration(@Ctx() ctx: RequestContext) {
    return this.tenants.getEffectiveConfiguration(ctx.tenantId);
  }

  @Post('configuration')
  @RequirePermission('configuration.publish')
  async publishConfiguration(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(publishConfigSchema, body);
    return this.tenants.publishConfiguration(input.config, ctx);
  }
}
