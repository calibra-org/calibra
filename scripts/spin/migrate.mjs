// @ts-check

import { step } from "./log.mjs";
import { writeMeta } from "./meta.mjs";
import { run } from "./run.mjs";

/**
 * @param {import("./meta.mjs").SpinMeta} meta
 */
export async function ensureMigrationsAndSeed(meta) {
    step("db", "migration:run");
    await run("pnpm", ["--filter", "@calibra/api", "migration:run"], { cwd: meta.worktreePath });
    if (meta.seeded) {
        step("db", "seed (skip, already seeded)");
        return;
    }
    step("db", "db:seed");
    await run("pnpm", ["--filter", "@calibra/api", "db:seed"], { cwd: meta.worktreePath });
    meta.seeded = true;
    await writeMeta(meta);
}
