import { test } from "@japa/runner";

/**
 * `/health/live` is the always-200 liveness probe — anything other than HTTP 200 means
 * the process is broken and the orchestrator restarts it. `/health/ready` ships a JSON
 * report from {@link healthChecks}; tests against a fresh container should be all-green.
 */
test.group("health probes", () => {
    test("/health/live is always 200", async ({ client }) => {
        const response = await client.get("/health/live");
        response.assertStatus(200);
        response.assertBodyContains({ status: "ok" });
    });

    test("/health/ready is 200 when the registered checks pass", async ({ client, assert }) => {
        const response = await client.get("/health/ready");
        response.assertStatus(200);
        const body = response.body();
        assert.equal(body.isHealthy, true);
        assert.isArray(body.checks);
        assert.isAbove(body.checks.length, 0);
    });
});
