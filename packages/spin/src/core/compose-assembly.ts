import { join } from "node:path";

import { DB_ROLES } from "./catalog";
import { SHARED_CADDY_CA_DIR, spinLogDir } from "./paths";
import { effectivePort, requirePort } from "./ports";
import type { ComposeOptions } from "./compose";
import type { SpinMeta } from "./meta";

/**
 * Assembles the docker-compose invocation for a spin: the 22-role port block → env vars, and the
 * stacked `-f` files. Ported from the legacy `scripts/spin/compose.mjs` so the on-disk compose
 * files (which read these env vars) keep working unchanged.
 */

function optionalPort(meta: SpinMeta, role: Parameters<typeof effectivePort>[1]): string {
    const port = effectivePort(meta, role);
    return typeof port === "number" ? String(port) : "";
}

/**
 * Env block passed to every `docker compose` invocation. Centralises the port → env mapping so
 * up/down/exec agree on substitutions. Note `DB_USER/PASSWORD/DATABASE` here are the **container
 * superuser** (`calibra`) used to init Postgres — distinct from the api's runtime `calibra_app`
 * role. Absolute `OBSERVABILITY_DIR`/`SPIN_*_DIR` are required because compose normalises relative
 * volume binds against the FIRST `-f` file's dir (`apps/api/`), not `docker/observability/`.
 */
export function composeEnv(meta: SpinMeta): NodeJS.ProcessEnv {
    return {
        ...process.env,
        COMPOSE_PROJECT_NAME: meta.composeProject,
        SPIN_SLUG: meta.slug,
        SPIN_LOG_DIR: spinLogDir(meta.worktreePath),
        SPIN_CONFIG_DIR: join(meta.worktreePath, ".spin/config"),
        OBSERVABILITY_DIR: join(meta.worktreePath, "docker/observability"),
        SPIN_DATA_DIR: join(meta.worktreePath, ".spin/data"),
        CALIBRA_CADDY_CA_DIR: SHARED_CADDY_CA_DIR,
        DB_PORT: String(meta.ports.db),
        DB_USER: DB_ROLES.superuser.user,
        DB_PASSWORD: DB_ROLES.superuser.password,
        DB_DATABASE: DB_ROLES.database,
        PGADMIN_PORT: String(meta.ports.pgadmin),
        MAILPIT_SMTP_PORT: String(requirePort(meta, "mailpitSmtp")),
        MAILPIT_WEB_PORT: String(requirePort(meta, "mailpitWeb")),
        REDIS_PORT: String(requirePort(meta, "redis")),
        REDISINSIGHT_PORT: String(requirePort(meta, "redisinsight")),
        ADMINER_PORT: String(requirePort(meta, "adminer")),
        CADDY_HTTP_PORT: optionalPort(meta, "caddyHttp"),
        CADDY_HTTPS_PORT: optionalPort(meta, "caddyHttps"),
        MEILISEARCH_PORT: optionalPort(meta, "meilisearch"),
        MEILI_MASTER_KEY: meta.meiliMasterKey ?? "",
        TEMPO_OTLP_PORT: optionalPort(meta, "tempo"),
        GLITCHTIP_SECRET_KEY: meta.glitchtipSecretKey ?? "",
        GLITCHTIP_DEFAULT_FROM_EMAIL: "ops@calibra.local",
    };
}

/**
 * Stacked `-f` flags — the api compose first (the relative-bind base), then caddy + meili +
 * observability + glitchtip on top. compose merges deep, so services extend by name across files.
 */
export function composeFiles(meta: SpinMeta): string[] {
    const obsDir = join(meta.worktreePath, "docker/observability");
    return [
        join(meta.worktreePath, "apps/api/docker-compose.yml"),
        join(obsDir, "docker-compose.caddy.yml"),
        join(obsDir, "docker-compose.meili.yml"),
        join(obsDir, "docker-compose.observability.yml"),
        join(obsDir, "docker-compose.glitchtip.yml"),
    ];
}

/** Build the full {@link ComposeOptions} for a spin. */
export function buildComposeOptions(meta: SpinMeta): ComposeOptions {
    return { project: meta.composeProject, files: composeFiles(meta), env: composeEnv(meta) };
}
