import { DiskSpaceCheck, HealthChecks, MemoryHeapCheck } from "@adonisjs/core/health";
import { DbCheck } from "@adonisjs/lucid/database";
import db from "@adonisjs/lucid/services/db";
import { RedisCheck } from "@adonisjs/redis";
import redis from "@adonisjs/redis/services/main";

/**
 * Readiness checks for `/health/ready`. The probe reports degraded when any of the
 * required dependencies is unhealthy:
 *
 *   - `DiskSpaceCheck` — bounded so a runaway export disk doesn't 503 us in dev.
 *   - `MemoryHeapCheck` — flags slow GC pressure before the container OOMs.
 *   - `DbCheck` — pings Postgres on the default Lucid connection; the api is unusable
 *     without it.
 *   - `RedisCheck` — pings the `main` connection; the limiter, lock, transmit transport
 *     and cache bus all key off it.
 *
 * Add a Mailpit / queue check by appending to this list. Each `BaseCheck` returns a
 * `HealthCheckResult` with structured metadata — the report renderer maps them straight
 * to JSON.
 */
export const healthChecks = new HealthChecks().register([
    new DiskSpaceCheck(),
    new MemoryHeapCheck(),
    new DbCheck(db.connection()),
    new RedisCheck(redis.connection()),
]);
