// @ts-check

/**
 * `pnpm spin <slug>` — bootstrap an isolated dev environment for a single task.
 *
 * Hands the operator a fully running, fully authenticated worktree with its own Postgres
 * container, its own API/admin ports, the seed credentials primed, and a draft PR already
 * opened against `main`. Idempotent: re-running with the same slug picks up where the previous
 * invocation left off, so a half-finished bootstrap (Ctrl-C mid-install, docker daemon stopped)
 * resumes without rebuilding the parts that already succeeded.
 *
 * Tracking issue: https://github.com/calibra-org/calibra/issues/21
 *
 * @see ../spin.md (operator-facing usage)
 */

import { alerts } from "./commands/alerts.mjs";
import { doctor } from "./commands/doctor.mjs";
import { list } from "./commands/list.mjs";
import { local } from "./commands/local.mjs";
import { logs } from "./commands/logs.mjs";
import { metrics } from "./commands/metrics.mjs";
import { start } from "./commands/start.mjs";
import { stop } from "./commands/stop.mjs";
import { url } from "./commands/url.mjs";
import { isSlug } from "./flags.mjs";
import { printHelp } from "./help.mjs";
import { red } from "./log.mjs";
import { ensurePr } from "./pr.mjs";

const SUBCOMMANDS = {
    start,
    stop,
    list,
    doctor,
    pr: ensurePr,
    local,
    url,
    logs,
    metrics,
    alerts,
    help: printHelp,
};

export async function main() {
    try {
        const [rawSub = "help", ...args] = process.argv.slice(2);
        if (rawSub in SUBCOMMANDS) {
            await SUBCOMMANDS[/** @type {keyof typeof SUBCOMMANDS} */ (rawSub)](args);
            return;
        }
        /** Convenience: `pnpm spin <slug>` == `pnpm spin start <slug>`. */
        if (isSlug(rawSub)) {
            await start([rawSub, ...args]);
            return;
        }
        printHelp();
        process.exit(1);
    } catch (err) {
        console.error(`\n${red("✖")} ${err instanceof Error ? err.message : String(err)}`);
        if (err instanceof Error && err.stack && process.env.SPIN_DEBUG === "1") {
            console.error(err.stack);
        }
        process.exit(1);
    }
}
