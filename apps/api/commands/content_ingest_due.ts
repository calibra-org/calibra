import { BaseCommand, flags } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";
import { DateTime } from "luxon";

/** Queue due RSS/Atom sources for every tenant. Intended for a five-minute host cron. */
export default class ContentIngestDue extends BaseCommand {
    static commandName = "content:ingest-due";
    static description = "Queue due tenant content sources for protected RSS or Atom ingestion";
    static options: CommandOptions = { startApp: true };

    @flags.number({ description: "Optional tenant id for a scoped run." })
    declare tenant: number;

    @flags.number({ description: "Maximum sources queued per tenant (default 25)." })
    declare limit: number;

    @flags.boolean({ description: "List due sources without reserving or dispatching them." })
    declare dryRun: boolean;

    async run() {
        const IngestContentSourceJob = (await import("#jobs/ingest_content_source_job")).default;
        const { contentService } = await import("#services/content/content_service");
        const { currentTrx } = await import("#services/tenant_context");
        const { forEachTenant } = await import("#services/tenant_runner");
        const perTenantLimit = Number.isSafeInteger(this.limit) && this.limit > 0 ? Math.min(this.limit, 100) : 25;
        let queued = 0;

        await forEachTenant(
            async (tenantId) => {
                const settings = await contentService.settings();
                if (!settings.source_fetch_enabled) return;
                const trx = currentTrx();
                const due = await trx
                    .from("content_sources")
                    .where((query) =>
                        query
                            .where("status", "active")
                            .orWhere((stale) =>
                                stale
                                    .where("status", "fetching")
                                    .where("updated_at", "<", DateTime.utc().minus({ minutes: 5 }).toISO()),
                            ),
                    )
                    .whereIn("source_type", ["rss", "atom"])
                    .where((query) => query.whereNull("next_fetch_at").orWhere("next_fetch_at", "<=", DateTime.utc().toISO()))
                    .orderByRaw("next_fetch_at ASC NULLS FIRST")
                    .limit(perTenantLimit)
                    .forUpdate()
                    .skipLocked()
                    .select("id", "name", "crawl_interval_minutes");

                for (const source of due as Array<{ id: number; name: string; crawl_interval_minutes: number }>) {
                    this.logger.info(`tenant ${tenantId}: due source ${source.id} (${source.name})`);
                    if (this.dryRun) continue;
                    const interval = Math.max(15, Number(source.crawl_interval_minutes || 360));
                    await trx
                        .from("content_sources")
                        .where("id", source.id)
                        .update({
                            next_fetch_at: DateTime.utc().plus({ minutes: interval }).toISO(),
                            updated_at: DateTime.utc().toISO(),
                        });
                    await IngestContentSourceJob.dispatch({ sourceId: Number(source.id) });
                    queued += 1;
                }
            },
            Number.isSafeInteger(this.tenant) && this.tenant > 0 ? this.tenant : undefined,
        );

        this.logger.info(this.dryRun ? "Dry-run completed; no source was queued." : `Queued ${queued} content source(s).`);
    }
}
