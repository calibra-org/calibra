import { log } from "../log";

import { run } from "./exec";
import type { SpinMeta } from "./meta";

/**
 * Install dependencies. Always runs — the presence of `node_modules` says nothing about whether it
 * matches the lockfile, and a **stale** tree is worse than a missing one because it fails far from
 * its cause: a dependency bump lands, the directory still exists, install is skipped, and the app
 * boots against the previous resolution. That surfaces as an unrelated-looking build error
 * (`Export X doesn't exist in target module`) or, worse, two copies of a transitive dependency
 * whose behaviour silently diverges. pnpm is a no-op in a second or two when the tree is already
 * in sync, so correctness beats the seconds saved — the same trade-off {@link ensureSdkBuild}
 * makes just below.
 */
export async function ensureInstall(meta: SpinMeta): Promise<void> {
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
