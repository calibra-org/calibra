/**
 * The api's full domain-metric surface, registered once at module-load. Every helper here is a
 * pure function over the {@link metricsRegistry} singleton — call sites pass closed-enum label
 * values, the helper writes the corresponding series, full stop.
 *
 * Label values are intentionally a closed set per metric: order statuses come from
 * {@link OrderStatus}, payment statuses from {@link PaymentAttemptStatus}, gateways from the
 * adapter codes, cache tags from {@link CacheTags}. This keeps cardinality bounded — Prometheus
 * recommends < 10 distinct values per label and < 5,000 total series across the process.
 */

import type { OrderStatus } from "#enums/order_status";
import type { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import type { InventoryMovementKind } from "#services/inventory_service";
import { metricsRegistry } from "#services/metrics/registry";

/** Discriminator for cache events; mirrors what we emit per outcome. */
export type CacheOutcome = "hit" | "miss" | "invalidate";

/** Phase of a payment lifecycle call — used as a label on the duration histogram. */
export type PaymentPhase = "init" | "callback" | "refund";

/** Outcome of a queue job. Pending/active are tracked by the gauge, not this counter. */
export type QueueOutcome = "completed" | "failed";

/** Outcome of an order transition through the state machine. */
export type OrderTransitionOutcome = "applied" | "rejected";

/** Auth event outcomes — used as the single label on the auth-events counter. */
export type AuthEventOutcome = "login_success" | "login_fail" | "login_locked" | "logout" | "token_invalid";

/** Limiter names that emit a throttle event. Mirrors the names in `start/limiter.ts`. */
export type LimiterName = "auth" | "login_email" | "payments" | "webhooks" | "admin_writes";

/** Direction of a CSV import or export row counter. */
export type IoRowOutcome = "processed" | "error";

/* -------------------------------------------------------------------------- */
/*  HTTP — the only metrics in this file that were already shipping before the */
/*  observability-pack PR. Kept here so the registry is single-source.         */
/* -------------------------------------------------------------------------- */

const HTTP_LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

const httpRequestsTotal = metricsRegistry.counter({
    name: "http_requests_total",
    help: "Total HTTP requests handled by the api.",
    labelNames: ["method", "route", "status"],
});

const httpRequestDurationSeconds = metricsRegistry.histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request latency histogram.",
    labelNames: ["method", "route", "status"],
    buckets: HTTP_LATENCY_BUCKETS,
});

export function recordHttpRequest(method: string, route: string, status: number, durationSeconds: number): void {
    const labels = { method, route, status: String(status) };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
}

/* -------------------------------------------------------------------------- */
/*  Cache — populated by the Bentocache event subscriber in `start/metrics`.   */
/*  Label is the *tag* (from `CacheTags`), never the raw key. {@link deriveCacheTagFromKey}
 *  collapses every key's prefix to its closed-set tag — `catalog:products:list:abc123:fa` →
 *  `catalog:products`.                                                          */
/* -------------------------------------------------------------------------- */

const cacheOperationsTotal = metricsRegistry.counter({
    name: "calibra_cache_operations_total",
    help: "Cache operations by tag and outcome (hit/miss/invalidate).",
    labelNames: ["tag", "outcome"],
});

/**
 * Closed set of cache tag values the API emits. Anything that doesn't match a prefix collapses
 * to `"other"` so a brand-new key doesn't accidentally blow up cardinality.
 */
const KNOWN_CACHE_TAGS = [
    "catalog:products",
    "catalog:categories",
    "catalog:taxonomy",
    "shipping:zones",
    "shipping:rates",
    "settings",
    "admin:reports",
    "admin:customers",
    "other",
] as const;

export type DerivedCacheTag = (typeof KNOWN_CACHE_TAGS)[number];

/**
 * Map a Bentocache key back to the closed-set tag we want to label by. Tag membership lives in
 * `cache_keys.ts` — this is the inverse mapping. New `CacheKeys.*` shapes must be added here too
 * or they fall through to `"other"`.
 */
export function deriveCacheTagFromKey(key: string): DerivedCacheTag {
    if (key.startsWith("catalog:products")) return "catalog:products";
    if (key.startsWith("catalog:categories")) return "catalog:categories";
    if (key.startsWith("catalog:taxonomy")) return "catalog:taxonomy";
    if (key.startsWith("shipping:zones")) return "shipping:zones";
    if (key.startsWith("shipping:rates")) return "shipping:rates";
    if (key.startsWith("settings:")) return "settings";
    if (key.startsWith("admin:reports")) return "admin:reports";
    if (key.startsWith("admin:customer")) return "admin:customers";
    return "other";
}

export function recordCacheHit(key: string): void {
    cacheOperationsTotal.inc({ tag: deriveCacheTagFromKey(key), outcome: "hit" });
}

export function recordCacheMiss(key: string): void {
    cacheOperationsTotal.inc({ tag: deriveCacheTagFromKey(key), outcome: "miss" });
}

/**
 * Tag-invalidation hits a tag directly (it's the closed set itself). The caller hands us a
 * list of tags it just deleted — every tag in the list increments once.
 */
export function recordCacheInvalidate(tags: readonly string[]): void {
    for (const tag of tags) {
        cacheOperationsTotal.inc({ tag: normalizeTag(tag), outcome: "invalidate" });
    }
}

function normalizeTag(tag: string): DerivedCacheTag {
    if (tag === "catalog:products") return "catalog:products";
    if (tag === "catalog:categories") return "catalog:categories";
    if (tag === "catalog:taxonomy") return "catalog:taxonomy";
    if (tag === "shipping:zones") return "shipping:zones";
    if (tag.startsWith("catalog:product:")) return "catalog:products";
    if (tag.startsWith("settings:")) return "settings";
    if (tag === "admin:reports") return "admin:reports";
    if (tag === "admin:customers" || tag.startsWith("admin:customer:")) return "admin:customers";
    return "other";
}

/* -------------------------------------------------------------------------- */
/*  Queue jobs — gauge for current backlog, counter for completed/failed.      */
/*  The duration histogram tracks how long each job took (wall-clock, including */
/*  retries).                                                                    */
/* -------------------------------------------------------------------------- */

const QUEUE_DURATION_BUCKETS = [0.5, 1, 5, 15, 30, 60, 300, 900] as const;

const queueJobsActive = metricsRegistry.gauge({
    name: "calibra_queue_jobs_active",
    help: "Pending + active queue jobs by queue. Refreshed lazily on /metrics scrape (10s cache).",
    labelNames: ["queue"],
});

const queueJobsTotal = metricsRegistry.counter({
    name: "calibra_queue_jobs_total",
    help: "Total queue jobs by queue and outcome (completed/failed).",
    labelNames: ["queue", "outcome"],
});

const queueJobDurationSeconds = metricsRegistry.histogram({
    name: "calibra_queue_job_duration_seconds",
    help: "Queue job wall-clock duration (seconds).",
    labelNames: ["queue"],
    buckets: QUEUE_DURATION_BUCKETS,
});

export function setQueueDepth(queue: string, value: number): void {
    queueJobsActive.set({ queue }, value);
}

export function recordQueueJobOutcome(queue: string, outcome: QueueOutcome, durationSeconds: number): void {
    queueJobsTotal.inc({ queue, outcome });
    queueJobDurationSeconds.observe({ queue }, durationSeconds);
}

/* -------------------------------------------------------------------------- */
/*  Orders — transitions through the state machine and finalized orders.       */
/* -------------------------------------------------------------------------- */

const orderTransitionsTotal = metricsRegistry.counter({
    name: "calibra_order_transitions_total",
    help: "Order status transitions attempted through the state machine.",
    labelNames: ["from", "to", "outcome"],
});

const ordersFinalizedTotal = metricsRegistry.counter({
    name: "calibra_orders_finalized_total",
    help: "Draft orders finalized through the OrderFinalizer (draft → pending).",
    labelNames: ["currency"],
});

export function recordOrderTransition(
    from: OrderStatus | string,
    to: OrderStatus | string,
    outcome: OrderTransitionOutcome,
): void {
    orderTransitionsTotal.inc({ from: String(from), to: String(to), outcome });
}

export function recordOrderFinalized(currency: string): void {
    ordersFinalizedTotal.inc({ currency });
}

/* -------------------------------------------------------------------------- */
/*  Payments — per-gateway attempts + per-phase duration.                       */
/* -------------------------------------------------------------------------- */

const PAYMENT_DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30] as const;

const paymentAttemptsTotal = metricsRegistry.counter({
    name: "calibra_payment_attempts_total",
    help: "Payment lifecycle attempts by gateway code and resulting status.",
    labelNames: ["gateway", "status"],
});

const paymentAttemptDurationSeconds = metricsRegistry.histogram({
    name: "calibra_payment_attempt_duration_seconds",
    help: "Payment service phase duration (seconds), labelled by gateway and phase.",
    labelNames: ["gateway", "phase"],
    buckets: PAYMENT_DURATION_BUCKETS,
});

export function recordPaymentAttempt(gateway: string, status: PaymentAttemptStatus | string): void {
    paymentAttemptsTotal.inc({ gateway, status: String(status) });
}

export function recordPaymentPhase(gateway: string, phase: PaymentPhase, durationSeconds: number): void {
    paymentAttemptDurationSeconds.observe({ gateway, phase }, durationSeconds);
}

/* -------------------------------------------------------------------------- */
/*  Inventory — movement counter + dedicated oversell-attempt counter.          */
/* -------------------------------------------------------------------------- */

const inventoryMovementsTotal = metricsRegistry.counter({
    name: "calibra_inventory_movements_total",
    help: "Inventory ledger writes grouped by movement kind.",
    labelNames: ["kind"],
});

const inventoryOversellAttemptsTotal = metricsRegistry.counter({
    name: "calibra_inventory_oversell_attempts_total",
    help: "Decrement attempts that would have driven stock below zero with backorders=no.",
});

export function recordInventoryMovement(kind: InventoryMovementKind): void {
    inventoryMovementsTotal.inc({ kind });
}

export function recordInventoryOversellAttempt(): void {
    inventoryOversellAttemptsTotal.inc();
}

/* -------------------------------------------------------------------------- */
/*  Auth — login success / fail / locked / logout / token-invalid.              */
/* -------------------------------------------------------------------------- */

const authEventsTotal = metricsRegistry.counter({
    name: "calibra_auth_events_total",
    help: "Authentication events by outcome.",
    labelNames: ["outcome"],
});

export function recordAuthEvent(outcome: AuthEventOutcome): void {
    authEventsTotal.inc({ outcome });
}

/* -------------------------------------------------------------------------- */
/*  Rate limiting — every 429 from a named limiter bumps once.                  */
/* -------------------------------------------------------------------------- */

const rateLimitThrottledTotal = metricsRegistry.counter({
    name: "calibra_rate_limit_throttled_total",
    help: "Requests throttled by a named limiter (every 429 from start/limiter.ts).",
    labelNames: ["limiter"],
});

export function recordRateLimitThrottled(limiter: LimiterName | string): void {
    rateLimitThrottledTotal.inc({ limiter: String(limiter) });
}

/* -------------------------------------------------------------------------- */
/*  Imports / exports — rows processed + error rows per direction.              */
/* -------------------------------------------------------------------------- */

const importsRowsTotal = metricsRegistry.counter({
    name: "calibra_imports_rows_total",
    help: "Rows handled by the CSV product importer.",
    labelNames: ["outcome"],
});

const exportsRowsTotal = metricsRegistry.counter({
    name: "calibra_exports_rows_total",
    help: "Rows handled by the CSV product exporter.",
    labelNames: ["outcome"],
});

export function recordImportRows(outcome: IoRowOutcome, count: number): void {
    if (count <= 0) return;
    importsRowsTotal.inc({ outcome }, count);
}

export function recordExportRows(outcome: IoRowOutcome, count: number): void {
    if (count <= 0) return;
    exportsRowsTotal.inc({ outcome }, count);
}

/* -------------------------------------------------------------------------- */
/*  SSE — connected Transmit clients per channel root.                          */
/* -------------------------------------------------------------------------- */

const sseClientsGauge = metricsRegistry.gauge({
    name: "calibra_sse_clients",
    help: "Active SSE subscribers grouped by Transmit channel root.",
    labelNames: ["channel"],
});

export function setSseClients(channel: string, value: number): void {
    sseClientsGauge.set({ channel }, value);
}

/* -------------------------------------------------------------------------- */
/*  Node runtime — sampled lazily on each /metrics scrape via the registry's   */
/*  collector hook. See `start/metrics.ts` for the wiring.                      */
/* -------------------------------------------------------------------------- */

const eventLoopLagSeconds = metricsRegistry.gauge({
    name: "nodejs_eventloop_lag_seconds",
    help: "Approximate event loop lag (seconds), averaged since last sample.",
});

const heapUsedBytes = metricsRegistry.gauge({
    name: "nodejs_heap_size_used_bytes",
    help: "Process heap bytes currently in use.",
});

const heapTotalBytes = metricsRegistry.gauge({
    name: "nodejs_heap_size_total_bytes",
    help: "Process heap bytes allocated by V8.",
});

const externalMemoryBytes = metricsRegistry.gauge({
    name: "nodejs_external_memory_bytes",
    help: "Memory used by C++ objects bound to JS (Buffer, etc).",
});

const rssBytes = metricsRegistry.gauge({
    name: "nodejs_rss_bytes",
    help: "Resident set size of the process.",
});

const activeHandles = metricsRegistry.gauge({
    name: "nodejs_active_handles",
    help: "Count of active libuv handles (sockets, timers, ...). Uses a private Node API.",
});

const processCpuSecondsTotal = metricsRegistry.counter({
    name: "process_cpu_seconds_total",
    help: "Total CPU time consumed by the process (user + system, seconds).",
});

const processUptimeSeconds = metricsRegistry.gauge({
    name: "process_uptime_seconds",
    help: "Seconds since the process started.",
});

let lastCpuSample: { user: number; system: number } | null = null;

export function setEventLoopLagSeconds(value: number): void {
    eventLoopLagSeconds.set(undefined, value);
}

export function sampleRuntimeMetrics(): void {
    const mem = process.memoryUsage();
    heapUsedBytes.set(undefined, mem.heapUsed);
    heapTotalBytes.set(undefined, mem.heapTotal);
    externalMemoryBytes.set(undefined, mem.external);
    rssBytes.set(undefined, mem.rss);

    /**
     * `_getActiveHandles` is a Node-internal API — stable enough to ship as a metric, but kept
     * behind a try/catch so a future removal degrades gracefully to "no handles reported".
     */
    try {
        const handles = (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles?.() ?? [];
        activeHandles.set(undefined, handles.length);
    } catch {
        activeHandles.set(undefined, 0);
    }

    const cpu = process.cpuUsage();
    /** cpuUsage returns microseconds. Convert to seconds; the counter wants a delta. */
    const userSec = cpu.user / 1_000_000;
    const sysSec = cpu.system / 1_000_000;
    if (lastCpuSample === null) {
        lastCpuSample = { user: userSec, system: sysSec };
        processCpuSecondsTotal.seed();
    } else {
        const deltaUser = Math.max(0, userSec - lastCpuSample.user);
        const deltaSystem = Math.max(0, sysSec - lastCpuSample.system);
        processCpuSecondsTotal.inc(undefined, deltaUser + deltaSystem);
        lastCpuSample.user = userSec;
        lastCpuSample.system = sysSec;
    }

    processUptimeSeconds.set(undefined, process.uptime());
}

/**
 * Reset the runtime-metrics state that lives outside the registry (CPU deltas). Tests that call
 * `metricsRegistry.reset()` should also call this so consecutive samples don't bleed an old
 * baseline into the new run.
 */
export function resetRuntimeSamplerState(): void {
    lastCpuSample = null;
}

/* -------------------------------------------------------------------------- */
/*  Seed common label combinations so first-boot dashboards show "0" instead of */
/*  "no data". Cardinality cost is one series per metric per known label value. */
/* -------------------------------------------------------------------------- */

const PAYMENT_GATEWAYS = ["zarinpal", "zibal", "payir", "nextpay", "idpay", "bank_transfer", "cod"] as const;
const PAYMENT_STATUSES = ["initiated", "awaiting_callback", "verified", "failed", "cancelled", "refunded"] as const;
const INVENTORY_KINDS: readonly InventoryMovementKind[] = ["sale", "return", "restock", "adjustment", "reservation", "release"];
const AUTH_OUTCOMES: readonly AuthEventOutcome[] = ["login_success", "login_fail", "login_locked", "logout", "token_invalid"];
const LIMITER_NAMES: readonly LimiterName[] = ["auth", "login_email", "payments", "webhooks", "admin_writes"];
const QUEUE_NAMES = ["imports", "exports"] as const;
const CACHE_TAGS = KNOWN_CACHE_TAGS;
const CACHE_OUTCOMES: readonly CacheOutcome[] = ["hit", "miss", "invalidate"];

for (const gateway of PAYMENT_GATEWAYS) {
    for (const status of PAYMENT_STATUSES) {
        paymentAttemptsTotal.seed({ gateway, status });
    }
}
for (const kind of INVENTORY_KINDS) {
    inventoryMovementsTotal.seed({ kind });
}
inventoryOversellAttemptsTotal.seed();
for (const outcome of AUTH_OUTCOMES) {
    authEventsTotal.seed({ outcome });
}
for (const limiter of LIMITER_NAMES) {
    rateLimitThrottledTotal.seed({ limiter });
}
for (const queue of QUEUE_NAMES) {
    queueJobsActive.seed({ queue });
    queueJobsTotal.seed({ queue, outcome: "completed" });
    queueJobsTotal.seed({ queue, outcome: "failed" });
}
for (const tag of CACHE_TAGS) {
    for (const outcome of CACHE_OUTCOMES) {
        cacheOperationsTotal.seed({ tag, outcome });
    }
}
for (const outcome of ["processed", "error"] as const) {
    importsRowsTotal.seed({ outcome });
    exportsRowsTotal.seed({ outcome });
}
ordersFinalizedTotal.seed({ currency: "IRR" });
