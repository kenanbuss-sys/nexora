/**
 * @nexora/kernel — tiny shared primitives every domain may depend on.
 * Keep this package minimal; it must never grow business logic.
 */

/** Stable machine-readable error codes for the canonical API error shape. */
export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'UNAUTHENTICATED'
  | 'TENANT_SUSPENDED'
  | 'USER_SUSPENDED'
  | 'INVALID_STATE';

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  TENANT_SUSPENDED: 403,
  USER_SUSPENDED: 403,
  INVALID_STATE: 409,
};

export class DomainError extends Error {
  readonly httpStatus: number;

  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
    this.httpStatus = HTTP_STATUS[code];
  }
}

export function notFound(objectType: string, id?: string): DomainError {
  return new DomainError('NOT_FOUND', `${objectType} not found`, id ? { id } : undefined);
}
