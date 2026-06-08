import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Filesystem layout for spin. Two anchors:
 *
 *  - **MAIN_REPO_ROOT** — the main worktree's repo root, located via `git --git-common-dir`.
 *    Resolving the *common* dir means every linked worktree (and the in-place `local` spin)
 *    agrees on one state location, so `.claude/spin/<slug>.json` is shared and a spin started
 *    from one worktree is visible from another. This is calibra's deliberate divergence from
 *    stridge's `~/.stridge-spin` home-dir model: in-repo state survives `--remove`, lets
 *    `git worktree add` see an empty target dir, and works from inside a worktree.
 *  - **PACKAGE_ROOT** — the installed `@calibra/spin` directory, located by walking up from this
 *    module to its `package.json`. Used to resolve the shipped `templates/` and `config/` dirs
 *    regardless of which `dist/` entry (cli, agent server, tui) is executing.
 */

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function findMainRepoRoot(): string {
    const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
        cwd: MODULE_DIR,
        encoding: "utf8",
    });
    if (result.status !== 0) {
        throw new Error(`could not locate git common dir: ${result.stderr}`);
    }
    /** The common dir is `<main-root>/.git`; the repo root is its parent. */
    return resolve(result.stdout.trim(), "..");
}

function findPackageRoot(): string {
    let dir = MODULE_DIR;
    for (let i = 0; i < 8; i += 1) {
        const candidate = join(dir, "package.json");
        if (existsSync(candidate)) {
            try {
                const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string };
                if (pkg.name === "@calibra/spin") return dir;
            } catch {
                /* Unreadable/partial package.json — keep walking up. */
            }
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    /** Fallback: from a `dist/**` entry, the package root is one level above `dist/`. */
    return resolve(MODULE_DIR, "..");
}

/** Repo root of the main worktree — the anchor for all in-repo spin state. */
export const MAIN_REPO_ROOT = findMainRepoRoot();

/** Worktrees created by `spin start <slug>` live here. */
export const WORKTREES_DIR = join(MAIN_REPO_ROOT, ".claude/worktrees");

/**
 * Per-spin state (meta + run-state), one flat `<slug>.json` / `<slug>.run.json` per spin.
 * Kept OUTSIDE the worktree on purpose: writing inside would pre-create the dir before
 * `git worktree add`, and keeping it here lets state survive `--remove` so a re-spin reuses
 * the same port allocation.
 */
export const STATE_DIR = join(MAIN_REPO_ROOT, ".claude/spin");

/**
 * Shared Caddy local-CA directory, host-bound across every spin on this machine. Caddy mints
 * its root + intermediate here on first boot; subsequent spins reuse them, so trusting the
 * root once (`spin trust`) is permanent — `--purge` never rotates the CA and a new slug
 * doesn't mean a new browser warning.
 */
export const SHARED_CADDY_CA_DIR = join(homedir(), ".calibra/caddy-ca");

/** Installed `@calibra/spin` package directory — anchor for shipped `templates/` + `config/`. */
export const PACKAGE_ROOT = findPackageRoot();

/** Shipped `{{TOKEN}}` templates (Caddyfile, env files, observability config). */
export const TEMPLATES_DIR = join(PACKAGE_ROOT, "templates");

/** Shipped static config (the services catalog lives in code; this is for any data assets). */
export const CONFIG_DIR = join(PACKAGE_ROOT, "config");

/** Absolute path to a spin's meta file. */
export function metaPath(slug: string): string {
    return join(STATE_DIR, `${slug}.json`);
}

/** Absolute path to a spin's live run-state file (present only during/after a pipeline run). */
export function runStatePath(slug: string): string {
    return join(STATE_DIR, `${slug}.run.json`);
}

/** Directory the api writes its ndjson log into (shipped to Loki via Promtail). */
export function spinLogDir(worktreePath: string): string {
    return join(worktreePath, ".spin/logs");
}
