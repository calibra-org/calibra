// @ts-check

import { spawnSync } from "node:child_process";

import { requireSlug } from "../flags.mjs";
import { readMetaOrFail } from "../meta.mjs";
import { requirePort } from "../ports.mjs";

/**
 * `pnpm spin alerts <slug>` — query Prometheus `/api/v1/alerts` via the spin's Caddy
 * hostname and dump the JSON. Same agent ergonomics as `metrics`: pipe straight into `jq`
 * to inspect what's firing without remembering the per-spin hostname.
 *
 * @param {string[]} args
 */
export async function alerts(args) {
    const slug = requireSlug(args[0]);
    const meta = await readMetaOrFail(slug);
    const caddyHttps = requirePort(meta, "caddyHttps");
    const target = `https://prom.${slug}.spin.localhost:${caddyHttps}/api/v1/alerts`;
    const res = spawnSync(
        "curl",
        ["-fsS", "--insecure", "--resolve", `prom.${slug}.spin.localhost:${caddyHttps}:127.0.0.1`, "--max-time", "5", target],
        { encoding: "utf8" },
    );
    if (res.status !== 0) {
        process.stderr.write(`spin alerts: failed to query ${target} (${res.stderr.trim() || "no response"})\n`);
        process.exit(2);
    }
    process.stdout.write(res.stdout);
    if (!res.stdout.endsWith("\n")) process.stdout.write("\n");
}
