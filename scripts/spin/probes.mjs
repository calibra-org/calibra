// @ts-check

import { spawnSync } from "node:child_process";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { requirePort } from "./ports.mjs";

/**
 * @param {number} port
 */
export function isPortListening(port) {
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

/**
 * Probe a service via its Caddy hostname. Returns true on any of the acceptable status codes
 * (default 200). Uses `--insecure` because Caddy's internal CA only chains to root after
 * `caddy trust`; doctor should still succeed on a machine that hasn't run that yet — the
 * status code is what matters, not the cert chain.
 *
 * @param {import("./meta.mjs").SpinMeta} meta
 * @param {string} subdomain
 * @param {string} path
 * @param {number[]} [acceptStatus]
 * @returns {Promise<boolean>}
 */
export async function probeViaCaddy(meta, subdomain, path, acceptStatus = [200]) {
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
 * Block until a TCP port answers, or throw with a clear "did not come up" error.
 *
 * @param {number} port
 * @param {number} timeoutMs
 * @param {string} label
 */
export async function waitForPort(port, timeoutMs, label) {
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
export async function waitForHttp(url, timeoutMs, label, opts = {}) {
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
 * Block until a Caddy-fronted service answers an acceptable status. Sharing implementation
 * with {@link probeViaCaddy} (the doctor probe) so the readiness loop and the per-spin
 * status report behave identically — a service that satisfies one satisfies the other.
 *
 * @param {import("./meta.mjs").SpinMeta} meta
 * @param {string} subdomain
 * @param {string} path
 * @param {number} timeoutMs
 * @param {string} label
 * @param {{ acceptStatus?: number[] }} [opts]
 */
export async function waitForCaddyHttp(meta, subdomain, path, timeoutMs, label, opts = {}) {
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
