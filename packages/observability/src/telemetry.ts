import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

export interface TelemetryOptions {
  serviceName: string;
  /** OTLP HTTP endpoint. When unset, no exporter is attached (local/dev default). */
  otlpEndpoint?: string | undefined;
}

/**
 * Start OpenTelemetry for a NEXORA process (docs/architecture/00_DECISIONS_LOCKED.md:
 * OpenTelemetry is the locked observability foundation).
 *
 * Returns a shutdown function that must be awaited on process exit so spans flush.
 */
export function startTelemetry(options: TelemetryOptions): () => Promise<void> {
  const sdk = new NodeSDK({
    serviceName: options.serviceName,
    ...(options.otlpEndpoint
      ? { traceExporter: new OTLPTraceExporter({ url: `${options.otlpEndpoint}/v1/traces` }) }
      : {}),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs instrumentation is noisy and rarely useful for business tracing
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  return async () => {
    await sdk.shutdown();
  };
}
