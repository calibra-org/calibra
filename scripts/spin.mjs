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

/** Base of the per-spin port range. Picked deliberately outside the user-visible 3xxx family. */
const PORT_BASE = 13000;
/**
 * Ten ports per slug — app surfaces (db / pgadmin / api / admin / web) plus the dev-ui stack
 * (mailpitSmtp / mailpitWeb / redis / redisinsight / adminer). Every spin gets its own copy
 * of all of them so two spins running side-by-side never share state.
 */
const PORTS_PER_SLOT = 10;
/** Total slots before we wrap around (and start nudging for collisions). 100 × 10 = 13000-13999. */
const TOTAL_SLOTS = 100;

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
    const mailpitWeb = effectivePort(meta, "mailpitWeb");
    const mailpitSmtp = effectivePort(meta, "mailpitSmtp");
    const redis = effectivePort(meta, "redis");
    const redisinsight = effectivePort(meta, "redisinsight");
    const adminer = effectivePort(meta, "adminer");
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
     * Generate (and persist in the meta file) a stable APP_KEY so signed cookies survive across
     * stops/starts of the same spin. Different spins get different keys — anything signed for
     * one spin is rejected by another, which is the correct security boundary.
     */
    if (!meta.appKey) {
        meta.appKey = randomBytes(32).toString("hex");
        await writeMeta(meta);
    }

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
            `SMTP_PORT=${effectivePort(meta, "mailpitSmtp")}`,
            `MAILPIT_WEB_URL=http://localhost:${effectivePort(meta, "mailpitWeb")}`,
            /**
             * Redis is per-spin too — no shared bus. `keyPrefix: ${APP_NAME}:` in
             * `config/redis.ts` stays as defence-in-depth, but each spin's containers are
             * already isolated by the docker-compose project name.
             */
            `REDIS_HOST=localhost`,
            `REDIS_PORT=${effectivePort(meta, "redis")}`,
            /** Bridge SSE broadcasts across api ↔ queue worker (single-process if `none`). */
            `TRANSMIT_TRANSPORT=redis`,
            /**
             * Background-job queue.
             *  - `database`: jobs persisted in Postgres; the spin's `queue:work` process polls.
             *    Transmit's redis transport (config/transmit.ts) bridges broadcasts back to the
             *    api process so the wizard's SSE subscription sees live progress.
             *  - `sync` (set in .env.test only): runs jobs inline; no worker, no transport needed.
             */
            `QUEUE_DRIVER=database`,
            /** Rate-limiter counter store shared across api ↔ queue worker. */
            `LIMITER_STORE=redis`,
            /** Default cache store — selects the multi-tier redis store in `config/cache.ts`. */
            `CACHE_DRIVER=redis`,
            "",
        ].join("\n"),
    );
}

/**
 * Resolve a per-spin port, falling back to the legacy shared dev-ui constants for spins that
 * pre-date {@link LEGACY_SHARED_DEV_UI_PORTS}. New spins always have every port populated in
 * `meta.ports`; old spins continue talking to their shared containers until they stop+restart.
 *
 * @param {SpinMeta} meta
 * @param {keyof SpinPorts} role
 * @returns {number}
 */
function effectivePort(meta, role) {
    const fromMeta = meta.ports[role];
    if (typeof fromMeta === "number") return fromMeta;
    if (role in LEGACY_SHARED_DEV_UI_PORTS) {
        return LEGACY_SHARED_DEV_UI_PORTS[/** @type {keyof typeof LEGACY_SHARED_DEV_UI_PORTS} */ (role)];
    }
    throw new Error(`spin "${meta.slug}" meta is missing a required port "${role}"`);
}

/**
 * @param {SpinMeta} meta
 */
async function ensureContainers(meta) {
    /** Skip the start if both DB + pgAdmin are already responding on the right ports. */
    if ((await isPortListening(meta.ports.db)) && (await isPortListening(meta.ports.pgadmin))) {
        step("containers", "running");
        return;
    }
    step("containers", "docker compose up");
    const composeFile = join(meta.worktreePath, "apps/api/docker-compose.yml");
    const env = composeEnv(meta);
    await run("docker", ["compose", "-f", composeFile, "up", "-d"], { env });

    step("containers", "wait for postgres");
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        if (await isPortListening(meta.ports.db)) {
            /** pg_isready inside the container — a TCP-listening port isn't enough to start migrations against. */
            const check = spawnSync(
                "docker",
                ["compose", "-f", composeFile, "exec", "-T", "db", "pg_isready", "-U", "calibra", "-d", "calibra"],
                { env, encoding: "utf8" },
            );
            if (check.status === 0) {
                step("containers", "wait for redis");
                const redisPort = effectivePort(meta, "redis");
                const redisDeadline = Date.now() + 30_000;
                while (Date.now() < redisDeadline) {
                    if (await isPortListening(redisPort)) return;
                    await sleep(500);
                }
                throw new Error(`redis (:${redisPort}) did not come up — the wizard's live progress needs it`);
            }
        }
        await sleep(1_000);
    }
    throw new Error("postgres did not become ready within 60s");
}

/**
 * The full env block we pass to every `docker compose` invocation for the spin's project.
 * Centralises the port → env mapping so `up`, `down`, and `exec` agree on which variables get
 * substituted into `apps/api/docker-compose.yml`.
 *
 * @param {SpinMeta} meta
 * @returns {NodeJS.ProcessEnv}
 */
function composeEnv(meta) {
    return {
        ...process.env,
        COMPOSE_PROJECT_NAME: meta.composeProject,
        DB_PORT: String(meta.ports.db),
        PGADMIN_PORT: String(meta.ports.pgadmin),
        MAILPIT_SMTP_PORT: String(effectivePort(meta, "mailpitSmtp")),
        MAILPIT_WEB_PORT: String(effectivePort(meta, "mailpitWeb")),
        REDIS_PORT: String(effectivePort(meta, "redis")),
        REDISINSIGHT_PORT: String(effectivePort(meta, "redisinsight")),
        ADMINER_PORT: String(effectivePort(meta, "adminer")),
    };
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

    await startServer({
        name: "admin",
        meta,
        cmd: "pnpm",
        args: ["exec", "next", "dev", "-p", String(meta.ports.admin)],
        cwd: join(meta.worktreePath, "apps/admin"),
        env: { ...process.env, PORT: String(meta.ports.admin) },
    });

    if (opts.withWeb) {
        await startServer({
            name: "web",
            meta,
            cmd: "pnpm",
            args: ["exec", "next", "dev", "-p", String(meta.ports.web)],
            cwd: join(meta.worktreePath, "apps/web"),
            env: { ...process.env, PORT: String(meta.ports.web) },
        });
    }
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
    log(`  admin   ${cyan(`http://localhost:${meta.ports.admin}`)}`);
    log(`  api     ${cyan(`http://localhost:${meta.ports.api}`)}`);
    if (opts.withWeb) log(`  web     ${cyan(`http://localhost:${meta.ports.web}`)}`);
    log(`  pgadmin ${cyan(`http://localhost:${meta.ports.pgadmin}`)}`);
    const mailpitWebPort = effectivePort(meta, "mailpitWeb");
    const mailpitSmtpPort = effectivePort(meta, "mailpitSmtp");
    const redisPort = effectivePort(meta, "redis");
    const redisInsightPort = effectivePort(meta, "redisinsight");
    const adminerPort = effectivePort(meta, "adminer");
    log(`  mailpit ${cyan(`http://localhost:${mailpitWebPort}`)} (smtp :${mailpitSmtpPort})`);
    log(`  redis   ${cyan(`http://localhost:${redisInsightPort}`)} (insight UI; redis on :${redisPort})`);
    log(
        `  queue   ${cyan(`http://localhost:${adminerPort}/?pgsql=&server=host.docker.internal&port=${meta.ports.db}&username=calibra&db=calibra&select=queue_jobs`)}`,
    );
    log(`  pr      ${meta.prUrl ?? `(skipped — run pnpm spin pr ${meta.slug})`}`);
    log(`  login   ${cyan("admin@bulk.calibra.dev")} / ${cyan("Passw0rd1!")}`);
    log(`  stop    ${cyan(`pnpm spin stop ${meta.slug}`)}`);
}

/* -------------------------------------------------------------------------- */
/*  Teardown                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @param {SpinMeta} meta
 */
async function killTrackedProcesses(meta) {
    for (const name of ["api", "admin", "queue", "web"]) {
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
    const composeFile = join(meta.worktreePath, "apps/api/docker-compose.yml");
    if (!existsSync(composeFile)) {
        log(yellow("    compose file missing; skipping"));
        return;
    }
    const args = ["compose", "-f", composeFile, "down"];
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
 */

/**
 * @typedef {Object} SpinMeta
 * @property {string} slug
 * @property {string} branch
 * @property {string} composeProject
 * @property {string} worktreePath
 * @property {SpinPorts} ports
 * @property {string} [appKey]
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
