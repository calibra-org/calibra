// @ts-check

import { downContainers } from "../compose.mjs";
import { parseFlags, requireSlug } from "../flags.mjs";
import { cyan, green, log } from "../log.mjs";
import { readMetaOrFail } from "../meta.mjs";
import { killTrackedProcesses } from "../processes.mjs";
import { removeWorktree } from "../worktree.mjs";

/**
 * Tear down everything `start` created. Servers stop, containers stop. Volumes survive by
 * default so the seeded catalog comes back the next time you `spin <slug>`; pass `--purge` to
 * wipe the database too. Pass `--remove` to drop the worktree + branch (refuses if the worktree
 * has uncommitted changes; bypass with `--force`).
 *
 * @param {string[]} args
 */
export async function stop(args) {
    const slug = requireSlug(args[0]);
    const flags = parseFlags(args.slice(1));
    const meta = await readMetaOrFail(slug);

    log(cyan(`stopping ${slug}`));

    await killTrackedProcesses(meta);
    await downContainers(meta, { purge: flags.purge });

    if (flags.remove) {
        await removeWorktree(meta, { force: flags.force });
    }

    log(green("  ✓ stopped"));
}
