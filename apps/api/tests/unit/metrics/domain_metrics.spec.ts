import { test } from "@japa/runner";

import {
    deriveCacheTagFromKey,
    recordAuthEvent,
    recordCacheHit,
    recordCacheInvalidate,
    recordCacheMiss,
    recordExportRows,
    recordHttpRequest,
    recordImportRows,
    recordInventoryMovement,
    recordInventoryOversellAttempt,
    recordOrderFinalized,
    recordOrderTransition,
    recordPaymentAttempt,
    recordPaymentPhase,
    recordQueueJobOutcome,
    recordRateLimitThrottled,
    sampleRuntimeMetrics,
    setQueueDepth,
    setSseClients,
} from "#services/metrics/domain_metrics";
import { metricsRegistry } from "#services/metrics/registry";

/**
 * Pure-helper tests. Each helper writes through {@link metricsRegistry}; we read back the
 * rendered Prometheus text and assert exact line shape so a renamed metric, a missing label,
 * or a busted bucket would fail loudly. No HTTP, no Adonis bootstrap — just the registry.
 */

test.group("Domain metric helpers", (group) => {
    group.each.setup(() => {
        metricsRegistry.reset();
    });

    test("deriveCacheTagFromKey maps every CacheKeys shape to a closed-set tag", ({ assert }) => {
        assert.equal(deriveCacheTagFromKey("catalog:products:list:abc:fa"), "catalog:products");
        assert.equal(deriveCacheTagFromKey("catalog:products:detail:42:en"), "catalog:products");
        assert.equal(deriveCacheTagFromKey("catalog:categories:tree:fa"), "catalog:categories");
        assert.equal(deriveCacheTagFromKey("catalog:taxonomy:tags:fa"), "catalog:taxonomy");
        assert.equal(deriveCacheTagFromKey("shipping:rates:IR:-:-:0"), "shipping:rates");
        assert.equal(deriveCacheTagFromKey("shipping:zones:list"), "shipping:zones");
        assert.equal(deriveCacheTagFromKey("settings:group:general"), "settings");
        assert.equal(deriveCacheTagFromKey("admin:reports:top-products:30:10:fa"), "admin:reports");
        assert.equal(deriveCacheTagFromKey("admin:customers:counts"), "admin:customers");
        assert.equal(deriveCacheTagFromKey("admin:customer:42:stats"), "admin:customers");
        assert.equal(deriveCacheTagFromKey("totally:made:up:key"), "other");
    });

    test("recordCacheHit / recordCacheMiss bump tag-scoped counters", async ({ assert }) => {
        recordCacheHit("catalog:products:list:abc:fa");
        recordCacheHit("catalog:products:detail:42:fa");
        recordCacheMiss("catalog:products:list:xyz:fa");
        recordCacheMiss("admin:reports:top-products:30:10:fa");
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_cache_operations_total{tag="catalog:products",outcome="hit"} 2');
        assert.include(body, 'calibra_cache_operations_total{tag="catalog:products",outcome="miss"} 1');
        assert.include(body, 'calibra_cache_operations_total{tag="admin:reports",outcome="miss"} 1');
    });

    test("recordCacheInvalidate maps per-id tags back to closed-set buckets", async ({ assert }) => {
        recordCacheInvalidate(["catalog:products", "catalog:product:42", "catalog:product:43"]);
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_cache_operations_total{tag="catalog:products",outcome="invalidate"} 3');
    });

    test("recordPaymentAttempt + recordPaymentPhase emit a per-gateway counter and histogram", async ({ assert }) => {
        recordPaymentAttempt("zarinpal", "initiated");
        recordPaymentAttempt("zarinpal", "verified");
        recordPaymentAttempt("cod", "verified");
        recordPaymentPhase("zarinpal", "init", 0.42);
        recordPaymentPhase("zarinpal", "callback", 1.2);
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_payment_attempts_total{gateway="zarinpal",status="verified"} 1');
        assert.include(body, 'calibra_payment_attempts_total{gateway="cod",status="verified"} 1');
        assert.include(body, 'calibra_payment_attempt_duration_seconds_count{gateway="zarinpal",phase="init"} 1');
        assert.include(body, 'calibra_payment_attempt_duration_seconds_sum{gateway="zarinpal",phase="init"} 0.420000');
    });

    test("recordOrderTransition labels from/to/outcome correctly", async ({ assert }) => {
        recordOrderTransition("draft", "pending", "applied");
        recordOrderTransition("pending", "cancelled", "applied");
        recordOrderTransition("completed", "draft", "rejected");
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_order_transitions_total{from="draft",to="pending",outcome="applied"} 1');
        assert.include(body, 'calibra_order_transitions_total{from="completed",to="draft",outcome="rejected"} 1');
    });

    test("recordOrderFinalized buckets by currency", async ({ assert }) => {
        recordOrderFinalized("IRR");
        recordOrderFinalized("IRR");
        recordOrderFinalized("USD");
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_orders_finalized_total{currency="IRR"} 2');
        assert.include(body, 'calibra_orders_finalized_total{currency="USD"} 1');
    });

    test("recordInventoryMovement + recordInventoryOversellAttempt", async ({ assert }) => {
        recordInventoryMovement("reservation");
        recordInventoryMovement("sale");
        recordInventoryMovement("release");
        recordInventoryOversellAttempt();
        recordInventoryOversellAttempt();
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_inventory_movements_total{kind="reservation"} 1');
        assert.include(body, 'calibra_inventory_movements_total{kind="sale"} 1');
        assert.include(body, "calibra_inventory_oversell_attempts_total 2");
    });

    test("recordAuthEvent emits each outcome bucket", async ({ assert }) => {
        recordAuthEvent("login_success");
        recordAuthEvent("login_fail");
        recordAuthEvent("login_fail");
        recordAuthEvent("token_invalid");
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_auth_events_total{outcome="login_success"} 1');
        assert.include(body, 'calibra_auth_events_total{outcome="login_fail"} 2');
        assert.include(body, 'calibra_auth_events_total{outcome="token_invalid"} 1');
    });

    test("recordRateLimitThrottled buckets per limiter name", async ({ assert }) => {
        recordRateLimitThrottled("auth");
        recordRateLimitThrottled("login_email");
        recordRateLimitThrottled("login_email");
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_rate_limit_throttled_total{limiter="auth"} 1');
        assert.include(body, 'calibra_rate_limit_throttled_total{limiter="login_email"} 2');
    });

    test("recordImportRows + recordExportRows ignore zero/negative increments", async ({ assert }) => {
        recordImportRows("processed", 50);
        recordImportRows("error", 0);
        recordExportRows("processed", 10);
        recordExportRows("error", -5);
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_imports_rows_total{outcome="processed"} 50');
        assert.include(body, 'calibra_imports_rows_total{outcome="error"} 0');
        assert.include(body, 'calibra_exports_rows_total{outcome="processed"} 10');
        assert.include(body, 'calibra_exports_rows_total{outcome="error"} 0');
    });

    test("setQueueDepth + recordQueueJobOutcome emit both gauges and counters", async ({ assert }) => {
        setQueueDepth("imports", 42);
        setQueueDepth("exports", 0);
        recordQueueJobOutcome("imports", "completed", 1.5);
        recordQueueJobOutcome("imports", "failed", 12.3);
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_queue_jobs_active{queue="imports"} 42');
        assert.include(body, 'calibra_queue_jobs_active{queue="exports"} 0');
        assert.include(body, 'calibra_queue_jobs_total{queue="imports",outcome="completed"} 1');
        assert.include(body, 'calibra_queue_jobs_total{queue="imports",outcome="failed"} 1');
        assert.include(body, 'calibra_queue_job_duration_seconds_count{queue="imports"} 2');
    });

    test("setSseClients emits a per-channel gauge", async ({ assert }) => {
        setSseClients("imports", 3);
        setSseClients("exports", 1);
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_sse_clients{channel="imports"} 3');
        assert.include(body, 'calibra_sse_clients{channel="exports"} 1');
    });

    test("recordHttpRequest writes a counter + histogram pair", async ({ assert }) => {
        recordHttpRequest("GET", "/api/v1/products", 200, 0.012);
        recordHttpRequest("POST", "/api/v1/checkout/submit", 422, 0.41);
        const body = await metricsRegistry.render();
        assert.include(body, 'http_requests_total{method="GET",route="/api/v1/products",status="200"} 1');
        assert.include(
            body,
            'http_request_duration_seconds_bucket{method="GET",route="/api/v1/products",status="200",le="0.025"} 1',
        );
        assert.include(
            body,
            'http_request_duration_seconds_bucket{method="GET",route="/api/v1/products",status="200",le="+Inf"} 1',
        );
    });

    test("sampleRuntimeMetrics fills heap + uptime gauges", async ({ assert }) => {
        sampleRuntimeMetrics();
        const body = await metricsRegistry.render();
        const heapMatch = body.match(/nodejs_heap_size_used_bytes (\d+(?:\.\d+)?)/);
        assert.isNotNull(heapMatch, "expected heap used gauge in /metrics body");
        const heapValue = Number(heapMatch![1]);
        assert.isAbove(heapValue, 0, "heap should be > 0 inside a running test");
        const uptimeMatch = body.match(/process_uptime_seconds (\d+(?:\.\d+)?)/);
        assert.isNotNull(uptimeMatch, "expected uptime gauge in /metrics body");
    });

    test("counters with no value still render a baseline zero", async ({ assert }) => {
        const body = await metricsRegistry.render();
        assert.include(body, 'calibra_payment_attempts_total{gateway="zarinpal",status="initiated"} 0');
        assert.include(body, 'calibra_auth_events_total{outcome="login_success"} 0');
    });
});
