import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { isPortListening } from "./probes";

/**
 * Host-process supervision. Calibra runs the apps (api/queue/admin/web/platform/agent) as host
 * HMR processes — not containers — so Docker bind-mount overhead doesn't slow HMR. Each process is
 * spawned **detached as its own group leader** (so `kill(-pid)` reaps pnpm's child Next/Adonis
 * workers too), with a pid file, a truncated-per-run log file, and a spawn manifest under the
 * worktree's `.spin/`. The manifest lets the panel's restart button re-spawn without pipeline
 * context. Ported from stridge-spin's host-process layer; state is worktree-relative (calibra's
 * model) rather than under a home dir.
 */

function pidFile(worktreePath: string, service: string): string {
    return join(worktreePath, ".spin", `${service}.pid`);
}

export function hostLogFile(worktreePath: string, service: string): string {
    return join(worktreePath, ".spin/logs", `${service}.log`);
}

function spawnManifestFile(worktreePath: string, service: string): string {
    return join(worktreePath, ".spin/spawn", `${service}.json`);
}

export interface SpawnManifest {
    cmd: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    /** ms epoch when this manifest was last written. */
    startedAt: number;
}

export interface StartHostOptions {
    worktreePath: string;
    service: string;
    cmd: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
}

export interface StartHostResult {
    pid: number;
    logPath: string;
    /** `false` when an existing live process was reused. */
    started: boolean;
}

export async function readPid(worktreePath: string, service: string): Promise<number | null> {
    const path = pidFile(worktreePath, service);
    if (!existsSync(path)) return null;
    const value = Number.parseInt((await readFile(path, "utf8")).trim(), 10);
    return Number.isFinite(value) && value > 0 ? value : null;
}

/** Whether a pid is alive (signal 0 = existence probe; EPERM means alive-but-not-ours). */
export function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return (err as NodeJS.ErrnoException).code === "EPERM";
    }
}

export async function isHostProcessAlive(worktreePath: string, service: string): Promise<boolean> {
    const pid = await readPid(worktreePath, service);
    return pid !== null && isPidAlive(pid);
}

export async function readSpawnManifest(worktreePath: string, service: string): Promise<SpawnManifest | null> {
    const path = spawnManifestFile(worktreePath, service);
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(await readFile(path, "utf8")) as SpawnManifest;
    } catch {
        return null;
    }
}

/** Spawn a host process detached, idempotently (reuses a live process). */
export async function startHostProcess(opts: StartHostOptions): Promise<StartHostResult> {
    if (await isHostProcessAlive(opts.worktreePath, opts.service)) {
        const pid = (await readPid(opts.worktreePath, opts.service)) as number;
        return { pid, logPath: hostLogFile(opts.worktreePath, opts.service), started: false };
    }
    await mkdir(join(opts.worktreePath, ".spin"), { recursive: true });
    await mkdir(join(opts.worktreePath, ".spin/logs"), { recursive: true });
    await mkdir(join(opts.worktreePath, ".spin/spawn"), { recursive: true });

    const logPath = hostLogFile(opts.worktreePath, opts.service);
    const fd = openSync(logPath, "w");
    const child = spawn(opts.cmd, opts.args, {
        cwd: opts.cwd,
        /**
         * FORCE_COLOR=0 / NO_COLOR=1 / TERM=dumb keep ANSI escapes out of the log file so the panel
         * and TUI render clean text (the log-stream strips stragglers too).
         */
        env: { ...process.env, ...opts.env, FORCE_COLOR: "0", NO_COLOR: "1", TERM: "dumb" },
        detached: true,
        stdio: ["ignore", fd, fd],
    });
    child.unref();
    if (typeof child.pid !== "number") {
        throw new Error(`failed to spawn host process for "${opts.service}"`);
    }
    await writeFile(pidFile(opts.worktreePath, opts.service), String(child.pid));
    const manifest: SpawnManifest = {
        cmd: opts.cmd,
        args: opts.args,
        cwd: opts.cwd,
        env: opts.env,
        startedAt: Date.now(),
    };
    await writeFile(spawnManifestFile(opts.worktreePath, opts.service), JSON.stringify(manifest, null, 2));
    return { pid: child.pid, logPath, started: true };
}

/** SIGTERM the process group, escalate to SIGKILL after 5s. Returns whether a process was killed. */
export async function stopHostProcess(worktreePath: string, service: string): Promise<boolean> {
    const pid = await readPid(worktreePath, service);
    if (pid === null || !isPidAlive(pid)) return false;
    try {
        process.kill(-pid, "SIGTERM");
    } catch {
        try {
            process.kill(pid, "SIGTERM");
        } catch {
            /* already gone */
        }
    }
    for (let i = 0; i < 10; i += 1) {
        if (!isPidAlive(pid)) return true;
        await sleep(500);
    }
    try {
        process.kill(-pid, "SIGKILL");
    } catch {
        /* ignore */
    }
    return true;
}

/** Stop then re-spawn from the on-disk manifest (the panel/TUI restart action). */
export async function restartHostProcess(worktreePath: string, service: string): Promise<StartHostResult> {
    const manifest = await readSpawnManifest(worktreePath, service);
    if (!manifest) {
        throw new Error(`no spawn manifest for "${service}" — re-run the spin so the manifest is written`);
    }
    await stopHostProcess(worktreePath, service);
    return startHostProcess({
        worktreePath,
        service,
        cmd: manifest.cmd,
        args: manifest.args,
        cwd: manifest.cwd,
        env: manifest.env,
    });
}

/**
 * Wait until the given ports are free. HMR child workers sometimes outlive their parent for a beat;
 * without this the next start hits `EADDRINUSE` and the app never recovers.
 */
export async function waitForPortsFree(ports: number[], timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const busy = await Promise.all(ports.map((port) => isPortListening(port)));
        if (busy.every((b) => !b)) return;
        await sleep(200);
    }
}
