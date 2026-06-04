// @ts-check

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { LOCAL_SLUG } from "./flags.mjs";
import { MAIN_REPO_ROOT, STATE_DIR, WORKTREES_DIR } from "./paths.mjs";
import { allocatePorts } from "./ports.mjs";

/**
 * @typedef {Object} SpinPorts
 * @property {number} db
 * @property {number} pgadmin
 * @property {number} api
 * @property {number} admin
 * @property {number} web
 * @property {number} [mailpitSmtp] — undefined on metas that pre-date the per-spin dev-ui layout
 * @property {number} [mailpitWeb]
 * @property {number} [redis]
 * @property {number} [redisinsight]
 * @property {number} [adminer]
 * @property {number} [caddyHttp] — undefined on metas that pre-date the prod-parity (observability + caddy + meili) layout
 * @property {number} [caddyHttps]
 * @property {number} [meilisearch]
 * @property {number} [prometheus]
 * @property {number} [grafana]
 * @property {number} [loki]
 * @property {number} [tempo]
 * @property {number} [alertmanager]
 * @property {number} [glitchtip]
 * @property {number} [uptimeKuma]
 * @property {number} [spinAgent]
 * @property {number} [platform] — undefined on metas allocated before the Phase-5 control-plane app
 */

/**
 * @typedef {Object} SpinMeta
 * @property {string} slug
 * @property {string} branch
 * @property {string} composeProject
 * @property {string} worktreePath
 * @property {SpinPorts} ports
 * @property {string} [appKey]
 * @property {string} [glitchtipSecretKey] — Django SECRET_KEY for the per-spin GlitchTip instance, stable across stops
 * @property {string} [meiliMasterKey] — Meilisearch master key for the per-spin instance, stable across stops
 * @property {string} [glitchtipDsn] — DSN read back after auto-provisioning GlitchTip's first org/project (best-effort)
 * @property {boolean} [seeded]
 * @property {number | null} [prNumber]
 * @property {string} [prUrl]
 * @property {string} createdAt
 */

/**
 * Read the spin's meta file if it exists, otherwise allocate fresh state. The meta file is the
 * source of truth for ports and the PR number across re-runs.
 *
 * @param {string} slug
 * @returns {Promise<SpinMeta>}
 */
export async function loadOrInitMeta(slug) {
    const path = metaPath(slug);
    if (existsSync(path)) {
        return JSON.parse(await readFile(path, "utf8"));
    }
    const ports = await allocatePorts(slug);
    /** @type {SpinMeta} */
    const meta = {
        slug,
        branch: `spin/${slug}`,
        composeProject: `calibra-spin-${slug}`,
        worktreePath: join(WORKTREES_DIR, slug),
        ports,
        prNumber: null,
        createdAt: new Date().toISOString(),
    };
    await writeMeta(meta);
    return meta;
}

/**
 * Initialise the meta for the `local` spin, attaching the current checkout. Re-runs of
 * `spin local` load the persisted meta so ports stay stable across restarts.
 *
 * @returns {Promise<SpinMeta>}
 */
export async function loadOrInitLocalMeta() {
    const path = metaPath(LOCAL_SLUG);
    const currentBranch =
        spawnSync("git", ["branch", "--show-current"], {
            cwd: MAIN_REPO_ROOT,
            encoding: "utf8",
        }).stdout.trim() || "(detached)";

    if (existsSync(path)) {
        const meta = JSON.parse(await readFile(path, "utf8"));
        /** Refresh the branch label each run so the handoff card reflects what's checked out. */
        meta.branch = currentBranch;
        meta.worktreePath = MAIN_REPO_ROOT;
        await writeMeta(meta);
        return meta;
    }
    const ports = await allocatePorts(LOCAL_SLUG);
    /** @type {SpinMeta} */
    const meta = {
        slug: LOCAL_SLUG,
        branch: currentBranch,
        composeProject: `calibra-spin-${LOCAL_SLUG}`,
        worktreePath: MAIN_REPO_ROOT,
        ports,
        prNumber: null,
        createdAt: new Date().toISOString(),
    };
    await writeMeta(meta);
    return meta;
}

/**
 * @param {string} slug
 * @returns {Promise<SpinMeta>}
 */
export async function readMetaOrFail(slug) {
    const path = metaPath(slug);
    if (!existsSync(path)) {
        throw new Error(`no spin metadata for "${slug}" (looked at ${path})`);
    }
    return JSON.parse(await readFile(path, "utf8"));
}

/**
 * @param {SpinMeta} meta
 */
export async function writeMeta(meta) {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(metaPath(meta.slug), JSON.stringify(meta, null, 2));
}

/**
 * @param {string} slug
 */
export function metaPath(slug) {
    return join(STATE_DIR, `${slug}.json`);
}
