import { loadEnv } from '@nexora/config';
import { createDb } from '@nexora/db';
import {
  getOrCreateCorrelationId,
  runWithCorrelationId,
  startTelemetry,
} from '@nexora/observability';
import { Queue, Worker } from 'bullmq';
import { dispatchPendingOutbox } from './outbox';
import { createRuleEngineConsumer } from './rule-engine';

/**
 * NEXORA background worker: outbox dispatch + heartbeat.
 * The outbox job runs every 5s; claims use FOR UPDATE SKIP LOCKED so multiple
 * worker replicas are safe.
 */
const HEARTBEAT_QUEUE = 'system.heartbeat';
const OUTBOX_QUEUE = 'system.outbox-dispatch';

async function main(): Promise<void> {
  const env = loadEnv();
  const stopTelemetry = startTelemetry({
    serviceName: 'nexora-worker',
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });
  const prisma = createDb({ connectionString: env.DATABASE_URL, max: 3 });
  const ruleEngine = createRuleEngineConsumer(prisma);

  const connection = { url: env.REDIS_URL };

  const heartbeatQueue = new Queue(HEARTBEAT_QUEUE, { connection });
  await heartbeatQueue.upsertJobScheduler('heartbeat-every-minute', { every: 60_000 });
  const heartbeatWorker = new Worker(
    HEARTBEAT_QUEUE,
    async (job) =>
      runWithCorrelationId(undefined, () => {
        console.log(
          `[nexora-worker] heartbeat job=${job.id ?? 'n/a'} correlationId=${getOrCreateCorrelationId()}`,
        );
      }),
    { connection },
  );

  const outboxQueue = new Queue(OUTBOX_QUEUE, { connection });
  await outboxQueue.upsertJobScheduler('outbox-dispatch', { every: 5_000 });
  const outboxWorker = new Worker(
    OUTBOX_QUEUE,
    async () =>
      runWithCorrelationId(undefined, async () => {
        const result = await dispatchPendingOutbox(prisma, async (event) => {
          console.log(
            `[nexora-worker] event ${event.eventType} aggregate=${event.aggregateType}/${event.aggregateId} tenant=${event.tenantId} correlationId=${event.correlationId}`,
          );
          // Declarative automation (Sprint 002): idempotent rule evaluation.
          await ruleEngine.handle(event);
        });
        if (result.dispatched > 0 || result.failed > 0) {
          console.log(
            `[nexora-worker] outbox dispatched=${result.dispatched} failed=${result.failed}`,
          );
        }
      }),
    { connection },
  );

  for (const w of [heartbeatWorker, outboxWorker]) {
    w.on('failed', (job, err) => {
      console.error(`[nexora-worker] job ${job?.id ?? 'n/a'} failed: ${err.message}`);
    });
  }

  const shutdown = async (): Promise<void> => {
    await Promise.all([heartbeatWorker.close(), outboxWorker.close()]);
    await Promise.all([heartbeatQueue.close(), outboxQueue.close()]);
    await prisma.$disconnect();
    await stopTelemetry();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  console.log(`[nexora-worker] started (${env.NODE_ENV}); outbox dispatch every 5s`);
}

void main();
