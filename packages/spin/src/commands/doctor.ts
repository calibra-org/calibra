import type { Command } from "commander";
import { c } from "../colors";
import { setJsonMode } from "../log";
import { readMetaOrFail } from "../core/meta";
import { buildSnapshot } from "../core/snapshot";
import { type SandboxSnapshot, snapshotHasFailure } from "../core/snapshot-types";

/**
 * Full probed status of one spin: every service + each seeded tenant's admin reachability + the
 * queue worker + run-state. Exit code follows the agent contract: **2 when anything is down**
 * (the semantics the legacy doctor lacked), 0 when all green. `--json` emits the raw snapshot.
 */
export async function runDoctor(slug: string, opts: { json?: boolean }): Promise<void> {
    if (opts.json) setJsonMode(true);
    const meta = await readMetaOrFail(slug);
    const snapshot = await buildSnapshot(meta);

    if (opts.json) {
        process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    } else {
        renderDoctor(snapshot);
    }
    if (snapshotHasFailure(snapshot)) process.exit(2);
}

function dot(status: string): string {
    if (status === "up") return c.green("●");
    if (status === "down") return c.red("●");
    return c.yellow("●");
}

function renderDoctor(s: SandboxSnapshot): void {
    process.stdout.write(`${c.cyan(`doctor ${s.slug}`)}\n`);
    process.stdout.write(`  worktree     ${s.worktreePath} ${s.worktreeExists ? c.green("✓") : c.red("✗ missing")}\n`);
    process.stdout.write(`  branch       ${s.branch}\n`);
    process.stdout.write(`  dashboard    ${s.dashboardUrl}\n`);
    if (s.run.kind !== "none") {
        const colour = s.run.kind === "failed" ? c.red : c.yellow;
        process.stdout.write(`  run          ${colour(s.run.kind)}${s.run.step ? ` — ${s.run.step}` : ""}${s.run.error ? ` (${s.run.error})` : ""}\n`);
    }
    for (const service of s.services) {
        process.stdout.write(`  ${dot(service.status)} ${service.id.padEnd(16)} ${service.url ?? ""}${service.note ? c.dim(` ${service.note}`) : ""}\n`);
    }
    if (s.tenants.length > 0) {
        process.stdout.write(`  ${c.bold("tenants")}\n`);
        for (const tenant of s.tenants) {
            process.stdout.write(`  ${dot(tenant.adminStatus)} ${tenant.slug.padEnd(16)} ${tenant.adminUrl}\n`);
        }
    }
    process.stdout.write(`  ${dot(s.queueWorker.status)} ${"queue".padEnd(16)} pid=${s.queueWorker.pid ?? "—"}\n`);
    process.stdout.write(`  PR           ${s.pr ? `#${s.pr}` : "—"}\n`);
    if (s.legacyDevUi) process.stdout.write(`  ${c.yellow("(legacy shared dev-ui ports — pre-spin layout)")}\n`);
    if (!s.glitchtipDsn) process.stdout.write(`  ${c.yellow("glitchtip DSN missing — see one-time setup in the panel")}\n`);
}

export function registerDoctor(program: Command): void {
    program
        .command("doctor")
        .argument("<slug>", "sandbox slug")
        .description("probe every service + tenant for a spin (exit 2 if any are down)")
        .option("--json", "emit the raw snapshot JSON on stdout")
        .action(async (slug: string, opts: { json?: boolean }) => {
            await runDoctor(slug, opts);
        });
}
