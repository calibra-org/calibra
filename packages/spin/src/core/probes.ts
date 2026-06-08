import { connect } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { composeExec } from "./compose";
import { capture } from "./exec";
import { requirePort } from "./ports";
import type { ComposeOptions } from "./compose";
import type { SpinMeta } from "./meta";

/**
 * Health probes shared by the pipeline's readiness waits, the diagnostics commands, and the
 * snapshot. The tenant-aware variant ({@link probeTenantViaCaddy}) is the net-new piece that
 * closes calibra's multi-tenant blind spot: doctor sends a real tenant `Host` through Caddy, so a
 * broken cert-issuance / host-resolution / routing path fails the probe instead of passing green.
 */

/** Resolve when something is listening on the local TCP port (500ms budget). */
export function isPortListening(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = connect({ port, host: "127.0.0.1" });
        const finish = (listening: boolean) => {
            socket.destroy();
            resolve(listening);
        };
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
        socket.setTimeout(500, () => finish(false));
    });
}

async function curlStatus(args: string[]): Promise<number> {
    const result = await capture("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "3", ...args]);
    return Number.parseInt(result.stdout.trim(), 10) || 0;
}

/** Probe a directly-published HTTP endpoint (e.g. Meilisearch `/health` on its host port). */
export async function probeHttp(url: string, acceptStatus: number[] = [200, 204]): Promise<boolean> {
    return acceptStatus.includes(await curlStatus([url]));
}

function spinHost(meta: SpinMeta, subdomain: string): string {
    return subdomain === "" ? `${meta.slug}.spin.localhost` : `${subdomain}.${meta.slug}.spin.localhost`;
}

/**
 * Probe a service via its Caddy hostname. `--insecure` (the local CA may be untrusted in CI) +
 * `--resolve` so SNI + Host route to the right vhost. A failed cert handshake (Caddy couldn't mint
 * the leaf) or a bad route surfaces as a non-accepted status, which is exactly what we want.
 */
export async function probeViaCaddy(
    meta: SpinMeta,
    subdomain: string,
    path: string,
    acceptStatus: number[] = [200],
): Promise<boolean> {
    const caddyHttps = requirePort(meta, "caddyHttps");
    const host = spinHost(meta, subdomain);
    const status = await curlStatus([
        "--insecure",
        "--resolve",
        `${host}:${caddyHttps}:127.0.0.1`,
        `https://${host}:${caddyHttps}${path}`,
    ]);
    return acceptStatus.includes(status);
}

/**
 * Probe a per-tenant host (`<tenant>.<app>.<slug>.spin.localhost`) through Caddy. Catches
 * multi-tenant cert/route/host-resolution failure that an apex-only probe would miss.
 */
export async function probeTenantViaCaddy(
    meta: SpinMeta,
    tenantSlug: string,
    app: "admin" | "web",
    path = "/",
    acceptStatus: number[] = [200],
): Promise<boolean> {
    const caddyHttps = requirePort(meta, "caddyHttps");
    const host = `${tenantSlug}.${app}.${meta.slug}.spin.localhost`;
    const status = await curlStatus([
        "--insecure",
        "--resolve",
        `${host}:${caddyHttps}:127.0.0.1`,
        `https://${host}:${caddyHttps}${path}`,
    ]);
    return acceptStatus.includes(status);
}

/** Block until a TCP port answers, or throw with a clear "did not come up" error. */
export async function waitForPort(port: number, timeoutMs: number, label: string): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isPortListening(port)) return;
        await sleep(500);
    }
    throw new Error(`${label} (:${port}) did not come up within ${Math.round(timeoutMs / 1000)}s`);
}

/** Block until a directly-published HTTP endpoint answers an acceptable status. */
export async function waitForHttp(
    url: string,
    timeoutMs: number,
    label: string,
    acceptStatus: number[] = [200, 204],
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await probeHttp(url, acceptStatus)) return;
        await sleep(1000);
    }
    throw new Error(`${label} (${url}) did not respond within ${Math.round(timeoutMs / 1000)}s — check container logs`);
}

/** Block until a Caddy-fronted service answers — shares {@link probeViaCaddy} with the doctor probe. */
export async function waitForCaddyHttp(
    meta: SpinMeta,
    subdomain: string,
    path: string,
    timeoutMs: number,
    label: string,
    acceptStatus: number[] = [200],
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await probeViaCaddy(meta, subdomain, path, acceptStatus)) return;
        await sleep(1000);
    }
    throw new Error(
        `${label} did not respond on https://${spinHost(meta, subdomain)}${path} within ${Math.round(timeoutMs / 1000)}s`,
    );
}

/**
 * Block until Postgres accepts connections. A listening TCP port isn't enough to run migrations
 * against — `pg_isready` inside the container is the real readiness signal.
 */
export async function waitForPostgresReady(compose: ComposeOptions, port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isPortListening(port)) {
            const check = await composeExec(compose, "db", ["pg_isready", "-U", "calibra", "-d", "calibra"]);
            if (check.ok) return;
        }
        await sleep(1000);
    }
    throw new Error("postgres did not become ready within 60s");
}
