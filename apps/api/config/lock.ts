import { defineConfig, stores } from "@adonisjs/lock";
import type { InferLockStores } from "@adonisjs/lock/types";

import env from "#start/env";

/**
 * Distributed lock registry. Redis backs production + dev so a second api process
 * (or the queue worker) sees the same lock state; memory is used by tests where the
 * single-process boundary makes cross-process coordination irrelevant.
 *
 * Critical sections that use `lock.use("redis").createLock(...)` today: checkout
 * submission, refund issuance, PSP verify, import rollback, coupon redemption.
 */
const lockConfig = defineConfig({
    default: env.get("LIMITER_STORE"),
    stores: {
        redis: stores.redis({}),
        memory: stores.memory(),
    },
});

export default lockConfig;

declare module "@adonisjs/lock/types" {
    export interface LockStoresList extends InferLockStores<typeof lockConfig> {}
}
