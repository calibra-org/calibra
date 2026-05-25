#!/usr/bin/env node
// @ts-check
/**
 * `pnpm spin <slug>` — bootstrap an isolated dev environment for a single task.
 *
 * Hands the operator a fully running, fully authenticated worktree with its own Postgres
 * container, its own API/admin ports, the seed credentials primed, and a draft PR already
 * opened against `main`. Idempotent: re-running with the same slug picks up where the previous
 * invocation left off, so a half-finished bootstrap (Ctrl-C mid-install, docker daemon stopped)
 * resumes without rebuilding the parts that already succeeded.
 *
 * Tracking issue: https://github.com/calibra-org/calibra/issues/21
 *
 * @see ./spin.md (operator-facing usage)
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MAIN_REPO_ROOT = findMainRepoRoot();
const WORKTREES_DIR = join(MAIN_REPO_ROOT, ".claude/worktrees");
/**
 * Per-spin metadata sits OUTSIDE the worktree on purpose. Writing it inside would create the
 * directory before `git worktree add` runs and git refuses to provision on a non-empty path.
 * Keeping it here also means the state survives `--remove` so the next spin reuses the same
 * port allocation.
 */
const STATE_DIR = join(MAIN_REPO_ROOT, ".claude/spin");

/**
 * Shared Caddy local-CA directory, host-bound across every spin on this machine. Caddy
 * generates its root + intermediate here on first boot; subsequent spins reuse them, so
 * trusting the root in the OS store once (`caddy trust` or the Windows import flow) is
 * permanent — `pnpm spin stop --purge` no longer rotates the CA, and a new slug doesn't
 * mean a new browser warning. Bound into the Caddy container by docker-compose.caddy.yml
 * at the `pki/authorities/local` sub-path; leaf certs (per-hostname) still live in the
 * per-spin `caddy_data` compose volume.
 */
const SHARED_CADDY_CA_DIR = join(homedir(), ".calibra/caddy-ca");

/** Base of the per-spin port range. Picked deliberately outside the user-visible 3xxx family. */
const PORT_BASE = 13000;
/**
 * Twenty-one ports per slug. The first ten are app surfaces + dev-ui (db, pgadmin, api, admin,
 * web, mailpit×2, redis, redisinsight, adminer) and are unchanged from the original layout —
 * old `.claude/spin/<slug>.json` files still parse and still point at the right containers.
 * The next ten are the prod-parity stack: caddy (http+https), meilisearch, and reserved
 * offsets for prometheus/grafana/loki/tempo/alertmanager/glitchtip/uptimeKuma. The
 * observability services don't actually publish to those host offsets in the compose file —
 * Caddy fronts them — but reserving the offsets keeps {@link allocatePorts} uniform and
 * leaves room for a direct publish later (handy when debugging from outside Caddy). The
 * single exception is `tempo`: its offset publishes the OTLP/HTTP receiver (4318) so the api
 * on the host can send traces; the HTTP API (3200) still stays container-only and is fronted
 * by Caddy. Offset +20 is the `spinAgent` — the homepage + control plane process started by
 * `startServers` and fronted by Caddy at the bare `<slug>.spin.localhost` host.
 */
const PORTS_PER_SLOT = 21;
/** Total slots before we wrap around. 47 × 21 = 987 < 1000, so 13xxx still fits cleanly. */
const TOTAL_SLOTS = 47;

const ROLES = /** @type {const} */ ([
    "db",
    "pgadmin",
    "api",
    "admin",
    "web",
    "mailpitSmtp",
    "mailpitWeb",
    "redis",
    "redisinsight",
    "adminer",
    "caddyHttp",
    "caddyHttps",
    "meilisearch",
    "prometheus",
    "grafana",
    "loki",
    "tempo",
    "alertmanager",
    "glitchtip",
    "uptimeKuma",
    "spinAgent",
]);

/**
 * Pre-`pnpm spin` shared dev-ui ports. Old spins that pre-date the per-spin layout don't have
 * dev-ui ports in their meta file; {@link effectivePort} falls back to these so they keep
 * pointing at the legacy `calibra-dev-ui` containers (still running on every machine that ran
 * the older bootstrap). New spins ignore these and use their own per-spin ports.
 */
const LEGACY_SHARED_DEV_UI_PORTS = /** @type {const} */ ({
    mailpitSmtp: 11025,
    mailpitWeb: 18025,
    redis: 16379,
    redisinsight: 15540,
    adminer: 18080,
});

const SUBCOMMANDS = {
    start,
    stop,
    list,
    doctor,
    pr: ensurePr,
    help: printHelp,
};

main().catch((err) => {
    console.error(`\n${red("✖")} ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack && process.env.SPIN_DEBUG === "1") {
        console.error(err.stack);
    }
    process.exit(1);
});

async function main() {
    const [rawSub = "help", ...args] = process.argv.slice(2);
    if (rawSub in SUBCOMMANDS) {
        await SUBCOMMANDS[/** @type {keyof typeof SUBCOMMANDS} */ (rawSub)](args);
        return;
    }
    /** Convenience: `pnpm spin <slug>` == `pnpm spin start <slug>`. */
    if (isSlug(rawSub)) {
        await start([rawSub, ...args]);
        return;
    }
    printHelp();
    process.exit(1);
}

/* -------------------------------------------------------------------------- */
/*  Subcommands                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Bootstrap (or resume bootstrapping) a worktree.
 *
 * @param {string[]} args
 */
async function start(args) {
    const slug = requireSlug(args[0]);
    const flags = parseFlags(args.slice(1));
    const meta = await loadOrInitMeta(slug);

    log(cyan(`spin ${slug}`));
    log(`  worktree ${meta.worktreePath}`);
    log(`  branch   ${meta.branch}`);
    log(`  ports    api=${meta.ports.api} admin=${meta.ports.admin} db=${meta.ports.db} pgadmin=${meta.ports.pgadmin}`);
    log("");

    await ensureWorktree(meta);
    await ensureEnvFiles(meta);
    await ensureObservabilityConfig(meta);
    await ensureContainers(meta);
    await ensureInstall(meta);
    await ensureSdkBuild(meta);
    await ensureMigrationsAndSeed(meta);
    await startServers(meta, { withWeb: flags.withWeb });
    await waitForServersReady(meta, { withWeb: flags.withWeb });
    if (!flags.noPr) {
        await ensureDraftPrInternal(meta);
    }

    printHandoffCard(meta, { withWeb: flags.withWeb });
}

/**
 * Tear down everything `start` created. Servers stop, containers stop. Volumes survive by
 * default so the seeded catalog comes back the next time you `spin <slug>`; pass `--purge` to
 * wipe the database too. Pass `--remove` to drop the worktree + branch (refuses if the worktree
 * has uncommitted changes; bypass with `--force`).
 *
 * @param {string[]} args
 */
async function stop(args) {
    const slug = requireSlug(args[0]);
    const flags = parseFlags(args.slice(1));
    const meta = await readMetaOrFail(slug);

    log(cyan(`stopping ${slug}`));

    await killTrackedProcesses(meta);
    await downContainers(meta, { purge: flags.purge });

    if (flags.remove) {
        await removeWorktree(meta, { force: flags.force });
    }

    log(green("  ✓ stopped"));
}

/**
 * Print every spin slug currently provisioned, with status (running / stopped) and ports.
 *
 * @param {string[]} _args
 */
async function list(_args) {
    if (!existsSync(STATE_DIR)) {
        log("(no spins)");
        return;
    }
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(STATE_DIR);
    const rows = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const meta = JSON.parse(await readFile(join(STATE_DIR, entry), "utf8"));
        const apiUp = await isPortListening(meta.ports.api);
        const adminUp = await isPortListening(meta.ports.admin);
        rows.push({
            slug: meta.slug,
            status: apiUp && adminUp ? green("running") : apiUp || adminUp ? yellow("partial") : "stopped",
            api: meta.ports.api,
            admin: meta.ports.admin,
            pr: meta.prNumber ? `#${meta.prNumber}` : "—",
        });
    }
    if (rows.length === 0) {
        log("(no spins)");
        return;
    }
    const width = Math.max(...rows.map((r) => r.slug.length));
    for (const row of rows) {
        log(`  ${row.slug.padEnd(width)}  ${row.status}  admin=${row.admin}  api=${row.api}  pr=${row.pr}`);
    }
}

/**
 * Print one spin's full status: ports, processes, containers, PR. Useful when something looks
 * broken and you want to see which step failed.
 *
 * @param {string[]} args
 */
async function doctor(args) {
    const slug = requireSlug(args[0]);
    const meta = await readMetaOrFail(slug);
    log(cyan(`doctor ${slug}`));
    log(`  worktree     ${meta.worktreePath} ${existsSync(meta.worktreePath) ? green("✓") : red("✗ missing")}`);
    log(`  branch       ${meta.branch}`);
    log(
        `  api          http://localhost:${meta.ports.api} ${(await isPortListening(meta.ports.api)) ? green("up") : red("down")}`,
    );
    log(
        `  admin        http://localhost:${meta.ports.admin} ${(await isPortListening(meta.ports.admin)) ? green("up") : red("down")}`,
    );
    log(`  db           localhost:${meta.ports.db} ${(await isPortListening(meta.ports.db)) ? green("up") : red("down")}`);
    log(
        `  pgadmin      http://localhost:${meta.ports.pgadmin} ${(await isPortListening(meta.ports.pgadmin)) ? green("up") : red("down")}`,
    );
    const mailpitWeb = requirePort(meta, "mailpitWeb");
    const mailpitSmtp = requirePort(meta, "mailpitSmtp");
    const redis = requirePort(meta, "redis");
    const redisinsight = requirePort(meta, "redisinsight");
    const adminer = requirePort(meta, "adminer");
    const tag = isLegacyDevUi(meta) ? " (shared, legacy)" : "";
    log(
        `  mailpit      http://localhost:${mailpitWeb} ${(await isPortListening(mailpitSmtp)) ? green("up") : red("down")}${tag}`,
    );
    log(`  redis        localhost:${redis} ${(await isPortListening(redis)) ? green("up") : red("down")}${tag}`);
    log(
        `  redisinsight http://localhost:${redisinsight} ${(await isPortListening(redisinsight)) ? green("up") : red("down")}${tag}`,
    );
    log(
        `  adminer      http://localhost:${adminer} ${(await isPortListening(adminer)) ? green("up") : red("down")}${tag} (queue_jobs)`,
    );
    const caddyHttps = requirePort(meta, "caddyHttps");
    const meili = requirePort(meta, "meilisearch");
    const caddyOk = await isPortListening(caddyHttps);
    log(`  caddy        https://*.${slug}.spin.localhost (port ${caddyHttps}) ${caddyOk ? green("up") : red("down")}`);
    log(`  meilisearch  http://localhost:${meili} ${(await isPortListening(meili)) ? green("up") : red("down")}`);
    log(
        `  glitchtip    https://errors.${slug}.spin.localhost ${(await probeViaCaddy(meta, "errors", "/api/0/", [200, 401, 403])) ? green("up") : red("down")}${meta.glitchtipDsn ? "" : yellow(" (no DSN — run `pnpm spin pr` blurb)")}`,
    );
    log(
        `  grafana      https://grafana.${slug}.spin.localhost ${(await probeViaCaddy(meta, "grafana", "/api/health")) ? green("up") : red("down")}`,
    );
    log(
        `  prometheus   https://prom.${slug}.spin.localhost ${(await probeViaCaddy(meta, "prom", "/-/ready")) ? green("up") : red("down")}`,
    );
    log(
        `  loki         https://loki.${slug}.spin.localhost ${(await probeViaCaddy(meta, "loki", "/ready")) ? green("up") : red("down")}`,
    );
    log(
        `  tempo        https://tempo.${slug}.spin.localhost (OTLP on :${requirePort(meta, "tempo")}) ${(await probeViaCaddy(meta, "tempo", "/ready")) ? green("up") : red("down")}`,
    );
    log(
        `  alertmanager https://alerts.${slug}.spin.localhost ${(await probeViaCaddy(meta, "alerts", "/-/ready")) ? green("up") : red("down")}`,
    );
    log(
        `  uptime kuma  https://uptime.${slug}.spin.localhost ${(await probeViaCaddy(meta, "uptime", "/", [200, 302])) ? green("up") : red("down")}`,
    );
    log(`  compose      project=${meta.composeProject}`);
    /**
     * Show queue-worker status alongside infra — it's a tracked process (see `startServers`)
     * and the importer/exporter wizards depend on it picking up dispatched jobs.
     */
    const queuePid = await readPidIfAlive(join(meta.worktreePath, ".spin/queue.pid"));
    log(`  queue worker pid=${queuePid ?? "—"} ${queuePid !== null ? green("up") : red("down")}`);
    log(`  PR           ${meta.prNumber ? `#${meta.prNumber}` : "—"}`);
}

/**
 * Probe a service via its Caddy hostname. Returns true on any of the acceptable status codes
 * (default 200). Uses `--insecure` because Caddy's internal CA only chains to root after
 * `caddy trust`; doctor should still succeed on a machine that hasn't run that yet — the
 * status code is what matters, not the cert chain.
 *
 * @param {SpinMeta} meta
 * @param {string} subdomain
 * @param {string} path
 * @param {number[]} [acceptStatus]
 * @returns {Promise<boolean>}
 */
async function probeViaCaddy(meta, subdomain, path, acceptStatus = [200]) {
    const caddyHttps = requirePort(meta, "caddyHttps");
    const probe = spawnSync(
        "curl",
        [
            "-s",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "--max-time",
            "3",
            "--insecure",
            "--resolve",
            `${subdomain}.${meta.slug}.spin.localhost:${caddyHttps}:127.0.0.1`,
            `https://${subdomain}.${meta.slug}.spin.localhost:${caddyHttps}${path}`,
        ],
        { encoding: "utf8" },
    );
    return acceptStatus.includes(Number(probe.stdout.trim()));
}

/**
 * Open a draft PR for a spin that started life with `--no-pr`, or recreate one that was closed.
 *
 * @param {string[]} args
 */
async function ensurePr(args) {
    const slug = requireSlug(args[0]);
    const meta = await readMetaOrFail(slug);
    await ensureDraftPrInternal(meta);
    log(green(`  ✓ PR #${meta.prNumber}`));
}

function printHelp() {
    process.stdout.write(`
${bold("pnpm spin")} — isolated worktree dev environments

Usage:
  pnpm spin ${cyan("<slug>")}              start (or resume) a spin
  pnpm spin start ${cyan("<slug>")} [flags]
  pnpm spin stop  ${cyan("<slug>")} [--purge] [--remove] [--force]
  pnpm spin list
  pnpm spin doctor ${cyan("<slug>")}
  pnpm spin pr ${cyan("<slug>")}

Flags (start):
  --with-web    also start the storefront on the allocated web port
  --no-pr       skip opening the draft PR (call \`pnpm spin pr\` later)

Flags (stop):
  --purge       also delete the docker volumes (wipes the seeded DB)
  --remove      delete the worktree directory and branch after stopping
  --force       allow --remove even with uncommitted changes / unpushed commits

Slug rules: lowercase letters, digits, dashes; 2–40 chars.

Issue: https://github.com/calibra-org/calibra/issues/21
`);
}

/* -------------------------------------------------------------------------- */
/*  Bootstrap steps                                                            */
/* -------------------------------------------------------------------------- */

/**
 * @param {SpinMeta} meta
 */
async function ensureWorktree(meta) {
    if (existsSync(meta.worktreePath) && existsSync(join(meta.worktreePath, ".git"))) {
        step("worktree", "exists");
        return;
    }
    step("worktree", "create");
    await mkdir(WORKTREES_DIR, { recursive: true });
    await run("git", ["fetch", "origin", "main", "--quiet"], { cwd: MAIN_REPO_ROOT });
    /**
     * Branch from origin/main so the spin starts from a clean baseline. The operator can
     * `git rebase origin/main` later if needed; the alternative (branching from HEAD) would
     * silently inherit whatever changes happen to be in the main checkout.
     */
    await run("git", ["worktree", "add", "-b", meta.branch, meta.worktreePath, "origin/main"], { cwd: MAIN_REPO_ROOT });
}

/**
 * @param {SpinMeta} meta
 */
async function ensureEnvFiles(meta) {
    step("env files", "write");
    const adminEnvPath = join(meta.worktreePath, "apps/admin/.env.local");
    const webEnvPath = join(meta.worktreePath, "apps/web/.env.local");
    const apiEnvPath = join(meta.worktreePath, "apps/api/.env");

    await writeFile(
        adminEnvPath,
        [
            `# Generated by scripts/spin.mjs for spin "${meta.slug}". Safe to edit; re-running spin overwrites.`,
            `NEXT_PUBLIC_API_BASE_URL=http://localhost:${meta.ports.api}`,
            `NEXT_PUBLIC_SITE_URL=http://localhost:${meta.ports.admin}`,
            `NEXT_PUBLIC_DEFAULT_LOCALE=fa`,
            "",
        ].join("\n"),
    );

    /**
     * Storefront env file. The web app's `getBaseUrl()` (packages/sdk) throws when
     * `NEXT_PUBLIC_API_BASE_URL` is missing, so SSR fails with a 500 on the homepage if we
     * don't write this. Matches the admin shape; only the SITE_URL differs.
     */
    await writeFile(
        webEnvPath,
        [
            `# Generated by scripts/spin.mjs for spin "${meta.slug}". Safe to edit; re-running spin overwrites.`,
            `NEXT_PUBLIC_API_BASE_URL=http://localhost:${meta.ports.api}`,
            `NEXT_PUBLIC_SITE_URL=http://localhost:${meta.ports.web}`,
            `NEXT_PUBLIC_DEFAULT_LOCALE=fa`,
            "",
        ].join("\n"),
    );

    /**
     * Generate (and persist) the stable per-spin secrets on first start. APP_KEY signs cookies
     * and keeps them valid across stop/start of the same spin (a different spin gets a different
     * key — anything signed by one is rejected by another, the correct security boundary).
     * GLITCHTIP_SECRET_KEY is the Django SECRET_KEY for the per-spin GlitchTip instance.
     * MEILI_MASTER_KEY guards the Meilisearch instance — the api uses it to authenticate.
     */
    let metaChanged = false;
    if (!meta.appKey) {
        meta.appKey = randomBytes(32).toString("hex");
        metaChanged = true;
    }
    if (!meta.glitchtipSecretKey) {
        meta.glitchtipSecretKey = randomBytes(48).toString("hex");
        metaChanged = true;
    }
    if (!meta.meiliMasterKey) {
        meta.meiliMasterKey = randomBytes(32).toString("hex");
        metaChanged = true;
    }
    if (metaChanged) await writeMeta(meta);

    const tempoPort = requirePort(meta, "tempo");
    const meiliPort = requirePort(meta, "meilisearch");

    await writeFile(
        apiEnvPath,
        [
            `# Generated by scripts/spin.mjs for spin "${meta.slug}". Safe to edit; re-running spin overwrites.`,
            `TZ=UTC`,
            `NODE_ENV=development`,
            `PORT=${meta.ports.api}`,
            `HOST=0.0.0.0`,
            `APP_NAME=calibra-api-${meta.slug}`,
            `LOG_LEVEL=info`,
            `APP_KEY=${meta.appKey}`,
            `DB_HOST=localhost`,
            `DB_PORT=${meta.ports.db}`,
            `DB_USER=calibra`,
            `DB_PASSWORD=calibra`,
            `DB_DATABASE=calibra`,
            `ALLOWED_ORIGINS=http://localhost:${meta.ports.admin},http://localhost:${meta.ports.web}`,
            /**
             * Mailpit (per-spin). The container is brought up by `ensureContainers()` on
             * `spin start` against the spin's own docker-compose project.
             * `MAIL_NOTIFICATIONS_ENABLED=true` opts the importer/exporter runners into sending
             * operator emails on terminal events.
             */
            `MAIL_FROM_ADDRESS=ops@calibra.local`,
            `MAIL_FROM_NAME=Calibra`,
            `MAIL_NOTIFICATIONS_ENABLED=true`,
            `SMTP_HOST=localhost`,
            `SMTP_PORT=${requirePort(meta, "mailpitSmtp")}`,
            `MAILPIT_WEB_URL=http://localhost:${requirePort(meta, "mailpitWeb")}`,
            /**
             * Redis is per-spin too — no shared bus. `keyPrefix: ${APP_NAME}:` in
             * `config/redis.ts` stays as defence-in-depth, but each spin's containers are
             * already isolated by the docker-compose project name.
             */
            `REDIS_HOST=localhost`,
            `REDIS_PORT=${requirePort(meta, "redis")}`,
            /** Bridge SSE broadcasts across api ↔ queue worker (single-process if `none`). */
            `TRANSMIT_TRANSPORT=redis`,
            /**
             * Limiter + lock backing store. `redis` shares counters across api ↔ queue worker
             * (matches the `redis` connection above); tests override to `memory`. Without this
             * env the boot validator in `start/env.ts` refuses to start.
             */
            `LIMITER_STORE=redis`,
            /**
             * Background-job queue.
             *  - `database`: jobs persisted in Postgres; the spin's `queue:work` process polls.
             *    Transmit's redis transport (config/transmit.ts) bridges broadcasts back to the
             *    api process so the wizard's SSE subscription sees live progress.
             *  - `sync` (set in .env.test only): runs jobs inline; no worker, no transport needed.
             */
            `QUEUE_DRIVER=database`,
            /** Default cache store — selects the multi-tier redis store in `config/cache.ts`. */
            `CACHE_DRIVER=redis`,
            /**
             * Meilisearch. Per-spin instance brought up by docker-compose.meili.yml; the api
             * reaches it on the host (HMR runs the api outside docker). Key is the master key
             * generated above; production overrides to a scoped key minted at deploy time.
             */
            `MEILISEARCH_HOST=http://localhost:${meiliPort}`,
            `MEILISEARCH_API_KEY=${meta.meiliMasterKey}`,
            /**
             * Observability. `DEV_OBSERVABILITY=true` flips the logger transport to also write
             * ndjson into `.spin/logs/api.ndjson` so Promtail can ship it to Loki. The OTLP
             * endpoint points at Tempo's host-published 4318.
             */
            `DEV_OBSERVABILITY=true`,
            `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:${tempoPort}`,
            `SPIN_API_LOG_PATH=${join(meta.worktreePath, ".spin/logs/api.ndjson")}`,
            /**
             * GlitchTip DSN. Auto-provisioned on first start (best-effort); when the
             * provisioner falls back to manual setup, the line is omitted and Sentry init
             * skips. Operator can paste the DSN here after creating org+project by hand.
             */
            ...(meta.glitchtipDsn ? [`GLITCHTIP_DSN=${meta.glitchtipDsn}`] : []),
            "",
        ].join("\n"),
    );
}

/**
 * Resolve a per-spin port, falling back to the legacy shared dev-ui constants for spins that
 * pre-date {@link LEGACY_SHARED_DEV_UI_PORTS}. New spins always have every port populated in
 * `meta.ports`; old spins continue talking to their shared containers until they stop+restart.
 *
 * For prod-parity roles (caddy, meili, observability stack) absent from a legacy meta, returns
 * `null` instead of throwing — call sites use that to skip provisioning the observability
 * compose files. Use {@link requirePort} instead when the caller cannot proceed without one.
 *
 * @param {SpinMeta} meta
 * @param {keyof SpinPorts} role
 * @returns {number | null}
 */
function effectivePort(meta, role) {
    const fromMeta = meta.ports[role];
    if (typeof fromMeta === "number") return fromMeta;
    if (role in LEGACY_SHARED_DEV_UI_PORTS) {
        return LEGACY_SHARED_DEV_UI_PORTS[/** @type {keyof typeof LEGACY_SHARED_DEV_UI_PORTS} */ (role)];
    }
    return null;
}

/**
 * Like {@link effectivePort} but throws when the role isn't allocated. Use for roles that
 * the caller depends on existing (api / db / pgadmin); use {@link effectivePort} for roles
 * that legacy spins may legitimately lack.
 *
 * @param {SpinMeta} meta
 * @param {keyof SpinPorts} role
 * @returns {number}
 */
function requirePort(meta, role) {
    const port = effectivePort(meta, role);
    if (port === null) {
        throw new Error(`spin "${meta.slug}" meta is missing a required port "${role}"`);
    }
    return port;
}

/**
 * Generate the per-spin config files for Caddy + Prometheus + Promtail + Grafana provisioning.
 * Writes everything into `.spin/config/` under the worktree; the compose files volume-mount
 * those paths read-only. Re-writing on every start is fine — the configs are templated from
 * `meta` and the contents are stable as long as the meta is.
 *
 * Tempo + Loki + Alertmanager use static configs that live in `docker/observability/`
 * (committed) and don't need per-spin templating — they're mounted directly by the compose
 * files. Grafana dashboards live there too.
 *
 * @param {SpinMeta} meta
 */
async function ensureObservabilityConfig(meta) {
    step("config", "write observability + caddy");
    const configDir = join(meta.worktreePath, ".spin/config");
    await mkdir(configDir, { recursive: true });
    await mkdir(join(configDir, "grafana/provisioning/datasources"), { recursive: true });
    await mkdir(join(configDir, "grafana/provisioning/dashboards"), { recursive: true });
    await mkdir(join(meta.worktreePath, ".spin/logs"), { recursive: true });
    /**
     * Pre-create the data dirs that Promtail position-file + GlitchTip media volumes need.
     * Without these the bind-mount creates them as root-owned (docker daemon default), which
     * the container processes can't write into.
     */
    await mkdir(join(meta.worktreePath, ".spin/data/promtail"), { recursive: true });

    /**
     * Shared Caddy CA dir. First spin on the host bootstraps the CA into here; every
     * subsequent spin reuses it, which is the whole point — trust once, trust forever.
     * `recursive: true` makes the call a no-op when the dir already exists.
     */
    await mkdir(SHARED_CADDY_CA_DIR, { recursive: true });

    await writeFile(join(configDir, "Caddyfile"), renderCaddyfile(meta));
    await writeFile(join(configDir, "prometheus.yml"), renderPrometheusConfig(meta));
    await writeFile(join(configDir, "promtail.yml"), renderPromtailConfig(meta));
    await writeFile(join(configDir, "grafana/provisioning/datasources/datasources.yml"), renderGrafanaDatasources());
    await writeFile(join(configDir, "grafana/provisioning/dashboards/dashboards.yml"), renderGrafanaDashboardsProvider());
}

/**
 * Render the per-spin Caddyfile. Every observability + dev-ui surface gets a
 * `<service>.<slug>.spin.localhost` hostname with internal-CA TLS. The api / admin / web
 * routes point at `host.docker.internal:<port>` because those processes run on the host
 * (HMR); the rest are container-to-container via service name on the spin's network.
 *
 * @param {SpinMeta} meta
 */
function renderCaddyfile(meta) {
    const slug = meta.slug;
    const apiPort = meta.ports.api;
    const adminPort = meta.ports.admin;
    const webPort = meta.ports.web;
    const agentPort = requirePort(meta, "spinAgent");
    return `# Generated by scripts/spin.mjs for spin "${slug}". Re-run \`pnpm spin\` to regenerate.
{
    auto_https disable_redirects
    local_certs
}

${slug}.spin.localhost {
    tls internal
    reverse_proxy host.docker.internal:${agentPort}
}

api.${slug}.spin.localhost {
    tls internal
    reverse_proxy host.docker.internal:${apiPort}
}

admin.${slug}.spin.localhost {
    tls internal
    reverse_proxy host.docker.internal:${adminPort}
}

web.${slug}.spin.localhost {
    tls internal
    reverse_proxy host.docker.internal:${webPort}
}

mail.${slug}.spin.localhost {
    tls internal
    reverse_proxy mailpit:8025
}

redis.${slug}.spin.localhost {
    tls internal
    reverse_proxy redisinsight:5540
}

db.${slug}.spin.localhost {
    tls internal
    reverse_proxy adminer:8080
}

grafana.${slug}.spin.localhost {
    tls internal
    reverse_proxy grafana:3000
}

prom.${slug}.spin.localhost {
    tls internal
    reverse_proxy prometheus:9090
}

loki.${slug}.spin.localhost {
    tls internal
    reverse_proxy loki:3100
}

tempo.${slug}.spin.localhost {
    tls internal
    reverse_proxy tempo:3200
}

alerts.${slug}.spin.localhost {
    tls internal
    reverse_proxy alertmanager:9093
}

errors.${slug}.spin.localhost {
    tls internal
    reverse_proxy glitchtip:8000
}

uptime.${slug}.spin.localhost {
    tls internal
    reverse_proxy uptimekuma:3001
}

search.${slug}.spin.localhost {
    tls internal
    reverse_proxy meilisearch:7700
}
`;
}

/**
 * Render Prometheus's scrape config. The only scrape target is the api on the host (HMR runs
 * outside docker), reached via `host.docker.internal`. Prometheus also scrapes itself so the
 * Prometheus → Grafana wiring has a sanity-check target. Alertmanager is reachable on the
 * compose network but no rules ship in this PR — adding `alertmanagers:` is the hook for
 * future rule authors.
 *
 * @param {SpinMeta} meta
 */
function renderPrometheusConfig(meta) {
    return `# Generated by scripts/spin.mjs for spin "${meta.slug}".
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    spin: ${meta.slug}

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets:
          - localhost:9090

  - job_name: calibra-api
    metrics_path: /metrics
    static_configs:
      - targets:
          - host.docker.internal:${meta.ports.api}
        labels:
          service: calibra-api
          spin: ${meta.slug}
`;
}

/**
 * Render Promtail's pipeline. Reads JSON lines from the api's per-spin ndjson log file
 * (the path is bind-mounted via SPIN_LOG_DIR), parses Pino's standard fields, and ships to
 * Loki with `service=calibra-api` + `spin=<slug>` labels.
 *
 * @param {SpinMeta} meta
 */
function renderPromtailConfig(meta) {
    return `# Generated by scripts/spin.mjs for spin "${meta.slug}".
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /run/promtail/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: calibra-api
    static_configs:
      - targets:
          - localhost
        labels:
          job: calibra-api
          service: calibra-api
          spin: ${meta.slug}
          __path__: /var/log/api/*.ndjson
    pipeline_stages:
      - json:
          expressions:
            level: level
            msg: msg
            time: time
            request_id: request_id
      - labels:
          level:
      - timestamp:
          source: time
          format: UnixMs
`;
}

/**
 * Grafana datasource provisioning — Prometheus, Loki, Tempo. All reach their targets
 * container-to-container by compose service name (not by published host port), so the URLs
 * are identical across spins. Marked `editable: false` so accidental UI tweaks don't drift
 * from the committed config.
 */
function renderGrafanaDatasources() {
    return `apiVersion: 1

datasources:
  - name: Prometheus
    uid: prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: Loki
    uid: loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: false

  - name: Tempo
    uid: tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
    editable: false
`;
}

/**
 * Grafana dashboard provisioner — points at the dashboards dir we bind-mount from
 * `docker/observability/grafana/dashboards/` (committed JSON, read-only). Auto-imports any
 * `*.json` on boot. New dashboards land in that directory and get picked up automatically.
 */
function renderGrafanaDashboardsProvider() {
    return `apiVersion: 1

providers:
  - name: calibra
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: false
`;
}

/**
 * @param {SpinMeta} meta
 */
async function ensureContainers(meta) {
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
 * Block until a Caddy-fronted service answers an acceptable status. Sharing implementation
 * with {@link probeViaCaddy} (the doctor probe) so the readiness loop and the per-spin
 * status report behave identically — a service that satisfies one satisfies the other.
 *
 * @param {SpinMeta} meta
 * @param {string} subdomain
 * @param {string} path
 * @param {number} timeoutMs
 * @param {string} label
 * @param {{ acceptStatus?: number[] }} [opts]
 */
async function waitForCaddyHttp(meta, subdomain, path, timeoutMs, label, opts = {}) {
    const accept = opts.acceptStatus ?? [200];
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await probeViaCaddy(meta, subdomain, path, accept)) return;
        await sleep(1_000);
    }
    throw new Error(
        `${label} did not respond on https://${subdomain}.${meta.slug}.spin.localhost${path} within ${Math.round(timeoutMs / 1000)}s — check container logs`,
    );
}

/**
 * Block until a TCP port answers, or throw with a clear "did not come up" error.
 *
 * @param {number} port
 * @param {number} timeoutMs
 * @param {string} label
 */
async function waitForPort(port, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isPortListening(port)) return;
        await sleep(500);
    }
    throw new Error(`${label} (:${port}) did not come up within ${Math.round(timeoutMs / 1000)}s`);
}

/**
 * Block until a direct-host HTTP endpoint responds with an acceptable status. Used for
 * services that publish their port to the host and need more than a TCP-listen to be
 * considered ready (Meilisearch boots its TCP listener before `/health` answers).
 *
 * @param {string} url
 * @param {number} timeoutMs
 * @param {string} label
 * @param {{ acceptStatus?: number[] }} [opts]
 */
async function waitForHttp(url, timeoutMs, label, opts = {}) {
    const accept = opts.acceptStatus ?? [200, 204];
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const probe = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "3", url], {
            encoding: "utf8",
        });
        const status = Number(probe.stdout.trim());
        if (accept.includes(status)) return;
        await sleep(1_000);
    }
    throw new Error(`${label} (${url}) did not respond within ${Math.round(timeoutMs / 1000)}s — check container logs`);
}

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
 * @param {SpinMeta} meta
 * @returns {NodeJS.ProcessEnv}
 */
function composeEnv(meta) {
    const optional = (/** @type {keyof SpinPorts} */ role) => {
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
 * @param {SpinMeta} meta
 * @returns {string[]}
 */
function composeFiles(meta) {
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
 * @param {SpinMeta} meta
 */
async function ensureInstall(meta) {
    if (existsSync(join(meta.worktreePath, "node_modules"))) {
        step("install", "skip (node_modules exists)");
        return;
    }
    step("install", "pnpm install");
    await run("pnpm", ["install"], { cwd: meta.worktreePath });
}

/**
 * @param {SpinMeta} meta
 */
async function ensureSdkBuild(meta) {
    const sdkDist = join(meta.worktreePath, "packages/sdk/dist");
    if (existsSync(sdkDist)) {
        step("sdk", "skip (dist exists)");
        return;
    }
    step("sdk", "pnpm --filter @calibra/sdk build");
    await run("pnpm", ["--filter", "@calibra/sdk", "build"], { cwd: meta.worktreePath });
}

/**
 * @param {SpinMeta} meta
 */
async function ensureMigrationsAndSeed(meta) {
    step("db", "migration:run");
    await run("pnpm", ["--filter", "@calibra/api", "migration:run"], { cwd: meta.worktreePath });
    if (meta.seeded) {
        step("db", "seed (skip, already seeded)");
        return;
    }
    step("db", "db:seed");
    await run("pnpm", ["--filter", "@calibra/api", "db:seed"], { cwd: meta.worktreePath });
    meta.seeded = true;
    await writeMeta(meta);
}

/**
 * @param {SpinMeta} meta
 * @param {{ withWeb: boolean }} opts
 */
async function startServers(meta, opts) {
    const logsDir = join(meta.worktreePath, ".spin/logs");
    await mkdir(logsDir, { recursive: true });

    await startServer({
        name: "api",
        meta,
        cmd: "pnpm",
        args: ["--filter", "@calibra/api", "dev"],
        cwd: meta.worktreePath,
        env: { ...process.env, PORT: String(meta.ports.api), HOST: "0.0.0.0" },
    });

    /**
     * Background-job worker for @adonisjs/queue's `database` driver. Tracked the same way as the
     * api/admin processes so `spin stop` cleans it up. The `queue:work` command stays alive until
     * SIGTERM and handles graceful shutdown of in-flight jobs.
     */
    await startServer({
        name: "queue",
        meta,
        cmd: "pnpm",
        /**
         * `--queue=imports,exports` matches the queues declared on `RunImportJob` and
         * `RunExportJob`. Without it the worker only polls `default` and the dispatched jobs
         * sit unprocessed in `queue_jobs`. The `default` queue stays empty in this repo for now.
         */
        args: ["--filter", "@calibra/api", "exec", "node", "ace", "queue:work", "--queue=imports,exports"],
        cwd: meta.worktreePath,
        env: { ...process.env },
    });

    /**
     * Literal hostnames Next.js's `allowedDevOrigins` should accept for this spin. Next's
     * glob matching only fires for a single dot-less segment per `*`, so the two-label
     * subdomains we use (`admin.<slug>.spin.localhost`) wouldn't always match a single
     * wildcard pattern. Passing the literal hostnames in alongside the wildcard patterns
     * (see each `next.config.ts`) guarantees acceptance regardless of how Next interprets
     * the glob.
     */
    const nextDevAllowedOrigins = [
        `admin.${meta.slug}.spin.localhost`,
        `web.${meta.slug}.spin.localhost`,
        `api.${meta.slug}.spin.localhost`,
    ].join(",");

    await startServer({
        name: "admin",
        meta,
        cmd: "pnpm",
        args: ["exec", "next", "dev", "-p", String(meta.ports.admin)],
        cwd: join(meta.worktreePath, "apps/admin"),
        env: {
            ...process.env,
            PORT: String(meta.ports.admin),
            NEXT_DEV_ALLOWED_ORIGINS: nextDevAllowedOrigins,
        },
    });

    if (opts.withWeb) {
        await startServer({
            name: "web",
            meta,
            cmd: "pnpm",
            args: ["exec", "next", "dev", "-p", String(meta.ports.web)],
            cwd: join(meta.worktreePath, "apps/web"),
            env: {
                ...process.env,
                PORT: String(meta.ports.web),
                NEXT_DEV_ALLOWED_ORIGINS: nextDevAllowedOrigins,
            },
        });
    }

    /**
     * Spin homepage + control plane. Tiny Node http server, no deps. Caddy fronts it at the
     * bare `<slug>.spin.localhost` host so the first URL the operator visits after `pnpm spin`
     * is the live dashboard, not a port-list in their terminal.
     */
    await startServer({
        name: "agent",
        meta,
        cmd: "node",
        args: ["scripts/spin-agent.mjs"],
        cwd: meta.worktreePath,
        env: {
            ...process.env,
            SPIN_AGENT_PORT: String(requirePort(meta, "spinAgent")),
            SPIN_SLUG: meta.slug,
            SPIN_META_PATH: metaPath(meta.slug),
            COMPOSE_PROJECT_NAME: meta.composeProject,
        },
    });
}

/**
 * @param {{ name: string, meta: SpinMeta, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv }} input
 */
async function startServer(input) {
    const pidPath = join(input.meta.worktreePath, `.spin/${input.name}.pid`);
    const logPath = join(input.meta.worktreePath, `.spin/logs/${input.name}.log`);
    if (existsSync(pidPath)) {
        const pid = Number(await readFile(pidPath, "utf8"));
        if (Number.isFinite(pid) && isProcessAlive(pid)) {
            step(input.name, `already running (pid ${pid})`);
            return;
        }
    }
    step(input.name, "start");
    const { openSync } = await import("node:fs");
    const fd = openSync(logPath, "w");
    const child = spawn(input.cmd, input.args, {
        cwd: input.cwd,
        env: input.env,
        stdio: ["ignore", fd, fd],
        detached: true,
    });
    child.unref();
    await writeFile(pidPath, String(child.pid));
}

/**
 * @param {SpinMeta} meta
 * @param {{ withWeb: boolean }} opts
 */
async function waitForServersReady(meta, opts) {
    const targets = [
        { name: "api", port: meta.ports.api },
        { name: "admin", port: meta.ports.admin },
        ...(opts.withWeb ? [{ name: "web", port: meta.ports.web }] : []),
    ];
    for (const target of targets) {
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
            if (await isPortListening(target.port)) {
                step(target.name, `ready on :${target.port}`);
                break;
            }
            await sleep(500);
        }
        if (!(await isPortListening(target.port))) {
            throw new Error(`${target.name} did not start within 60s — check .spin/logs/${target.name}.log`);
        }
    }
    /**
     * Queue worker has no port — give it a beat to boot, then verify the pid file resolves to
     * a live process AND the log shows the "Starting worker for queues:" line. Failure here
     * is non-fatal (operator can still hit the api) but loud so it's not silently broken.
     */
    await sleep(1_500);
    const queuePid = await readPidIfAlive(join(meta.worktreePath, ".spin/queue.pid"));
    if (queuePid === null) {
        log(`  ${red("✗")} queue worker not running — check .spin/logs/queue.log`);
    } else {
        step("queue", `ready (pid ${queuePid})`);
    }
}

/**
 * @param {SpinMeta} meta
 */
async function ensureDraftPrInternal(meta) {
    if (meta.prNumber) {
        step("PR", `exists (#${meta.prNumber})`);
        return;
    }
    /** Need at least one commit on the branch before `gh pr create` will accept it. */
    const hasCommits = spawnSync("git", ["rev-list", "--count", `origin/main..${meta.branch}`], {
        cwd: meta.worktreePath,
        encoding: "utf8",
    });
    const ahead = Number(hasCommits.stdout.trim());
    if (ahead === 0) {
        step("PR", "empty bootstrap commit");
        await run(
            "git",
            [
                "commit",
                "--allow-empty",
                "-m",
                `chore(spin): bootstrap ${meta.slug}\n\nGenerated by \`pnpm spin\`. Replace this commit with real work, or amend it.\n\nPorts: api=${meta.ports.api} admin=${meta.ports.admin} db=${meta.ports.db} pgadmin=${meta.ports.pgadmin}`,
            ],
            { cwd: meta.worktreePath },
        );
    }
    step("PR", "push branch");
    await run("git", ["push", "-u", "origin", meta.branch], { cwd: meta.worktreePath });

    step("PR", "gh pr create --draft");
    const body = [
        `Bootstrapped by \`pnpm spin ${meta.slug}\`.`,
        ``,
        `## Ports`,
        ``,
        `| service | URL |`,
        `| --- | --- |`,
        `| admin   | http://localhost:${meta.ports.admin} |`,
        `| api     | http://localhost:${meta.ports.api} |`,
        `| pgadmin | http://localhost:${meta.ports.pgadmin} |`,
        `| db      | postgres://calibra:calibra@localhost:${meta.ports.db}/calibra |`,
        ``,
        `## Seed credentials`,
        ``,
        `Admin login: \`admin@bulk.calibra.dev\` / \`Passw0rd1!\` (from the bulk seeder).`,
        ``,
        `## Tasks`,
        ``,
        `- [ ] Replace this section with the actual scope.`,
        ``,
        `<sub>Teardown: \`pnpm spin stop ${meta.slug}\` · containers + processes only.  Add \`--purge --remove\` to wipe everything.</sub>`,
    ].join("\n");
    const result = spawnSync(
        "gh",
        ["pr", "create", "--draft", "--base", "main", "--head", meta.branch, "--title", `spin/${meta.slug}: WIP`, "--body", body],
        { cwd: meta.worktreePath, encoding: "utf8" },
    );
    if (result.status !== 0) {
        throw new Error(`gh pr create failed: ${result.stderr || result.stdout}`);
    }
    const url = result.stdout.trim().split("\n").pop() ?? "";
    const numberMatch = url.match(/\/pull\/(\d+)/);
    meta.prNumber = numberMatch ? Number(numberMatch[1]) : null;
    meta.prUrl = url;
    await writeMeta(meta);
}

/**
 * @param {SpinMeta} meta
 * @param {{ withWeb: boolean }} opts
 */
function printHandoffCard(meta, opts) {
    log("");
    log(bold(green("ready")));
    const slug = meta.slug;
    const caddyHttps = requirePort(meta, "caddyHttps");
    log(`  ${bold("dashboard")}`);
    log(`    home    ${cyan(`https://${slug}.spin.localhost:${caddyHttps}`)} ${dim("(live URLs + health + actions)")}`);
    log(`  ${bold("app")}`);
    log(`    admin   ${cyan(`https://admin.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(host :${meta.ports.admin})`)}`);
    log(`    api     ${cyan(`https://api.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(host :${meta.ports.api})`)}`);
    if (opts.withWeb) {
        log(`    web     ${cyan(`https://web.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(host :${meta.ports.web})`)}`);
    }
    log(`  ${bold("observability")}`);
    const dsnNote = meta.glitchtipDsn ? "DSN wired" : "DSN pending — see GlitchTip setup below";
    log(`    grafana ${cyan(`https://grafana.${slug}.spin.localhost:${caddyHttps}`)} ${dim("(anonymous editor)")}`);
    log(`    errors  ${cyan(`https://errors.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(${dsnNote})`)}`);
    log(`    uptime  ${cyan(`https://uptime.${slug}.spin.localhost:${caddyHttps}`)}`);
    log(`    prom    ${cyan(`https://prom.${slug}.spin.localhost:${caddyHttps}`)}`);
    log(`    alerts  ${cyan(`https://alerts.${slug}.spin.localhost:${caddyHttps}`)}`);
    log(`  ${bold("search")}`);
    log(`    meili   ${cyan(`https://search.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(key in ${meta.slug}.json)`)}`);
    log(`  ${bold("data + dev")}`);
    log(
        `    mail    ${cyan(`https://mail.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(smtp localhost:${requirePort(meta, "mailpitSmtp")})`)}`,
    );
    log(
        `    redis   ${cyan(`https://redis.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(redis-cli on :${requirePort(meta, "redis")})`)}`,
    );
    log(`    db      ${cyan(`https://db.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(psql on :${meta.ports.db})`)}`);
    log(`    pgadmin ${cyan(`http://localhost:${meta.ports.pgadmin}`)}`);
    log(`  pr      ${meta.prUrl ?? `(skipped — run pnpm spin pr ${meta.slug})`}`);
    log(`  login   ${cyan("admin@bulk.calibra.dev")} / ${cyan("Passw0rd1!")}`);
    log(`  stop    ${cyan(`pnpm spin stop ${meta.slug}`)}`);
    if (!meta.glitchtipDsn) {
        log("");
        log(dim("GlitchTip setup (one-time): open errors.<slug>.spin.localhost, register"));
        log(dim("`spin@calibra.dev`, create org `spin` + project `api`, copy the DSN into"));
        log(dim(`\`apps/api/.env\` as \`GLITCHTIP_DSN=…\`, then restart the api. We'll auto-`));
        log(dim("provision once the GlitchTip register API stabilises."));
    }
    log("");
    log(
        dim(
            `caddy: \`*.${slug}.spin.localhost\` resolves to 127.0.0.1; certs use Caddy's local CA. Run \`caddy trust\` once on this host if you haven't.`,
        ),
    );
}

/* -------------------------------------------------------------------------- */
/*  Teardown                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @param {SpinMeta} meta
 */
async function killTrackedProcesses(meta) {
    for (const name of ["api", "admin", "queue", "web", "agent"]) {
        const pidPath = join(meta.worktreePath, `.spin/${name}.pid`);
        if (!existsSync(pidPath)) continue;
        const pid = Number(await readFile(pidPath, "utf8"));
        if (Number.isFinite(pid) && isProcessAlive(pid)) {
            step(name, `kill ${pid}`);
            try {
                process.kill(-pid, "SIGTERM");
            } catch {
                /** Already gone — ignore. */
            }
        }
        await rm(pidPath, { force: true });
    }
    /**
     * Wait until tracked ports are actually free. HMR child workers from `node ace serve --hmr`
     * sometimes outlive their parent for a beat — without this wait the next `spin start` hits
     * `EADDRINUSE: 13737` and the api never recovers. 5s is enough in practice.
     */
    const portsToFree = [meta.ports.api, meta.ports.admin, meta.ports.web];
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        const busy = await Promise.all(portsToFree.map(isPortListening));
        if (busy.every((b) => !b)) return;
        await sleep(200);
    }
}

/**
 * @param {SpinMeta} meta
 * @param {{ purge: boolean }} opts
 */
async function downContainers(meta, opts) {
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

/**
 * `true` when the spin pre-dates the per-spin dev-ui layout — its meta has no `redis` port
 * (and friends) and {@link effectivePort} falls back to the legacy shared container.
 *
 * @param {SpinMeta} meta
 */
function isLegacyDevUi(meta) {
    return typeof meta.ports.redis !== "number";
}

/**
 * @param {SpinMeta} meta
 * @param {{ force: boolean }} opts
 */
async function removeWorktree(meta, opts) {
    step("worktree", "remove");
    const args = ["worktree", "remove", meta.worktreePath];
    if (opts.force) args.push("--force");
    await run("git", args, { cwd: MAIN_REPO_ROOT });
    /** `git worktree remove` deletes the dir but leaves the branch; drop it too. */
    if (opts.force) await run("git", ["branch", "-D", meta.branch], { cwd: MAIN_REPO_ROOT }).catch(() => undefined);
}

/* -------------------------------------------------------------------------- */
/*  Meta + ports                                                               */
/* -------------------------------------------------------------------------- */

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
async function loadOrInitMeta(slug) {
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
 * @param {string} slug
 * @returns {Promise<SpinMeta>}
 */
async function readMetaOrFail(slug) {
    const path = metaPath(slug);
    if (!existsSync(path)) {
        throw new Error(`no spin metadata for "${slug}" (looked at ${path})`);
    }
    return JSON.parse(await readFile(path, "utf8"));
}

/**
 * @param {SpinMeta} meta
 */
async function writeMeta(meta) {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(metaPath(meta.slug), JSON.stringify(meta, null, 2));
}

/**
 * @param {string} slug
 */
function metaPath(slug) {
    return join(STATE_DIR, `${slug}.json`);
}

/**
 * Pick a port slot deterministically from the slug, then nudge until every port is free. The
 * nudge keeps slugs that hash to the same base from clobbering each other.
 *
 * @param {string} slug
 * @returns {Promise<SpinPorts>}
 */
async function allocatePorts(slug) {
    for (let nudge = 0; nudge < TOTAL_SLOTS; nudge++) {
        const slotKey = nudge === 0 ? slug : `${slug}#${nudge}`;
        const slot = hashToSlot(slotKey);
        const base = PORT_BASE + slot * PORTS_PER_SLOT;
        /** Keep the offsets in lockstep with {@link ROLES}; one entry per role. */
        const ports = {
            db: base,
            pgadmin: base + 1,
            api: base + 2,
            admin: base + 3,
            web: base + 4,
            mailpitSmtp: base + 5,
            mailpitWeb: base + 6,
            redis: base + 7,
            redisinsight: base + 8,
            adminer: base + 9,
            caddyHttp: base + 10,
            caddyHttps: base + 11,
            meilisearch: base + 12,
            prometheus: base + 13,
            grafana: base + 14,
            loki: base + 15,
            tempo: base + 16,
            alertmanager: base + 17,
            glitchtip: base + 18,
            uptimeKuma: base + 19,
            spinAgent: base + 20,
        };
        if (await allPortsFree(ports)) return ports;
    }
    throw new Error(`could not find a free port slot for slug "${slug}"`);
}

/**
 * @param {string} key
 * @returns {number}
 */
function hashToSlot(key) {
    const digest = createHash("sha256").update(key).digest("hex").slice(0, 8);
    return Number.parseInt(digest, 16) % TOTAL_SLOTS;
}

/**
 * @param {SpinPorts} ports
 */
async function allPortsFree(ports) {
    for (const role of ROLES) {
        const port = ports[role];
        if (typeof port === "number" && (await isPortListening(port))) return false;
    }
    return true;
}

/**
 * @param {number} port
 */
function isPortListening(port) {
    return new Promise((res) => {
        const socket = net.createConnection({ port, host: "127.0.0.1" });
        const finish = (/** @type {boolean} */ listening) => {
            socket.destroy();
            res(listening);
        };
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
        socket.setTimeout(500, () => finish(false));
    });
}

/* -------------------------------------------------------------------------- */
/*  CLI plumbing                                                               */
/* -------------------------------------------------------------------------- */

/**
 * @param {string[]} args
 */
function parseFlags(args) {
    return {
        withWeb: args.includes("--with-web"),
        noPr: args.includes("--no-pr"),
        purge: args.includes("--purge"),
        remove: args.includes("--remove"),
        force: args.includes("--force"),
    };
}

/**
 * @param {string | undefined} raw
 */
function requireSlug(raw) {
    if (!raw || !isSlug(raw)) {
        throw new Error(`expected a slug like "tags-workbench"; got "${raw ?? ""}"`);
    }
    return raw;
}

/**
 * @param {string} candidate
 */
function isSlug(candidate) {
    return /^[a-z][a-z0-9-]{1,39}$/.test(candidate);
}

/* -------------------------------------------------------------------------- */
/*  Process helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
function run(cmd, args, opts = {}) {
    return new Promise((res, rej) => {
        const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: "inherit" });
        child.once("error", rej);
        child.once("exit", (code) => {
            if (code === 0) res(undefined);
            else rej(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
        });
    });
}

/**
 * @param {number} pid
 */
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/**
 * Read a pidfile and return the PID iff the process is alive. Used by `doctor` to surface
 * background processes (queue worker) that have no port to probe.
 *
 * @param {string} pidPath
 * @returns {Promise<number | null>}
 */
async function readPidIfAlive(pidPath) {
    if (!existsSync(pidPath)) return null;
    const pid = Number(await readFile(pidPath, "utf8"));
    return Number.isFinite(pid) && isProcessAlive(pid) ? pid : null;
}

function findMainRepoRoot() {
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

/* -------------------------------------------------------------------------- */
/*  Logging                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} msg
 */
function log(msg) {
    process.stdout.write(`${msg}\n`);
}

/**
 * @param {string} stage
 * @param {string} detail
 */
function step(stage, detail) {
    log(`  ${dim("›")} ${stage.padEnd(12)} ${detail}`);
}

/** @param {string} s */
function bold(s) {
    return `\x1b[1m${s}\x1b[22m`;
}
/** @param {string} s */
function cyan(s) {
    return `\x1b[36m${s}\x1b[39m`;
}
/** @param {string} s */
function green(s) {
    return `\x1b[32m${s}\x1b[39m`;
}
/** @param {string} s */
function yellow(s) {
    return `\x1b[33m${s}\x1b[39m`;
}
/** @param {string} s */
function red(s) {
    return `\x1b[31m${s}\x1b[39m`;
}
/** @param {string} s */
function dim(s) {
    return `\x1b[2m${s}\x1b[22m`;
}
