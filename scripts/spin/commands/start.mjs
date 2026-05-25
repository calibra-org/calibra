// @ts-check

import { ensureContainers } from "../compose.mjs";
import { ensureEnvFiles } from "../env-files.mjs";
import { parseFlags, requireSlug } from "../flags.mjs";
import { printHandoffCard } from "../handoff.mjs";
import { ensureInstall, ensureSdkBuild } from "../install.mjs";
import { cyan, log } from "../log.mjs";
import { loadOrInitMeta } from "../meta.mjs";
import { ensureMigrationsAndSeed } from "../migrate.mjs";
import { ensureObservabilityConfig } from "../observability-config.mjs";
import { ensureDraftPrInternal } from "../pr.mjs";
import { startServers, waitForServersReady } from "../processes.mjs";
import { ensureWorktree } from "../worktree.mjs";

/**
 * Bootstrap (or resume bootstrapping) a worktree.
 *
 * @param {string[]} args
 */
export async function start(args) {
    const slug = requireSlug(args[0]);
    const flags = parseFlags(args.slice(1));
    const meta = await loadOrInitMeta(slug);

    log(cyan(`spin ${slug}`));
    log(`  worktree ${meta.worktreePath}`);
    log(`  branch   ${meta.branch}`);
    log(`  ports    api=${meta.ports.api} admin=${meta.ports.admin} db=${meta.ports.db} pgadmin=${meta.ports.pgadmin}`);
    log("");

    await ensureWorktree(meta);
    await ensureEnvFiles(meta);
    await ensureObservabilityConfig(meta);
    await ensureContainers(meta);
    await ensureInstall(meta);
    await ensureSdkBuild(meta);
    await ensureMigrationsAndSeed(meta);
    await startServers(meta, { withWeb: flags.withWeb });
    await waitForServersReady(meta, { withWeb: flags.withWeb });
    if (!flags.noPr) {
        await ensureDraftPrInternal(meta);
    }

    printHandoffCard(meta, { withWeb: flags.withWeb });
}
