import { test } from "@japa/runner";

import env from "#start/env";

import { getMeilisearch, resetMeilisearchClient } from "#services/meilisearch";

test.group("Meilisearch client", (group) => {
    let savedHost: string | undefined;
    let savedKey: string | undefined;

    group.each.setup(() => {
        savedHost = env.get("MEILISEARCH_HOST");
        savedKey = env.get("MEILISEARCH_API_KEY");
        resetMeilisearchClient();
    });

    group.each.teardown(() => {
        env.set("MEILISEARCH_HOST", savedHost ?? "");
        env.set("MEILISEARCH_API_KEY", savedKey ?? "");
        resetMeilisearchClient();
    });

    test("returns null when MEILISEARCH_HOST is unset", ({ assert }) => {
        env.set("MEILISEARCH_HOST", "");
        env.set("MEILISEARCH_API_KEY", "");
        resetMeilisearchClient();
        assert.isNull(getMeilisearch());
    });

    test("returns null when MEILISEARCH_API_KEY is unset", ({ assert }) => {
        env.set("MEILISEARCH_HOST", "http://localhost:7700");
        env.set("MEILISEARCH_API_KEY", "");
        resetMeilisearchClient();
        assert.isNull(getMeilisearch());
    });

    test("memoises the constructed client across calls", ({ assert }) => {
        env.set("MEILISEARCH_HOST", "http://localhost:7700");
        env.set("MEILISEARCH_API_KEY", "test-key");
        resetMeilisearchClient();

        const a = getMeilisearch();
        const b = getMeilisearch();
        assert.isNotNull(a, "expected a non-null client when env is set");
        assert.strictEqual(a, b, "expected the second call to return the memoised client");
    });
});
