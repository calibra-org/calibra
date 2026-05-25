// @ts-check

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { step } from "./log.mjs";
import { MAIN_REPO_ROOT, WORKTREES_DIR } from "./paths.mjs";
import { run } from "./run.mjs";

/**
 * @param {import("./meta.mjs").SpinMeta} meta
 */
export async function ensureWorktree(meta) {
    if (existsSync(meta.worktreePath) && existsSync(join(meta.worktreePath, ".git"))) {
        step("worktree", "exists");
        return;
    }
    step("worktree", "create");
    await mkdir(WORKTREES_DIR, { recursive: true });
    await run("git", ["fetch", "origin", "main", "--quiet"], { cwd: MAIN_REPO_ROOT });
    /**
     * Branch from origin/main so the spin starts from a clean baseline. The operator can
     * `git rebase origin/main` later if needed; the alternative (branching from HEAD) would
     * silently inherit whatever changes happen to be in the main checkout.
     */
    await run("git", ["worktree", "add", "-b", meta.branch, meta.worktreePath, "origin/main"], { cwd: MAIN_REPO_ROOT });
}

/**
 * @param {import("./meta.mjs").SpinMeta} meta
 * @param {{ force: boolean }} opts
 */
export async function removeWorktree(meta, opts) {
    step("worktree", "remove");
    const args = ["worktree", "remove", meta.worktreePath];
    if (opts.force) args.push("--force");
    await run("git", args, { cwd: MAIN_REPO_ROOT });
    /** `git worktree remove` deletes the dir but leaves the branch; drop it too. */
    if (opts.force) await run("git", ["branch", "-D", meta.branch], { cwd: MAIN_REPO_ROOT }).catch(() => undefined);
}
