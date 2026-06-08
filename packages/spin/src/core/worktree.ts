import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { log } from "../log";

import { capture, run } from "./exec";
import { MAIN_REPO_ROOT, WORKTREES_DIR } from "./paths";
import type { SpinMeta } from "./meta";

/** Whether the worktree directory exists and is a real git worktree. */
export function worktreeExists(meta: SpinMeta): boolean {
    return existsSync(meta.worktreePath) && existsSync(join(meta.worktreePath, ".git"));
}

/**
 * Create the spin's git worktree on its branch, or reuse it if present. Branches from
 * `origin/main` for a clean baseline. If the branch already exists (a prior spin removed the
 * worktree without `-D`), the existing branch is reattached rather than failing.
 */
export async function ensureWorktree(meta: SpinMeta): Promise<void> {
    if (worktreeExists(meta)) {
        log.skip("worktree exists");
        return;
    }
    await mkdir(WORKTREES_DIR, { recursive: true });
    await run("git", ["fetch", "origin", "main", "--quiet"], { cwd: MAIN_REPO_ROOT });
    const branchExists =
        (await capture("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${meta.branch}`], { cwd: MAIN_REPO_ROOT }))
            .exitCode === 0;
    if (branchExists) {
        await run("git", ["worktree", "add", meta.worktreePath, meta.branch], { cwd: MAIN_REPO_ROOT });
    } else {
        await run("git", ["worktree", "add", "-b", meta.branch, meta.worktreePath, "origin/main"], { cwd: MAIN_REPO_ROOT });
    }
}

/** Remove the worktree (and, with `--force`, its branch). Refuses on dirty state without force. */
export async function removeWorktree(meta: SpinMeta, opts: { force: boolean }): Promise<void> {
    log.step("worktree: remove");
    const args = ["worktree", "remove", meta.worktreePath];
    if (opts.force) args.push("--force");
    await run("git", args, { cwd: MAIN_REPO_ROOT });
    if (opts.force) {
        await run("git", ["branch", "-D", meta.branch], { cwd: MAIN_REPO_ROOT }).catch(() => {});
    }
}
