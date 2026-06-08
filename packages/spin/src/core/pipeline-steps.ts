import { composeUp } from "./compose";
import { renderEdgeAndObsConfig, renderEnvFiles } from "./env-render";
import { ensureInstall, ensureSdkBuild } from "./install";
import { ensureMigrationsAndSeed } from "./migrate";
import { effectivePort, requirePort } from "./ports";
import { ensureDraftPr } from "./pr";
import { isPortListening, waitForCaddyHttp, waitForHttp, waitForPort, waitForPostgresReady } from "./probes";
import { startHostServers, waitForServersReady } from "./servers";
import { ensureWorktree, worktreeExists } from "./worktree";
import type { PipelineContext, PipelineStep } from "./pipeline";

/**
 * Whether the infra containers are already up — used to skip the compose-up + readiness-wait steps
 * on a re-run. The db + pgadmin ports signal the foundational layer; Caddy's HTTPS port is the
 * bellwether for the observability/meili/glitchtip stack (it can't be up without the network).
 */
async function infraUp(ctx: PipelineContext): Promise<boolean> {
    const { meta } = ctx;
    const foundation = (await isPortListening(meta.ports.db)) && (await isPortListening(meta.ports.pgadmin));
    const caddyHttps = effectivePort(meta, "caddyHttps");
    const observability = caddyHttps !== null ? await isPortListening(caddyHttps) : true;
    return foundation && observability;
}

async function waitForInfraReady(ctx: PipelineContext): Promise<void> {
    const { meta, compose } = ctx;
    await waitForPostgresReady(compose, meta.ports.db, 60_000);
    await waitForPort(requirePort(meta, "redis"), 30_000, "redis");
    await waitForPort(requirePort(meta, "caddyHttps"), 30_000, "caddy");
    await waitForHttp(`http://localhost:${requirePort(meta, "meilisearch")}/health`, 30_000, "meilisearch");
    await waitForCaddyHttp(meta, "prom", "/-/ready", 30_000, "prometheus");
    await waitForCaddyHttp(meta, "grafana", "/api/health", 60_000, "grafana");
    await waitForCaddyHttp(meta, "errors", "/api/0/", 180_000, "glitchtip", [200, 401, 403]);
}

/**
 * The ordered bring-up steps. Caddy (edge) comes up with the infra **before** the host processes,
 * and the agent panel is started last (inside `startServers`). Mirrors the legacy ensureX chain but
 * as a resumable, run-state-tracked pipeline.
 */
export function pipelineSteps(): PipelineStep[] {
    return [
        {
            name: "worktree",
            describe: () => "Create worktree + branch",
            isComplete: (ctx) => !ctx.worktree || worktreeExists(ctx.meta),
            run: (ctx) => ensureWorktree(ctx.meta),
        },
        {
            name: "renderEnv",
            describe: () => "Render per-spin env files",
            run: (ctx) => renderEnvFiles(ctx.meta),
        },
        {
            name: "renderConfig",
            describe: () => "Render Caddyfile + observability config",
            run: (ctx) => renderEdgeAndObsConfig(ctx.meta),
        },
        {
            name: "composeUp",
            describe: () => "Start infra containers (docker compose up)",
            isComplete: infraUp,
            run: (ctx) => composeUp(ctx.compose),
        },
        {
            name: "waitInfra",
            describe: () => "Wait for infra readiness",
            isComplete: infraUp,
            run: waitForInfraReady,
        },
        {
            name: "install",
            describe: () => "Install dependencies",
            run: (ctx) => ensureInstall(ctx.meta),
        },
        {
            name: "sdkBuild",
            describe: () => "Build @calibra/sdk",
            run: (ctx) => ensureSdkBuild(ctx.meta),
        },
        {
            name: "migrate",
            describe: () => "Bootstrap roles + migrate + seed",
            run: (ctx) => ensureMigrationsAndSeed(ctx.meta),
        },
        {
            name: "startServers",
            describe: () => "Start host processes (apps + panel)",
            run: (ctx) => startHostServers(ctx.meta, { withWeb: ctx.withWeb }),
        },
        {
            name: "waitServers",
            describe: () => "Wait for host processes",
            run: (ctx) => waitForServersReady(ctx.meta, { withWeb: ctx.withWeb }),
        },
        {
            name: "draftPr",
            describe: () => "Ensure draft PR",
            isComplete: (ctx) => !ctx.worktree || ctx.noPr || Boolean(ctx.meta.prNumber),
            run: (ctx) => ensureDraftPr(ctx.meta),
        },
    ];
}
