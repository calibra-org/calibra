import { test } from "@japa/runner";

import { truncatePhase03Tables } from "#tests/helpers/db";

/**
 * Rate-limit exhaustion behaviour for the auth surface. The bootstrap's per-group hook
 * wipes the memory store before every test, so each spec gets a fresh burst budget.
 */
test.group("auth rate limiter", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("login is allowed up to the per-IP burst then 429", async ({ client, assert }) => {
        const responses = [];
        for (let i = 0; i < 6; i += 1) {
            responses.push(
                await client
                    .post("/api/v1/auth/login")
                    .header("X-Forwarded-For", "203.0.113.10")
                    .json({ email: "missing@calibra.dev", password: "wrong" }),
            );
        }
        const lastFiveStatuses = responses.slice(0, 5).map((r) => r.status());
        const overflow = responses[5];
        assert.notInclude(lastFiveStatuses, 429, "first 5 should not hit the limit");
        overflow.assertStatus(429);
        assert.exists(overflow.header("retry-after"));
    });
});
