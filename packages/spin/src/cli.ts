#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { log, setJsonMode } from "./log";

/**
 * `@calibra/spin` CLI root. This module runs its `parseAsync` on import, so both the
 * `bin/spin` shim and the `scripts/spin.mjs` repo entrypoint just need to `import` the
 * built `dist/cli.js`. Command groups are registered by `register*` functions (added in
 * later phases); the single top-level `.catch` is the global exit-code-1 funnel.
 */

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string; description?: string };

const program = new Command();

program
    .name("spin")
    .description(pkg.description ?? "Calibra developer-local stack orchestrator")
    .version(pkg.version, "-v, --version", "print the spin version")
    .showHelpAfterError();

/**
 * Phase-0 placeholder. The real orchestration pipeline (worktree → env → compose →
 * migrate → host processes → panel) lands in Phase 4; this stub proves the CLI wiring
 * and the `--json` / stdout-vs-stderr contract end-to-end.
 */
program
    .command("start")
    .argument("[slug]", "sandbox slug", "local")
    .description("(scaffold) bring up the calibra stack for <slug>")
    .option("--json", "emit machine-readable output on stdout")
    .action((slug: string, opts: { json?: boolean }) => {
        if (opts.json) {
            setJsonMode(true);
            process.stdout.write(`${JSON.stringify({ slug, phase: "scaffold", ok: true })}\n`);
            return;
        }
        log.info("spin start — scaffold only (Phase 0); orchestration arrives in a later phase.", { slug });
    });

program.parseAsync(process.argv).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`spin: ${message}\n`);
    process.exit(1);
});
