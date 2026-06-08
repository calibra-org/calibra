import { existsSync } from "node:fs";
import { join } from "node:path";

import { log } from "../log";

import { run } from "./exec";
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
 * (Re)build `@calibra/sdk` before the apps boot. The Next apps import the SDK's built output, so a
 * missing dist 500s on SSR — but a **stale** dist is worse and silent: a dist built before a client
 * was added (e.g. the Phase-5 `platform` client) leaves `api.platform` undefined, so the platform
 * login throws a generic "sign-in failed". The build is fast (tsdown), so we always rebuild rather
 * than skip on existence — correctness beats the few seconds saved.
 */
export async function ensureSdkBuild(meta: SpinMeta): Promise<void> {
    log.step("sdk: pnpm --filter @calibra/sdk build");
    await run("pnpm", ["--filter", "@calibra/sdk", "build"], { cwd: meta.worktreePath });
}
