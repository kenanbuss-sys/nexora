import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { RequestContext } from '@nexora/tenancy';
import type { AuthenticatedRequest } from './auth.guard';

/** Injects the server-resolved RequestContext into a controller handler. */
export const Ctx = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  const ctx = request.requestContext;
  if (!ctx) {
    throw new Error('RequestContext missing: AuthGuard did not run for this endpoint');
  }
  return ctx satisfies RequestContext;
});
