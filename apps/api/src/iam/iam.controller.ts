import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';
import type { RoleService, UserService } from '@nexora/domain-iam';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { ROLE_SERVICE } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const USER_SERVICE = 'USER_SERVICE';

const inviteSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(200),
  idpSubject: z.string().min(1).max(200).optional(),
});
const suspendSchema = z.object({ reason: z.string().min(1).max(500) });
const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().min(3).max(100)).max(200).optional(),
});
const setPermissionsSchema = z.object({
  permissions: z.array(z.string().min(3).max(100)).max(200),
});
const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
  scopeType: z.enum(['TENANT', 'LEGAL_ENTITY', 'BUSINESS_UNIT', 'BRANCH', 'FACTORY']).optional(),
  scopeId: z.string().uuid().optional(),
});

@Controller('api/v1/users')
export class UsersController {
  constructor(@Inject(USER_SERVICE) private readonly users: UserService) {}

  @Get()
  @RequirePermission('iam.user.manage')
  async list(@Ctx() ctx: RequestContext) {
    return { users: await this.users.listUsers(ctx) };
  }

  @Post('invite')
  @RequirePermission('iam.user.manage')
  async invite(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.users.inviteUser(parseBody(inviteSchema, body), ctx);
  }

  @Post(':id/suspend')
  @RequirePermission('iam.user.manage')
  async suspend(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.users.suspendUser(id, parseBody(suspendSchema, body).reason, ctx);
  }

  @Get(':id')
  @RequirePermission('iam.user.manage')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.users.getUser(id, ctx);
  }
}

@Controller('api/v1/roles')
export class RolesController {
  constructor(@Inject(ROLE_SERVICE) private readonly roles: RoleService) {}

  @Get()
  @RequirePermission('iam.role.manage')
  async list(@Ctx() ctx: RequestContext) {
    return { roles: await this.roles.listRoles(ctx) };
  }

  @Post()
  @RequirePermission('iam.role.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.roles.createRole(parseBody(createRoleSchema, body), ctx);
  }

  @Put(':id/permissions')
  @RequirePermission('iam.permission.manage')
  async setPermissions(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.roles.setRolePermissions(
      id,
      parseBody(setPermissionsSchema, body).permissions,
      ctx,
    );
  }

  @Post('assign')
  @RequirePermission('iam.role.manage')
  async assign(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.roles.assignRole(parseBody(assignRoleSchema, body), ctx);
  }
}

@Controller('api/v1/me')
export class MeController {
  constructor(@Inject(ROLE_SERVICE) private readonly roles: RoleService) {}

  /** Effective permissions of the current session's user. */
  @Get('permissions')
  async myPermissions(@Ctx() ctx: RequestContext) {
    if (!ctx.userId) return { grants: [] };
    const grants = await this.roles.getEffectivePermissions(ctx.userId, ctx.tenantId);
    return { grants };
  }
}
