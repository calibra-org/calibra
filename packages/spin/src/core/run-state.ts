import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { runStatePath } from "./paths";

/**
 * Live record of an in-flight pipeline run, written to `.claude/spin/<slug>.run.json` and
 * updated as each step starts. It exists ONLY while a spin is coming up (or after a failure);
 * a clean success deletes it. Its whole purpose is **cross-shell visibility** — `list`,
 * `status`, `doctor`, and the TUI in another terminal read it so a multi-minute provision
 * shows as "bringing up step N/M" instead of the bare "stopped" that today's calibra spin
 * infers from an empty `docker compose ps`. This is the single biggest capability the legacy
 * spin lacks.
 */
const RunStateSchema = z.object({
    /** PID of the spin process driving the run — used to detect a dead/interrupted run. */
    pid: z.number(),
    phase: z.enum(["running", "failed"]),
    /** 1-based index of the step in progress (0 before the first step starts). */
    stepIndex: z.number(),
    stepTotal: z.number(),
    /** Stable step id (e.g. "composeUpInfra"). */
    stepName: z.string(),
    /** User-facing describe() text for the step in progress. */
    stepLabel: z.string(),
    startedAt: z.string(),
    updatedAt: z.string(),
    /** Failure message — present only when phase is "failed". */
    error: z.string().optional(),
});

export type RunState = z.infer<typeof RunStateSchema>;

export async function writeRunState(slug: string, state: RunState): Promise<void> {
    const path = runStatePath(slug);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2));
}

/** Delete the run record — called on clean success so readers fall back to `docker ps`. */
export async function clearRunState(slug: string): Promise<void> {
    await rm(runStatePath(slug), { force: true });
}

export async function readRunState(slug: string): Promise<RunState | null> {
    const path = runStatePath(slug);
    if (!existsSync(path)) return null;
    try {
        return RunStateSchema.parse(JSON.parse(await readFile(path, "utf8")));
    } catch {
        /* Malformed/old record — treat as absent rather than crash a reader. */
        return null;
    }
}

/** Whether a PID is still alive on this machine (signal 0 = existence probe). */
export function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        /* ESRCH = no such process; EPERM = exists but not ours (still alive). */
        return (err as NodeJS.ErrnoException).code === "EPERM";
    }
}

export type RunActivity =
    | { kind: "in-progress"; state: RunState }
    | { kind: "interrupted"; state: RunState }
    | { kind: "failed"; state: RunState }
    | { kind: "none" };

/**
 * Classify the run record into something a reader command can act on:
 *   in-progress — a run is actively executing (pid alive, phase running)
 *   interrupted — phase running but the driving process is gone (Ctrl-C / crash)
 *   failed      — the last run threw and left the sandbox partway up
 *   none        — no record (idle sandbox; fall back to `docker ps`)
 */
export async function runActivity(slug: string): Promise<RunActivity> {
    const state = await readRunState(slug);
    if (!state) return { kind: "none" };
    if (state.phase === "failed") return { kind: "failed", state };
    return isPidAlive(state.pid) ? { kind: "in-progress", state } : { kind: "interrupted", state };
}

/** One-line human summary, e.g. "step 9/14: Starting host processes". */
export function describeRunStep(state: RunState): string {
    const where = state.stepIndex > 0 ? `step ${state.stepIndex}/${state.stepTotal}` : "starting";
    return state.stepLabel ? `${where}: ${state.stepLabel}` : where;
}
