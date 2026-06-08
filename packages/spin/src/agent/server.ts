import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDashboardHtml } from "./page";
import type { StatusPayload } from "./types";

/**
 * Web-panel HTTP server. Bound to **127.0.0.1 by default** (never 0.0.0.0) because the
 * panel exposes destructive actions (db reseed, migrate, container restart) in later
 * phases and must not be reachable from the LAN. Runs as its own tsdown entry
 * (`dist/agent/server.js`) so the orchestration pipeline can spawn it as a host process
 * via `node dist/agent/server.js --slug <slug> --port <port>`.
 *
 * Phase 0 serves the SSR shell, the bundled client, and a stub `/api/status`; Phase 6
 * adds the snapshot feed, SSE log streams, and the action endpoints.
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

async function serveClientAsset(pathname: string, res: ServerResponse): Promise<void> {
    const isMap = pathname.endsWith(".map");
    const file = isMap ? `${CLIENT_JS_PATH}.map` : CLIENT_JS_PATH;
    try {
        const body = await readFile(file);
        res.setHeader("content-type", isMap ? "application/json" : "text/javascript; charset=utf-8");
        res.setHeader("cache-control", "no-cache");
        res.end(body);
    } catch {
        res.statusCode = 404;
        res.end("client bundle not built; run `pnpm --filter @calibra/spin build`");
    }
}

async function handle(req: IncomingMessage, res: ServerResponse, opts: AgentOptions): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(renderDashboardHtml({ slug: opts.slug }));
        return;
    }

    if (url.pathname === "/client.js" || url.pathname === "/client.js.map") {
        await serveClientAsset(url.pathname, res);
        return;
    }

    if (url.pathname === "/api/status") {
        const payload: StatusPayload = { slug: opts.slug, ok: true, phase: "scaffold", version: pkg.version };
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(payload));
        return;
    }

    res.statusCode = 404;
    res.end("not found");
}

/** Start the panel server. Returns the underlying http.Server so callers can close it. */
export function startAgentServer(opts: AgentOptions) {
    const host = opts.host ?? "127.0.0.1";
    const server = createServer((req, res) => {
        handle(req, res, opts).catch((cause: unknown) => {
            res.statusCode = 500;
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
        const arg = argv[i];
        if (arg === "--slug") slug = argv[++i] ?? slug;
        else if (arg === "--port") port = Number.parseInt(argv[++i] ?? "0", 10);
        else if (arg === "--host") host = argv[++i];
    }
    return { slug, port, host };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url) || invokedPath.endsWith(`${join("agent", "server.js")}`)) {
    const opts = parseArgs(process.argv.slice(2));
    if (!opts.port) {
        process.stderr.write("spin agent: --port is required\n");
        process.exit(1);
    }
    startAgentServer(opts);
    process.stderr.write(`spin agent listening on http://${opts.host ?? "127.0.0.1"}:${opts.port} (slug=${opts.slug})\n`);
}
