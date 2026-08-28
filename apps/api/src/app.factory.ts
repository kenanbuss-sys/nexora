import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import {
  CORRELATION_HEADER,
  getOrCreateCorrelationId,
  runWithCorrelationId,
} from '@nexora/observability';
import { AppModule } from './app.module';

/**
 * Build the API application: Fastify adapter + correlation-ID hook + AppModule.
 * Used by main.ts and by integration tests (via app.inject).
 */
export async function createApiApp(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter();

  // Correlation ID: accept a sane inbound header or mint a fresh UUID, expose
  // it on the async context for the whole request, and echo it in the response.
  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    const inbound = request.headers[CORRELATION_HEADER];
    const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
    runWithCorrelationId(candidate, () => {
      void reply.header(CORRELATION_HEADER, getOrCreateCorrelationId());
      done();
    });
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: ['warn', 'error'],
  });
  app.enableShutdownHooks();
  return app;
}
