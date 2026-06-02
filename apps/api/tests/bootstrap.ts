import { resolve } from "node:path";
import { authApiClient } from "@adonisjs/auth/plugins/api_client";
import cache from "@adonisjs/cache/services/main";
import app from "@adonisjs/core/services/app";
import testUtils from "@adonisjs/core/services/test_utils";
import limiter from "@adonisjs/limiter/services/main";
import db from "@adonisjs/lucid/services/db";
import { ApiClient, apiClient } from "@japa/api-client";
import { assert } from "@japa/assert";
import { openapi } from "@japa/openapi-assertions";
import { pluginAdonisJS } from "@japa/plugin-adonisjs";
import type { Config } from "@japa/runner/types";

import { bootstrapTestRoles, ensureTestTenant, seedTestTenant, TEST_TENANT_SLUG } from "#tests/helpers/tenant";

/**
 * Control-plane + reference tables that must SURVIVE `testUtils.db().truncate()`. These hold
 * cross-tenant reference data (the reserved test tenant, plans, currencies, regions) — truncating
 * them between tests is wrong regardless: it deletes the fixed-id test tenant, leaving the
 * database-level `app.current_tenant` GUC pointing at a missing row, which fails every subsequent
 * per-tenant insert on `tenant_id_fkey`. Adonis' `db:truncate` only excludes the migration tables,
 * so we widen the exclusion list (see {@link patchTruncateExclusions}).
 */
const RESERVED_TRUNCATE_TABLES = [
    "tenants",
    "plans",
    "tenant_domains",
    "platform_users",
    "platform_access_tokens",
    "currencies",
    "regions",
    "region_translations",
];

const TRUNCATE_PATCH_FLAG = Symbol.for("calibra.test.truncatePatched");

/**
 * Monkeypatch `QueryClient.prototype.truncateAllTables` (test-process only) to prepend
 * {@link RESERVED_TRUNCATE_TABLES} to whatever exclude list a caller passes. `testUtils.db().truncate()`
 * runs `db:truncate` in-process via `ace.exec`, which calls `connection.truncateAllTables([migrations…])`
 * — patching the shared prototype covers every caller (direct truncate, `truncateAndCleanup`,
 * `testUtils.db().seed()`) and every connection without touching application code.
 */
function patchTruncateExclusions(): void {
    const proto = Object.getPrototypeOf(db.connection()) as {
        truncateAllTables: (exclude?: string[], schemas?: string[]) => Promise<void>;
        [TRUNCATE_PATCH_FLAG]?: boolean;
    };
    if (proto[TRUNCATE_PATCH_FLAG]) {
        return;
    }
    const original = proto.truncateAllTables;
    proto.truncateAllTables = function patched(exclude, schemas) {
        const merged = [...new Set([...(exclude ?? []), ...RESERVED_TRUNCATE_TABLES])];
        return original.call(this, merged, schemas);
    };
    proto[TRUNCATE_PATCH_FLAG] = true;
}

/**
 * Every functional request carries the default tenant header so tenant-context middleware resolves
 * the shared test tenant — matching how the web/admin BFFs forward `X-Calibra-Tenant` in production.
 * A spec that needs a different (or missing/invalid) tenant overrides it with a later `.header(...)`.
 */
ApiClient.onRequest((request) => {
    request.header("X-Calibra-Tenant", TEST_TENANT_SLUG);
});

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
    setup: [
        () => testUtils.db().migrate(),
        async () => {
            patchTruncateExclusions();
            await bootstrapTestRoles();
            await seedTestTenant();
        },
    ],
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
            /**
             * Re-ensure the reserved test tenant before every test. `suite.onGroup` hooks run after a
             * group's own `each.setup`, so this restores the tenant even after a spec that ran
             * `testUtils.db().truncate()` (+ reseed) wiped it — keeping the `app.current_tenant` GUC
             * default pointing at a row that exists for every subsequent per-tenant insert.
             */
            await ensureTestTenant();
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
