import { test } from "@japa/runner";

/**
 * Shield's header guards are wired in `start/kernel.ts` and fire on every response. We hit
 * the unauthenticated `/health` endpoint because it's the cheapest probe in the app — no
 * DB load, no auth indirection. CSP rides in report-only, so we look for the
 * `content-security-policy-report-only` header (not the enforcing one).
 */
test.group("shield security headers", () => {
    test("baseline headers land on /health", async ({ client, assert }) => {
        const response = await client.get("/health");
        response.assertStatus(200);

        assert.equal(response.header("x-frame-options"), "DENY");
        assert.equal(response.header("x-content-type-options"), "nosniff");
        assert.exists(response.header("content-security-policy-report-only"), "CSP report-only header is set");
    });
});
