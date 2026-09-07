import { z } from 'zod';

/**
 * Environment contract for all NEXORA runtime processes.
 *
 * Validation happens once at process start (fail fast, aggregated errors).
 * Secrets are provided via the environment / secret manager, never committed
 * (see CLAUDE.md absolute rules and docs/security/01_SECURITY_BASELINE.md).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), {
      message: 'DATABASE_URL must be a postgresql:// connection string',
    }),
  REDIS_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('redis://') || v.startsWith('rediss://'), {
      message: 'REDIS_URL must be a redis:// connection string',
    }),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Identity adapter behind the OIDC-first port ('dev' HMAC or 'oidc' RS256/JWKS). */
  AUTH_MODE: z.enum(['dev', 'oidc']).default('dev'),
  /** OIDC settings — required when AUTH_MODE=oidc. */
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_AUDIENCE: z.string().min(1).optional(),
  OIDC_JWKS_URL: z.string().url().optional(),
  /** Claim carrying the tenant slug in OIDC tokens. */
  OIDC_TENANT_CLAIM: z.string().min(1).default('tenant'),
  /** HMAC secret for the dev identity adapter. Never used in production OIDC mode. */
  DEV_AUTH_SECRET: z.string().min(8).default('dev-secret-change-me'),
  /** OTLP endpoint; when unset, telemetry is collected but not exported. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/** Parse and validate the process environment. Throws EnvValidationError with every problem listed. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new EnvValidationError(issues);
  }
  return result.data;
}
