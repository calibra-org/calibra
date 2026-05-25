import { test } from "@japa/runner";

import { resetMetrics } from "#middleware/metrics_middleware";

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
});
