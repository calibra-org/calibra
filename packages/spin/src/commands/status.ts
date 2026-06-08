import type { Command } from "commander";

import { c } from "../colors";
import { readMetaOrFail } from "../core/meta";
import { buildSnapshot } from "../core/snapshot";
import { snapshotHasFailure } from "../core/snapshot-types";
import { setJsonMode } from "../log";

/**
 * Concise per-spin status: the run banner, up/down counts, and the headline URLs. The full
 * per-service breakdown is `doctor`. Same exit-code contract (2 when anything is down).
 */
export async function runStatus(slug: string, opts: { json?: boolean }): Promise<void> {
    if (opts.json) setJsonMode(true);
    const meta = await readMetaOrFail(slug);
    const snapshot = await buildSnapshot(meta);

    if (opts.json) {
        process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
        if (snapshotHasFailure(snapshot)) process.exit(2);
        return;
    }

    const up = snapshot.services.filter((s) => s.status === "up").length;
    const total = snapshot.services.length;
    const tenantsUp = snapshot.tenants.filter((t) => t.adminStatus === "up").length;

    process.stdout.write(`${c.cyan(`status ${snapshot.slug}`)} ${c.dim(`(${snapshot.branch})`)}\n`);
    if (snapshot.run.kind !== "none") {
        const colour = snapshot.run.kind === "failed" ? c.red : c.yellow;
        process.stdout.write(`  run        ${colour(snapshot.run.kind)}${snapshot.run.step ? ` — ${snapshot.run.step}` : ""}\n`);
    }
    process.stdout.write(`  services   ${up === total ? c.green(`${up}/${total} up`) : c.yellow(`${up}/${total} up`)}\n`);
    if (snapshot.tenants.length > 0) {
        const colour = tenantsUp === snapshot.tenants.length ? c.green : c.yellow;
        process.stdout.write(`  tenants    ${colour(`${tenantsUp}/${snapshot.tenants.length} reachable`)}\n`);
    }
    process.stdout.write(`  queue      ${snapshot.queueWorker.status === "up" ? c.green("up") : c.red("down")}\n`);
    process.stdout.write(`  dashboard  ${snapshot.dashboardUrl}\n`);

    if (snapshotHasFailure(snapshot)) process.exit(2);
}

export function registerStatus(program: Command): void {
    program
        .command("status")
        .alias("ps")
        .argument("<slug>", "sandbox slug")
        .description("concise status of a spin (exit 2 if any service/tenant is down)")
        .option("--json", "emit the raw snapshot JSON on stdout")
        .action(async (slug: string, opts: { json?: boolean }) => {
            await runStatus(slug, opts);
        });
}
