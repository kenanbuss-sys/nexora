import { DomainError } from '@nexora/kernel';
import type { z } from 'zod';

/** Parse a request body with zod; failures become canonical VALIDATION_FAILED. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      fieldErrors[issue.path.join('.') || '(root)'] = issue.message;
    }
    throw new DomainError('VALIDATION_FAILED', 'Request validation failed', { fieldErrors });
  }
  return result.data as z.infer<T>;
}
