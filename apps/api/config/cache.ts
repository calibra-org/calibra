import { defineConfig, drivers, store } from "@adonisjs/cache";

import env from "#start/env";

/**
 * Two stores, deliberately. `redis` is the multi-tier production default that every hot read
 * path uses — an in-process L1 keeps repeat hits at zero network cost, the L2 in Redis survives
 * restarts and is shared across the api + queue-worker processes, and the bus broadcasts
 * invalidations so each process's L1 evicts the moment a sibling writes. `memory` is the
 * single-tier in-process store the export wizard still calls explicitly via `cache.use("memory")`
 * — its meta-keys snapshot is intentionally per-process (warm restart wins) and doesn't need
 * coherency with other api instances.
 *
 * Tests set `CACHE_DRIVER=memory` so Japa runs never touch Redis. Production sets it to `redis`.
 *
 * **Global defaults** below are tuned for "the catalog stays up if Postgres dies":
 *  - `ttl: "5m"` — fresh data window. Per-call overrides tighten this on hot paths and relax it
 *    on rarely-changing taxonomy.
 *  - `grace: "24h"` — if the factory fails (Postgres outage, network blip) we keep serving the
 *    last good value for a full day. Correctness-sensitive callers (cart pricing, stock,
 *    shipping rates) MUST pass `grace: undefined` per-call to disable this.
 *  - `graceBackoff: "30s"` — after a failed refresh, don't pummel the source; wait 30s before
 *    retrying. Stale data continues to serve in the gap.
 *  - `timeout: "200ms"` (soft) — if the factory takes > 200ms AND a stale value exists in the
 *    grace window, return stale immediately and let the factory finish in the background.
 *  - `hardTimeout: "2s"` — absolute upper bound. The factory keeps running and will populate the
 *    cache for the next request, but this request fails fast.
 */
const cacheConfig = defineConfig({
    default: env.get("CACHE_DRIVER"),
    ttl: "5m",
    grace: "24h",
    graceBackoff: "30s",
    timeout: "200ms",
    hardTimeout: "2s",
    stores: {
        /**
         * Multi-tier production store. The L1 ceiling is sized so a handful of large
         * paginated catalog responses fit comfortably without crowding the api heap; raise it
         * if `cache:clear`d under load and L1 hit-rate stays low. The bus uses the same
         * `main` Redis connection — `config/redis.ts` already namespaces keys + pub-sub
         * channels by `APP_NAME` so two spins or two replicas don't cross-pollinate.
         */
        redis: store()
            .useL1Layer(drivers.memory({ maxSize: "64mb" }))
            .useL2Layer(drivers.redis({ connectionName: "main" }))
            .useBus(drivers.redisBus({ connectionName: "main" })),

        /**
         * Single-tier in-process store. The export wizard's distinct-meta-keys snapshot calls
         * `cache.use("memory")` so its 60s TTL behaves identically per process (warm restart
         * recomputes, no Redis dependency for that particular shape).
         */
        memory: store().useL1Layer(drivers.memory({ maxSize: "32mb" })),
    },
});

export default cacheConfig;
