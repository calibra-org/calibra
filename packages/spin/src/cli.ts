#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { registerAlerts } from "./commands/alerts";
import { registerDoctor } from "./commands/doctor";
import { registerList } from "./commands/list";
import { registerLocal } from "./commands/local";
import { registerLogs } from "./commands/logs";
import { registerMetrics } from "./commands/metrics";
import { registerPr } from "./commands/pr";
import { registerSeed } from "./commands/seed";
import { registerStart } from "./commands/start";
import { registerStatus } from "./commands/status";
import { registerStop } from "./commands/stop";
import { registerTerm } from "./commands/term";
import { registerUrl } from "./commands/url";

/**
 * `@calibra/spin` CLI root. This module runs `parseAsync` on import, so both the `bin/spin` shim
 * and the `scripts/spin.mjs` repo entrypoint just need to `import` the built `dist/cli.js`. Command
 * groups are registered by `register*` functions; the single top-level `.catch` is the global
 * exit-code-1 funnel (individual commands set their own exit codes for the agent contract).
 */

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string; description?: string };

/** Every registered command name — used by the bare-slug alias below. */
const COMMANDS = new Set([
    "start",
    "local",
    "stop",
    "pr",
    "list",
    "doctor",
    "status",
    "logs",
    "url",
    "metrics",
    "alerts",
    "term",
    "trust",
    "seed",
    "help",
]);

const program = new Command();

program
    .name("spin")
    .description(pkg.description ?? "Calibra developer-local stack orchestrator")
    .version(pkg.version, "-v, --version", "print the spin version")
    .showHelpAfterError();

registerStart(program);
registerLocal(program);
registerStop(program);
registerPr(program);
registerList(program);
registerDoctor(program);
registerStatus(program);
registerLogs(program);
registerUrl(program);
registerMetrics(program);
registerAlerts(program);
registerSeed(program);
registerTerm(program);

/**
 * Bare-slug alias: `pnpm spin <slug>` means `pnpm spin start <slug>`. If the first positional isn't
 * a known command (and isn't a flag), splice in `start` so the common case needs no subcommand.
 */
function withStartAlias(argv: string[]): string[] {
    const first = argv[2];
    if (first && !first.startsWith("-") && !COMMANDS.has(first)) {
        return [argv[0]!, argv[1]!, "start", ...argv.slice(2)];
    }
    return argv;
}

program.parseAsync(withStartAlias(process.argv)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`spin: ${message}\n`);
    process.exit(1);
});
