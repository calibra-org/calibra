import { defineConfig, drivers } from "@adonisjs/queue";

import env from "#start/env";

/**
 * Queue runs on the same Postgres each spin already provisions — no Redis dep, no extra
 * container. Migration `database/migrations/<ts>_create_queue_tables.ts` creates the underlying
 * tables on the very first migration:run.
 *
 * `QUEUE_DRIVER=sync` is the test default — jobs execute inline in the dispatching process,
 * making functional tests deterministic without spawning a worker. Dev + prod default to
 * `database`, which requires `node ace queue:work` to run alongside the API; the spin's start
 * script spawns one tracked worker per spin.
 */
export default defineConfig({
    default: env.get("QUEUE_DRIVER"),
    adapters: {
        database: drivers.database({ connectionName: "postgres" }),
        sync: drivers.sync(),
    },
    worker: {
        concurrency: 2,
        idleDelay: "2s",
        gracefulShutdown: true,
    },
    locations: ["./app/jobs/**/*.{ts,js}"],
});
