/**
 * Sprint 224: integration tests get their OWN database and may never
 * point their destructive setup (TRUNCATE in beforeAll) at a dev or
 * production database again. INTEGRATION=1 alone is NOT authorization —
 * the destination itself must look like a test database.
 *
 * Runs before every vitest file (vitest.config.ts `setupFiles`):
 * - default DATABASE_URL becomes ..._test (never the dev demo DB);
 * - an explicit DATABASE_URL whose database name does not end in
 *   `_test` is refused loudly, unless the operator consciously sets
 *   ALLOW_DESTRUCTIVE_TEST_DB=1 (e.g. a disposable CI database).
 */
const TEST_DEFAULT = 'postgresql://app:app@localhost:5432/enterprise_os_test';

if (process.env.INTEGRATION === '1') {
  const url = process.env.DATABASE_URL ?? TEST_DEFAULT;
  let dbName = '';
  try {
    dbName = new URL(url).pathname.replace(/^\//, '');
  } catch {
    throw new Error(`Integration tests: DATABASE_URL is not a valid URL`);
  }
  if (!dbName.endsWith('_test') && process.env.ALLOW_DESTRUCTIVE_TEST_DB !== '1') {
    throw new Error(
      `Integration tests refuse to run against database '${dbName}': ` +
        `their setup TRUNCATEs business tables. Point DATABASE_URL at a ` +
        `'*_test' database (default: enterprise_os_test), or — only for a ` +
        `disposable database — set ALLOW_DESTRUCTIVE_TEST_DB=1.`,
    );
  }
  process.env.DATABASE_URL = url;
}
