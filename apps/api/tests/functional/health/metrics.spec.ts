import { test } from "@japa/runner";

import { resetMetrics } from "#middleware/metrics_middleware";

/**
 * `/metrics` endpoint contract. Two layers:
 *
 *  1. Format — `text/plain` content-type, `# TYPE …` lines for every metric, well-formed
 *     histogram buckets / count / sum tuples. A renamed metric or a broken serialiser fails
 *     these.
 *  2. Surface — every metric name we instrument is exposed (asserted by name, not value, so
 *     dashboards that reference them never go silently empty after a refactor).
 */

const EXPECTED_METRIC_NAMES = [
    "http_requests_total",
    "http_request_duration_seconds",
    "calibra_cache_operations_total",
    "calibra_queue_jobs_active",
    "calibra_queue_jobs_total",
    "calibra_queue_job_duration_seconds",
    "calibra_order_transitions_total",
    "calibra_orders_finalized_total",
    "calibra_payment_attempts_total",
    "calibra_payment_attempt_duration_seconds",
    "calibra_inventory_movements_total",
    "calibra_inventory_oversell_attempts_total",
    "calibra_auth_events_total",
    "calibra_rate_limit_throttled_total",
    "calibra_imports_rows_total",
    "calibra_exports_rows_total",
    "calibra_sse_clients",
    "nodejs_eventloop_lag_seconds",
    "nodejs_heap_size_used_bytes",
    "nodejs_heap_size_total_bytes",
    "nodejs_external_memory_bytes",
    "nodejs_rss_bytes",
    "nodejs_active_handles",
    "process_cpu_seconds_total",
    "process_uptime_seconds",
];

test.group("Prometheus /metrics endpoint", (group) => {
    group.each.setup(() => {
        resetMetrics();
    });

    test("exposes Prometheus text-exposition format with our counters + histograms", async ({ client, assert }) => {
        await client.get("/health");

        const response = await client.get("/metrics");
        response.assertStatus(200);
        const contentType = response.headers()["content-type"];
        assert.match(String(contentType ?? ""), /text\/plain/);

        const body = response.text();
        assert.include(body, "# TYPE http_requests_total counter");
        assert.include(body, "# TYPE http_request_duration_seconds histogram");
        assert.include(body, 'http_requests_total{method="GET"');
        assert.include(body, "http_request_duration_seconds_bucket");
        assert.include(body, "http_request_duration_seconds_count");
        assert.include(body, "http_request_duration_seconds_sum");
    });

    test("increments per-request counter across calls", async ({ client, assert }) => {
        await client.get("/health");
        await client.get("/health");
        await client.get("/health");

        const response = await client.get("/metrics");
        response.assertStatus(200);
        const body = response.text();

        const match = body.match(/http_requests_total\{[^}]*route="\/health"[^}]*\}\s+(\d+)/);
        assert.isNotNull(match, "expected /health counter line in /metrics body");
        const count = Number(match![1]);
        assert.isAtLeast(count, 3, "expected /health counter ≥ 3 after three GETs");
    });

    test("exposes every domain metric name as a registered series", async ({ client, assert }) => {
        const response = await client.get("/metrics");
        response.assertStatus(200);
        const body = response.text();
        for (const name of EXPECTED_METRIC_NAMES) {
            assert.include(body, `# TYPE ${name} `, `metric ${name} missing # TYPE line`);
        }
    });

    test("seeds zero-valued series so dashboards don't render 'no data' on cold spins", async ({ client, assert }) => {
        const response = await client.get("/metrics");
        const body = response.text();
        assert.include(body, 'calibra_payment_attempts_total{gateway="zarinpal",status="initiated"} 0');
        assert.include(body, 'calibra_auth_events_total{outcome="login_success"} 0');
        assert.include(body, 'calibra_rate_limit_throttled_total{limiter="auth"} 0');
        assert.include(body, 'calibra_inventory_movements_total{kind="sale"} 0');
    });

    test("samples node runtime gauges on every scrape", async ({ client, assert }) => {
        const response = await client.get("/metrics");
        const body = response.text();
        const heapMatch = body.match(/nodejs_heap_size_used_bytes (\d+(?:\.\d+)?)/);
        assert.isNotNull(heapMatch, "expected heap used gauge in /metrics body");
        assert.isAbove(Number(heapMatch![1]), 0);
    });
});
