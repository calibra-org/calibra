import { defineConfig } from "@adonisjs/redis";
import type { InferConnections } from "@adonisjs/redis/types";

import env from "#start/env";

/**
 * Single `main` Redis connection — used by Transmit's `redis` transport to bridge SSE
 * broadcasts across processes (api ↔ queue worker), the cache L2 + bus (`config/cache.ts`),
 * and any future limiter / lock store that wants distributed state.
 *
 * Dev points at the per-spin Redis container that `scripts/spin.mjs` brings up. `keyPrefix`
 * is namespaced per spin via `APP_NAME` so two spins sharing the same Redis container don't
 * collide on keys / pub-sub channels.
 */
const redisConfig = defineConfig({
    connection: "main",
    connections: {
        main: {
            host: env.get("REDIS_HOST"),
            port: env.get("REDIS_PORT"),
            password: env.get("REDIS_PASSWORD"),
            keyPrefix: `${env.get("APP_NAME")}:`,
        },
    },
});

export default redisConfig;

declare module "@adonisjs/redis/types" {
    export interface RedisConnections extends InferConnections<typeof redisConfig> {}
}
