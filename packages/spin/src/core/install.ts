import { existsSync } from "node:fs";
import { join } from "node:path";
import { run } from "./exec";
import { log } from "../log";
import type { SpinMeta } from "./meta";

/**
 * Install dependencies if the worktree has none. A worktree-based spin starts from a fresh
 * checkout with no `node_modules`; the in-place `local` spin reuses the existing install.
 */
export async function ensureInstall(meta: SpinMeta): Promise<void> {
    if (existsSync(join(meta.worktreePath, "node_modules"))) {
        log.skip("install (node_modules present)");
        return;
    }
    log.step("install: pnpm install");
    await run("pnpm", ["install"], { cwd: meta.worktreePath });
}

/**
 * Build `@calibra/sdk` if its `dist/` is missing. The Next apps import the SDK's built output —
 * `getBaseUrl()` throws (SSR 500) if it isn't there — so this must run before the apps boot.
 */
export async function ensureSdkBuild(meta: SpinMeta): Promise<void> {
    if (existsSync(join(meta.worktreePath, "packages/sdk/dist"))) {
        log.skip("sdk build (dist present)");
        return;
    }
    log.step("sdk: pnpm --filter @calibra/sdk build");
    await run("pnpm", ["--filter", "@calibra/sdk", "build"], { cwd: meta.worktreePath });
}
