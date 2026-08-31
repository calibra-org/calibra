import type { Command } from "commander";

import { buildComposeOptions } from "../core/compose-assembly";
import { printHandoffCard } from "../core/handoff";
import { loadOrInitMeta, type SpinMeta } from "../core/meta";
import { runPipeline } from "../core/pipeline";
import { pipelineSteps } from "../core/pipeline-steps";
import { assertSlug } from "../core/slug";
import { log } from "../log";

interface StartOptions {
    withWeb?: boolean;
    /** Bring the observability stack up with everything else instead of the default lite set. */
    full?: boolean;
}

/** Print the one-line provisioning header (slug, paths, key ports). */
export function printStartHeader(meta: SpinMeta, mode: string): void {
    log.info(`spin ${meta.slug} — ${mode}`);
    log.info(`  profile  ${meta.profile}`);
    log.info(`  worktree ${meta.worktreePath}`);
    log.info(`  branch   ${meta.branch}`);
    log.info(`  ports    api=${meta.ports.api} admin=${meta.ports.admin} db=${meta.ports.db} pgadmin=${meta.ports.pgadmin}`);
}

/** Bring up (or resume) a worktree spin for `slug`, then print the handoff card. */
export async function runStart(slug: string, opts: StartOptions): Promise<void> {
    assertSlug(slug);
    const meta = await loadOrInitMeta(slug, opts.full ? { profile: "full" } : {});
    printStartHeader(meta, "worktree spin");
    await runPipeline(pipelineSteps(), {
        meta,
        compose: buildComposeOptions(meta),
        worktree: true,
        withWeb: Boolean(opts.withWeb),
    });
    printHandoffCard(meta, { withWeb: Boolean(opts.withWeb) });
}

export function registerStart(program: Command): void {
    program
        .command("start")
        .argument("<slug>", "sandbox slug")
        .description("bring up the calibra stack in a dedicated worktree + branch for <slug>")
        .option("--with-web", "also start the storefront (web); admin always starts")
        .option("--full", "also run observability + error tracking (default: lite)")
        .action(async (slug: string, opts: StartOptions) => {
            await runStart(slug, opts);
        });
}
