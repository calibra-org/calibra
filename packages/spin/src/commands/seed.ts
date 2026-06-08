import { join } from "node:path";
import type { Command } from "commander";
import { log } from "../log";
import { run } from "../core/exec";
import { readMetaOrFail, writeMeta } from "../core/meta";

/**
 * Re-run the database seeder on demand (`MainSeeder`, provisioning the demo tenants). Always runs
 * on the BYPASSRLS `postgres_admin` connection — seeding on the RLS-enforced `calibra_app` role
 * silently writes zero rows and leaves shops empty.
 */
export async function runSeed(slug: string): Promise<void> {
    const meta = await readMetaOrFail(slug);
    log.step(`db: db:seed (postgres_admin) for ${slug}`);
    await run("node", ["ace", "db:seed", "--connection=postgres_admin"], { cwd: join(meta.worktreePath, "apps/api") });
    if (!meta.seeded) {
        meta.seeded = true;
        await writeMeta(meta);
    }
    log.success("seeded");
}

export function registerSeed(program: Command): void {
    program
        .command("seed")
        .argument("<slug>", "sandbox slug")
        .description("re-run the database seeder (demo tenants) on the admin connection")
        .action(async (slug: string) => {
            await runSeed(slug);
        });
}
