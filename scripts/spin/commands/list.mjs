// @ts-check

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseFlags } from "../flags.mjs";
import { green, log, yellow } from "../log.mjs";
import { STATE_DIR } from "../paths.mjs";
import { isPortListening } from "../probes.mjs";

/**
 * Print every spin slug currently provisioned, with status (running / stopped) and ports.
 *
 * @param {string[]} args
 */
export async function list(args) {
    const flags = parseFlags(args);
    const rows = await collectListRows();
    if (flags.json) {
        process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
        return;
    }
    if (rows.length === 0) {
        log("(no spins)");
        return;
    }
    const width = Math.max(...rows.map((r) => r.slug.length));
    for (const row of rows) {
        const statusColored =
            row.status === "running" ? green(row.status) : row.status === "partial" ? yellow(row.status) : row.status;
        const prLabel = row.pr ? `#${row.pr}` : "—";
        log(`  ${row.slug.padEnd(width)}  ${statusColored}  admin=${row.admin}  api=${row.api}  pr=${prLabel}`);
    }
}

/**
 * Collect machine-readable rows for every persisted spin. Used by both the human-facing
 * `list` rendering and the `--json` output that agents pipe into `jq`.
 *
 * @returns {Promise<Array<{slug: string, status: "running" | "partial" | "stopped", api: number, admin: number, pr: number | null, branch: string, composeProject: string}>>}
 */
export async function collectListRows() {
    if (!existsSync(STATE_DIR)) return [];
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(STATE_DIR);
    const rows = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const meta = JSON.parse(await readFile(join(STATE_DIR, entry), "utf8"));
        const apiUp = await isPortListening(meta.ports.api);
        const adminUp = await isPortListening(meta.ports.admin);
        const status = apiUp && adminUp ? "running" : apiUp || adminUp ? "partial" : "stopped";
        rows.push({
            slug: meta.slug,
            status,
            api: meta.ports.api,
            admin: meta.ports.admin,
            pr: meta.prNumber ?? null,
            branch: meta.branch ?? "(unknown)",
            composeProject: meta.composeProject ?? `calibra-spin-${meta.slug}`,
        });
    }
    return rows.sort((a, b) => a.slug.localeCompare(b.slug));
}
