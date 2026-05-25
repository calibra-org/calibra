// @ts-check

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { log, step, yellow } from "./log.mjs";
import { SHARED_CADDY_CA_DIR } from "./paths.mjs";
import { effectivePort, requirePort } from "./ports.mjs";
import { isPortListening, waitForCaddyHttp, waitForHttp, waitForPort } from "./probes.mjs";
import { run } from "./run.mjs";

/**
 * The full env block we pass to every `docker compose` invocation for the spin's project.
 * Centralises the port → env mapping so `up`, `down`, and `exec` agree on which variables get
 * substituted into the docker-compose files. The observability + caddy + meili compose files
 * also need the slug (for Caddy hostnames), the secrets (Meili master key, GlitchTip Django
 * SECRET_KEY), and the worktree's log dir (so Promtail can volume-mount api.ndjson).
 *
 * Legacy spins (pre-observability layout) silently leave the new keys empty — the new compose
 * files aren't brought up for them, so the values are never consumed.
 *
 * @param {import("./meta.mjs").SpinMeta} meta
 * @returns {NodeJS.ProcessEnv}
 */
export function composeEnv(meta) {
    const optional = (/** @type {keyof import("./meta.mjs").SpinPorts} */ role) => {
        const port = effectivePort(meta, role);
        return typeof port === "number" ? String(port) : "";
    };
    return {
        ...process.env,
        COMPOSE_PROJECT_NAME: meta.composeProject,
        SPIN_SLUG: meta.slug,
        SPIN_LOG_DIR: join(meta.worktreePath, ".spin/logs"),
        SPIN_CONFIG_DIR: join(meta.worktreePath, ".spin/config"),
        /**
         * Docker compose normalises relative volume binds against the FIRST `-f` file's
         * directory — which for us is `apps/api/`, not `docker/observability/`. The static
         * observability configs (tempo.yml, loki.yml, alertmanager.yml, the dashboards dir)
         * live under `docker/observability/` and would otherwise resolve to the wrong path.
         * Passing the absolute base via env var sidesteps the issue.
         */
        OBSERVABILITY_DIR: join(meta.worktreePath, "docker/observability"),
        SPIN_DATA_DIR: join(meta.worktreePath, ".spin/data"),
        CALIBRA_CADDY_CA_DIR: SHARED_CADDY_CA_DIR,
        DB_PORT: String(meta.ports.db),
        DB_USER: "calibra",
        DB_PASSWORD: "calibra",
        DB_DATABASE: "calibra",
        PGADMIN_PORT: String(meta.ports.pgadmin),
        MAILPIT_SMTP_PORT: String(requirePort(meta, "mailpitSmtp")),
        MAILPIT_WEB_PORT: String(requirePort(meta, "mailpitWeb")),
        REDIS_PORT: String(requirePort(meta, "redis")),
        REDISINSIGHT_PORT: String(requirePort(meta, "redisinsight")),
        ADMINER_PORT: String(requirePort(meta, "adminer")),
        CADDY_HTTP_PORT: optional("caddyHttp"),
        CADDY_HTTPS_PORT: optional("caddyHttps"),
        MEILISEARCH_PORT: optional("meilisearch"),
        MEILI_MASTER_KEY: meta.meiliMasterKey ?? "",
        TEMPO_OTLP_PORT: optional("tempo"),
        GLITCHTIP_SECRET_KEY: meta.glitchtipSecretKey ?? "",
        GLITCHTIP_DEFAULT_FROM_EMAIL: "ops@calibra.local",
    };
}

/**
 * Resolve the list of `-f compose-file` flags for the spin. Stacks the api compose first,
 * then the observability + caddy + meili files on top. compose merges deep — services
 * declared in one file extend services in another by name, networks union, etc.
 *
 * @param {import("./meta.mjs").SpinMeta} meta
 * @returns {string[]}
 */
export function composeFiles(meta) {
    const obsDir = join(meta.worktreePath, "docker/observability");
    return [
        "-f",
        join(meta.worktreePath, "apps/api/docker-compose.yml"),
        "-f",
        join(obsDir, "docker-compose.caddy.yml"),
        "-f",
        join(obsDir, "docker-compose.meili.yml"),
        "-f",
        join(obsDir, "docker-compose.observability.yml"),
        "-f",
        join(obsDir, "docker-compose.glitchtip.yml"),
    ];
}

/**
 * @param {import("./meta.mjs").SpinMeta} meta
 */
export async function ensureContainers(meta) {
    const env = composeEnv(meta);
    const files = composeFiles(meta);
    /**
     * Skip the start only when EVERY required layer is already responding. DB + pgAdmin
     * signal the foundational layer; Caddy's HTTPS port is the bellwether for the
     * observability + meili + glitchtip stack — it can't be up without the network being
     * right. Without this check the shortcut would silently bypass `compose up` on a
     * partially-bootstrapped spin and the new layer would never start.
     */
    const foundationUp = (await isPortListening(meta.ports.db)) && (await isPortListening(meta.ports.pgadmin));
    const observabilityUp = await isPortListening(requirePort(meta, "caddyHttps"));
    if (foundationUp && observabilityUp) {
        step("containers", "running");
        return;
    }
    step("containers", "docker compose up");
    await run("docker", ["compose", ...files, "up", "-d"], { env });

    step("containers", "wait for postgres");
    const dbDeadline = Date.now() + 60_000;
    let dbReady = false;
    while (Date.now() < dbDeadline) {
        if (await isPortListening(meta.ports.db)) {
            /** pg_isready inside the container — a TCP-listening port isn't enough to start migrations against. */
            const check = spawnSync(
                "docker",
                ["compose", ...files, "exec", "-T", "db", "pg_isready", "-U", "calibra", "-d", "calibra"],
                { env, encoding: "utf8" },
            );
            if (check.status === 0) {
                dbReady = true;
                break;
            }
        }
        await sleep(1_000);
    }
    if (!dbReady) throw new Error("postgres did not become ready within 60s");

    step("containers", "wait for redis");
    await waitForPort(requirePort(meta, "redis"), 30_000, "redis");

    /**
     * Observability + caddy + meili. Each gets its own readiness probe — TCP-listen is the
     * lower bound, HTTP /health is the upper bound where the service exposes one. GlitchTip
     * runs Django migrations on first boot which take ~30s longer than subsequent starts;
     * its timeout is intentionally generous.
     */
    step("containers", "wait for caddy");
    await waitForPort(requirePort(meta, "caddyHttps"), 30_000, "caddy");

    step("containers", "wait for meilisearch");
    /** Meilisearch publishes its host port directly — probe localhost, not via Caddy. */
    await waitForHttp(`http://localhost:${requirePort(meta, "meilisearch")}/health`, 30_000, "meilisearch");

    /**
     * Everything past here is container-only and only reachable via Caddy from the host.
     * The probe goes through Caddy's HTTPS port with `--resolve` so SNI matches the cert
     * for the right hostname and the proxy routes by Host. `--insecure` because Caddy's
     * local CA isn't trusted in CI environments that haven't run `caddy trust`.
     */
    step("containers", "wait for prometheus");
    await waitForCaddyHttp(meta, "prom", "/-/ready", 30_000, "prometheus");

    step("containers", "wait for grafana");
    await waitForCaddyHttp(meta, "grafana", "/api/health", 60_000, "grafana");

    step("containers", "wait for glitchtip (django migrations on first boot, ~60s)");
    await waitForCaddyHttp(meta, "errors", "/api/0/", 180_000, "glitchtip", { acceptStatus: [200, 401, 403] });
}

/**
 * @param {import("./meta.mjs").SpinMeta} meta
 * @param {{ purge: boolean }} opts
 */
export async function downContainers(meta, opts) {
    step("containers", opts.purge ? "down -v" : "down");
    const apiCompose = join(meta.worktreePath, "apps/api/docker-compose.yml");
    if (!existsSync(apiCompose)) {
        log(yellow("    compose file missing; skipping"));
        return;
    }
    /**
     * `down` needs every `-f` flag that `up` saw, otherwise compose only stops services
     * declared in the files it was told about and the observability stack lingers. The
     * worktree-relative paths are still accurate even when the worktree's been partially
     * removed — compose only reads YAML, no other files in the dir are loaded.
     */
    const args = ["compose", ...composeFiles(meta), "down"];
    if (opts.purge) args.push("-v");
    await run("docker", args, { env: composeEnv(meta) });
}
