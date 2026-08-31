import type { Command } from "commander";

import { observabilityComposeServices } from "../core/catalog";
import { composeRemove } from "../core/compose";
import { buildComposeOptions } from "../core/compose-assembly";
import { printHandoffCard } from "../core/handoff";
import { loadMetaOrFail, writeMeta } from "../core/meta";
import { runPipeline } from "../core/pipeline";
import { pipelineSteps } from "../core/pipeline-steps";
import { LOCAL_SLUG } from "../core/slug";
import { log } from "../log";

/**
 * Promote an existing spin from the default `lite` profile to `full` — in place, without losing the
 * database, the seeded tenants, or the allocated ports.
 *
 * The whole implementation is "flip the persisted profile, then re-run the normal pipeline". That
 * works because every step is idempotent: the worktree exists, deps are installed, the SDK is built
 * and the DB is seeded, so those steps skip themselves, while `renderEnv` picks up the telemetry
 * env, `composeUp` sees the two extra compose files and creates only the missing containers, and
 * `waitInfra` gates on the observability stack it now expects. Host processes are restarted by
 * `startServers` so the api boots with the OTLP exporter enabled.
 */
export async function runUpgrade(slug: string, opts: { withWeb?: boolean }): Promise<void> {
    const meta = await loadMetaOrFail(slug);
    if (meta.profile === "full") {
        log.skip(`spin ${slug} already runs the full profile`);
        return;
    }

    meta.profile = "full";
    await writeMeta(meta);
    log.info(`spin ${slug} — upgrading lite → full (observability + error tracking)`);

    await runPipeline(pipelineSteps(), {
        meta,
        compose: buildComposeOptions(meta),
        worktree: slug !== LOCAL_SLUG,
        withWeb: Boolean(opts.withWeb),
    });
    printHandoffCard(meta, { withWeb: Boolean(opts.withWeb) });
}

/**
 * The inverse: drop back to `lite`, freeing the observability containers while keeping the database,
 * the seeded tenants and the ports. Their named volumes are left in place, so upgrading again
 * restores the dashboards and metric history. Order matters — the containers are removed *before*
 * the profile flips, because `composeFiles` stops declaring them afterwards and compose can only
 * remove services it can still name.
 */
export async function runDowngrade(slug: string): Promise<void> {
    const meta = await loadMetaOrFail(slug);
    if (meta.profile === "lite") {
        log.skip(`spin ${slug} already runs the lite profile`);
        return;
    }

    log.step(`spin ${slug} — removing the observability stack`);
    await composeRemove(buildComposeOptions(meta), observabilityComposeServices());

    meta.profile = "lite";
    await writeMeta(meta);
    /** The api keeps its OTLP exporter until the env is re-rendered, which the next start does. */
    log.success(`spin ${slug} is now lite — run \`pnpm spin ${slug === LOCAL_SLUG ? "local" : slug}\` to re-render its env`);
}

export function registerUpgrade(program: Command): void {
    program
        .command("upgrade")
        .argument("[slug]", "sandbox slug", LOCAL_SLUG)
        .description("add the observability stack to a running lite spin (keeps data + ports)")
        .option("--with-web", "also (re)start the storefront (web)")
        .action(async (slug: string, opts: { withWeb?: boolean }) => {
            await runUpgrade(slug, opts);
        });

    program
        .command("downgrade")
        .argument("[slug]", "sandbox slug", LOCAL_SLUG)
        .description("remove the observability stack from a spin, back to lite (keeps data + ports)")
        .action(async (slug: string) => {
            await runDowngrade(slug);
        });
}
