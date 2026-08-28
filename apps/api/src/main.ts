import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { loadEnv } from '@nexora/config';
import {
  CORRELATION_HEADER,
  getOrCreateCorrelationId,
  runWithCorrelationId,
  startTelemetry,
} from '@nexora/observability';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const stopTelemetry = startTelemetry({
    serviceName: 'nexora-api',
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  const adapter = new FastifyAdapter();

  // Correlation ID: accept a sane inbound header or mint a fresh UUID, expose it
  // on the async context for the whole request, and echo it in the response.
  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    const inbound = request.headers[CORRELATION_HEADER];
    const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
    runWithCorrelationId(candidate, () => {
      void reply.header(CORRELATION_HEADER, getOrCreateCorrelationId());
      done();
    });
  });

  // Dynamic import so OpenTelemetry auto-instrumentation is active before
  // Nest/Fastify modules load.
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: ['log', 'warn', 'error'],
  });
  app.enableShutdownHooks();

  const shutdown = async (): Promise<void> => {
    await app.close();
    await stopTelemetry();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });

  console.log(`[nexora-api] listening on :${env.API_PORT} (${env.NODE_ENV})`);
}

void bootstrap();
