// @ts-check

import { join } from "node:path";

import { step } from "./log.mjs";
import { writeMeta } from "./meta.mjs";
import { run } from "./run.mjs";

/**
 * Multi-tenant DB bring-up. The two Postgres roles must exist before the first migration:
 *  1. `db:bootstrap-roles` (superuser) creates `calibra_app` + `calibra_admin`.
 *  2. migrations run as `calibra_admin` (BYPASSRLS, owns the schema).
 *  3. the seeder runs as `calibra_admin` so it can write across every tenant.
 *
 * @param {import("./meta.mjs").SpinMeta} meta
 */
export async function ensureMigrationsAndSeed(meta) {
    const apiCwd = join(meta.worktreePath, "apps/api");

    step("db", "bootstrap-roles");
    await run("node", ["ace", "db:bootstrap-roles"], { cwd: apiCwd });

    step("db", "migration:run (postgres_admin)");
    await run("node", ["ace", "migration:run", "--connection=postgres_admin"], { cwd: apiCwd });

    if (meta.seeded) {
        step("db", "seed (skip, already seeded)");
        return;
    }
    step("db", "db:seed (postgres_admin)");
    await run("node", ["ace", "db:seed", "--connection=postgres_admin"], { cwd: apiCwd });
    meta.seeded = true;
    await writeMeta(meta);
}
