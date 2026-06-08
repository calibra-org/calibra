import { join } from "node:path";

import { log } from "../log";

import { run } from "./exec";
import { writeMeta } from "./meta";
import type { SpinMeta } from "./meta";

/**
 * Multi-tenant DB bring-up. The two RLS roles must exist before the first migration:
 *  1. `db:bootstrap-roles` (superuser) creates `calibra_app` (NOBYPASSRLS) + `calibra_admin` (BYPASSRLS).
 *  2. migrations run as `calibra_admin` so they own the schema.
 *  3. the seeder runs as `calibra_admin` (BYPASSRLS) so it can write across every tenant — running
 *     it on the default `calibra_app` connection would silently return zero rows under RLS and
 *     leave every shop looking empty (indistinguishable from a tenancy bug).
 *
 * Seeding is gated on `meta.seeded`; `--connection=postgres_admin` is hard-coded, never inferred.
 */
export async function ensureMigrationsAndSeed(meta: SpinMeta): Promise<void> {
    const apiCwd = join(meta.worktreePath, "apps/api");

    log.step("db: bootstrap-roles");
    await run("node", ["ace", "db:bootstrap-roles"], { cwd: apiCwd });

    log.step("db: migration:run (postgres_admin)");
    await run("node", ["ace", "migration:run", "--connection=postgres_admin"], { cwd: apiCwd });

    if (meta.seeded) {
        log.skip("db: seed (already seeded)");
        return;
    }
    log.step("db: db:seed (postgres_admin)");
    await run("node", ["ace", "db:seed", "--connection=postgres_admin"], { cwd: apiCwd });
    meta.seeded = true;
    await writeMeta(meta);
}
