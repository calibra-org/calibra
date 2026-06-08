import type { Command } from "commander";
import { c } from "../colors";
import { setJsonMode } from "../log";
import { listMeta } from "../core/meta";
import { isPortListening } from "../core/probes";
import { runActivity } from "../core/run-state";

type ListStatus = "running" | "partial" | "stopped" | "starting" | "interrupted" | "failed";

interface ListRow {
    slug: string;
    status: ListStatus;
    api: number;
    admin: number;
    pr: number | null;
    branch: string;
    composeProject: string;
}

/**
 * Cheap inventory of every persisted spin. Probes only the api + admin ports (so it stays fast)
 * and lets an in-flight run-state override the docker-ps inference — a provisioning spin reads as
 * `starting`, not `stopped`. Always exits 0 (it's an inventory, not a health gate).
 */
async function collectRows(): Promise<ListRow[]> {
    const metas = await listMeta();
    const rows = await Promise.all(
        metas.map(async (meta): Promise<ListRow> => {
            const [apiUp, adminUp, activity] = await Promise.all([
                isPortListening(meta.ports.api),
                isPortListening(meta.ports.admin),
                runActivity(meta.slug),
            ]);
            let status: ListStatus = apiUp && adminUp ? "running" : apiUp || adminUp ? "partial" : "stopped";
            if (activity.kind === "in-progress") status = "starting";
            else if (activity.kind === "interrupted") status = "interrupted";
            else if (activity.kind === "failed") status = "failed";
            return {
                slug: meta.slug,
                status,
                api: meta.ports.api,
                admin: meta.ports.admin,
                pr: meta.prNumber ?? null,
                branch: meta.branch,
                composeProject: meta.composeProject,
            };
        }),
    );
    return rows;
}

function colourStatus(status: ListStatus): string {
    if (status === "running") return c.green(status);
    if (status === "stopped") return c.dim(status);
    if (status === "failed") return c.red(status);
    return c.yellow(status);
}

export async function runList(opts: { json?: boolean }): Promise<void> {
    if (opts.json) setJsonMode(true);
    const rows = await collectRows();
    if (opts.json) {
        process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
        return;
    }
    if (rows.length === 0) {
        process.stdout.write("(no spins)\n");
        return;
    }
    const width = Math.max(...rows.map((row) => row.slug.length));
    for (const row of rows) {
        const pr = row.pr ? `#${row.pr}` : "—";
        process.stdout.write(`  ${row.slug.padEnd(width)}  ${colourStatus(row.status).padEnd(20)}  admin=${row.admin}  api=${row.api}  pr=${pr}\n`);
    }
}

export function registerList(program: Command): void {
    program
        .command("list")
        .alias("ls")
        .description("list every provisioned spin with status + ports")
        .option("--json", "emit machine-readable rows on stdout")
        .action(async (opts: { json?: boolean }) => {
            await runList(opts);
        });
}
