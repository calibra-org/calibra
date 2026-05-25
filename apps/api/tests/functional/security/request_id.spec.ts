import { test } from "@japa/runner";

test.group("request id middleware", () => {
    test("echoes the upstream X-Request-Id header verbatim", async ({ client, assert }) => {
        const response = await client.get("/health").header("X-Request-Id", "test-fixed-uuid");
        response.assertStatus(200);
        assert.equal(response.header("x-request-id"), "test-fixed-uuid");
    });

    test("mints a fresh UUID when none provided", async ({ client, assert }) => {
        const response = await client.get("/health");
        response.assertStatus(200);
        const id = response.header("x-request-id");
        assert.isString(id);
        assert.match(id as string, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
});
