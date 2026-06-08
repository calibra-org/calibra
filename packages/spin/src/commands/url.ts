import type { Command } from "commander";

import { SERVICES, serviceById } from "../core/catalog";
import { readMetaOrFail } from "../core/meta";
import { requirePort } from "../core/ports";
import { dashboardUrl, serviceUrl } from "../core/snapshot";

/**
 * Print one URL to stdout — no formatting, ready to pipe into curl / xdg-open. Resolves a service
 * name (or alias) to its canonical URL **without probing**, so it's instant. Without a service,
 * prints the dashboard. Aliases preserve the legacy names agents/just recipes already use.
 */
const ALIASES: Record<string, string> = {
    home: "dashboard",
    mail: "mailpit",
    "mailpit-web": "mailpit",
    prom: "prometheus",
    meili: "meilisearch",
    errors: "glitchtip",
    uptime: "uptimekuma",
    "uptime-kuma": "uptimekuma",
};

export async function runUrl(slug: string, requested: string): Promise<void> {
    const meta = await readMetaOrFail(slug);
    const want = ALIASES[requested.toLowerCase()] ?? requested.toLowerCase();

    if (want === "dashboard") {
        process.stdout.write(`${dashboardUrl(meta)}\n`);
        return;
    }
    if (want === "mailpit-smtp" || want === "smtp" || want === "mail-smtp") {
        process.stdout.write(`smtp://localhost:${requirePort(meta, "mailpitSmtp")}\n`);
        return;
    }

    const service = serviceById(want);
    const resolved = service ? serviceUrl(meta, service) : null;
    if (!resolved) {
        const ids = SERVICES.map((s) => s.id).join(", ");
        throw new Error(`unknown service "${requested}". Recognised: dashboard, smtp, ${ids}`);
    }
    process.stdout.write(`${resolved}\n`);
}

export function registerUrl(program: Command): void {
    program
        .command("url")
        .argument("<slug>", "sandbox slug")
        .argument("[service]", "service name (default: dashboard)", "dashboard")
        .description("print one service URL to stdout (pipe into curl/open)")
        .action(async (slug: string, service: string) => {
            await runUrl(slug, service);
        });
}
