// @ts-check

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { log, red, step } from "./log.mjs";
import { metaPath } from "./meta.mjs";
import { requirePort } from "./ports.mjs";
import { isPortListening } from "./probes.mjs";

/**
 * @param {import("./meta.mjs").SpinMeta} meta
 * @param {{ withWeb: boolean }} opts
 */
export async function startServers(meta, opts) {
    const logsDir = join(meta.worktreePath, ".spin/logs");
    await mkdir(logsDir, { recursive: true });

    await startServer({
        name: "api",
        meta,
        cmd: "pnpm",
        args: ["--filter", "@calibra/api", "dev"],
        cwd: meta.worktreePath,
        env: { ...process.env, PORT: String(meta.ports.api), HOST: "0.0.0.0" },
    });

    /**
     * Background-job worker for @adonisjs/queue's `database` driver. Tracked the same way as the
     * api/admin processes so `spin stop` cleans it up. The `queue:work` command stays alive until
     * SIGTERM and handles graceful shutdown of in-flight jobs.
     */
    await startServer({
        name: "queue",
        meta,
        cmd: "pnpm",
        /**
         * `--queue=imports,exports` matches the queues declared on `RunImportJob` and
         * `RunExportJob`. Without it the worker only polls `default` and the dispatched jobs
         * sit unprocessed in `queue_jobs`. The `default` queue stays empty in this repo for now.
         */
        args: ["--filter", "@calibra/api", "exec", "node", "ace", "queue:work", "--queue=imports,exports"],
        cwd: meta.worktreePath,
        env: { ...process.env },
    });

    /**
     * Literal hostnames Next.js's `allowedDevOrigins` should accept for this spin. Next's
     * glob matching only fires for a single dot-less segment per `*`, so the two-label
     * subdomains we use (`admin.<slug>.spin.localhost`) wouldn't always match a single
     * wildcard pattern. Passing the literal hostnames in alongside the wildcard patterns
     * (see each `next.config.ts`) guarantees acceptance regardless of how Next interprets
     * the glob.
     */
    const nextDevAllowedOrigins = [
        `admin.${meta.slug}.spin.localhost`,
        `web.${meta.slug}.spin.localhost`,
        `api.${meta.slug}.spin.localhost`,
    ].join(",");

    await startServer({
        name: "admin",
        meta,
        cmd: "pnpm",
        args: ["exec", "next", "dev", "-p", String(meta.ports.admin)],
        cwd: join(meta.worktreePath, "apps/admin"),
        env: {
            ...process.env,
            PORT: String(meta.ports.admin),
            NEXT_DEV_ALLOWED_ORIGINS: nextDevAllowedOrigins,
        },
    });

    if (opts.withWeb) {
        await startServer({
            name: "web",
            meta,
            cmd: "pnpm",
            args: ["exec", "next", "dev", "-p", String(meta.ports.web)],
            cwd: join(meta.worktreePath, "apps/web"),
            env: {
                ...process.env,
                PORT: String(meta.ports.web),
                NEXT_DEV_ALLOWED_ORIGINS: nextDevAllowedOrigins,
            },
        });
    }

    /**
     * Spin homepage + control plane. Tiny Node http server, no deps. Caddy fronts it at the
     * bare `<slug>.spin.localhost` host so the first URL the operator visits after `pnpm spin`
     * is the live dashboard, not a port-list in their terminal.
     */
    await startServer({
        name: "agent",
        meta,
        cmd: "node",
        args: ["scripts/spin-agent.mjs"],
        cwd: meta.worktreePath,
        env: {
            ...process.env,
            SPIN_AGENT_PORT: String(requirePort(meta, "spinAgent")),
            SPIN_SLUG: meta.slug,
            SPIN_META_PATH: metaPath(meta.slug),
            COMPOSE_PROJECT_NAME: meta.composeProject,
        },
    });
}

/**
 * @param {{ name: string, meta: import("./meta.mjs").SpinMeta, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv }} input
 */
export async function startServer(input) {
    const pidPath = join(input.meta.worktreePath, `.spin/${input.name}.pid`);
    const logPath = join(input.meta.worktreePath, `.spin/logs/${input.name}.log`);
    if (existsSync(pidPath)) {
        const pid = Number(await readFile(pidPath, "utf8"));
        if (Number.isFinite(pid) && isProcessAlive(pid)) {
            step(input.name, `already running (pid ${pid})`);
            return;
        }
    }
    step(input.name, "start");
    const { openSync } = await import("node:fs");
    const fd = openSync(logPath, "w");
    const child = spawn(input.cmd, input.args, {
        cwd: input.cwd,
        env: input.env,
        stdio: ["ignore", fd, fd],
        detached: true,
    });
    child.unref();
    await writeFile(pidPath, String(child.pid));
}

/**
 * @param {import("./meta.mjs").SpinMeta} meta
 * @param {{ withWeb: boolean }} opts
 */
export async function waitForServersReady(meta, opts) {
    const targets = [
        { name: "api", port: meta.ports.api },
        { name: "admin", port: meta.ports.admin },
        ...(opts.withWeb ? [{ name: "web", port: meta.ports.web }] : []),
    ];
    for (const target of targets) {
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
            if (await isPortListening(target.port)) {
                step(target.name, `ready on :${target.port}`);
                break;
            }
            await sleep(500);
        }
        if (!(await isPortListening(target.port))) {
            throw new Error(`${target.name} did not start within 60s — check .spin/logs/${target.name}.log`);
        }
    }
    /**
     * Queue worker has no port — give it a beat to boot, then verify the pid file resolves to
     * a live process AND the log shows the "Starting worker for queues:" line. Failure here
     * is non-fatal (operator can still hit the api) but loud so it's not silently broken.
     */
    await sleep(1_500);
    const queuePid = await readPidIfAlive(join(meta.worktreePath, ".spin/queue.pid"));
    if (queuePid === null) {
        log(`  ${red("✗")} queue worker not running — check .spin/logs/queue.log`);
    } else {
        step("queue", `ready (pid ${queuePid})`);
    }
}

/**
 * @param {import("./meta.mjs").SpinMeta} meta
 */
export async function killTrackedProcesses(meta) {
    for (const name of ["api", "admin", "queue", "web", "agent"]) {
        const pidPath = join(meta.worktreePath, `.spin/${name}.pid`);
        if (!existsSync(pidPath)) continue;
        const pid = Number(await readFile(pidPath, "utf8"));
        if (Number.isFinite(pid) && isProcessAlive(pid)) {
            step(name, `kill ${pid}`);
            try {
                process.kill(-pid, "SIGTERM");
            } catch {
                /** Already gone — ignore. */
            }
        }
        await rm(pidPath, { force: true });
    }
    /**
     * Wait until tracked ports are actually free. HMR child workers from `node ace serve --hmr`
     * sometimes outlive their parent for a beat — without this wait the next `spin start` hits
     * `EADDRINUSE: 13737` and the api never recovers. 5s is enough in practice.
     */
    const portsToFree = [meta.ports.api, meta.ports.admin, meta.ports.web];
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        const busy = await Promise.all(portsToFree.map(isPortListening));
        if (busy.every((b) => !b)) return;
        await sleep(200);
    }
}

/**
 * Read a pidfile and return the PID iff the process is alive. Used by `doctor` to surface
 * background processes (queue worker) that have no port to probe.
 *
 * @param {string} pidPath
 * @returns {Promise<number | null>}
 */
export async function readPidIfAlive(pidPath) {
    if (!existsSync(pidPath)) return null;
    const pid = Number(await readFile(pidPath, "utf8"));
    return Number.isFinite(pid) && isProcessAlive(pid) ? pid : null;
}

/**
 * @param {number} pid
 */
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}
