import type { Command } from "commander";

import { capture } from "../core/exec";
import { readMetaOrFail } from "../core/meta";
import { requirePort } from "../core/ports";

/**
 * Query Prometheus `/api/v1/alerts` via the spin's Caddy host and dump the JSON to stdout (pipe
 * into jq). Exit 0 on success, **exit 2** on query failure — matching the agent contract.
 */
export async function runAlerts(slug: string): Promise<void> {
    const meta = await readMetaOrFail(slug);
    const caddyHttps = requirePort(meta, "caddyHttps");
    const host = `prom.${slug}.spin.localhost`;
    const target = `https://${host}:${caddyHttps}/api/v1/alerts`;
    const result = await capture("curl", [
        "-fsS",
        "--insecure",
        "--resolve",
        `${host}:${caddyHttps}:127.0.0.1`,
        "--max-time",
        "5",
        target,
    ]);
    if (result.exitCode !== 0) {
        process.stderr.write(`spin alerts: failed to query ${target} (${result.stderr.trim() || "no response"})\n`);
        process.exit(2);
    }
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) process.stdout.write("\n");
}

export function registerAlerts(program: Command): void {
    program
        .command("alerts")
        .argument("<slug>", "sandbox slug")
        .description("query Prometheus /api/v1/alerts via Caddy to stdout (exit 2 if down)")
        .action(async (slug: string) => {
            await runAlerts(slug);
        });
}
