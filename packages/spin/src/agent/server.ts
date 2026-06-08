import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serviceById } from "../core/catalog";
import { composeRestart, type ComposeOptions } from "../core/compose";
import { buildComposeOptions } from "../core/compose-assembly";
import { hostLogFile, restartHostProcess } from "../core/host-process";
import { type LogStream, readServiceLogTail, streamContainerLog, streamHostLog } from "../core/log-stream";
import { loadMetaOrFail, type SpinMeta } from "../core/meta";
import { spinLogDir } from "../core/paths";
import { buildSnapshot } from "../core/snapshot";
import { renderDashboardHtml } from "./page";

/**
 * The web-panel HTTP server. Bound to **127.0.0.1** (never 0.0.0.0) — it exposes destructive
 * actions (db reseed, migrate, container restart) and must not be reachable from the LAN. It loads
 * the spin's meta by slug and serves: the SSR shell, the bundled client, the live snapshot, SSE log
 * streams, SSE action streams, and the Caddy on-demand-TLS authorizer (`/api/caddy/ask`).
 */

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_JS_PATH = join(HERE, "client.js");

export interface AgentOptions {
    slug: string;
    port: number;
    host?: string;
}

function sseHeaders(res: ServerResponse): void {
    res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
    });
}

function sseSend(res: ServerResponse, event: string, data: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function serveClientAsset(pathname: string, res: ServerResponse): Promise<void> {
    const isMap = pathname.endsWith(".map");
    try {
        const body = await readFile(isMap ? `${CLIENT_JS_PATH}.map` : CLIENT_JS_PATH);
        res.setHeader("content-type", isMap ? "application/json" : "text/javascript; charset=utf-8");
        res.setHeader("cache-control", "no-cache");
        res.end(body);
    } catch {
        res.statusCode = 404;
        res.end("client bundle not built; run `pnpm --filter @calibra/spin build`");
    }
}

function startLogStream(meta: SpinMeta, compose: ComposeOptions, name: string, onLine: (line: string) => void): LogStream | null {
    if (name === "api.ndjson") {
        return streamHostLog(join(spinLogDir(meta.worktreePath), "api.ndjson"), onLine);
    }
    const service = serviceById(name);
    if (!service) return null;
    if (service.kind === "host") {
        return streamHostLog(hostLogFile(meta.worktreePath, name), onLine);
    }
    if (service.composeService) {
        return streamContainerLog(compose, service.composeService, onLine);
    }
    return null;
}

async function logTailFor(meta: SpinMeta, name: string, lines: number): Promise<string[]> {
    if (name === "api.ndjson") return readServiceLogTail(join(spinLogDir(meta.worktreePath), "api.ndjson"), lines);
    const service = serviceById(name);
    if (service?.kind === "host") return readServiceLogTail(hostLogFile(meta.worktreePath, name), lines);
    return [];
}

/** Spawn a command and stream its combined output to the SSE response, then a `done` event. */
function spawnToSse(res: ServerResponse, cmd: string, args: string[], cwd: string): void {
    sseHeaders(res);
    sseSend(res, "line", `$ ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
    let buffer = "";
    const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) sseSend(res, "line", line);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("close", (code) => {
        if (buffer.trim()) sseSend(res, "line", buffer);
        sseSend(res, "done", { ok: code === 0, code });
        res.end();
    });
    child.once("error", (err) => {
        sseSend(res, "done", { ok: false, error: String(err) });
        res.end();
    });
    res.on("close", () => {
        try {
            child.kill("SIGTERM");
        } catch {
            /* ignore */
        }
    });
}

async function handleAction(meta: SpinMeta, compose: ComposeOptions, action: string, service: string | null, res: ServerResponse): Promise<void> {
    const apiCwd = join(meta.worktreePath, "apps/api");
    if (action === "migrate") {
        spawnToSse(res, "node", ["ace", "migration:run", "--connection=postgres_admin"], apiCwd);
        return;
    }
    if (action === "reseed") {
        spawnToSse(res, "node", ["ace", "db:seed", "--connection=postgres_admin"], apiCwd);
        return;
    }
    if (action === "restart") {
        const def = service ? serviceById(service) : undefined;
        if (!def) {
            res.statusCode = 400;
            res.end(`unknown service "${service}"`);
            return;
        }
        if (def.kind === "container" && def.composeService) {
            sseHeaders(res);
            sseSend(res, "line", `restarting container ${def.composeService}…`);
            const result = await composeRestart(compose, [def.composeService]);
            if (result.output.trim()) sseSend(res, "line", result.output.trim());
            sseSend(res, "done", { ok: result.ok });
            res.end();
            return;
        }
        sseHeaders(res);
        sseSend(res, "line", `restarting host process ${service}…`);
        try {
            const result = await restartHostProcess(meta.worktreePath, service!);
            sseSend(res, "line", `restarted ${service} (pid ${result.pid})`);
            sseSend(res, "done", { ok: true });
        } catch (err) {
            sseSend(res, "done", { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
        res.end();
        return;
    }
    res.statusCode = 404;
    res.end(`unknown action "${action}"`);
}

async function handle(req: IncomingMessage, res: ServerResponse, opts: AgentOptions): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;

    if (path === "/") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(renderDashboardHtml({ slug: opts.slug }));
        return;
    }
    if (path === "/client.js" || path === "/client.js.map") {
        await serveClientAsset(path, res);
        return;
    }

    /**
     * Caddy on-demand-TLS authorizer. Caddy asks before minting a leaf for an ad-hoc tenant host;
     * we only authorize hosts inside this spin's domain so Caddy can't be tricked into issuing for
     * arbitrary names.
     */
    if (path === "/api/caddy/ask") {
        const domain = (url.searchParams.get("domain") ?? "").toLowerCase();
        const ok = domain === `${opts.slug}.spin.localhost` || domain.endsWith(`.${opts.slug}.spin.localhost`);
        res.statusCode = ok ? 200 : 403;
        res.end(ok ? "ok" : "denied");
        return;
    }

    const meta = await loadMetaOrFail(opts.slug);
    const compose = buildComposeOptions(meta);

    if (path === "/api/status") {
        const snapshot = await buildSnapshot(meta);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(snapshot));
        return;
    }

    const logMatch = path.match(/^\/api\/log\/([^/]+)\/stream$/);
    if (logMatch) {
        const name = decodeURIComponent(logMatch[1]!);
        sseHeaders(res);
        for (const line of await logTailFor(meta, name, 200)) sseSend(res, "line", line);
        const stream = startLogStream(meta, compose, name, (line) => sseSend(res, "line", line));
        if (!stream) {
            sseSend(res, "done", { ok: false, error: `unknown log stream "${name}"` });
            res.end();
            return;
        }
        const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
        res.on("close", () => {
            clearInterval(heartbeat);
            stream.stop();
        });
        return;
    }

    if (req.method === "POST" && path.startsWith("/api/actions/")) {
        const action = path.slice("/api/actions/".length);
        await handleAction(meta, compose, action, url.searchParams.get("service"), res);
        return;
    }

    res.statusCode = 404;
    res.end("not found");
}

export function startAgentServer(opts: AgentOptions) {
    const host = opts.host ?? "127.0.0.1";
    const server = createServer((req, res) => {
        handle(req, res, opts).catch((cause: unknown) => {
            if (!res.headersSent) res.statusCode = 500;
            res.end(`spin agent error: ${cause instanceof Error ? cause.message : String(cause)}`);
        });
    });
    server.listen(opts.port, host);
    return server;
}

function parseArgs(argv: string[]): AgentOptions {
    let slug = "local";
    let port = 0;
    let host: string | undefined;
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === "--slug") slug = argv[++i] ?? slug;
        else if (argv[i] === "--port") port = Number.parseInt(argv[++i] ?? "0", 10);
        else if (argv[i] === "--host") host = argv[++i];
    }
    return { slug, port, host };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url) || invokedPath.endsWith(join("agent", "server.js"))) {
    const opts = parseArgs(process.argv.slice(2));
    if (!opts.port) {
        process.stderr.write("spin agent: --port is required\n");
        process.exit(1);
    }
    startAgentServer(opts);
    process.stderr.write(`spin agent (v${pkg.version}) listening on http://${opts.host ?? "127.0.0.1"}:${opts.port} (slug=${opts.slug})\n`);
}
