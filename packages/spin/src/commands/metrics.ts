import type { Command } from "commander";

import { capture } from "../core/exec";
import { readMetaOrFail } from "../core/meta";

/**
 * Print the api's `/metrics` body to stdout so an agent can pipe it into grep/awk without composing
 * the URL. Exit 0 on a clean scrape, **exit 2** on connection failure (api down) — the agent contract.
 */
export async function runMetrics(slug: string): Promise<void> {
    const meta = await readMetaOrFail(slug);
    const target = `http://localhost:${meta.ports.api}/metrics`;
    const result = await capture("curl", ["-fsS", "--max-time", "5", target]);
    if (result.exitCode !== 0) {
        process.stderr.write(`spin metrics: failed to scrape ${target} (${result.stderr.trim() || "no response"})\n`);
        process.exit(2);
    }
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) process.stdout.write("\n");
}

export function registerMetrics(program: Command): void {
    program
        .command("metrics")
        .argument("<slug>", "sandbox slug")
        .description("scrape the api /metrics endpoint to stdout (exit 2 if down)")
        .action(async (slug: string) => {
            await runMetrics(slug);
        });
}
