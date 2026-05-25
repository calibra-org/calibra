/**
 * Validated environment for the API. Anything read elsewhere via `env.get(…)` must be declared here
 * — values that don't pass validation will block boot in every environment, including production.
 */

import { Env } from "@adonisjs/core/env";

export default await Env.create(new URL("../", import.meta.url), {
    NODE_ENV: Env.schema.enum(["development", "production", "test"] as const),
    PORT: Env.schema.number(),
    APP_KEY: Env.schema.string(),
    APP_NAME: Env.schema.string(),
    HOST: Env.schema.string({ format: "host" }),
    LOG_LEVEL: Env.schema.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),

    /** Postgres connection — matches the `docker-compose.yml` defaults out of the box. */
    DB_HOST: Env.schema.string({ format: "host" }),
    DB_PORT: Env.schema.number(),
    DB_USER: Env.schema.string(),
    DB_PASSWORD: Env.schema.string.optional(),
    DB_DATABASE: Env.schema.string(),

    /** Comma-separated origins allowed via CORS. Empty falls back to `*` in dev. */
    ALLOWED_ORIGINS: Env.schema.string.optional(),

    /**
     * Mail / SMTP. The spin script writes `localhost:11025` (Mailpit) by default;
     * production overrides to the real relay. `MAIL_NOTIFICATIONS_ENABLED` is the runner-side
     * opt-out — CI runs with no catcher set it to `false` so terminal-event notifications
     * don't fail the test.
     */
    MAIL_FROM_ADDRESS: Env.schema.string({ format: "email" }),
    MAIL_FROM_NAME: Env.schema.string(),
    MAIL_NOTIFICATIONS_ENABLED: Env.schema.boolean(),
    SMTP_HOST: Env.schema.string({ format: "host" }),
    SMTP_PORT: Env.schema.number(),
    SMTP_USERNAME: Env.schema.string.optional(),
    SMTP_PASSWORD: Env.schema.string.optional(),
    MAILPIT_WEB_URL: Env.schema.string.optional(),

    /**
     * Job queue driver. `sync` for tests (runs the job inline), `database` for dev + prod (uses
     * the existing Postgres connection — needs `node ace queue:work` running alongside the API).
     */
    QUEUE_DRIVER: Env.schema.enum(["sync", "database"] as const),

    /**
     * Redis — used by Transmit's redis transport (cross-process SSE) and any future cache /
     * limiter / lock store. Dev spins point at the shared Redis container from
     * `scripts/redis-compose.yml` on `localhost:16379`. Per-spin keyspace isolation lives in
     * `config/redis.ts` via `keyPrefix: ${APP_NAME}:`.
     */
    REDIS_HOST: Env.schema.string({ format: "host" }),
    REDIS_PORT: Env.schema.number(),
    REDIS_PASSWORD: Env.schema.string.optional(),

    /**
     * Transmit transport driver. `redis` bridges SSE broadcasts across the api ↔ queue worker
     * processes (required when QUEUE_DRIVER=database). `none` keeps it single-process — used
     * by tests + ace commands (`check:api-docs`, `migration:run`) that boot the app without
     * needing live SSE and shouldn't crash if Redis is unreachable.
     */
    TRANSMIT_TRANSPORT: Env.schema.enum(["redis", "none"] as const),

    /**
     * Rate limiter store. `redis` shares counters across the api ↔ queue worker processes;
     * `memory` is used by tests and any boot path that should not touch Redis. The composite
     * limiters in `start/limiter.ts` key off the active store via `limiter.use("...")`.
     */
    LIMITER_STORE: Env.schema.enum(["redis", "memory"] as const),

    /**
     * Default cache store name. `redis` is the production multi-tier store (L1 memory + L2 Redis
     * + Redis bus) used by every hot read path. `memory` is the single-tier in-process fallback —
     * .env.test sets it so Japa runs never reach Redis. Per-call `cache.use("...")` still works
     * either way; this only sets the *default* store when callers do not specify one.
     */
    CACHE_DRIVER: Env.schema.enum(["redis", "memory"] as const),

    /**
     * OpenTelemetry OTLP endpoint. Optional — when blank we skip the exporter and the
     * SDK falls back to no-op (spans are created in-memory and dropped). Point at any
     * OTLP collector (Tempo, Jaeger, Honeycomb's free tier, Grafana Cloud free tier).
     */
    OTEL_EXPORTER_OTLP_ENDPOINT: Env.schema.string.optional(),

    /**
     * Meilisearch — full-text + faceted search. Per-spin instance brought up by
     * `docker/observability/docker-compose.meili.yml`; production points at the managed
     * Meilisearch cluster. Both vars are optional so legacy spins and ace commands that
     * don't touch search still boot.
     */
    MEILISEARCH_HOST: Env.schema.string.optional(),
    MEILISEARCH_API_KEY: Env.schema.string.optional(),

    /**
     * GlitchTip (Sentry-protocol) DSN. Optional — when blank the `@sentry/node` init is
     * skipped and uncaught exceptions surface only through Pino. When set, exceptions
     * ship to the per-spin GlitchTip instance and appear at `errors.<slug>.spin.localhost`.
     */
    GLITCHTIP_DSN: Env.schema.string.optional(),

    /**
     * Per-spin observability mode. When `true`, `config/logger.ts` adds a JSON-line
     * file target (`SPIN_API_LOG_PATH`) so Promtail can ship logs to Loki. When `false`
     * (production, tests, no-spin dev), only the default transport runs.
     */
    DEV_OBSERVABILITY: Env.schema.boolean.optional(),

    /**
     * Absolute path the file logger writes ndjson into when `DEV_OBSERVABILITY=true`.
     * Set by `scripts/spin.mjs` to `<worktree>/.spin/logs/api.ndjson` so the file lands
     * exactly where Promtail's bind-mount expects it. Optional; ignored without observability.
     */
    SPIN_API_LOG_PATH: Env.schema.string.optional(),
});
