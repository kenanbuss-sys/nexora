import { loadEnv } from '@nexora/config';
import {
  getOrCreateCorrelationId,
  runWithCorrelationId,
  startTelemetry,
} from '@nexora/observability';
import { Queue, Worker } from 'bullmq';

/**
 * NEXORA background worker.
 *
 * Sprint 000 scope: process skeleton only — queue wiring, correlation-aware
 * processing, graceful shutdown. The transactional outbox dispatcher and
 * integration jobs land in later sprints on top of this shell.
 */
const HEARTBEAT_QUEUE = 'system.heartbeat';

async function main(): Promise<void> {
  const env = loadEnv();
  const stopTelemetry = startTelemetry({
    serviceName: 'nexora-worker',
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  const connection = { url: env.REDIS_URL };

  const queue = new Queue(HEARTBEAT_QUEUE, { connection });
  await queue.upsertJobScheduler('heartbeat-every-minute', { every: 60_000 });

  const worker = new Worker(
    HEARTBEAT_QUEUE,
    async (job) =>
      runWithCorrelationId(undefined, () => {
        console.log(
          `[nexora-worker] heartbeat job=${job.id ?? 'n/a'} correlationId=${getOrCreateCorrelationId()}`,
        );
      }),
    { connection },
  );

  worker.on('failed', (job, err) => {
    console.error(`[nexora-worker] job ${job?.id ?? 'n/a'} failed: ${err.message}`);
  });

  const shutdown = async (): Promise<void> => {
    await worker.close();
    await queue.close();
    await stopTelemetry();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  console.log(`[nexora-worker] started (${env.NODE_ENV}), queue "${HEARTBEAT_QUEUE}"`);
}

void main();
