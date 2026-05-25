import { resolve } from "node:path";
import { authApiClient } from "@adonisjs/auth/plugins/api_client";
import cache from "@adonisjs/cache/services/main";
import app from "@adonisjs/core/services/app";
import testUtils from "@adonisjs/core/services/test_utils";
import limiter from "@adonisjs/limiter/services/main";
import { apiClient } from "@japa/api-client";
import { assert } from "@japa/assert";
import { openapi } from "@japa/openapi-assertions";
import { pluginAdonisJS } from "@japa/plugin-adonisjs";
import type { Config } from "@japa/runner/types";

/**
 * Path to the test-only merged OpenAPI bundle produced by
 * `pnpm --filter @calibra/api-docs run build:test-spec`. The `pretest` hook in
 * this package's `package.json` regenerates it before every `node ace test`
 * run, so the assertions always validate against the latest hand-authored spec.
 */
const API_SPEC_PATH = resolve(import.meta.dirname, "../../../docs/api/dist/_merged.test.json");

export const plugins: Config["plugins"] = [
    assert(),
    openapi({ schemas: [API_SPEC_PATH] }),
    apiClient(),
    pluginAdonisJS(app),
    authApiClient(app),
];

/**
 * Schema lifecycle for the whole test run. `migrate()` brings the test database up to the latest
 * migrations on startup and rolls it back to empty on teardown — pair with `truncate()` (per
 * `group.each.setup`) so data resets between tests without redoing migrations every time.
 *
 * Requires a separate test database (`calibra_test`) so the dev DB's seeded data survives test
 * runs. Configured in `.env.test`.
 */
export const runnerHooks: Required<Pick<Config, "setup" | "teardown">> = {
    setup: [() => testUtils.db().migrate()],
    teardown: [],
};

export const configureSuite: Config["configureSuite"] = (suite) => {
    /**
     * The cache lives in process-global state (Bentocache's in-memory L1, configured per
     * `config/cache.ts`). Wipe it before every test in every suite so stale entries from a
     * previous test never bleed into the current one — every test sees a cold cache.
     */
    suite.onGroup((group) => {
        group.each.setup(async () => {
            await cache.clear();
            await cache.use("memory").clear();
        });
    });
    if (["browser", "functional", "e2e"].includes(suite.name)) {
        suite.setup(() => testUtils.httpServer().start());
        /**
         * Limiter buckets in the memory store live forever inside a single process; wiping
         * them per-test keeps the auth/payment/webhook caps from leaking across unrelated
         * specs (a register spec doesn't deserve a 429 because a previous spec consumed
         * the burst).
         */
        suite.onGroup((group) => {
            group.each.setup(async () => {
                await limiter.clear(["memory"]);
            });
        });
    }
};
