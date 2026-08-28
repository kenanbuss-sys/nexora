// @nexora/db — engine-free Prisma client (queryCompiler + driverAdapters).
//
// The generated client lives in ./generated/client (output of `pnpm db:generate`,
// committed so offline environments can typecheck; CI regenerates from the
// schema on every run). This package is intentionally build-free: plain CJS
// entry + handwritten .d.ts re-exporting the generated types.
'use strict';

const { PrismaPg } = require('@prisma/adapter-pg');
const generated = require('./generated/client');

/**
 * Create a PrismaClient backed by the pg driver adapter (no native engine).
 * @param {{ connectionString: string, max?: number }} options
 */
function createDb(options) {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    max: options.max ?? 5,
  });
  return new generated.PrismaClient({ adapter });
}

module.exports = { ...generated, createDb };
