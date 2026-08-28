import 'reflect-metadata';
import { loadEnv } from '@nexora/config';
import { startTelemetry } from '@nexora/observability';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const stopTelemetry = startTelemetry({
    serviceName: 'nexora-api',
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  // Dynamic import so OpenTelemetry auto-instrumentation is active before
  // Nest/Fastify modules load.
  const { createApiApp } = await import('./app.factory.js');
  const app = await createApiApp();

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
