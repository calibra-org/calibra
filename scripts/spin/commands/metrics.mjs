// @ts-check

import { spawnSync } from "node:child_process";

import { requireSlug } from "../flags.mjs";
import { readMetaOrFail } from "../meta.mjs";

/**
 * `pnpm spin metrics <slug>` — print the api's `/metrics` body straight to stdout so an agent
 * can pipe it into `grep` / `awk` / `prometheus_client_python` without composing the URL by
 * hand. Returns exit 0 on a successful scrape, exit 2 on connection failure (api down).
 *
 * @param {string[]} args
 */
export async function metrics(args) {
    const slug = requireSlug(args[0]);
    const meta = await readMetaOrFail(slug);
    const target = `http://localhost:${meta.ports.api}/metrics`;
    const res = spawnSync("curl", ["-fsS", "--max-time", "5", target], { encoding: "utf8" });
    if (res.status !== 0) {
        process.stderr.write(`spin metrics: failed to scrape ${target} (${res.stderr.trim() || "no response"})\n`);
        process.exit(2);
    }
    process.stdout.write(res.stdout);
}
