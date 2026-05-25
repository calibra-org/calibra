// @ts-check

import { existsSync } from "node:fs";
import { join } from "node:path";

import { step } from "./log.mjs";
import { run } from "./run.mjs";

/**
 * @param {import("./meta.mjs").SpinMeta} meta
 */
export async function ensureInstall(meta) {
    if (existsSync(join(meta.worktreePath, "node_modules"))) {
        step("install", "skip (node_modules exists)");
        return;
    }
    step("install", "pnpm install");
    await run("pnpm", ["install"], { cwd: meta.worktreePath });
}

/**
 * @param {import("./meta.mjs").SpinMeta} meta
 */
export async function ensureSdkBuild(meta) {
    const sdkDist = join(meta.worktreePath, "packages/sdk/dist");
    if (existsSync(sdkDist)) {
        step("sdk", "skip (dist exists)");
        return;
    }
    step("sdk", "pnpm --filter @calibra/sdk build");
    await run("pnpm", ["--filter", "@calibra/sdk", "build"], { cwd: meta.worktreePath });
}
