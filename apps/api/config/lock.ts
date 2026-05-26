import { defineConfig, stores } from "@adonisjs/lock";
import type { InferLockStores } from "@adonisjs/lock/types";

import env from "#start/env";

/**
 * Distributed lock registry. Redis backs production + dev so a second api process
 * (or the queue worker) sees the same lock state; memory is used by tests where the
 * single-process boundary makes cross-process coordination irrelevant.
 *
 * **`LIMITER_STORE` is load-bearing**: when it's `memory`, the `redis` store is *not declared*
 * at all (not just not-default). The ioredis client connects eagerly the moment the store is
 * constructed, so leaving the definition around in a test/CI boot — where Redis isn't running
 * on the configured host:port — exhausts the retry budget and floods the process with
 * `ECONNREFUSED` until the test runner times out. The cache config takes the same shape for
 * the same reason.
 *
 * Critical sections that go through `lock.createLock(...)` today: checkout submission, refund
 * issuance, PSP verify, import rollback, coupon redemption.
 */
const lockStore = env.get("LIMITER_STORE");

const lockConfig =
    lockStore === "redis"
        ? defineConfig({
              default: "redis" as const,
              stores: {
                  redis: stores.redis({}),
                  memory: stores.memory(),
              },
          })
        : defineConfig({
              default: "memory" as const,
              stores: {
                  memory: stores.memory(),
              },
          });

export default lockConfig;

declare module "@adonisjs/lock/types" {
    export interface LockStoresList extends InferLockStores<typeof lockConfig> {}
}
