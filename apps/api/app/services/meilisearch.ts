import { Meilisearch } from "meilisearch";

import env from "#start/env";

/**
 * Per-app Meilisearch client. Constructed lazily on first call so ace commands that don't
 * touch search (`migration:run`, `check:api-docs`) don't pay the cost of opening a TCP
 * connection. Returns `null` when the env vars aren't set — the call sites either no-op or
 * fall back to the existing Postgres ILIKE scan; never throw on missing config.
 *
 * Production points at the managed Meilisearch cluster, dev at the per-spin container
 * (`docker/observability/docker-compose.meili.yml`). Both share the same `MEILISEARCH_HOST`
 * + `MEILISEARCH_API_KEY` contract.
 */

let client: Meilisearch | null | undefined;

/**
 * Returns the singleton client, or `null` when Meilisearch isn't configured. Cached after
 * the first call — subsequent calls return the same instance, so callers can safely use
 * the result in module scope without re-resolving env on every request.
 */
export function getMeilisearch(): Meilisearch | null {
    if (client !== undefined) return client;
    const host = env.get("MEILISEARCH_HOST");
    const apiKey = env.get("MEILISEARCH_API_KEY");
    if (!host || !apiKey) {
        client = null;
        return null;
    }
    client = new Meilisearch({ host, apiKey });
    return client;
}

/**
 * Test-only reset hook. Clears the memoised client so a unit test can swap the env
 * between cases. Not exported on a route.
 */
export function resetMeilisearchClient(): void {
    client = undefined;
}
