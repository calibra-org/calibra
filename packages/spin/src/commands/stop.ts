import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";

import { composeDown } from "../core/compose";
import { buildComposeOptions } from "../core/compose-assembly";
import { readMetaOrFail, writeMeta } from "../core/meta";
import { clearRunState } from "../core/run-state";
import { stopHostServers } from "../core/servers";
import { removeWorktree } from "../core/worktree";
import { log } from "../log";

export interface StopOptions {
    purge: boolean;
    remove: boolean;
    force: boolean;
}

/**
 * Tear down a spin: stop host processes, then stop containers. Volumes survive by default (the
 * seeded catalog returns on the next start); `--purge` wipes them and clears the `seeded` gate so
 * the next start re-seeds. `--remove` drops the worktree + branch (worktree spins only).
 */
export async function runStop(slug: string, opts: StopOptions): Promise<void> {
    const meta = await readMetaOrFail(slug);
    log.info(`stopping ${slug}`);

    await stopHostServers(meta);

    const apiCompose = join(meta.worktreePath, "apps/api/docker-compose.yml");
    if (existsSync(apiCompose)) {
        await composeDown(buildComposeOptions(meta), opts.purge);
    } else {
        log.warn("compose file missing; skipping container teardown");
    }

    if (opts.purge && meta.seeded) {
        meta.seeded = false;
        await writeMeta(meta);
    }

    if (opts.remove) {
        await removeWorktree(meta, { force: opts.force });
    }

    await clearRunState(meta.slug);
    log.success("stopped");
}

export function registerStop(program: Command): void {
    program
        .command("stop")
        .argument("<slug>", "sandbox slug")
        .description("stop a spin (containers + host processes); volumes survive unless --purge")
        .option("--purge", "also drop docker volumes (wipes the db; forces re-seed next start)")
        .option("--remove", "remove the worktree + branch")
        .option("--force", "force worktree removal even with uncommitted changes")
        .action(async (slug: string, opts: { purge?: boolean; remove?: boolean; force?: boolean }) => {
            await runStop(slug, { purge: Boolean(opts.purge), remove: Boolean(opts.remove), force: Boolean(opts.force) });
        });
}
