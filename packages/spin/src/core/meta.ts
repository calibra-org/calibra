import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { MAIN_REPO_ROOT, metaPath, STATE_DIR, WORKTREES_DIR } from "./paths";
import { allocatePorts, layoutFromBase, type SpinPorts } from "./ports";
import { backfillSecrets, generateSecrets } from "./secrets";
import { composeProjectName, LOCAL_SLUG } from "./slug";

/**
 * The spin meta file (`.claude/spin/<slug>.json`) is the source of truth for ports, secrets,
 * the PR number, and the seeded flag across re-runs. The schema is **flat** — secrets sit at
 * the top level (`appKey`, `glitchtipSecretKey`, `meiliMasterKey`) exactly as the legacy
 * `scripts/spin` wrote them, so existing metas parse with zero migration. zod + forward
 * migration ({@link backfillSchema}) only ever *fills holes* (a newly-added port role, a
 * missing secret); it never reallocates ports or rewrites existing values.
 */

const PortsSchema = z
    .object({
        db: z.number(),
        pgadmin: z.number(),
        api: z.number(),
        admin: z.number(),
        web: z.number(),
        mailpitSmtp: z.number().optional(),
        mailpitWeb: z.number().optional(),
        redis: z.number().optional(),
        redisinsight: z.number().optional(),
        adminer: z.number().optional(),
        caddyHttp: z.number().optional(),
        caddyHttps: z.number().optional(),
        meilisearch: z.number().optional(),
        prometheus: z.number().optional(),
        grafana: z.number().optional(),
        loki: z.number().optional(),
        tempo: z.number().optional(),
        alertmanager: z.number().optional(),
        glitchtip: z.number().optional(),
        uptimeKuma: z.number().optional(),
        spinAgent: z.number().optional(),
        platform: z.number().optional(),
    })
    .passthrough();

export const MetaSchema = z.object({
    slug: z.string(),
    branch: z.string(),
    composeProject: z.string(),
    worktreePath: z.string(),
    ports: PortsSchema,
    /** Adonis APP_KEY — signs cookies. Optional only to tolerate a meta read before first start. */
    appKey: z.string().optional(),
    /** Django SECRET_KEY for the per-spin GlitchTip. */
    glitchtipSecretKey: z.string().optional(),
    /** Meilisearch master key for the per-spin instance. */
    meiliMasterKey: z.string().optional(),
    /** Edge shared secret — spin agent → api `/api/caddy/ask` `X-Edge-Secret`. */
    edgeSecret: z.string().optional(),
    /** DSN read back after auto-provisioning GlitchTip's first org/project (best-effort). */
    glitchtipDsn: z.string().optional(),
    /** Whether the database has been seeded (gates re-seed; cleared by `--purge`). */
    seeded: z.boolean().default(false),
    prNumber: z.number().nullable().default(null),
    prUrl: z.string().optional(),
    /** `--no-observability` clears this; persisted so teardown/status see the same view. */
    observability: z.boolean().default(true),
    /** `--no-tls` clears this. */
    tls: z.boolean().default(true),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
});

export type SpinMeta = z.infer<typeof MetaSchema>;

export interface InitMetaOptions {
    observability?: boolean;
    tls?: boolean;
}

/**
 * Forward-migrate ports: fill any missing role from the slot base (`ports.db`). Skipped for
 * legacy dev-ui metas (no `redis` port) — those resolve missing roles through
 * {@link import("./ports").effectivePort}'s shared-container fallback, so backfilling them
 * would point at host ports with no container behind them. Existing values are preserved
 * verbatim; only holes are filled (e.g. a meta created before the `platform` role).
 */
function backfillPorts(raw: Record<string, unknown>): Record<string, unknown> {
    const ports = (raw.ports ?? {}) as Partial<SpinPorts>;
    if (typeof ports.db !== "number") return raw;
    if (typeof ports.redis !== "number") return raw;
    const full = layoutFromBase(ports.db) as Record<string, number>;
    const merged: Record<string, number> = { ...full };
    for (const [key, value] of Object.entries(ports as Record<string, unknown>)) {
        if (typeof value === "number") merged[key] = value;
    }
    return { ...raw, ports: merged };
}

/** Forward-migrate the whole record: ports + the flat secret triplet. Exported for tests. */
export function backfillSchema(raw: Record<string, unknown>): Record<string, unknown> {
    const out = backfillPorts(raw);
    const secrets = backfillSecrets({
        appKey: out.appKey as string | undefined,
        glitchtipSecretKey: out.glitchtipSecretKey as string | undefined,
        meiliMasterKey: out.meiliMasterKey as string | undefined,
        edgeSecret: out.edgeSecret as string | undefined,
    });
    return { ...out, ...secrets };
}

function migrationChanged(raw: Record<string, unknown>, meta: SpinMeta): boolean {
    const rawPorts = JSON.stringify((raw.ports ?? {}) as object);
    const metaPorts = JSON.stringify(meta.ports);
    if (rawPorts !== metaPorts) return true;
    return (
        raw.appKey !== meta.appKey ||
        raw.glitchtipSecretKey !== meta.glitchtipSecretKey ||
        raw.meiliMasterKey !== meta.meiliMasterKey ||
        raw.edgeSecret !== meta.edgeSecret
    );
}

export async function loadMeta(slug: string): Promise<SpinMeta | null> {
    const path = metaPath(slug);
    if (!existsSync(path)) return null;
    const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const meta = MetaSchema.parse(backfillSchema(raw));
    /** Persist if migration filled anything, so non-init readers see the clean shape too. */
    if (migrationChanged(raw, meta)) await writeMeta(meta);
    return meta;
}

export async function loadMetaOrFail(slug: string): Promise<SpinMeta> {
    const meta = await loadMeta(slug);
    if (!meta) {
        throw new Error(`no spin sandbox "${slug}" — create one with \`pnpm spin ${slug}\``);
    }
    return meta;
}

/** Like {@link loadMetaOrFail} but with the legacy error phrasing some callers expect. */
export async function readMetaOrFail(slug: string): Promise<SpinMeta> {
    const meta = await loadMeta(slug);
    if (!meta) {
        throw new Error(`no spin metadata for "${slug}" (looked at ${metaPath(slug)})`);
    }
    return meta;
}

function currentGitBranch(): string {
    const result = spawnSync("git", ["branch", "--show-current"], {
        cwd: MAIN_REPO_ROOT,
        encoding: "utf8",
    });
    return result.stdout.trim() || "(detached)";
}

/**
 * Load the meta for a worktree spin, or allocate fresh state on first run. Re-runs only update
 * persisted flags (observability/tls); ports and secrets stay stable.
 */
export async function loadOrInitMeta(slug: string, opts: InitMetaOptions = {}): Promise<SpinMeta> {
    const existing = await loadMeta(slug);
    if (existing) return applyFlags(existing, opts);

    const ports = await allocatePorts(slug);
    const now = new Date().toISOString();
    const fresh: SpinMeta = {
        slug,
        branch: `spin/${slug}`,
        composeProject: composeProjectName(slug),
        worktreePath: join(WORKTREES_DIR, slug),
        ports,
        ...generateSecrets(),
        seeded: false,
        prNumber: null,
        observability: opts.observability ?? true,
        tls: opts.tls ?? true,
        createdAt: now,
        updatedAt: now,
    };
    await writeMeta(fresh);
    return fresh;
}

/**
 * Load (or allocate) the in-place `local` spin meta, attaching the current checkout. The branch
 * label and worktree path are refreshed each run so the handoff card reflects what's checked out.
 */
export async function loadOrInitLocalMeta(opts: InitMetaOptions = {}): Promise<SpinMeta> {
    const existing = await loadMeta(LOCAL_SLUG);
    if (existing) {
        existing.branch = currentGitBranch();
        existing.worktreePath = MAIN_REPO_ROOT;
        const withFlags = applyFlags(existing, opts);
        await writeMeta(withFlags);
        return withFlags;
    }

    const ports = await allocatePorts(LOCAL_SLUG);
    const now = new Date().toISOString();
    const fresh: SpinMeta = {
        slug: LOCAL_SLUG,
        branch: currentGitBranch(),
        composeProject: composeProjectName(LOCAL_SLUG),
        worktreePath: MAIN_REPO_ROOT,
        ports,
        ...generateSecrets(),
        seeded: false,
        prNumber: null,
        observability: opts.observability ?? true,
        tls: opts.tls ?? true,
        createdAt: now,
        updatedAt: now,
    };
    await writeMeta(fresh);
    return fresh;
}

function applyFlags(meta: SpinMeta, opts: InitMetaOptions): SpinMeta {
    return {
        ...meta,
        observability: opts.observability ?? meta.observability,
        tls: opts.tls ?? meta.tls,
    };
}

export async function writeMeta(meta: SpinMeta): Promise<void> {
    await mkdir(STATE_DIR, { recursive: true });
    meta.updatedAt = new Date().toISOString();
    const path = metaPath(meta.slug);
    await writeFile(path, JSON.stringify(meta, null, 2));
    /** Meta carries plaintext secrets — restrict to the owning user. Best-effort on non-POSIX. */
    await chmod(path, 0o600).catch(() => {});
}

/** Enumerate every spin (one row per `<slug>.json` under the state dir). Best-effort. */
export async function listMeta(): Promise<SpinMeta[]> {
    if (!existsSync(STATE_DIR)) return [];
    const entries = await readdir(STATE_DIR, { withFileTypes: true });
    const out: SpinMeta[] = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.endsWith(".run.json")) continue;
        try {
            const raw = JSON.parse(await readFile(join(STATE_DIR, entry.name), "utf8")) as Record<string, unknown>;
            out.push(MetaSchema.parse(backfillSchema(raw)));
        } catch {
            /* Skip malformed entries — listing is best-effort. */
        }
    }
    return out.sort((a, b) => a.slug.localeCompare(b.slug));
}
