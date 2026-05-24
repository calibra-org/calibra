import { defineConfig } from "@adonisjs/otel";

import env from "#start/env";

/**
 * OpenTelemetry tracing config. Disabled unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, so
 * dev + tests get zero overhead. When enabled, the provider boots the SDK with the default
 * instrumentations (HTTP, Lucid, Redis, Pino) and forwards spans to the OTLP collector at
 * the endpoint env var.
 *
 * Sentry's tracesSampleRate is independent of this — both can run at once.
 */
const otelConfig = defineConfig({
    enabled: env.get("OTEL_EXPORTER_OTLP_ENDPOINT") !== undefined,
    serviceName: env.get("APP_NAME"),
});

export default otelConfig;
