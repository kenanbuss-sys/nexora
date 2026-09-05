import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type Redis from 'ioredis';
import type { RequestContext } from '@nexora/tenancy';

/** Same DI token string the app module provides Redis under. */
const REDIS = 'REDIS';

/**
 * Step-up authentication (IAM): sensitive routes demand a fresh password
 * re-verification. POST /auth/step-up grants a short-lived elevation
 * (Redis TTL); routes marked @RequireStepUp refuse without it, returning
 * STEP_UP_REQUIRED so clients can prompt and retry. Platform operator
 * sessions are exempt (they have no tenant credential to verify).
 */

export const IS_STEP_UP = 'requireStepUp';
export const RequireStepUp = () => SetMetadata(IS_STEP_UP, true);

export const STEP_UP_TTL_SECONDS = 300;

export function stepUpKey(tenantId: string, userId: string): string {
  return `stepup:${tenantId}:${userId}`;
}

interface StepUpRequest {
  requestContext?: RequestContext;
}

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(IS_STEP_UP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<StepUpRequest>();
    const ctx = request.requestContext;
    if (!ctx) return false;
    if (ctx.platformAdmin === true) return true;
    if (!ctx.userId) {
      throw new ForbiddenException({
        code: 'STEP_UP_REQUIRED',
        message: 'This action requires a fresh password confirmation',
      });
    }
    const granted = await this.redis.get(stepUpKey(ctx.tenantId, ctx.userId));
    if (!granted) {
      throw new ForbiddenException({
        code: 'STEP_UP_REQUIRED',
        message: 'This action requires a fresh password confirmation',
      });
    }
    return true;
  }
}
