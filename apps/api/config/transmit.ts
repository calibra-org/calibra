import { defineConfig } from "@adonisjs/transmit";
/**
 * Import the redis transport via its subpath, not `@adonisjs/transmit/transports`. The
 * top-level transports index re-exports the mqtt transport too, which forces a load of the
 * `mqtt` peer dep that we don't have installed. The redis subpath sidesteps that.
 */
import { redis } from "@adonisjs/transmit/transports/redis";

import env from "#start/env";

/**
 * Transmit needs a transport to bridge SSE broadcasts across processes — without one, a
 * `transmit.broadcast(...)` call only reaches subscribers in the SAME process. We run at
 * least two processes (api + `node ace queue:work`), so the importer/exporter runners
 * broadcast from the worker process while the browser's SSE connection lives in the api
 * process. The redis transport's pub/sub bridges the two.
 *
 * **Spin isolation**: ioredis's `keyPrefix` option is NOT applied to pub/sub channels — only
 * to `SET`/`GET`/etc. So two spins sharing one Redis container would cross-talk on
 * `"transmit::broadcast"` and each receive the other's events. We side-step this by baking
 * `APP_NAME` (per-spin, see `scripts/spin.mjs`) directly into the channel name. Production
 * apps deploying alongside others on the same Redis: keep this pattern.
 *
 * `pingInterval: "30s"` keeps long-lived SSE connections alive past intermediate-proxy idle
 * timeouts (Nginx defaults to 60s) without flooding the wire.
 */
/**
 * `TRANSMIT_TRANSPORT=none` (tests + ace commands like `check:api-docs`, `migration:run`)
 * keeps Transmit single-process — Adonis still boots it, broadcasts stay in-memory. Without
 * this opt-out, the transport's constructor synchronously calls `bus.subscribe(...)` which
 * makes ioredis try to reach Redis at boot time. CI doesn't run Redis, so ioredis retries
 * past its limit and crashes the process *after* the command already printed success.
 */
const useRedisTransport = env.get("TRANSMIT_TRANSPORT") === "redis";

export default defineConfig({
    pingInterval: "30s",
    transport: useRedisTransport
        ? {
              driver: redis({
                  host: env.get("REDIS_HOST"),
                  port: env.get("REDIS_PORT"),
                  password: env.get("REDIS_PASSWORD"),
                  /** Surface a real connectivity blip fast — don't hang 20 retries deep on a broadcast. */
                  maxRetriesPerRequest: 1,
              }),
              channel: `${env.get("APP_NAME")}::transmit::broadcast`,
          }
        : null,
});
