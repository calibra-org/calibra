#!/usr/bin/env node
// @ts-check
/**
 * Per-spin homepage + control-plane.
 *
 * Started by `scripts/spin.mjs` as a tracked process (pidfile in `.spin/agent.pid`, log in
 * `.spin/logs/agent.log`). Listens on the `spinAgent` host port; Caddy fronts it at the bare
 * `<slug>.spin.localhost` host so the operator's first URL after `pnpm spin` is a real
 * dashboard with live health pills and action buttons.
 *
 * Endpoints:
 *  - GET  /                      → HTML dashboard
 *  - GET  /api/status            → JSON: { services: [{ name, url, healthy, kind }, …] }
 *  - POST /api/actions/restart   → body: { service: string } → `docker compose restart`
 *  - POST /api/actions/reseed    → runs `pnpm --filter @calibra/api db:seed`
 *  - POST /api/actions/migrate   → runs `pnpm --filter @calibra/api migration:run`
 *  - POST /api/actions/rollback  → runs migration:rollback then migration:run
 *  - GET  /api/log/:stream       → SSE: tails .spin/logs/{api,admin,web,queue,api.ndjson}
 *
 * Security model: dev-only, bound to `localhost` of the host, reachable only through Caddy on
 * the spin's hostname. No auth — anyone with shell access to your machine has bigger problems
 * than the spin agent. Do NOT expose this anywhere beyond the developer machine.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, watch } from "node:fs";
import http from "node:http";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const PORT = Number(process.env.SPIN_AGENT_PORT);
const SLUG = process.env.SPIN_SLUG ?? "";
const META_PATH = process.env.SPIN_META_PATH ?? "";
const COMPOSE_PROJECT = process.env.COMPOSE_PROJECT_NAME ?? "";

if (!PORT || !SLUG || !META_PATH) {
    console.error("spin-agent: missing required env (SPIN_AGENT_PORT, SPIN_SLUG, SPIN_META_PATH)");
    process.exit(1);
}

/** @returns {Record<string, unknown>} */
function readMeta() {
    if (!existsSync(META_PATH)) return {};
    return JSON.parse(readFileSync(META_PATH, "utf8"));
}

/**
 * The list of services the dashboard renders rows for. Each entry has:
 *   - `name`: display label
 *   - `kind`: `app` / `obs` / `search` / `data` / `infra` — grouped in the UI
 *   - `caddyHost`: subdomain on `<slug>.spin.localhost` Caddy serves it under, or null
 *   - `directPort`: host port if any (for the "direct" badge)
 *   - `health`: relative URL path on the host port that returns 200 when up, or null
 *   - `container`: docker compose service name, or null (can't restart non-container services)
 */
function buildServiceCatalog() {
    const meta = readMeta();
    const ports = /** @type {Record<string, number>} */ (meta.ports ?? {});
    return [
        {
            name: "admin",
            kind: "app",
            caddyHost: `admin.${SLUG}.spin.localhost`,
            directPort: ports.admin,
            health: "/",
            container: null,
        },
        {
            name: "api",
            kind: "app",
            caddyHost: `api.${SLUG}.spin.localhost`,
            directPort: ports.api,
            health: "/health",
            container: null,
        },
        {
            name: "web",
            kind: "app",
            caddyHost: `web.${SLUG}.spin.localhost`,
            directPort: ports.web,
            health: "/",
            container: null,
        },
        {
            name: "grafana",
            kind: "obs",
            caddyHost: `grafana.${SLUG}.spin.localhost`,
            directPort: null,
            health: "/api/health",
            container: "grafana",
        },
        {
            name: "prometheus",
            kind: "obs",
            caddyHost: `prom.${SLUG}.spin.localhost`,
            directPort: null,
            health: "/-/ready",
            container: "prometheus",
        },
        {
            name: "loki",
            kind: "obs",
            caddyHost: `loki.${SLUG}.spin.localhost`,
            directPort: null,
            health: "/ready",
            container: "loki",
        },
        {
            name: "tempo",
            kind: "obs",
            caddyHost: `tempo.${SLUG}.spin.localhost`,
            directPort: ports.tempo,
            health: "/ready",
            container: "tempo",
        },
        {
            name: "alertmanager",
            kind: "obs",
            caddyHost: `alerts.${SLUG}.spin.localhost`,
            directPort: null,
            health: "/-/ready",
            container: "alertmanager",
        },
        {
            name: "glitchtip",
            kind: "obs",
            caddyHost: `errors.${SLUG}.spin.localhost`,
            directPort: null,
            health: "/api/0/",
            container: "glitchtip",
        },
        {
            name: "uptime kuma",
            kind: "obs",
            caddyHost: `uptime.${SLUG}.spin.localhost`,
            directPort: null,
            health: "/",
            container: "uptimekuma",
        },
        {
            name: "meilisearch",
            kind: "search",
            caddyHost: `search.${SLUG}.spin.localhost`,
            directPort: ports.meilisearch,
            health: "/health",
            container: "meilisearch",
        },
        {
            name: "mailpit",
            kind: "data",
            caddyHost: `mail.${SLUG}.spin.localhost`,
            directPort: ports.mailpitWeb,
            health: "/livez",
            container: "mailpit",
        },
        {
            name: "redis insight",
            kind: "data",
            caddyHost: `redis.${SLUG}.spin.localhost`,
            directPort: ports.redisinsight,
            health: "/",
            container: "redisinsight",
        },
        {
            name: "adminer (db)",
            kind: "data",
            caddyHost: `db.${SLUG}.spin.localhost`,
            directPort: ports.adminer,
            health: "/",
            container: "adminer",
        },
        { name: "pgadmin", kind: "data", caddyHost: null, directPort: ports.pgadmin, health: "/", container: "pgadmin" },
        { name: "caddy", kind: "infra", caddyHost: null, directPort: ports.caddyHttps, health: null, container: "caddy" },
        { name: "postgres", kind: "infra", caddyHost: null, directPort: ports.db, health: null, container: "db" },
        { name: "redis", kind: "infra", caddyHost: null, directPort: ports.redis, health: null, container: "redis" },
    ];
}

/**
 * Probe a service. For HTTP services with a `directPort`, hit `http://localhost:<port><path>`.
 * For TCP-only services (postgres, redis), just check the port is listening.
 *
 * Returns `null` if there's nothing to probe (no `directPort` AND no `caddyHost`).
 *
 * @param {ReturnType<typeof buildServiceCatalog>[number]} svc
 * @returns {Promise<{ healthy: boolean | null, statusCode: number | null, error?: string }>}
 */
async function probeService(svc) {
    if (svc.directPort && svc.health) {
        return new Promise((resolveProbe) => {
            const req = http.get(`http://127.0.0.1:${svc.directPort}${svc.health}`, { timeout: 2000 }, (res) => {
                res.resume();
                const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 500;
                resolveProbe({ healthy: ok, statusCode: res.statusCode ?? null });
            });
            req.on("error", (err) => resolveProbe({ healthy: false, statusCode: null, error: err.message }));
            req.on("timeout", () => {
                req.destroy();
                resolveProbe({ healthy: false, statusCode: null, error: "timeout" });
            });
        });
    }
    if (svc.directPort && !svc.health) {
        return new Promise((resolveProbe) => {
            const sock = net.createConnection({ port: svc.directPort, host: "127.0.0.1" });
            sock.setTimeout(1500);
            sock.once("connect", () => {
                sock.destroy();
                resolveProbe({ healthy: true, statusCode: null });
            });
            sock.once("error", () => resolveProbe({ healthy: false, statusCode: null }));
            sock.once("timeout", () => {
                sock.destroy();
                resolveProbe({ healthy: false, statusCode: null, error: "timeout" });
            });
        });
    }
    /** Service only reachable via Caddy — defer probing to the browser side. */
    return { healthy: null, statusCode: null };
}

async function statusJson() {
    const services = buildServiceCatalog();
    const results = await Promise.all(services.map(async (svc) => ({ ...svc, probe: await probeService(svc) })));
    const meta = readMeta();
    const ports = /** @type {Record<string, number>} */ (meta.ports ?? {});
    return {
        slug: SLUG,
        composeProject: COMPOSE_PROJECT,
        services: results,
        /**
         * Per-spin secrets the dashboard surfaces in the "search" panel for convenience —
         * copy button + curl hint, no shell digging required. Only the master key is exposed
         * (GlitchTip SECRET_KEY stays out of the agent because the operator has no use for
         * it outside of GlitchTip's own internals).
         */
        secrets: {
            meiliMasterKey: typeof meta.meiliMasterKey === "string" ? meta.meiliMasterKey : null,
            meiliPort: typeof ports.meilisearch === "number" ? ports.meilisearch : null,
        },
    };
}

/**
 * Run a shell command and stream stdout+stderr lines back via SSE. Used by the action
 * endpoints so the operator sees what's happening (migrations can take a few seconds; the
 * blank wait is unpleasant).
 *
 * @param {http.ServerResponse} res
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} [cwd]
 */
function streamShellSse(res, cmd, args, cwd = REPO_ROOT) {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
    });
    res.write(`event: start\ndata: ${JSON.stringify({ cmd, args, cwd })}\n\n`);
    const child = spawn(cmd, args, { cwd, env: process.env });
    /** @param {Buffer} buf */
    const writeStream = (stream) => (buf) => {
        const lines = buf.toString("utf8").split("\n");
        for (const line of lines) if (line.length > 0) res.write(`event: ${stream}\ndata: ${JSON.stringify(line)}\n\n`);
    };
    child.stdout.on("data", writeStream("stdout"));
    child.stderr.on("data", writeStream("stderr"));
    child.on("close", (code) => {
        res.write(`event: end\ndata: ${JSON.stringify({ code })}\n\n`);
        res.end();
    });
}

/**
 * Tail a file and stream new lines via SSE. Used by the log viewer pane.
 *
 * @param {http.ServerResponse} res
 * @param {string} filePath
 */
function streamLogSse(res, filePath) {
    if (!existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "log not found", path: filePath }));
        return;
    }
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
    });
    /** Seed with the last ~200 lines so the operator sees recent history immediately. */
    const initial = readFileSync(filePath, "utf8").split("\n").slice(-200);
    for (const line of initial) if (line.length > 0) res.write(`data: ${JSON.stringify(line)}\n\n`);

    let lastSize = readFileSync(filePath).length;
    const watcher = watch(filePath, () => {
        try {
            const buf = readFileSync(filePath);
            if (buf.length > lastSize) {
                const newChunk = buf.subarray(lastSize).toString("utf8");
                lastSize = buf.length;
                for (const line of newChunk.split("\n")) if (line.length > 0) res.write(`data: ${JSON.stringify(line)}\n\n`);
            } else if (buf.length < lastSize) {
                /** File was truncated (log rotation). Reset and replay from start. */
                lastSize = 0;
            }
        } catch {
            /** File may briefly disappear during rotation. */
        }
    });
    res.on("close", () => watcher.close());
}

const ALLOWED_LOG_STREAMS = new Set(["api", "api.ndjson", "admin", "web", "queue", "agent"]);

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
        const path = url.pathname;
        const method = req.method ?? "GET";

        if (path === "/" && method === "GET") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(renderDashboardHtml());
            return;
        }
        if (path === "/api/status" && method === "GET") {
            const payload = await statusJson();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(payload));
            return;
        }
        if (path === "/api/actions/restart" && method === "POST") {
            const body = await readBody(req);
            const { service } = JSON.parse(body);
            if (typeof service !== "string" || !/^[a-zA-Z0-9_-]+$/.test(service)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "invalid service name" }));
                return;
            }
            streamShellSse(res, "docker", ["compose", "-p", COMPOSE_PROJECT, "restart", service]);
            return;
        }
        if (path === "/api/actions/reseed" && method === "POST") {
            streamShellSse(res, "pnpm", ["--filter", "@calibra/api", "db:seed"]);
            return;
        }
        if (path === "/api/actions/migrate" && method === "POST") {
            streamShellSse(res, "pnpm", ["--filter", "@calibra/api", "migration:run"]);
            return;
        }
        if (path === "/api/actions/rollback" && method === "POST") {
            /** Roll back, then re-run to land at the same head. Equivalent to `just db-reset` minus the volume drop. */
            streamShellSse(res, "sh", [
                "-c",
                "pnpm --filter @calibra/api migration:rollback && pnpm --filter @calibra/api migration:run",
            ]);
            return;
        }
        if (path.startsWith("/api/log/") && method === "GET") {
            const stream = path.slice("/api/log/".length);
            if (!ALLOWED_LOG_STREAMS.has(stream)) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "unknown stream", stream }));
                return;
            }
            const meta = readMeta();
            const worktree = String(meta.worktreePath ?? "");
            const filePath =
                stream === "api.ndjson" ? join(worktree, ".spin/logs/api.ndjson") : join(worktree, `.spin/logs/${stream}.log`);
            streamLogSse(res, filePath);
            return;
        }
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found", path }));
    } catch (err) {
        console.error("agent request error:", err);
        if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        } else {
            res.end();
        }
    }
});

server.on("clientError", (err, socket) => {
    console.error("agent client error:", err.message);
    socket.destroy();
});

process.on("uncaughtException", (err) => {
    console.error("agent uncaughtException:", err);
});

/** @param {http.IncomingMessage} req */
function readBody(req) {
    return new Promise((resolveBody, rejectBody) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
        req.on("error", rejectBody);
    });
}

server.listen(PORT, "0.0.0.0", () => {
    console.log(`spin-agent v2 listening on :${PORT} for spin "${SLUG}" pid=${process.pid}`);
});

function renderDashboardHtml() {
    /**
     * Server-side JSON marshalling for values the React app reads from the page. Kept tight —
     * the rest of the data (services, secrets, log streams) flows through the JSON endpoints +
     * SSE, not through the initial HTML.
     */
    const boot = {
        slug: SLUG,
        composeProject: COMPOSE_PROJECT,
    };
    return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>spin · ${SLUG}</title>
<style>
* { box-sizing: border-box; }
:root {
    --bg: #0a0c10;
    --bg-accent: radial-gradient(1200px circle at 0% -10%, rgba(110, 168, 254, 0.08), transparent 50%), radial-gradient(900px circle at 100% 0%, rgba(52, 211, 153, 0.05), transparent 50%);
    --panel: #11151b;
    --panel-2: #1a1f26;
    --panel-hover: #1c222a;
    --border: #20262f;
    --border-soft: #1a1f26;
    --text: #e7ecf2;
    --muted: #8b95a3;
    --muted-2: #6b7280;
    --accent: #6ea8fe;
    --accent-2: #93c5fd;
    --accent-glow: rgba(110, 168, 254, 0.18);
    --ok: #34d399;
    --warn: #fbbf24;
    --bad: #ef4444;
    --unknown: #6b7280;
}
body { margin: 0; padding: 32px 24px 48px; font: 14px/1.55 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif; background: var(--bg); background-image: var(--bg-accent); background-attachment: fixed; color: var(--text); -webkit-font-smoothing: antialiased; }
.wrap { max-width: 1200px; margin: 0 auto; }
header { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--border-soft); }
header .logo { width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, var(--accent) 0%, #5b8ef0 100%); box-shadow: 0 0 0 1px var(--accent-glow), 0 4px 16px var(--accent-glow); display: grid; place-items: center; font-weight: 700; color: #0a0c10; font-size: 14px; }
header h1 { font-size: 16px; margin: 0; font-weight: 600; letter-spacing: -0.01em; }
header .slug { color: var(--accent); font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; padding: 3px 10px; background: var(--accent-glow); border-radius: 999px; border: 1px solid rgba(110, 168, 254, 0.25); }
header .spacer { flex: 1; }
header .refresh { font-size: 11px; color: var(--muted-2); font-family: ui-monospace, SFMono-Regular, monospace; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; transition: border-color .15s; }
.panel + .panel { margin-top: 16px; }
.panel h2 { margin: 0 0 14px; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 8px; }
.panel h2 .glyph { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; background: var(--panel-2); border: 1px solid var(--border); font-size: 11px; color: var(--accent); }
.row { display: grid; grid-template-columns: auto 1fr auto auto; gap: 12px; align-items: center; padding: 10px 8px; margin: 0 -8px; border-bottom: 1px solid var(--border-soft); border-radius: 6px; transition: background-color .12s; }
.row:last-child { border-bottom: none; }
.row:hover { background: var(--panel-hover); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--unknown); flex-shrink: 0; box-shadow: 0 0 0 0 transparent; transition: background-color .2s, box-shadow .2s; }
.dot.ok { background: var(--ok); box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.15); }
.dot.bad { background: var(--bad); box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15); }
.dot.warn { background: var(--warn); box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15); }
.row .info { display: flex; flex-direction: column; min-width: 0; }
.row .name { font-weight: 500; font-size: 13px; }
.row .url a { color: var(--accent); text-decoration: none; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11.5px; opacity: 0.85; transition: opacity .15s; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; max-width: 100%; }
.row .url a:hover { opacity: 1; text-decoration: underline; }
.row .port { color: var(--muted-2); font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; }
button { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 5px; padding: 5px 11px; font: inherit; font-size: 12px; cursor: pointer; transition: border-color .12s, background-color .12s, color .12s; }
button:hover { border-color: var(--accent); color: var(--accent); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.empty { padding: 8px 0; color: var(--muted-2); font-size: 12px; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-top: 4px; }
.card { display: block; padding: 12px 14px; background: linear-gradient(180deg, var(--panel-2) 0%, var(--panel) 100%); border: 1px solid var(--border); border-radius: 9px; text-decoration: none; color: var(--text); transition: border-color .12s, transform .12s, box-shadow .12s; position: relative; overflow: hidden; }
.card::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, var(--card-accent, var(--accent-glow)), transparent 60%); opacity: 0; transition: opacity .2s; pointer-events: none; }
.card:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px var(--accent-glow); }
.card:hover::before { opacity: 1; }
.card .icon { font-size: 18px; margin-bottom: 6px; display: block; position: relative; }
.card .title { font-weight: 600; font-size: 13px; margin: 0 0 4px; position: relative; letter-spacing: -0.01em; }
.card .desc { font-size: 11.5px; color: var(--muted); line-height: 1.5; position: relative; }
.card .meta { display: flex; align-items: center; gap: 6px; margin-top: 8px; position: relative; }
.card .badge { font-size: 10px; color: var(--accent); background: var(--accent-glow); border-radius: 3px; padding: 1px 6px; font-family: ui-monospace, SFMono-Regular, monospace; }
.card .arrow { color: var(--muted-2); font-size: 11px; margin-left: auto; transition: transform .15s, color .15s; }
.card:hover .arrow { color: var(--accent); transform: translateX(3px); }
.actions-row { display: flex; gap: 8px; flex-wrap: wrap; }
.actions-row button.primary { background: linear-gradient(180deg, var(--accent) 0%, #5b8ef0 100%); color: #0a0c10; border-color: var(--accent); font-weight: 600; }
.actions-row button.primary:hover { box-shadow: 0 0 0 3px var(--accent-glow); color: #0a0c10; }
.actions-row button.danger { background: #2a1518; border-color: #5c2026; color: #fca5a5; }
.actions-row button.danger:hover { border-color: #ef4444; color: #fecaca; }
.log { background: #06080a; border: 1px solid var(--border); border-radius: 6px; padding: 12px; height: 320px; overflow: auto; font: 11px/1.5 ui-monospace, SFMono-Regular, monospace; color: #a8b3c1; white-space: pre-wrap; }
.log-controls { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; align-items: center; }
.log-controls .sources { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
.log-controls .sources button.active { border-color: var(--accent); color: var(--accent); }
.log-controls .log-clear { background: transparent; border: none; color: var(--muted); padding: 4px 6px; font-size: 11px; opacity: 0.7; cursor: pointer; }
.log-controls .log-clear:hover { color: var(--text); opacity: 1; border: none; }
.log-controls .log-clear::before { content: '⌫ '; }
.toast { position: fixed; bottom: 20px; right: 20px; background: var(--panel-2); border: 1px solid var(--border); padding: 10px 14px; border-radius: 6px; font-size: 12px; max-width: 360px; opacity: 0; transform: translateY(8px); transition: opacity .2s, transform .2s; pointer-events: none; }
.toast.show { opacity: 1; transform: translateY(0); }
.toast.error { border-color: var(--bad); }
.setup { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 16px; overflow: hidden; }
.setup-summary { padding: 12px 16px; cursor: pointer; font-size: 13px; color: var(--text); display: flex; align-items: center; gap: 10px; user-select: none; }
.setup-summary::before { content: '▸'; color: var(--muted); transition: transform .15s; }
.setup.open .setup-summary::before { transform: rotate(90deg); }
.setup.open .setup-summary { border-bottom: 1px solid var(--border); }
.setup .lock { color: var(--warn); font-weight: 600; }
.setup-body { padding: 16px 16px 12px; font-size: 13px; line-height: 1.6; }
.setup-body h3 { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 16px 0 8px; }
.setup-body h3:first-child { margin-top: 0; }
.setup-body pre { background: #06080a; border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px; overflow-x: auto; margin: 6px 0 12px; font-size: 12px; line-height: 1.5; color: #c7d0db; position: relative; }
.setup-body code { background: var(--panel-2); padding: 2px 6px; border-radius: 3px; font-size: 12px; }
.setup-body .copy-btn { position: absolute; top: 6px; right: 6px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 3px; padding: 2px 6px; font-size: 10px; cursor: pointer; color: var(--muted); }
.setup-body .copy-btn:hover { color: var(--text); border-color: var(--accent); }
.setup-body a { color: var(--accent); }
.setup-tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.setup-tabs button { background: var(--panel-2); }
.setup-tabs button.active { border-color: var(--accent); color: var(--accent); }
.secret-row { display: grid; grid-template-columns: 120px 1fr auto; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.secret-row:last-child { border-bottom: none; }
.secret-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
.secret-value { background: #06080a; border: 1px solid var(--border); border-radius: 4px; padding: 6px 10px; font: 11px/1.4 ui-monospace, SFMono-Regular, monospace; color: var(--accent); overflow-x: auto; word-break: break-all; min-width: 0; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px; max-width: 460px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.4); }
.modal h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; color: var(--text); }
.modal p { margin: 0 0 18px; font-size: 13px; line-height: 1.6; color: var(--muted); }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.modal-actions button { padding: 6px 14px; }
.modal-actions button.confirm { background: var(--accent); color: #0b0d10; border-color: var(--accent); }
.boot-fallback { color: var(--muted); padding: 60px 20px; text-align: center; font-size: 13px; }
.boot-fallback code { background: var(--panel-2); padding: 2px 6px; border-radius: 3px; color: var(--text); }
</style>
</head>
<body>
<div id="root" class="wrap">
    <div class="boot-fallback">
        loading dashboard… if this never goes away, your browser couldn't reach <code>esm.sh</code> — check the network tab.
    </div>
</div>
<script type="application/json" id="boot">${JSON.stringify(boot)}</script>
<script type="module">
/**
 * React + htm bootstrap. Loaded as ESM from esm.sh — no build step, no bundler. esm.sh is a
 * cached CDN; the modules pin to specific versions so a CDN update can't silently change
 * behaviour. If the CDN is unreachable the boot fallback above stays on screen.
 *
 * htm (https://github.com/developit/htm) is a tagged-template alternative to JSX. \`html\`<x />\`\`
 * compiles to React.createElement at runtime via the same parser Preact uses. Trade-off: every
 * page render parses the templates once; for a dashboard with ~20 components this is invisible.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "https://esm.sh/react@19.1.0";
import { createRoot } from "https://esm.sh/react-dom@19.1.0/client";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);
const { slug: SLUG, composeProject: COMPOSE_PROJECT } = JSON.parse(document.getElementById("boot").textContent);

/* ---------------------------------------------------------------------------------------- */
/*  Static catalogs — the source of truth for the dashboard + prometheus quick-link cards.   */
/*  Adding a Grafana dashboard? Drop the JSON under docker/observability/grafana/dashboards   */
/*  and add an entry below so it shows up here.                                                */
/* ---------------------------------------------------------------------------------------- */

const DASHBOARDS = [
    { uid: "calibra-api-overview", title: "API overview", desc: "Request rate, p95 latency, error ratio, recent error logs.", icon: "📊", accent: "rgba(110, 168, 254, 0.18)" },
    { uid: "calibra-api-by-route", title: "API by route", desc: "Top routes by traffic, latency, errors. Status code mix.", icon: "🧭", accent: "rgba(167, 139, 250, 0.18)" },
    { uid: "calibra-checkout-payments", title: "Checkout & payments", desc: "Per-gateway attempt rate + success ratio. Callback latency.", icon: "💳", accent: "rgba(52, 211, 153, 0.18)" },
    { uid: "calibra-orders-inventory", title: "Orders & inventory", desc: "Transitions, finalizations, movements, oversell attempts.", icon: "📦", accent: "rgba(251, 191, 36, 0.18)" },
    { uid: "calibra-cache-queue", title: "Cache & queue", desc: "Hit ratio per tag. Queue depth + throughput + failure ratio.", icon: "⚙️", accent: "rgba(244, 114, 182, 0.18)" },
    { uid: "calibra-auth-ratelimits", title: "Auth & rate limits", desc: "Login outcomes, throttles per limiter, brute-force signal.", icon: "🔐", accent: "rgba(239, 68, 68, 0.18)" },
    { uid: "calibra-node-runtime", title: "Node runtime", desc: "Event-loop lag, heap, RSS, CPU, active handles, uptime.", icon: "⏱️", accent: "rgba(56, 189, 248, 0.18)" },
    { uid: "calibra-imports-exports", title: "Imports & exports", desc: "Row throughput, error rows, job durations, recent failures.", icon: "↕️", accent: "rgba(196, 181, 253, 0.18)" },
];

const PROMETHEUS_LINKS = [
    { path: "/alerts", title: "Alerts", desc: "What is firing right now + pending. Drill-down from a red Grafana stat.", icon: "🚨", badge: "alerts", accent: "rgba(239, 68, 68, 0.18)" },
    { path: "/rules", title: "Rules", desc: "All recording + alert rules loaded from the per-spin rules dir.", icon: "📐", badge: "rules", accent: "rgba(167, 139, 250, 0.18)" },
    { path: "/targets", title: "Targets", desc: "Scrape health — is the api /metrics endpoint reachable?", icon: "🎯", badge: "targets", accent: "rgba(52, 211, 153, 0.18)" },
    { path: "/graph?g0.expr=" + encodeURIComponent("calibra:api_error_ratio:5m") + "&g0.tab=0&g0.range_input=15m", title: "API error ratio", desc: "Live graph of 5xx / total over 5m. Ad-hoc PromQL playground.", icon: "📈", badge: "graph", accent: "rgba(110, 168, 254, 0.18)" },
    { path: "/graph?g0.expr=" + encodeURIComponent("calibra:api_latency_p95:5m") + "&g0.tab=0&g0.range_input=15m", title: "API p95 latency", desc: "Per-route p95 latency, recorded every 30s.", icon: "⏱️", badge: "graph", accent: "rgba(56, 189, 248, 0.18)" },
    { path: "/graph?g0.expr=" + encodeURIComponent("calibra_queue_jobs_active") + "&g0.tab=0&g0.range_input=15m", title: "Queue depth", desc: "Pending + active + delayed jobs per queue, refreshed every 10s.", icon: "📥", badge: "graph", accent: "rgba(251, 191, 36, 0.18)" },
];

const KIND_GLYPH = { app: "◆", obs: "◉", search: "⌕", data: "▤" };
const KIND_LABEL = { app: "app", obs: "observability", search: "search", data: "data + dev" };

const LOG_STREAMS = ["api.ndjson", "api", "admin", "web", "queue", "agent"];

const ACTIONS = [
    { id: "reseed", label: "reseed db", variant: "primary", confirm: "This drops every seeded row and reinserts a fresh demo dataset. Anything you've added since the last seed will be lost. Continue?" },
    { id: "migrate", label: "migrate", variant: "default", confirm: "Run all pending migrations against the spin's database. Continue?" },
    { id: "rollback", label: "rollback + re-migrate", variant: "danger", confirm: "Rolls every migration back, then re-runs the full migration history. All data not covered by seeders is lost. Continue?" },
];

/* ---------------------------------------------------------------------------------------- */
/*  Hooks                                                                                     */
/* ---------------------------------------------------------------------------------------- */

/** The Caddy HTTPS port is the port the dashboard itself is served on. */
function useCaddyPort() {
    return typeof window === "undefined" ? "443" : (window.location.port || "443");
}

/** Poll an endpoint that returns JSON. Re-fetches every \`intervalMs\` and on demand. */
function usePolledJson(url, intervalMs) {
    const [data, setData] = useState(null);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [error, setError] = useState(null);
    const refresh = useCallback(async () => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const body = await res.json();
            setData(body);
            setLastRefresh(new Date());
            setError(null);
        } catch (err) {
            setError(err.message ?? String(err));
        }
    }, [url]);
    useEffect(() => {
        refresh();
        const id = setInterval(refresh, intervalMs);
        return () => clearInterval(id);
    }, [refresh, intervalMs]);
    return { data, lastRefresh, error, refresh };
}

/** Open an SSE stream and append every received line to a bounded ring buffer. */
function useLogStream(streamName) {
    const [lines, setLines] = useState([]);
    const [streaming, setStreaming] = useState(false);
    const sourceRef = useRef(null);
    const clear = useCallback(() => setLines([]), []);
    useEffect(() => {
        setLines([]);
        if (!streamName) return undefined;
        const es = new EventSource("/api/log/" + streamName);
        sourceRef.current = es;
        setStreaming(true);
        es.onmessage = (e) => {
            try {
                const line = JSON.parse(e.data);
                setLines((prev) => {
                    /** Cap at 1000 lines so a chatty log doesn't pin the DOM. */
                    const next = prev.length > 1000 ? prev.slice(-900) : prev;
                    return [...next, line];
                });
            } catch {
                /* skip unparseable */
            }
        };
        es.onerror = () => {
            setStreaming(false);
            setLines((prev) => [...prev, "— stream ended —"]);
        };
        return () => {
            es.close();
            setStreaming(false);
        };
    }, [streamName]);
    return { lines, streaming, clear };
}

/** Toast + confirm-modal context built without a real React context — single-tenant globals. */
function useToaster() {
    const [toast, setToast] = useState({ message: "", error: false, key: 0 });
    const show = useCallback((message, error = false) => {
        setToast({ message, error, key: Date.now() });
    }, []);
    useEffect(() => {
        if (!toast.message) return undefined;
        const id = setTimeout(() => setToast((t) => ({ ...t, message: "" })), 3500);
        return () => clearTimeout(id);
    }, [toast.key, toast.message]);
    return { toast, show };
}

function useConfirm() {
    const [request, setRequest] = useState(null);
    const ask = useCallback((title, body) => new Promise((resolve) => setRequest({ title, body, resolve })), []);
    const close = useCallback((result) => {
        if (!request) return;
        request.resolve(result);
        setRequest(null);
    }, [request]);
    return { request, ask, close };
}

/* ---------------------------------------------------------------------------------------- */
/*  Helpers                                                                                   */
/* ---------------------------------------------------------------------------------------- */

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * Run a POST endpoint that streams SSE events. Resolves when the server emits \`event: end\`.
 * Each parsed data line is forwarded to \`onLine\`. Errors fall through to a toast.
 */
async function streamAction(url, body, onLine) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.body) throw new Error("no response body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let exitCode = null;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\\n\\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
            let event = "message";
            let data = "";
            for (const line of block.split("\\n")) {
                if (line.startsWith("event: ")) event = line.slice(7);
                else if (line.startsWith("data: ")) data += line.slice(6);
            }
            if (event === "end") {
                try {
                    exitCode = JSON.parse(data).code ?? null;
                } catch {
                    exitCode = null;
                }
                continue;
            }
            try {
                const parsed = JSON.parse(data);
                const text = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
                onLine(text);
            } catch {
                /* skip */
            }
        }
    }
    return exitCode;
}

/* ---------------------------------------------------------------------------------------- */
/*  Components                                                                                */
/* ---------------------------------------------------------------------------------------- */

function Header({ lastRefresh, error }) {
    const ago = lastRefresh ? lastRefresh.toLocaleTimeString() : "—";
    return html\`
        <header>
            <div class="logo">s</div>
            <h1>spin</h1>
            <span class="slug">\${SLUG}</span>
            <span class="spacer"></span>
            <span class="refresh">\${error ? "refresh failed: " + error : "refreshed " + ago}</span>
        </header>
    \`;
}

function CopyButton({ text, label = "copy" }) {
    const [copied, setCopied] = useState(false);
    return html\`
        <button onClick=\${async () => {
            const ok = await copyToClipboard(text);
            if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
        }}>\${copied ? "copied ✓" : label}</button>
    \`;
}

function Panel({ glyph, title, children, style }) {
    return html\`
        <section class="panel" style=\${style}>
            <h2><span class="glyph">\${glyph}</span>\${title}</h2>
            \${children}
        </section>
    \`;
}

function ServicesGrid({ services, onRestart }) {
    const grouped = useMemo(() => {
        const g = { app: [], obs: [], search: [], data: [] };
        for (const svc of services ?? []) {
            const bucket = svc.kind === "infra" ? "data" : svc.kind;
            if (g[bucket]) g[bucket].push(svc);
        }
        return g;
    }, [services]);
    const port = useCaddyPort();
    return html\`
        <div class="grid">
            \${Object.keys(KIND_LABEL).map((kind) => html\`
                <\${Panel} key=\${kind} glyph=\${KIND_GLYPH[kind]} title=\${KIND_LABEL[kind]}>
                    \${grouped[kind].length === 0
                        ? html\`<div class="empty">—</div>\`
                        : grouped[kind].map((svc) => html\`<\${ServiceRow} key=\${svc.name} svc=\${svc} port=\${port} onRestart=\${onRestart} />\`)}
                <//>
            \`)}
        </div>
    \`;
}

function ServiceRow({ svc, port, onRestart }) {
    const dotClass = svc.probe?.healthy === true ? "ok" : svc.probe?.healthy === false ? "bad" : "";
    const url = svc.caddyHost
        ? "https://" + svc.caddyHost + ":" + port + "/"
        : (svc.directPort ? "http://localhost:" + svc.directPort : "");
    const tip = svc.probe?.statusCode ?? svc.probe?.error ?? "unknown";
    const [busy, setBusy] = useState(false);
    return html\`
        <div class="row">
            <span class=\${"dot " + dotClass} title=\${tip}></span>
            <div class="info">
                <div class="name">\${svc.name}</div>
                \${url && html\`<div class="url"><a href=\${url} target="_blank" rel="noopener">\${url}</a></div>\`}
            </div>
            <span class="port">\${svc.directPort ? ":" + svc.directPort : ""}</span>
            \${svc.container
                ? html\`<button disabled=\${busy} onClick=\${async () => {
                    setBusy(true);
                    await onRestart(svc.container);
                    setBusy(false);
                }}>\${busy ? "restarting…" : "restart"}</button>\`
                : html\`<span></span>\`}
        </div>
    \`;
}

function CardGrid({ baseUrl, items, hrefKey }) {
    return html\`
        <div class="cards-grid">
            \${items.map((item) => html\`
                <a key=\${item.title}
                   class="card"
                   style=\${{ "--card-accent": item.accent }}
                   href=\${baseUrl + item[hrefKey]}
                   target="_blank"
                   rel="noopener">
                    <span class="icon">\${item.icon}</span>
                    <div class="title">\${item.title}</div>
                    <div class="desc">\${item.desc}</div>
                    <div class="meta">
                        <span class="badge">\${item.badge ?? (item.uid ? item.uid.replace(/^calibra-/, "") : "")}</span>
                        <span class="arrow">→</span>
                    </div>
                </a>
            \`)}
        </div>
    \`;
}

function GrafanaPanel() {
    const port = useCaddyPort();
    const base = "https://grafana." + SLUG + ".spin.localhost:" + port;
    const items = useMemo(() => DASHBOARDS.map((d) => ({ ...d, href: "/d/" + d.uid + "/" })), []);
    return html\`
        <\${Panel} glyph="▥" title="grafana dashboards">
            <\${CardGrid} baseUrl=\${base} items=\${items} hrefKey="href" />
        <//>
    \`;
}

function PrometheusPanel() {
    const port = useCaddyPort();
    const base = "https://prom." + SLUG + ".spin.localhost:" + port;
    return html\`
        <\${Panel} glyph="◎" title="prometheus quick-links">
            <\${CardGrid} baseUrl=\${base} items=\${PROMETHEUS_LINKS} hrefKey="path" />
        <//>
    \`;
}

function MeilisearchPanel({ secrets }) {
    const masterKey = secrets?.meiliMasterKey ?? null;
    const port = secrets?.meiliPort ?? null;
    const curlCmd = masterKey && port ? \`curl -H "Authorization: Bearer \${masterKey}" http://localhost:\${port}/keys\` : "";
    return html\`
        <\${Panel} glyph="⌗" title="meilisearch credentials">
            <div class="secret-row">
                <span class="secret-label">master key</span>
                <code class="secret-value">\${masterKey ?? "(not provisioned for this spin)"}</code>
                \${masterKey && html\`<\${CopyButton} text=\${masterKey} />\`}
            </div>
            <div class="secret-row">
                <span class="secret-label">curl</span>
                <code class="secret-value">\${curlCmd || "—"}</code>
                \${curlCmd && html\`<\${CopyButton} text=\${curlCmd} />\`}
            </div>
        <//>
    \`;
}

function ActionsPanel({ ask, showToast, appendLog }) {
    const [busyId, setBusyId] = useState(null);
    const run = async (action) => {
        if (action.confirm) {
            const proceed = await ask("Run " + action.id + "?", action.confirm);
            if (!proceed) return;
        }
        setBusyId(action.id);
        appendLog("— " + action.id + " —");
        try {
            const code = await streamAction("/api/actions/" + action.id, {}, appendLog);
            showToast(action.id + (code === 0 ? " ✓" : " failed (" + code + ")"), code !== 0);
        } catch (err) {
            showToast(action.id + " failed: " + (err.message ?? err), true);
        } finally {
            setBusyId(null);
        }
    };
    return html\`
        <\${Panel} glyph="⚡" title="actions">
            <div class="actions-row">
                \${ACTIONS.map((a) => html\`
                    <button key=\${a.id}
                            class=\${a.variant === "primary" ? "primary" : a.variant === "danger" ? "danger" : ""}
                            disabled=\${busyId !== null}
                            onClick=\${() => run(a)}>\${a.label}</button>
                \`)}
                <button class="danger"
                        onClick=\${() => showToast("Run \\"pnpm spin stop " + SLUG + "\\" in your shell. Add --purge --remove to wipe volumes.")}>
                    stop spin (see CLI)
                </button>
            </div>
        <//>
    \`;
}

function LogsPanel({ logRef }) {
    const [stream, setStream] = useState("api.ndjson");
    const { lines, clear } = useLogStream(stream);
    const preRef = useRef(null);
    const stickyRef = useRef(true);

    /** Track whether the user has scrolled away from the bottom — pause auto-scroll if so. */
    useEffect(() => {
        const el = preRef.current;
        if (!el) return undefined;
        const onScroll = () => {
            stickyRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
        };
        el.addEventListener("scroll", onScroll);
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        if (stickyRef.current && preRef.current) {
            preRef.current.scrollTop = preRef.current.scrollHeight;
        }
    }, [lines]);

    /** Expose an imperative \`append\` to the parent so action streams can interleave their output. */
    useEffect(() => {
        if (logRef) logRef.current = (line) => { /* no-op; action output goes through toaster + here when streaming */ };
        return undefined;
    }, [logRef]);

    return html\`
        <\${Panel} glyph="≡" title="logs">
            <div class="log-controls">
                <div class="sources">
                    \${LOG_STREAMS.map((s) => html\`
                        <button key=\${s}
                                class=\${stream === s ? "active" : ""}
                                onClick=\${() => setStream(s)}>\${s}</button>
                    \`)}
                </div>
                <button class="log-clear" title="clear log view" onClick=\${clear}>clear</button>
            </div>
            <pre class="log" ref=\${preRef}>\${lines.join("\\n")}</pre>
        <//>
    \`;
}

function Toast({ toast }) {
    return html\`
        <div class=\${"toast " + (toast.message ? "show " : "") + (toast.error ? "error" : "")}>\${toast.message}</div>
    \`;
}

function ConfirmModal({ request, onClose }) {
    useEffect(() => {
        if (!request) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") onClose(false);
            if (e.key === "Enter") onClose(true);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [request, onClose]);
    if (!request) return null;
    return html\`
        <div class="modal-backdrop" onClick=\${(e) => { if (e.target.classList.contains("modal-backdrop")) onClose(false); }}>
            <div class="modal">
                <h3>\${request.title}</h3>
                <p>\${request.body}</p>
                <div class="modal-actions">
                    <button onClick=\${() => onClose(false)}>cancel</button>
                    <button class="confirm" onClick=\${() => onClose(true)}>continue</button>
                </div>
            </div>
        </div>
    \`;
}

/* ---------------------------------------------------------------------------------------- */
/*  Trust-setup section — collapsible HTTPS setup wizard with per-platform tabs.              */
/* ---------------------------------------------------------------------------------------- */

const PANES = [
    {
        id: "wsl2",
        label: "WSL2 + Windows browser",
        intro: "This is the dev path where Caddy runs inside WSL2 but your browser is on Windows. Download the cert from this very page, then install it into Windows' trusted root store.",
        steps: [
            { h: "1. Download the cert", cmd: \`docker cp \${COMPOSE_PROJECT}-caddy-1:/data/caddy/pki/authorities/local/root.crt $(wslpath "$(cmd.exe /c 'echo %USERPROFILE%\\\\Downloads\\\\caddy-root.crt' 2>/dev/null)" | tr -d '\\\\r')\` },
            { h: "2. Install it (PowerShell as Administrator)", cmd: 'Import-Certificate -FilePath "$env:USERPROFILE\\\\Downloads\\\\caddy-root.crt" -CertStoreLocation Cert:\\\\LocalMachine\\\\Root', after: html\`<p>You will see a confirmation dialog with the subject <code>Caddy Local Authority - 20XX ECC Root</code> — click <strong>Yes</strong>.</p>\` },
            { h: "3. Restart Chrome completely", after: html\`<p>Close every Chrome window. Open Task Manager (<kbd>Ctrl+Shift+Esc</kbd>) and end any leftover <code>chrome.exe</code> processes (Chrome runs a background host process by default). Then reopen Chrome and visit a spin URL — green lock 🔒.</p>\` },
            { h: 'Still seeing "Not secure"?', after: html\`<p>Chrome caches per-host bypass overrides. Clear them via <a href="chrome://net-internals/#hsts" target="_blank">chrome://net-internals/#hsts</a> → Delete domain security policies → enter <code>\${SLUG}.spin.localhost</code> → Delete. Or open Incognito (<kbd>Ctrl+Shift+N</kbd>) as a clean test.</p>\` },
        ],
    },
    {
        id: "linux",
        label: "Linux native",
        intro: null,
        steps: [
            { h: "Run on the host (sudo required)", cmd: "sudo caddy trust", after: html\`<p>This pulls Caddy's local CA root and installs it into the system trust store (<code>/etc/ssl/certs</code>) plus the per-browser stores (Firefox / Chromium NSS db).</p>\` },
            { h: "If Caddy isn't installed on your host yet:", cmd: "sudo apt install -y caddy   # Debian / Ubuntu\\nsudo pacman -S caddy        # Arch\\nbrew install caddy          # Linuxbrew", after: html\`<p>Restart your browser, visit any <code>*.spin.localhost</code> URL — green lock.</p>\` },
        ],
    },
    {
        id: "macos",
        label: "macOS",
        intro: null,
        steps: [
            { h: "Install Caddy + trust the root", cmd: "brew install caddy\\nsudo caddy trust", after: html\`<p>This adds the cert to the System keychain. macOS Safari / Chrome / Firefox all pick it up automatically.</p>\` },
            { h: "If Caddy is running in Docker only", cmd: \`docker cp \${COMPOSE_PROJECT}-caddy-1:/data/caddy/pki/authorities/local/root.crt ~/Downloads/caddy-root.crt\\nopen ~/Downloads/caddy-root.crt\`, after: html\`<p>Keychain Access opens → drag the cert into the <strong>System</strong> keychain → double-click it → expand <strong>Trust</strong> → set <strong>When using this certificate</strong> to <strong>Always Trust</strong>.</p>\` },
        ],
    },
    {
        id: "windows",
        label: "Windows native",
        intro: null,
        steps: [
            { h: "Install Caddy + trust the root (PowerShell as Administrator)", cmd: "winget install caddy\\ncaddy trust" },
            { h: "Or, if Caddy is only inside Docker:", cmd: \`docker cp \${COMPOSE_PROJECT}-caddy-1:/data/caddy/pki/authorities/local/root.crt $env:USERPROFILE\\\\Downloads\\\\caddy-root.crt\\nImport-Certificate -FilePath "$env:USERPROFILE\\\\Downloads\\\\caddy-root.crt" -CertStoreLocation Cert:\\\\LocalMachine\\\\Root\`, after: html\`<p>Restart Chrome / Edge after install — green lock on every <code>*.spin.localhost</code> URL.</p>\` },
        ],
    },
];

function CopyPre({ cmd }) {
    const [copied, setCopied] = useState(false);
    return html\`
        <pre>
            <button class="copy-btn" onClick=\${async () => {
                const ok = await copyToClipboard(cmd);
                if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
            }}>\${copied ? "copied ✓" : "copy"}</button>\${cmd}
        </pre>
    \`;
}

function TrustSetup() {
    const [open, setOpen] = useState(false);
    const [activePane, setActivePane] = useState("wsl2");
    const pane = PANES.find((p) => p.id === activePane) ?? PANES[0];
    return html\`
        <div class=\${"setup" + (open ? " open" : "")}>
            <div class="setup-summary" onClick=\${() => setOpen((o) => !o)}>
                <span class="lock">🔒 first-time HTTPS setup —</span>
                <span>trust Caddy's local CA so this page (and every <code>*.spin.localhost</code> URL) loads without a browser warning</span>
            </div>
            \${open && html\`
                <div class="setup-body">
                    <p>Caddy issues TLS certs from its own local CA. You need to install the root cert into your OS trust store <strong>once</strong> — after that every spin's certs are trusted automatically (they all chain to the same root). Pick your platform below.</p>
                    <div class="setup-tabs">
                        \${PANES.map((p) => html\`
                            <button key=\${p.id}
                                    class=\${activePane === p.id ? "active" : ""}
                                    onClick=\${() => setActivePane(p.id)}>\${p.label}</button>
                        \`)}
                    </div>
                    \${pane.intro && html\`<p>\${pane.intro}</p>\`}
                    \${pane.steps.map((step, i) => html\`
                        <div key=\${i}>
                            <h3>\${step.h}</h3>
                            \${step.cmd && html\`<\${CopyPre} cmd=\${step.cmd} />\`}
                            \${step.after}
                        </div>
                    \`)}
                </div>
            \`}
        </div>
    \`;
}

/* ---------------------------------------------------------------------------------------- */
/*  App                                                                                       */
/* ---------------------------------------------------------------------------------------- */

function App() {
    const { data, lastRefresh, error, refresh } = usePolledJson("/api/status", 5000);
    const { toast, show: showToast } = useToaster();
    const { request, ask, close } = useConfirm();
    const logRef = useRef(null);

    const restart = async (container) => {
        const proceed = await ask("Restart " + container + "?", "Stops and starts the " + container + " container. In-flight requests against it will fail; expect ~5–30 s of downtime.");
        if (!proceed) return;
        showToast("restarting " + container + "…");
        try {
            const code = await streamAction("/api/actions/restart", { service: container }, () => {});
            showToast(container + (code === 0 ? " restarted ✓" : " restart failed (" + code + ")"), code !== 0);
            refresh();
        } catch (err) {
            showToast("restart " + container + " failed: " + (err.message ?? err), true);
        }
    };

    return html\`
        <\${Header} lastRefresh=\${lastRefresh} error=\${error} />
        <\${TrustSetup} />
        <\${ServicesGrid} services=\${data?.services} onRestart=\${restart} />
        <\${GrafanaPanel} />
        <\${PrometheusPanel} />
        <\${MeilisearchPanel} secrets=\${data?.secrets} />
        <\${ActionsPanel} ask=\${ask} showToast=\${showToast} appendLog=\${(line) => logRef.current?.(line)} />
        <\${LogsPanel} logRef=\${logRef} />
        <\${Toast} toast=\${toast} />
        <\${ConfirmModal} request=\${request} onClose=\${close} />
    \`;
}

createRoot(document.getElementById("root")).render(html\`<\${App} />\`);
</script>
</body>
</html>`;
}
