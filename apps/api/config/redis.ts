import { defineConfig } from "@adonisjs/redis";

import env from "#start/env";

/**
 * Single `main` Redis connection — used by Transmit's `redis` transport to bridge SSE
 * broadcasts across processes (api ↔ queue worker), and available for any future cache /
 * limiter / lock store that wants distributed state.
 *
 * Dev points at the shared Mailpit-style Redis container that `scripts/spin.mjs` brings up
 * on `localhost:16379`. `keyPrefix` is namespaced per spin via `APP_NAME` so two spins
 * sharing the same Redis container don't collide on keys / pub-sub channels.
 */
export default defineConfig({
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
