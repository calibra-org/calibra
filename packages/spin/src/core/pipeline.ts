import { log } from "../log";

import { clearRunState, writeRunState } from "./run-state";
import type { ComposeOptions } from "./compose";
import type { SpinMeta } from "./meta";

/**
 * The bring-up engine: a flat, ordered list of {@link PipelineStep}s driven by {@link runPipeline}.
 * Each step can declare itself already-complete (so a re-run skips it — idempotent/resumable), and
 * the driver writes a {@link import("./run-state").RunState} record **before** each step so another
 * shell's `list`/`status`/`doctor`/TUI shows "step N/M" during a multi-minute provision instead of
 * a bare "stopped". There is no rollback by design: fail fast, mark the run failed, and let a
 * re-run heal because every step re-checks real state.
 */

export interface PipelineContext {
    meta: SpinMeta;
    compose: ComposeOptions;
    /** True for `start <slug>` (worktree + PR); false for the in-place `local` spin. */
    worktree: boolean;
    /** Start the storefront too (admin always starts; web is opt-in via `--with-web`). */
    withWeb: boolean;
    /** Skip the draft PR (`--no-pr`). */
    noPr: boolean;
}

export interface PipelineStep {
    name: string;
    describe: (ctx: PipelineContext) => string;
    /** When this resolves true, the step is skipped (already done). */
    isComplete?: (ctx: PipelineContext) => boolean | Promise<boolean>;
    run: (ctx: PipelineContext) => Promise<void>;
}

export async function runPipeline(steps: PipelineStep[], ctx: PipelineContext): Promise<void> {
    const total = steps.length;
    const startedAt = new Date().toISOString();
    for (let i = 0; i < total; i += 1) {
        const step = steps[i]!;
        const label = step.describe(ctx);
        await writeRunState(ctx.meta.slug, {
            pid: process.pid,
            phase: "running",
            stepIndex: i + 1,
            stepTotal: total,
            stepName: step.name,
            stepLabel: label,
            startedAt,
            updatedAt: new Date().toISOString(),
        });
        if (step.isComplete && (await step.isComplete(ctx))) {
            log.skip(`[${i + 1}/${total}] ${label}`);
            continue;
        }
        log.step(`[${i + 1}/${total}] ${label}`);
        try {
            await step.run(ctx);
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            await writeRunState(ctx.meta.slug, {
                pid: process.pid,
                phase: "failed",
                stepIndex: i + 1,
                stepTotal: total,
                stepName: step.name,
                stepLabel: label,
                startedAt,
                updatedAt: new Date().toISOString(),
                error,
            });
            throw err;
        }
    }
    await clearRunState(ctx.meta.slug);
}
