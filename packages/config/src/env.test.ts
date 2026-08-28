import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from './env';

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://app:app@localhost:5432/enterprise_os',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = loadEnv(valid);
    expect(env.NODE_ENV).toBe('test');
    expect(env.API_PORT).toBe(3001);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
  });

  it('rejects a missing DATABASE_URL and reports every issue at once', () => {
    expect(() => loadEnv({ NODE_ENV: 'test' })).toThrowError(EnvValidationError);
    try {
      loadEnv({ NODE_ENV: 'test' });
    } catch (e) {
      const err = e as EnvValidationError;
      expect(err.issues.length).toBeGreaterThanOrEqual(2);
      expect(err.issues.join('\n')).toContain('DATABASE_URL');
      expect(err.issues.join('\n')).toContain('REDIS_URL');
    }
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: 'mysql://x:y@localhost/db' })).toThrowError(
      EnvValidationError,
    );
  });

  it('coerces API_PORT and rejects out-of-range ports', () => {
    expect(loadEnv({ ...valid, API_PORT: '8080' }).API_PORT).toBe(8080);
    expect(() => loadEnv({ ...valid, API_PORT: '99999' })).toThrowError(EnvValidationError);
  });
});
