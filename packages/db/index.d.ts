export * from './generated/client';
import type { PrismaClient } from './generated/client';

/** A PrismaClient or interactive-transaction client — what domain code accepts. */
export type Db = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface CreateDbOptions {
  connectionString: string;
  /** Max pg pool connections (default 5). */
  max?: number;
}

/** Create a PrismaClient backed by the pg driver adapter (no native engine). */
export declare function createDb(options: CreateDbOptions): PrismaClient;
