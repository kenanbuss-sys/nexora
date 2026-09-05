import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleService, ServiceAccountService } from '@nexora/domain-iam';
import type { AuthenticatedRequest } from './auth.guard';
import { IS_PUBLIC, SERVICE_ACCOUNT_SERVICE } from './auth.guard';

export const ROLE_SERVICE = 'ROLE_SERVICE';

/** Endpoint requires a platform-operator session. */
export const IS_PLATFORM = 'isPlatform';
export const PlatformOnly = () => SetMetadata(IS_PLATFORM, true);

/** Endpoint requires this permission key for the current tenant context. */
export const PERMISSION_KEY = 'permissionKey';
export const RequirePermission = (key: string) => SetMetadata(PERMISSION_KEY, key);

/**
 * Default-deny authorization (docs/security/04_PERMISSION_MODEL.md).
 * Evaluation order: identity -> tenant -> account active -> permission -> scope.
 * Record-level scope checks beyond this happen inside domain services.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ROLE_SERVICE) private readonly roles: RoleService,
    @Inject(SERVICE_ACCOUNT_SERVICE) private readonly serviceAccounts: ServiceAccountService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const ctx = request.requestContext;
    if (!ctx) return false; // AuthGuard must have run

    const platformOnly = this.reflector.getAllAndOverride<boolean>(IS_PLATFORM, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (platformOnly) {
      if (ctx.platformAdmin === true) return true;
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Platform operator session required',
      });
    }

    const permissionKey = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permissionKey) return true; // authenticated endpoint without extra permission

    if (ctx.tenantStatus !== 'ACTIVE') {
      throw new ForbiddenException({ code: 'TENANT_SUSPENDED', message: 'Tenant is suspended' });
    }

    // API-key sessions authorize against the key's explicit allowlist.
    if (request.apiKeyPermissions) {
      if (request.apiKeyPermissions.includes(permissionKey)) return true;
      await this.serviceAccounts.logSecurityEvent(
        ctx.tenantId,
        'permission.denied',
        'api-key',
        `missing ${permissionKey}`,
      );
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'API key lacks this permission',
        details: { permission: permissionKey },
      });
    }

    if (!ctx.userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'No linked user in tenant' });
    }
    if (ctx.userStatus !== 'ACTIVE') {
      throw new ForbiddenException({ code: 'USER_SUSPENDED', message: 'User is not active' });
    }
    const allowed = await this.roles.authorize(ctx, permissionKey);
    if (!allowed) {
      await this.serviceAccounts.logSecurityEvent(
        ctx.tenantId,
        'permission.denied',
        ctx.userId,
        `missing ${permissionKey}`,
      );
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Missing permission',
        details: { permission: permissionKey },
      });
    }
    return true;
  }
}
