import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException } from '@nestjs/common';
import { DomainError } from '@nexora/kernel';
import { getOrCreateCorrelationId } from '@nexora/observability';
import type { FastifyReply } from 'fastify';

/**
 * Canonical API error shape (docs/architecture/07_API_CONVENTIONS.md):
 * stable code, human-safe message, correlationId, details, fieldErrors.
 * Never a stack trace, never secrets.
 */
interface CanonicalError {
  code: string;
  message: string;
  correlationId: string;
  details?: Record<string, unknown>;
  fieldErrors?: Record<string, string>;
}

@Catch()
export class CanonicalErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const correlationId = getOrCreateCorrelationId();

    if (exception instanceof DomainError) {
      const { fieldErrors, ...details } = exception.details ?? {};
      const body: CanonicalError = {
        code: exception.code,
        message: exception.message,
        correlationId,
        ...(Object.keys(details).length > 0 ? { details } : {}),
        ...(fieldErrors ? { fieldErrors: fieldErrors as Record<string, string> } : {}),
      };
      void reply.status(exception.httpStatus).send(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const payload =
        typeof response === 'object' && response !== null
          ? (response as Record<string, unknown>)
          : { message: String(response) };
      const body: CanonicalError = {
        code: typeof payload.code === 'string' ? payload.code : httpCode(status),
        message: typeof payload.message === 'string' ? payload.message : exception.message,
        correlationId,
        ...(typeof payload.details === 'object' && payload.details !== null
          ? { details: payload.details as Record<string, unknown> }
          : {}),
      };
      void reply.status(status).send(body);
      return;
    }

    // Unknown error: log server-side, return an opaque 500.
    console.error(`[nexora-api] unhandled error correlationId=${correlationId}`, exception);
    void reply.status(500).send({
      code: 'INTERNAL',
      message: 'Internal server error',
      correlationId,
    } satisfies CanonicalError);
  }
}

function httpCode(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 503:
      return 'NOT_READY';
    default:
      return 'INTERNAL';
  }
}
