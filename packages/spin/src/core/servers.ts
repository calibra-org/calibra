import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { log } from "../log";
import { nextDevAllowedOrigins } from "./env-render";
import { isPidAlive, readPid, startHostProcess, stopHostProcess, waitForPortsFree } from "./host-process";
import type { SpinMeta } from "./meta";
import { AGENT_SERVER_ENTRY } from "./paths";
import { effectivePort, requirePort } from "./ports";
import { isPortListening } from "./probes";

/**
 * Host-process orchestration for the apps. Calibra runs api/queue/admin/web/platform/agent on the
 * host (HMR) — only datastores + observability are containers. The agent (web panel) is spawned
 * last, pointing at the built panel server in the running spin package.
 */

/** Every host service this spin can run, in teardown order. */
export const HOST_SERVICE_IDS = ["api", "admin", "queue", "web", "agent", "platform"] as const;

async function spawn(meta: SpinMeta, service: string, cmd: string, args: string[], cwd: string, env: Record<string, string>) {
    const result = await startHostProcess({ worktreePath: meta.worktreePath, service, cmd, args, cwd, env });
    log[result.started ? "step" : "skip"](`${service}${result.started ? ` (pid ${result.pid})` : " already running"}`);
}

/** Start the host processes for a spin. `admin` always starts; `web` is gated on `withWeb`. */
export async function startHostServers(meta: SpinMeta, opts: { withWeb: boolean }): Promise<void> {
    const wt = meta.worktreePath;
    const origins = nextDevAllowedOrigins(meta);

    await spawn(meta, "api", "pnpm", ["--filter", "@calibra/api", "dev"], wt, {
        PORT: String(meta.ports.api),
        HOST: "0.0.0.0",
    });
    await spawn(meta, "queue", "pnpm", ["--filter", "@calibra/api", "exec", "node", "ace", "queue:work", "--queue=imports,exports"], wt, {});
    await spawn(meta, "admin", "pnpm", ["exec", "next", "dev", "-p", String(meta.ports.admin)], join(wt, "apps/admin"), {
        PORT: String(meta.ports.admin),
        NEXT_DEV_ALLOWED_ORIGINS: origins,
    });
    if (opts.withWeb) {
        await spawn(meta, "web", "pnpm", ["exec", "next", "dev", "-p", String(meta.ports.web)], join(wt, "apps/web"), {
            PORT: String(meta.ports.web),
            NEXT_DEV_ALLOWED_ORIGINS: origins,
        });
    }
    const platformPort = effectivePort(meta, "platform");
    if (platformPort !== null) {
        await spawn(meta, "platform", "pnpm", ["exec", "next", "dev", "-p", String(platformPort)], join(wt, "apps/platform"), {
            PORT: String(platformPort),
            NEXT_DEV_ALLOWED_ORIGINS: origins,
        });
    }
    await spawn(meta, "agent", "node", [AGENT_SERVER_ENTRY, "--slug", meta.slug, "--port", String(requirePort(meta, "spinAgent"))], wt, {});
}

/** Block until the app ports answer; warn (non-fatal) if the portless queue worker died. */
export async function waitForServersReady(meta: SpinMeta, opts: { withWeb: boolean }): Promise<void> {
    const targets = [
        { name: "api", port: meta.ports.api },
        { name: "admin", port: meta.ports.admin },
    ];
    if (opts.withWeb) targets.push({ name: "web", port: meta.ports.web });
    const platformPort = effectivePort(meta, "platform");
    if (platformPort !== null) targets.push({ name: "platform", port: platformPort });

    for (const target of targets) {
        const deadline = Date.now() + 60_000;
        let ready = false;
        while (Date.now() < deadline) {
            if (await isPortListening(target.port)) {
                ready = true;
                log.success(`${target.name} ready on :${target.port}`);
                break;
            }
            await sleep(500);
        }
        if (!ready) {
            throw new Error(`${target.name} did not start within 60s — check .spin/logs/${target.name}.log`);
        }
    }

    await sleep(1500);
    const queuePid = await readPid(meta.worktreePath, "queue");
    if (queuePid !== null && isPidAlive(queuePid)) log.success(`queue ready (pid ${queuePid})`);
    else log.warn("queue worker not running — check .spin/logs/queue.log");
}

/** Stop every host process and wait for the app ports to free (dodges EADDRINUSE on re-start). */
export async function stopHostServers(meta: SpinMeta): Promise<void> {
    for (const service of HOST_SERVICE_IDS) {
        if (await stopHostProcess(meta.worktreePath, service)) log.step(`stopped ${service}`);
    }
    await waitForPortsFree([meta.ports.api, meta.ports.admin, meta.ports.web]);
}
