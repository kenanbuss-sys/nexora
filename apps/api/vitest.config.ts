import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Sprint 224: destination guard — integration tests only ever run
    // against a *_test database (see src/testing/integration-db.setup.ts).
    setupFiles: ['src/testing/integration-db.setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
