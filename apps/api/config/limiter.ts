import { defineConfig, stores } from "@adonisjs/limiter";
import type { InferLimiters } from "@adonisjs/limiter/types";

import env from "#start/env";

/**
 * Rate limiter store registry. `redis` is the production default (shared counters across the
 * api + queue worker processes); `memory` is used by tests so they don't need Redis up. The
 * keyPrefix on the redis driver namespaces buckets per app, mirroring `config/redis.ts` so a
 * `pnpm spin` instance can't see another spin's counters.
 *
 * Named limiters that actually apply to routes live in `start/limiter.ts` — this file just
 * declares which stores exist.
 */
const limiterConfig = defineConfig({
    default: env.get("LIMITER_STORE"),
    stores: {
        redis: stores.redis({
            keyPrefix: `${env.get("APP_NAME")}:limiter:`,
        }),
        memory: stores.memory({}),
    },
});

export default limiterConfig;

declare module "@adonisjs/limiter/types" {
    export interface LimitersList extends InferLimiters<typeof limiterConfig> {}
}
