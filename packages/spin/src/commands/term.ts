import type { Command } from "commander";
import { createElement } from "react";
import { render } from "ink";
import { App } from "../tui/app";

/**
 * `spin term [slug]` — the interactive Ink terminal dashboard (k9s-style). With a slug it opens
 * straight into that spin's services view; without, it shows the sandbox picker. Needs a TTY.
 */
export async function runTerm(slug?: string): Promise<void> {
    if (!process.stdout.isTTY) {
        throw new Error("spin term needs an interactive terminal (TTY)");
    }
    const instance = render(createElement(App, { initialSlug: slug }));
    await instance.waitUntilExit();
}

export function registerTerm(program: Command): void {
    program
        .command("term")
        .alias("dashboard")
        .argument("[slug]", "sandbox slug to open (default: sandbox picker)")
        .description("interactive terminal dashboard (services, tenants, live logs, restart)")
        .action(async (slug?: string) => {
            await runTerm(slug);
        });
}
