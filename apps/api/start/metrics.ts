import { monitorEventLoopDelay } from "node:perf_hooks";
import cache from "@adonisjs/cache/services/main";
import logger from "@adonisjs/core/services/logger";
import db from "@adonisjs/lucid/services/db";

import {
    recordCacheHit,
    recordCacheMiss,
    sampleRuntimeMetrics,
    setEventLoopLagSeconds,
    setQueueDepth,
} from "#services/metrics/domain_metrics";
import { metricsRegistry } from "#services/metrics/registry";

/**
 * Preload module that finishes wiring the metrics surface at boot:
 *
 *  1. Subscribes to Bentocache's `cache:hit` / `cache:miss` events. Each event carries the raw
 *     cache *key* (not the tag); {@link recordCacheHit} / {@link recordCacheMiss} map the key
 *     prefix to one of the closed-set tag labels via `deriveCacheTagFromKey`. Subscribing here
 *     (in a preload) instead of per-controller keeps the wiring DRY — adding a new cached
 *     endpoint just adds a tag prefix to the deriver, not another event listener.
 *
 *  2. Registers an `onBeforeRender` collector so `/metrics` scrapes pull fresh:
 *     - Node runtime gauges (heap, RSS, CPU delta, uptime, active handles).
 *     - Event-loop-lag gauge (filled from the long-running monitor).
 *     - Queue-depth gauge (read from the `queue_jobs` table with a 10s in-process cache so we
 *       don't pay a Postgres roundtrip per scrape).
 *
 * Test environments where `cache` may be unavailable land in a degraded but non-crashing state —
 * each registration is wrapped in a try so a misconfigured spin still serves the rest of /metrics.
 */

try {
    cache.on("cache:hit", ({ key }) => {
        if (typeof key === "string") recordCacheHit(key);
    });
    cache.on("cache:miss", ({ key }) => {
        if (typeof key === "string") recordCacheMiss(key);
    });
} catch (err) {
    logger.warn({ err }, "metrics: cache event subscription failed");
}

/**
 * `monitorEventLoopDelay` samples libuv polling intervals — `mean` is the running average since
 * `enable()` was called. We reset after each scrape so the gauge reflects the recent window, not
 * lifetime. Resolution of 20ms balances accuracy with the histogram's memory footprint.
 */
const eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
eventLoopMonitor.enable();

let lastQueueRefresh = 0;
const QUEUE_REFRESH_INTERVAL_MS = 10_000;
const QUEUES = ["imports", "exports"] as const;
let queueRefreshInflight: Promise<void> | null = null;

async function refreshQueueDepth(): Promise<void> {
    if (queueRefreshInflight) {
        await queueRefreshInflight;
        return;
    }
    queueRefreshInflight = (async () => {
        try {
            /**
             * `queue_jobs` is created by `@adonisjs/queue`'s migration. The states we care about
             * for "active backlog" are `pending` (claimed-to-run) + `active` (currently running)
             * + `delayed` (waiting on a future schedule). `completed` / `failed` are history rows
             * pruned by the worker and are out of scope for a backlog gauge.
             */
            const rows = await db
                .from("queue_jobs")
                .select("queue")
                .count("* as count")
                .whereIn("status", ["pending", "active", "delayed"])
                .groupBy("queue");
            const counts = new Map<string, number>();
            for (const row of rows as Array<{ queue: string; count: string | number }>) {
                counts.set(row.queue, Number(row.count));
            }
            for (const queue of QUEUES) {
                setQueueDepth(queue, counts.get(queue) ?? 0);
            }
            lastQueueRefresh = Date.now();
        } catch (err) {
            /**
             * `queue_jobs` may not exist in unmigrated environments (a fresh test database before
             * the first migration:run, for example). Don't fail the scrape — leave the previous
             * gauge value in place and move on.
             */
            logger.debug({ err }, "metrics: queue depth refresh failed");
        } finally {
            queueRefreshInflight = null;
        }
    })();
    await queueRefreshInflight;
}

metricsRegistry.onBeforeRender(async () => {
    const lagNs = eventLoopMonitor.mean;
    if (Number.isFinite(lagNs) && lagNs > 0) {
        setEventLoopLagSeconds(lagNs / 1e9);
    }
    eventLoopMonitor.reset();
    sampleRuntimeMetrics();
    if (Date.now() - lastQueueRefresh > QUEUE_REFRESH_INTERVAL_MS) {
        await refreshQueueDepth();
    }
});
