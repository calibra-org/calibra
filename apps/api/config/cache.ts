import { defineConfig, drivers, store } from "@adonisjs/cache";

/**
 * In-memory cache only — no Redis cluster to coordinate across, since we run a single AdonisJS
 * process per deployment. If we ever go multi-process the export wizard's distinct-meta-keys
 * cache will need an L2 layer + a Redis bus so each instance doesn't recompute the same JSON
 * scan; see the multi-tier section of the cache docs.
 *
 * `maxSize: "32mb"` is plenty for the only caller (a Postgres `jsonb_object_keys` scan over the
 * filtered product set — payload is a short string array per filter shape) and small enough that
 * it won't crowd the api process's heap on a 256MB container.
 */
const cacheConfig = defineConfig({
    default: "memory",
    ttl: "30s",
    stores: {
        memory: store().useL1Layer(drivers.memory({ maxSize: "32mb" })),
    },
});

export default cacheConfig;
