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
    return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>spin · ${SLUG}</title>
<style>
* { box-sizing: border-box; }
:root {
    --bg: #0b0d10;
    --panel: #14181d;
    --panel-2: #1a1f26;
    --border: #232a33;
    --text: #e4e7eb;
    --muted: #8b95a3;
    --accent: #6ea8fe;
    --ok: #34d399;
    --warn: #fbbf24;
    --bad: #ef4444;
    --unknown: #6b7280;
}
body { margin: 0; padding: 24px; font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); }
.wrap { max-width: 1200px; margin: 0 auto; }
header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 24px; }
header h1 { font-size: 18px; margin: 0; font-weight: 600; }
header .slug { color: var(--muted); font-family: ui-monospace, SFMono-Regular, monospace; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
.panel h2 { margin: 0 0 12px; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.row { display: grid; grid-template-columns: auto 1fr auto auto; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.row:last-child { border-bottom: none; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--unknown); flex-shrink: 0; }
.dot.ok { background: var(--ok); }
.dot.bad { background: var(--bad); }
.dot.warn { background: var(--warn); }
.name { font-weight: 500; }
.url a { color: var(--accent); text-decoration: none; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; }
.url a:hover { text-decoration: underline; }
.port { color: var(--muted); font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; }
button { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; }
button:hover { border-color: var(--accent); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.actions { display: flex; gap: 8px; margin-top: 8px; }
.actions button.primary { background: var(--accent); color: #0b0d10; border-color: var(--accent); }
.actions button.danger { background: #2a1518; border-color: #5c2026; color: #fca5a5; }
#log { background: #06080a; border: 1px solid var(--border); border-radius: 6px; padding: 12px; height: 320px; overflow: auto; font: 11px/1.5 ui-monospace, SFMono-Regular, monospace; color: #a8b3c1; white-space: pre-wrap; }
.log-controls { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; align-items: center; }
.log-controls .sources { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
.log-controls .sources button.active { border-color: var(--accent); color: var(--accent); }
.log-controls .log-clear { background: transparent; border: none; color: var(--muted); padding: 4px 6px; font-size: 11px; opacity: 0.7; cursor: pointer; }
.log-controls .log-clear:hover { color: var(--text); opacity: 1; border: none; }
.log-controls .log-clear::before { content: '⌫ '; }
.toast { position: fixed; bottom: 20px; right: 20px; background: var(--panel-2); border: 1px solid var(--border); padding: 10px 14px; border-radius: 6px; font-size: 12px; max-width: 360px; opacity: 0; transform: translateY(8px); transition: opacity .2s, transform .2s; }
.toast.show { opacity: 1; transform: translateY(0); }
.toast.error { border-color: var(--bad); }
details.setup { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 0; margin-bottom: 16px; }
details.setup[open] summary { border-bottom: 1px solid var(--border); }
details.setup summary { padding: 12px 16px; cursor: pointer; font-size: 13px; color: var(--text); list-style: none; display: flex; align-items: center; gap: 10px; }
details.setup summary::-webkit-details-marker { display: none; }
details.setup summary::before { content: '▸'; color: var(--muted); transition: transform .15s; }
details.setup[open] summary::before { transform: rotate(90deg); }
details.setup summary .lock { color: var(--warn); font-weight: 600; }
.setup-body { padding: 16px 16px 12px 16px; font-size: 13px; line-height: 1.6; }
.setup-body h3 { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 16px 0 8px; }
.setup-body h3:first-child { margin-top: 0; }
.setup-body pre { background: #06080a; border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px; overflow-x: auto; margin: 6px 0 12px; font-size: 12px; line-height: 1.5; color: #c7d0db; position: relative; }
.setup-body code { background: var(--panel-2); padding: 2px 6px; border-radius: 3px; font-size: 12px; }
.setup-body .copy { position: absolute; top: 6px; right: 6px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 3px; padding: 2px 6px; font-size: 10px; cursor: pointer; color: var(--muted); }
.setup-body .copy:hover { color: var(--text); border-color: var(--accent); }
.setup-body a { color: var(--accent); }
.setup-tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.setup-tabs button { background: var(--panel-2); }
.setup-tabs button.active { border-color: var(--accent); color: var(--accent); }
.setup-pane { display: none; }
.setup-pane.active { display: block; }
.secret-row { display: grid; grid-template-columns: 120px 1fr auto; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.secret-row:last-child { border-bottom: none; }
.secret-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
.secret-value { background: #06080a; border: 1px solid var(--border); border-radius: 4px; padding: 6px 10px; font: 11px/1.4 ui-monospace, SFMono-Regular, monospace; color: var(--accent); overflow-x: auto; word-break: break-all; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; z-index: 1000; }
.modal-backdrop.show { display: flex; }
.modal { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px; max-width: 460px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.4); }
.modal h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; color: var(--text); }
.modal p { margin: 0 0 18px; font-size: 13px; line-height: 1.6; color: var(--muted); }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.modal-actions button { padding: 6px 14px; }
.modal-actions button.confirm { background: var(--accent); color: #0b0d10; border-color: var(--accent); }
.modal-actions button.danger { background: #2a1518; border-color: #5c2026; color: #fca5a5; }
button.danger { background: #2a1518; border-color: #5c2026; color: #fca5a5; }
</style>
</head>
<body>
<div class="wrap">
    <header>
        <h1>spin</h1>
        <span class="slug">${SLUG}</span>
        <span class="port" id="last-refresh"></span>
    </header>

    <details class="setup" id="trust-setup">
        <summary><span class="lock">🔒 first-time HTTPS setup —</span> trust Caddy's local CA so this page (and every <code>*.spin.localhost</code> URL) loads without a browser warning</summary>
        <div class="setup-body">
            <p>Caddy issues TLS certs from its own local CA. You need to install the root cert into your OS trust store <strong>once</strong> — after that every spin's certs are trusted automatically (they all chain to the same root). Pick your platform below.</p>

            <div class="setup-tabs">
                <button class="active" data-pane="wsl2">WSL2 + Windows browser</button>
                <button data-pane="linux">Linux native</button>
                <button data-pane="macos">macOS</button>
                <button data-pane="windows">Windows native</button>
            </div>

            <div class="setup-pane active" data-pane="wsl2">
                <p>This is the dev path where Caddy runs inside WSL2 but your browser is on Windows. Download the cert from this very page, then install it into Windows' trusted root store.</p>
                <h3>1. Download the cert</h3>
                <pre><button class="copy">copy</button>docker cp ${COMPOSE_PROJECT}-caddy-1:/data/caddy/pki/authorities/local/root.crt $(wslpath "$(cmd.exe /c 'echo %USERPROFILE%\\Downloads\\caddy-root.crt' 2>/dev/null)" | tr -d '\\r')</pre>
                <h3>2. Install it (PowerShell as Administrator)</h3>
                <pre><button class="copy">copy</button>Import-Certificate -FilePath "$env:USERPROFILE\\Downloads\\caddy-root.crt" -CertStoreLocation Cert:\\LocalMachine\\Root</pre>
                <p>You'll see a confirmation dialog with the subject <code>Caddy Local Authority - 20XX ECC Root</code> — click <strong>Yes</strong>.</p>
                <h3>3. Restart Chrome completely</h3>
                <p>Close every Chrome window. Open Task Manager (<kbd>Ctrl+Shift+Esc</kbd>) and end any leftover <code>chrome.exe</code> processes (Chrome runs a background host process by default). Then reopen Chrome and visit a spin URL — green lock 🔒.</p>
                <h3>4. Still seeing "Not secure"?</h3>
                <p>Chrome caches per-host bypass overrides. Clear them via <a href="chrome://net-internals/#hsts" target="_blank">chrome://net-internals/#hsts</a> → Delete domain security policies → enter <code>${SLUG}.spin.localhost</code> → Delete. Or open Incognito (<kbd>Ctrl+Shift+N</kbd>) as a clean test.</p>
            </div>

            <div class="setup-pane" data-pane="linux">
                <h3>Run on the host (sudo required)</h3>
                <pre><button class="copy">copy</button>sudo caddy trust</pre>
                <p>This pulls Caddy's local CA root and installs it into the system trust store (<code>/etc/ssl/certs</code>) plus the per-browser stores (Firefox / Chromium NSS db).</p>
                <p>If Caddy isn't installed on your host yet:</p>
                <pre><button class="copy">copy</button>sudo apt install -y caddy   # Debian / Ubuntu
sudo pacman -S caddy        # Arch
brew install caddy          # Linuxbrew</pre>
                <p>Restart your browser, visit any <code>*.spin.localhost</code> URL — green lock.</p>
            </div>

            <div class="setup-pane" data-pane="macos">
                <h3>Install Caddy + trust the root</h3>
                <pre><button class="copy">copy</button>brew install caddy
sudo caddy trust</pre>
                <p>This adds the cert to the System keychain. macOS Safari / Chrome / Firefox all pick it up automatically.</p>
                <h3>If Caddy is running in Docker only</h3>
                <p>Extract the root cert from the container and install via Keychain Access:</p>
                <pre><button class="copy">copy</button>docker cp ${COMPOSE_PROJECT}-caddy-1:/data/caddy/pki/authorities/local/root.crt ~/Downloads/caddy-root.crt
open ~/Downloads/caddy-root.crt</pre>
                <p>Keychain Access opens → drag the cert into the <strong>System</strong> keychain → double-click it → expand <strong>Trust</strong> → set <strong>When using this certificate</strong> to <strong>Always Trust</strong>.</p>
            </div>

            <div class="setup-pane" data-pane="windows">
                <h3>Install Caddy + trust the root (PowerShell as Administrator)</h3>
                <pre><button class="copy">copy</button>winget install caddy
caddy trust</pre>
                <p>Or, if Caddy is only inside Docker:</p>
                <pre><button class="copy">copy</button>docker cp ${COMPOSE_PROJECT}-caddy-1:/data/caddy/pki/authorities/local/root.crt $env:USERPROFILE\\Downloads\\caddy-root.crt
Import-Certificate -FilePath "$env:USERPROFILE\\Downloads\\caddy-root.crt" -CertStoreLocation Cert:\\LocalMachine\\Root</pre>
                <p>Restart Chrome / Edge after install — green lock on every <code>*.spin.localhost</code> URL.</p>
            </div>
        </div>
    </details>

    <div class="grid">
        <section class="panel" id="group-app"><h2>app</h2></section>
        <section class="panel" id="group-obs"><h2>observability</h2></section>
        <section class="panel" id="group-search"><h2>search</h2></section>
        <section class="panel" id="group-data"><h2>data + dev</h2></section>
    </div>

    <section class="panel" style="margin-top: 16px;">
        <h2>meilisearch credentials</h2>
        <div class="secret-row">
            <span class="secret-label">master key</span>
            <code class="secret-value" id="meili-key">—</code>
            <button data-copy-secret="meili-key">copy</button>
        </div>
        <div class="secret-row">
            <span class="secret-label">curl</span>
            <code class="secret-value" id="meili-curl">—</code>
            <button data-copy-secret="meili-curl">copy</button>
        </div>
    </section>

    <section class="panel" style="margin-top: 16px;">
        <h2>actions</h2>
        <div class="actions">
            <button class="primary" data-action="reseed" data-confirm="This drops every seeded row and reinserts a fresh demo dataset. Anything you've added since the last seed will be lost. Continue?">reseed db</button>
            <button data-action="migrate" data-confirm="Run all pending migrations against the spin's database. Continue?">migrate</button>
            <button class="danger" data-action="rollback" data-confirm="Rolls every migration back, then re-runs the full migration history. All data not covered by seeders is lost. Continue?">rollback + re-migrate</button>
            <button class="danger" id="open-stop-help">stop spin (see CLI)</button>
        </div>
    </section>

    <section class="panel" style="margin-top: 16px;">
        <h2>logs</h2>
        <div class="log-controls">
            <div class="sources">
                <button data-log="api.ndjson" class="active">api.ndjson</button>
                <button data-log="api">api.log</button>
                <button data-log="admin">admin</button>
                <button data-log="web">web</button>
                <button data-log="queue">queue</button>
                <button data-log="agent">agent</button>
            </div>
            <button id="log-clear" class="log-clear" title="clear log view">clear</button>
        </div>
        <pre id="log"></pre>
    </section>
</div>
<div class="toast" id="toast"></div>

<div class="modal-backdrop" id="confirm-modal">
    <div class="modal">
        <h3 id="confirm-title">Confirm action</h3>
        <p id="confirm-body">…</p>
        <div class="modal-actions">
            <button id="confirm-cancel">cancel</button>
            <button class="confirm" id="confirm-ok">continue</button>
        </div>
    </div>
</div>

<script>
const groups = { app: document.getElementById('group-app'), obs: document.getElementById('group-obs'), search: document.getElementById('group-search'), data: document.getElementById('group-data') };
const lastRefresh = document.getElementById('last-refresh');
const logEl = document.getElementById('log');
const toast = document.getElementById('toast');
let currentLogES = null;

function showToast(message, isError = false) {
    toast.textContent = message;
    toast.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => toast.className = 'toast', 3500);
}

function renderSecrets(secrets) {
    const keyEl = document.getElementById('meili-key');
    const curlEl = document.getElementById('meili-curl');
    if (!secrets || !secrets.meiliMasterKey) {
        keyEl.textContent = '(not provisioned for this spin)';
        curlEl.textContent = '';
        return;
    }
    keyEl.textContent = secrets.meiliMasterKey;
    const host = secrets.meiliPort ? \`http://localhost:\${secrets.meiliPort}\` : '';
    curlEl.textContent = host ? \`curl -H "Authorization: Bearer \${secrets.meiliMasterKey}" \${host}/keys\` : '';
}

function confirmDialog(title, body) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-body').textContent = body;
        const ok = document.getElementById('confirm-ok');
        const cancel = document.getElementById('confirm-cancel');
        const close = (result) => {
            modal.classList.remove('show');
            ok.removeEventListener('click', onOk);
            cancel.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKey);
            resolve(result);
        };
        const onOk = () => close(true);
        const onCancel = () => close(false);
        const onBackdrop = (e) => { if (e.target === modal) close(false); };
        const onKey = (e) => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); };
        ok.addEventListener('click', onOk);
        cancel.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey);
        modal.classList.add('show');
        ok.focus();
    });
}

async function refreshStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        renderSecrets(data.secrets);
        for (const key of Object.keys(groups)) {
            const heading = groups[key].querySelector('h2');
            groups[key].innerHTML = '';
            groups[key].appendChild(heading);
        }
        for (const svc of data.services) {
            const target = groups[svc.kind === 'infra' ? 'data' : svc.kind];
            if (!target) continue;
            const dotClass = svc.probe.healthy === true ? 'ok' : svc.probe.healthy === false ? 'bad' : '';
            const url = svc.caddyHost ? \`https://\${svc.caddyHost}:\${readMetaCaddyPort()}/\` : (svc.directPort ? \`http://localhost:\${svc.directPort}\` : '');
            const restartBtn = svc.container ? \`<button data-restart="\${svc.container}">restart</button>\` : '<span></span>';
            target.insertAdjacentHTML('beforeend', \`
                <div class="row">
                    <span class="dot \${dotClass}" title="\${svc.probe.statusCode ?? svc.probe.error ?? 'unknown'}"></span>
                    <div>
                        <div class="name">\${svc.name}</div>
                        <div class="url">\${url ? \`<a href="\${url}" target="_blank">\${url}</a>\` : ''}</div>
                    </div>
                    <span class="port">\${svc.directPort ? ':' + svc.directPort : ''}</span>
                    \${restartBtn}
                </div>
            \`);
        }
        lastRefresh.textContent = 'refreshed ' + new Date().toLocaleTimeString();
    } catch (err) {
        lastRefresh.textContent = 'refresh failed: ' + err.message;
    }
}

function readMetaCaddyPort() {
    /* The dashboard is itself fronted by Caddy, so window.location.port is the spin's
       Caddy HTTPS port — we read it back instead of hardcoding (which would mean every
       caddyHttps change required a redeploy). */
    return window.location.port || '443';
}

document.body.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const restartName = target.getAttribute('data-restart');
    if (restartName) {
        const proceed = await confirmDialog(
            \`Restart \${restartName}?\`,
            \`Stops and starts the \${restartName} container. In-flight requests against it will fail; expect ~5–30 s of downtime.\`,
        );
        if (!proceed) return;
        target.disabled = true;
        const original = target.textContent;
        target.textContent = 'restarting…';
        await streamAction('/api/actions/restart', { service: restartName }, \`restart \${restartName}\`);
        target.textContent = original;
        target.disabled = false;
        refreshStatus();
        return;
    }

    const action = target.getAttribute('data-action');
    if (action) {
        const message = target.getAttribute('data-confirm');
        if (message) {
            const proceed = await confirmDialog(\`Run \${action}?\`, message);
            if (!proceed) return;
        }
        target.disabled = true;
        await streamAction('/api/actions/' + action, {}, action);
        target.disabled = false;
        refreshStatus();
        return;
    }

    const copySecret = target.getAttribute('data-copy-secret');
    if (copySecret) {
        const el = document.getElementById(copySecret);
        const text = el ? el.textContent : '';
        try {
            await navigator.clipboard.writeText(text);
            const original = target.textContent;
            target.textContent = 'copied ✓';
            setTimeout(() => { target.textContent = original; }, 1500);
        } catch {
            showToast('clipboard write failed — copy manually', true);
        }
        return;
    }

    const logName = target.getAttribute('data-log');
    if (logName) {
        document.querySelectorAll('[data-log]').forEach(el => el.classList.remove('active'));
        target.classList.add('active');
        startLogStream(logName);
        return;
    }

    if (target.id === 'log-clear') {
        logEl.textContent = '';
        return;
    }

    if (target.id === 'open-stop-help') {
        showToast('Run "pnpm spin stop ${SLUG}" in your shell. Add --purge --remove to wipe volumes.');
    }
});

function streamAction(url, body, label) {
    return new Promise((resolve) => {
        logEl.textContent += '\\n— ' + label + ' —\\n';
        logEl.scrollTop = logEl.scrollHeight;
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then(async (res) => {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    /** Parse SSE events line-by-line. */
                    const events = buffer.split('\\n\\n');
                    buffer = events.pop() ?? '';
                    for (const block of events) {
                        const lines = block.split('\\n');
                        let event = 'message';
                        let data = '';
                        for (const line of lines) {
                            if (line.startsWith('event: ')) event = line.slice(7);
                            else if (line.startsWith('data: ')) data += line.slice(6);
                        }
                        if (event === 'end') {
                            const { code } = JSON.parse(data);
                            showToast(label + (code === 0 ? ' ✓' : ' failed (' + code + ')'), code !== 0);
                            resolve();
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            const text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
                            logEl.textContent += text + '\\n';
                            logEl.scrollTop = logEl.scrollHeight;
                        } catch { /* skip unparseable */ }
                    }
                }
                resolve();
            })
            .catch((err) => { showToast(label + ' failed: ' + err.message, true); resolve(); });
    });
}

function startLogStream(name) {
    if (currentLogES) currentLogES.close();
    logEl.textContent = '';
    const es = new EventSource('/api/log/' + name);
    currentLogES = es;
    es.onmessage = (e) => {
        try {
            const line = JSON.parse(e.data);
            logEl.textContent += line + '\\n';
            logEl.scrollTop = logEl.scrollHeight;
        } catch { /* skip */ }
    };
    es.onerror = () => { logEl.textContent += '\\n— stream ended —\\n'; };
}

document.querySelectorAll('.setup-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
        const pane = btn.getAttribute('data-pane');
        document.querySelectorAll('.setup-tabs button').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.setup-pane').forEach(p => p.classList.toggle('active', p.getAttribute('data-pane') === pane));
    });
});

document.querySelectorAll('.copy').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const pre = btn.parentElement;
        const text = pre.textContent.replace(/^copy\\s*/, '').trim();
        try {
            await navigator.clipboard.writeText(text);
            const original = btn.textContent;
            btn.textContent = 'copied ✓';
            setTimeout(() => { btn.textContent = original; }, 1500);
        } catch {
            showToast('clipboard write failed — copy manually', true);
        }
    });
});

refreshStatus();
setInterval(refreshStatus, 5000);
startLogStream('api.ndjson');
</script>
</body>
</html>`;
}
