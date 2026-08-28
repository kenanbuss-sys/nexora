import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PrismaClient } from '@nexora/db';
import type { IdentityPort, RequestContext } from '@nexora/tenancy';
import type { FastifyRequest } from 'fastify';

export const IDENTITY_PORT = 'IDENTITY_PORT';
export const PRISMA = 'PRISMA';

/** Marks an endpoint as public (no authentication). */
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthenticatedRequest extends FastifyRequest {
  requestContext?: RequestContext;
}

/**
 * Resolves the server-side tenant/actor context from a verified bearer token
 * (docs/architecture/06_TENANCY_WHITE_LABEL.md: trust authenticated claims,
 * never a client-supplied tenant id).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IDENTITY_PORT) private readonly identity: IdentityPort,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Missing bearer token' });
    }
    const claims = await this.identity.verifyToken(header.slice('Bearer '.length));
    if (!claims) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid token' });
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { slug: claims.tenantSlug } });

    if (claims.platformAdmin === true) {
      // Verified platform-operator session (tenant provisioning etc.).
      // May exist before any tenant does.
      request.requestContext = {
        tenantId: tenant?.id ?? '00000000-0000-0000-0000-000000000000',
        tenantSlug: claims.tenantSlug,
        tenantStatus: tenant?.status ?? 'ACTIVE',
        actorType: 'SERVICE',
        userId: undefined,
        userStatus: undefined,
        platformAdmin: true,
      };
      return true;
    }

    if (!tenant) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown tenant' });
    }
    const user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, idpSubject: claims.subject },
    });

    request.requestContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantStatus: tenant.status,
      actorType: 'USER',
      userId: user?.id,
      userStatus: user?.status,
      platformAdmin: false,
    };
    return true;
  }
}
