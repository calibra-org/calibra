import type { Command } from "commander";
import { log } from "../log";
import { readMetaOrFail } from "../core/meta";
import { ensureDraftPr } from "../core/pr";

export function registerPr(program: Command): void {
    program
        .command("pr")
        .argument("<slug>", "sandbox slug")
        .description("create (or recreate) the draft PR for a spin started with --no-pr")
        .action(async (slug: string) => {
            const meta = await readMetaOrFail(slug);
            await ensureDraftPr(meta);
            log.success(`PR ${meta.prUrl ?? `#${meta.prNumber}`}`);
        });
}
