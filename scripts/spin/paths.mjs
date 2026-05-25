// @ts-check

import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export function findMainRepoRoot() {
    const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
        cwd: SCRIPT_DIR,
        encoding: "utf8",
    });
    if (result.status !== 0) {
        throw new Error(`could not locate git common dir: ${result.stderr}`);
    }
    const commonDir = result.stdout.trim();
    /** common-dir is the path to `.git` in the main worktree; the repo root is its parent. */
    return resolve(commonDir, "..");
}

export const MAIN_REPO_ROOT = findMainRepoRoot();
export const WORKTREES_DIR = join(MAIN_REPO_ROOT, ".claude/worktrees");
/**
 * Per-spin metadata sits OUTSIDE the worktree on purpose. Writing it inside would create the
 * directory before `git worktree add` runs and git refuses to provision on a non-empty path.
 * Keeping it here also means the state survives `--remove` so the next spin reuses the same
 * port allocation.
 */
export const STATE_DIR = join(MAIN_REPO_ROOT, ".claude/spin");

/**
 * Shared Caddy local-CA directory, host-bound across every spin on this machine. Caddy
 * generates its root + intermediate here on first boot; subsequent spins reuse them, so
 * trusting the root in the OS store once (`caddy trust` or the Windows import flow) is
 * permanent — `pnpm spin stop --purge` no longer rotates the CA, and a new slug doesn't
 * mean a new browser warning. Bound into the Caddy container by docker-compose.caddy.yml
 * at the `pki/authorities/local` sub-path; leaf certs (per-hostname) still live in the
 * per-spin `caddy_data` compose volume.
 */
export const SHARED_CADDY_CA_DIR = join(homedir(), ".calibra/caddy-ca");
